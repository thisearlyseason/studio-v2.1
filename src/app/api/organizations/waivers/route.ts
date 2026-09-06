import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { filterGlobalWaiverDeploymentCopies, getGlobalWaiverDeploymentId, type GlobalWaiverDocument } from '@/lib/global-waiver-policy';
import { readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';
import { buildWaiverVersionIdentity, canonicalWaiverRecordMatches, normalizeWaiverVersion } from '@/lib/waiver-security';

const ID = /^[A-Za-z0-9_-]{1,160}$/;

function responseForError(error: unknown, method: string) {
  if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
  const code = error instanceof Error ? error.message : '';
  const status = ({ INVALID: 400, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409 } as Record<string, number>)[code];
  if (status) return NextResponse.json({ error: code.replaceAll('_', ' ').toLowerCase() }, { status });
  if (error instanceof Error && /valid waiver|valid.*content|valid.*title|valid waiver version/i.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error(`[organizations/waivers ${method}]`, error);
  return NextResponse.json({ error: 'Unable to update this global waiver.' }, { status: 500 });
}

function optimisticGuard(body: Record<string, unknown>) {
  const expectedVersion = normalizeWaiverVersion(body.expectedVersion);
  const expectedTextHash = String(body.expectedTextHash || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedTextHash)) throw new Error('INVALID');
  return { expectedVersion, expectedTextHash };
}

async function resolveDeployment(ownerId: string, documentId: string) {
  let deploymentId = getGlobalWaiverDeploymentId({ id: documentId });
  let masterRef = adminDb.collection('users').doc(ownerId).collection('clubDocuments').doc(documentId);
  let masterSnapshot = await masterRef.get();
  if (masterSnapshot.exists) {
    const master = { id: masterSnapshot.id, ...masterSnapshot.data() } as GlobalWaiverDocument;
    if (master.isClubMaster !== true) return null;
    deploymentId = getGlobalWaiverDeploymentId(master);
  } else {
    masterRef = adminDb.collection('users').doc(ownerId).collection('clubDocuments').doc(`${deploymentId}_global`);
    masterSnapshot = await masterRef.get();
  }
  const copiesSnapshot = await adminDb.collectionGroup('documents').where('ownerUserId', '==', ownerId).get();
  const candidates = copiesSnapshot.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() } as GlobalWaiverDocument));
  const selectedIds = new Set(filterGlobalWaiverDeploymentCopies(candidates, deploymentId).map(candidate => candidate.id));
  const copies = copiesSnapshot.docs.filter(snapshot => selectedIds.has(snapshot.id));
  if (!masterSnapshot.exists && copies.length === 0) return null;
  return { deploymentId, masterRef, masterSnapshot, copies };
}

async function assertOwnerTargets(auth: { uid: string; role?: string }, teamIds: string[]) {
  if (teamIds.length === 0 || teamIds.length > 100 || new Set(teamIds).size !== teamIds.length || teamIds.some(id => !ID.test(id))) throw new Error('INVALID');
  const refs = teamIds.map(teamId => adminDb.collection('teams').doc(teamId));
  const snapshots = await adminDb.getAll(...refs);
  if (snapshots.some(snapshot => !snapshot.exists)) throw new Error('NOT_FOUND');
  const ownerId = String(snapshots[0].data()?.ownerUserId || '');
  const ownsEveryTarget = snapshots.every(snapshot => {
    const team = snapshot.data() || {};
    return team.ownerUserId === ownerId && team.isActive !== false && team.isArchived !== true && !['school', 'school_hub'].includes(String(team.type || ''));
  });
  if (!ownerId || !ownsEveryTarget || (auth.role !== 'superadmin' && auth.uid !== ownerId)) throw new Error('FORBIDDEN');
  return { ownerId, refs };
}

function globalDocumentData(input: {
  id: string; deploymentId: string; ownerId: string; identity: ReturnType<typeof buildWaiverVersionIdentity>;
  audience: 'participant' | 'team'; teamIds: string[]; teamId?: string; sourceGlobalDocumentId?: string;
  createdAt: string; requestId: string;
}) {
  return {
    id: input.id, deploymentId: input.deploymentId, ownerUserId: input.ownerId, type: 'waiver',
    isClubMaster: true, isGlobal: !input.teamId, isActive: true,
    targetTeamIds: input.teamIds, requestId: input.requestId,
    ...(input.teamId ? { teamId: input.teamId, sourceGlobalDocumentId: input.sourceGlobalDocumentId } : {}),
    ...input.identity, createdAt: input.createdAt, updatedAt: input.createdAt,
  };
}

export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(request, 64_000);
    const requestId = String(body.requestId || '').trim();
    const teamIds = Array.isArray(body.teamIds) ? body.teamIds.map(value => String(value).trim()).sort() : [];
    if (!ID.test(requestId)) throw new Error('INVALID');
    const { ownerId, refs } = await assertOwnerTargets(auth, teamIds);
    const audience = body.waiverAudience === 'team' ? 'team' : 'participant';
    const identity = buildWaiverVersionIdentity({ title: body.title, content: body.content, version: 1, waiverAudience: audience, assignedTo: ['all'] });
    const deploymentId = `waiver_${requestId}`.slice(0, 180);
    const masterId = `${deploymentId}_global`;
    const masterRef = adminDb.collection('users').doc(ownerId).collection('clubDocuments').doc(masterId);
    const copyRefs = refs.map((teamRef, index) => teamRef.collection('documents').doc(`${deploymentId}_${index + 1}`));
    let alreadyDeployed = false;
    let repairedCopies = 0;
    await adminDb.runTransaction(async transaction => {
      const snapshots = await Promise.all([...refs, masterRef, ...copyRefs].map(ref => transaction.get(ref)));
      const teamSnapshots = snapshots.slice(0, refs.length);
      const master = snapshots[refs.length];
      const copies = snapshots.slice(refs.length + 1);
      if (teamSnapshots.some(team => !team.exists || team.data()?.ownerUserId !== ownerId || team.data()?.isActive === false || team.data()?.isArchived === true)) throw new Error('FORBIDDEN');
      const now = new Date().toISOString();
      if (master.exists) {
        const current = master.data() || {};
        if (current.isActive === false) throw new Error('CONFLICT');
        const currentIdentity = buildWaiverVersionIdentity({ title: current.title, content: current.content, version: current.version, waiverAudience: current.waiverAudience, assignedTo: current.assignedTo });
        const sameTargets = JSON.stringify([...(current.targetTeamIds || [])].sort()) === JSON.stringify(teamIds);
        if (currentIdentity.textHash !== identity.textHash || !sameTargets || current.waiverAudience !== audience) throw new Error('CONFLICT');
        alreadyDeployed = true;
      } else {
        transaction.create(masterRef, globalDocumentData({ id: masterId, deploymentId, ownerId, identity, audience, teamIds, createdAt: now, requestId }));
      }
      copyRefs.forEach((copyRef, index) => {
        const expected = globalDocumentData({ id: copyRef.id, deploymentId, ownerId, identity, audience, teamIds, teamId: teamIds[index], sourceGlobalDocumentId: masterId, createdAt: copies[index].data()?.createdAt || now, requestId });
        if (copies[index].exists && !canonicalWaiverRecordMatches(copies[index].data() || {}, expected)) throw new Error('CONFLICT');
        if (copies[index].exists) return;
        repairedCopies += 1;
        transaction.create(copyRef, expected);
      });
    });
    return NextResponse.json({ success: true, deploymentId, documentId: masterId, version: 1, textHash: identity.textHash, copies: teamIds.length, repairedCopies, alreadyDeployed }, { status: alreadyDeployed ? 200 : 201 });
  } catch (error) {
    return responseForError(error, 'POST');
  }
}

function archivedVersion(deploymentId: string, documentId: string, identity: ReturnType<typeof buildWaiverVersionIdentity>, data: FirebaseFirestore.DocumentData, now: string, actor: string) {
  return { deploymentId, documentId, ownerUserId: data.ownerUserId, ...identity, targetTeamIds: data.targetTeamIds || [], archivedAt: now, archivedBy: actor, immutable: true };
}

async function mutateGlobalWaiver(
  auth: { uid: string; role?: string },
  body: Record<string, unknown>,
  forceArchive: boolean
) {
  const documentId = String(body.documentId || '').trim();
  if (!ID.test(documentId)) throw new Error('INVALID');
  const guard = optimisticGuard(body);
  const located = await resolveDeployment(auth.uid, documentId);
  if (!located) throw new Error('NOT_FOUND');
  return adminDb.runTransaction(async transaction => {
    const masterSnapshot = await transaction.get(located.masterRef);
    if (!masterSnapshot.exists) throw new Error('NOT_FOUND');
    const master = masterSnapshot.data() || {};
    if (master.ownerUserId !== auth.uid && auth.role !== 'superadmin') throw new Error('FORBIDDEN');
    const deploymentId = getGlobalWaiverDeploymentId({ id: masterSnapshot.id, ...master });
    const teamIds = Array.isArray(master.targetTeamIds) ? master.targetTeamIds.map(String).sort() : [];
    if (teamIds.length === 0 || teamIds.some(teamId => !ID.test(teamId))) throw new Error('CONFLICT');
    const oldIdentity = buildWaiverVersionIdentity({
      title: master.title, content: master.content, version: master.version,
      waiverAudience: master.waiverAudience, assignedTo: master.assignedTo,
    });
    if (guard.expectedVersion !== oldIdentity.version || guard.expectedTextHash !== oldIdentity.textHash) throw new Error('CONFLICT');
    const teamRefs = teamIds.map(teamId => adminDb.collection('teams').doc(teamId));
    const copyRefs = teamRefs.map((teamRef, index) => teamRef.collection('documents').doc(`${deploymentId}_${index + 1}`));
    const masterArchiveRef = adminDb.collection('users').doc(auth.uid).collection('waiverVersions').doc(`${deploymentId}_v${oldIdentity.version}`);
    const teamArchiveRefs = teamRefs.map(teamRef => teamRef.collection('archived_waivers').doc(`version_${deploymentId}_v${oldIdentity.version}`));
    const snapshots = await Promise.all([
      ...teamRefs.map(ref => transaction.get(ref)),
      ...copyRefs.map(ref => transaction.get(ref)),
      transaction.get(masterArchiveRef),
      ...teamArchiveRefs.map(ref => transaction.get(ref)),
    ]);
    const teams = snapshots.slice(0, teamRefs.length);
    const copies = snapshots.slice(teamRefs.length, teamRefs.length + copyRefs.length);
    const masterArchive = snapshots[teamRefs.length + copyRefs.length];
    const teamArchives = snapshots.slice(teamRefs.length + copyRefs.length + 1);
    if (teams.some(team => !team.exists || team.data()?.ownerUserId !== auth.uid || team.data()?.isActive === false || team.data()?.isArchived === true)) throw new Error('FORBIDDEN');
    copyRefs.forEach((copyRef, index) => {
      if (!copies[index].exists) return;
      const copy = copies[index].data() || {};
      const copyIdentity = buildWaiverVersionIdentity({ title: copy.title, content: copy.content, version: copy.version, waiverAudience: copy.waiverAudience, assignedTo: copy.assignedTo });
      if (copy.teamId !== teamIds[index] || copy.ownerUserId !== auth.uid || copy.sourceGlobalDocumentId !== masterSnapshot.id ||
          copy.deploymentId !== deploymentId || copyIdentity.version !== oldIdentity.version || copyIdentity.textHash !== oldIdentity.textHash) throw new Error('CONFLICT');
    });

    const nextAudience = body.waiverAudience === 'participant' || body.waiverAudience === 'team' ? body.waiverAudience : oldIdentity.waiverAudience;
    const proposed = buildWaiverVersionIdentity({
      title: typeof body.title === 'string' ? body.title : oldIdentity.title,
      content: typeof body.content === 'string' ? body.content : oldIdentity.content,
      version: oldIdentity.version, waiverAudience: nextAudience, assignedTo: oldIdentity.assignedTo,
    });
    const changed = proposed.textHash !== oldIdentity.textHash;
    const version = changed ? oldIdentity.version + 1 : oldIdentity.version;
    const identity = buildWaiverVersionIdentity({ ...proposed, version });
    const deactivate = forceArchive || body.isActive === false;
    const archiveRequired = changed || deactivate;
    const now = new Date().toISOString();
    if (archiveRequired) {
      const expectedMasterArchive = archivedVersion(deploymentId, masterSnapshot.id, oldIdentity, master, now, auth.uid);
      if (masterArchive.exists && !canonicalWaiverRecordMatches(masterArchive.data() || {}, expectedMasterArchive)) throw new Error('CONFLICT');
      if (!masterArchive.exists) transaction.create(masterArchiveRef, expectedMasterArchive);
      teamArchiveRefs.forEach((archiveRef, index) => {
        const source = copies[index].data() || globalDocumentData({
          id: copyRefs[index].id, deploymentId, ownerId: auth.uid, identity: oldIdentity,
          audience: oldIdentity.waiverAudience, teamIds, teamId: teamIds[index], sourceGlobalDocumentId: masterSnapshot.id,
          createdAt: master.createdAt || now, requestId: String(master.requestId || deploymentId),
        });
        const expected = { id: archiveRef.id, teamId: teamIds[index], type: 'waiver-version', ...archivedVersion(deploymentId, copyRefs[index].id, oldIdentity, source, now, auth.uid) };
        if (teamArchives[index].exists && !canonicalWaiverRecordMatches(teamArchives[index].data() || {}, expected)) throw new Error('CONFLICT');
        if (!teamArchives[index].exists) transaction.create(archiveRef, expected);
      });
    }
    const activity = typeof body.isActive === 'boolean' ? body.isActive : forceArchive ? false : master.isActive !== false;
    const updates = {
      ...identity, isActive: activity, updatedAt: now,
      ...(deactivate && master.isActive !== false ? { archivedAt: now, archivedBy: auth.uid } : {}),
    };
    transaction.update(located.masterRef, updates);
    let repairedCopies = 0;
    copyRefs.forEach((copyRef, index) => {
      if (copies[index].exists) transaction.update(copyRef, updates);
      else {
        repairedCopies += 1;
        transaction.create(copyRef, {
          ...globalDocumentData({ id: copyRef.id, deploymentId, ownerId: auth.uid, identity, audience: identity.waiverAudience, teamIds, teamId: teamIds[index], sourceGlobalDocumentId: masterSnapshot.id, createdAt: master.createdAt || now, requestId: String(master.requestId || deploymentId) }),
          ...updates,
        });
      }
    });
    return { deploymentId, version, textHash: identity.textHash, copies: copyRefs.length, repairedCopies };
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(request, 64_000);
    const result = await mutateGlobalWaiver(auth, body, false);
    return NextResponse.json({ success: true, ...result, updatedCopies: result.copies + 1 });
  } catch (error) {
    return responseForError(error, 'PATCH');
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(request, 8_000);
    const result = await mutateGlobalWaiver(auth, body, true);
    return NextResponse.json({ success: true, ...result, archivedCopies: result.copies + 1 });
  } catch (error) {
    return responseForError(error, 'DELETE');
  }
}
