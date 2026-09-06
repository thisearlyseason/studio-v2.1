import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { getTeamAuthority } from '@/lib/server-team-access';
import { readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';
import { buildWaiverVersionIdentity, canonicalWaiverRecordMatches, normalizeWaiverVersion } from '@/lib/waiver-security';

const ID = /^[A-Za-z0-9_-]{1,160}$/;

function requireGuard(body: Record<string, unknown>) {
  const expectedVersion = normalizeWaiverVersion(body.expectedVersion);
  const expectedTextHash = String(body.expectedTextHash || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedTextHash)) throw new Error('INVALID');
  return { expectedVersion, expectedTextHash };
}

function failure(error: unknown, label: string) {
  if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
  const message = error instanceof Error ? error.message : '';
  const statuses: Record<string, number> = {
    INVALID: 400, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409,
  };
  if (statuses[message]) return NextResponse.json({ error: message.replaceAll('_', ' ').toLowerCase() }, { status: statuses[message] });
  if (error instanceof Error && /valid waiver|valid.*content|valid.*title|valid waiver version/i.test(error.message)) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error(`[teams/waivers/lifecycle ${label}]`, error);
  return NextResponse.json({ error: 'Unable to update this waiver.' }, { status: 500 });
}

async function authorize(teamId: string, uid: string, role?: string) {
  const authority = await getTeamAuthority(teamId, uid, role);
  if (!authority) throw new Error('NOT_FOUND');
  if (!authority.isStaff) throw new Error('FORBIDDEN');
  return authority;
}

function archiveData(documentId: string, data: FirebaseFirestore.DocumentData, archivedAt: string, archivedBy: string) {
  const identity = buildWaiverVersionIdentity({
    title: data.title,
    content: data.content,
    version: normalizeWaiverVersion(data.version),
    waiverAudience: data.waiverAudience,
    assignedTo: data.assignedTo,
  });
  return {
    id: `version_${documentId}_v${identity.version}`,
    documentId,
    type: 'waiver-version',
    ...identity,
    teamId: data.teamId,
    ownerUserId: data.ownerUserId,
    createdAt: data.createdAt || archivedAt,
    archivedAt,
    archivedBy,
    immutable: true,
  };
}

export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(request, 64_000);
    const teamId = String(body.teamId || '').trim();
    const requestId = String(body.requestId || '').trim();
    if (!ID.test(teamId) || !ID.test(requestId)) throw new Error('INVALID');
    const authority = await authorize(teamId, auth.uid, auth.role);
    const identity = buildWaiverVersionIdentity({ title: body.title, content: body.content, version: 1, waiverAudience: body.waiverAudience, assignedTo: body.assignedTo });
    const requestedDocumentId = String(body.documentId || '').trim();
    if (requestedDocumentId && !ID.test(requestedDocumentId)) throw new Error('INVALID');
    const documentId = requestedDocumentId || `waiver_${requestId}`.slice(0, 190);
    const documentRef = authority.teamRef.collection('documents').doc(documentId);
    let alreadyCreated = false;
    await adminDb.runTransaction(async transaction => {
      const existing = await transaction.get(documentRef);
      if (existing.exists) {
        const current = existing.data() || {};
        const currentIdentity = buildWaiverVersionIdentity({ title: current.title, content: current.content, version: current.version, waiverAudience: current.waiverAudience, assignedTo: current.assignedTo });
        if (currentIdentity.textHash !== identity.textHash) throw new Error('CONFLICT');
        alreadyCreated = true;
        return;
      }
      const now = new Date().toISOString();
      transaction.create(documentRef, {
        id: documentId,
        teamId,
        ownerUserId: authority.teamData.ownerUserId,
        type: 'waiver',
        isActive: body.isActive !== false,
        ...identity,
        requestId,
        createdAt: now,
        updatedAt: now,
      });
    });
    return NextResponse.json({ success: true, documentId, version: 1, textHash: identity.textHash, alreadyCreated }, { status: alreadyCreated ? 200 : 201 });
  } catch (error) {
    return failure(error, 'POST');
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(request, 64_000);
    const guard = requireGuard(body);
    const teamId = String(body.teamId || '').trim();
    const documentId = String(body.documentId || '').trim();
    if (!ID.test(teamId) || !ID.test(documentId)) throw new Error('INVALID');
    const authority = await authorize(teamId, auth.uid, auth.role);
    const documentRef = authority.teamRef.collection('documents').doc(documentId);
    let result: { version: number; textHash: string } | undefined;
    await adminDb.runTransaction(async transaction => {
      const snapshot = await transaction.get(documentRef);
      if (!snapshot.exists || snapshot.data()?.type !== 'waiver') throw new Error('NOT_FOUND');
      const current = snapshot.data() || {};
      const oldIdentity = buildWaiverVersionIdentity({ title: current.title, content: current.content, version: current.version, waiverAudience: current.waiverAudience, assignedTo: current.assignedTo });
      if (guard.expectedVersion !== oldIdentity.version || guard.expectedTextHash !== oldIdentity.textHash) throw new Error('CONFLICT');
      const nextTitle = typeof body.title === 'string' ? body.title : current.title;
      const nextContent = typeof body.content === 'string' ? body.content : current.content;
      const nextAudience = body.waiverAudience === 'participant' || body.waiverAudience === 'team' ? body.waiverAudience : current.waiverAudience;
      const nextAssignedTo = Array.isArray(body.assignedTo) ? body.assignedTo : current.assignedTo;
      const proposed = buildWaiverVersionIdentity({ title: nextTitle, content: nextContent, version: oldIdentity.version, waiverAudience: nextAudience, assignedTo: nextAssignedTo });
      const changed = proposed.textHash !== oldIdentity.textHash;
      const version = changed ? oldIdentity.version + 1 : oldIdentity.version;
      const identity = buildWaiverVersionIdentity({ title: nextTitle, content: nextContent, version, waiverAudience: nextAudience, assignedTo: nextAssignedTo });
      const now = new Date().toISOString();
      let archiveRef: FirebaseFirestore.DocumentReference | undefined;
      let archive: FirebaseFirestore.DocumentSnapshot | undefined;
      if (changed || body.isActive === false) {
        archiveRef = authority.teamRef.collection('archived_waivers').doc(`version_${documentId}_v${oldIdentity.version}`);
        archive = await transaction.get(archiveRef);
      }
      const expectedArchive = archiveData(documentId, current, now, auth.uid);
      if (archive?.exists && !canonicalWaiverRecordMatches(archive.data() || {}, expectedArchive)) throw new Error('CONFLICT');
      if (archiveRef && !archive?.exists) transaction.create(archiveRef, expectedArchive);
      transaction.update(documentRef, {
        ...identity,
        ...(typeof body.isActive === 'boolean' ? { isActive: body.isActive } : {}),
        updatedAt: now,
        ...(body.isActive === false && current.isActive !== false ? { archivedAt: now, archivedBy: auth.uid } : {}),
      });
      result = { version, textHash: identity.textHash };
    });
    return NextResponse.json({ success: true, documentId, ...result });
  } catch (error) {
    return failure(error, 'PATCH');
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(request, 8_000);
    const guard = requireGuard(body);
    const teamId = String(body.teamId || '').trim();
    const documentId = String(body.documentId || '').trim();
    if (!ID.test(teamId) || !ID.test(documentId)) throw new Error('INVALID');
    const authority = await authorize(teamId, auth.uid, auth.role);
    const documentRef = authority.teamRef.collection('documents').doc(documentId);
    await adminDb.runTransaction(async transaction => {
      const snapshot = await transaction.get(documentRef);
      if (!snapshot.exists || snapshot.data()?.type !== 'waiver') throw new Error('NOT_FOUND');
      const current = snapshot.data() || {};
      const version = normalizeWaiverVersion(current.version);
      const currentIdentity = buildWaiverVersionIdentity({ title: current.title, content: current.content, version, waiverAudience: current.waiverAudience, assignedTo: current.assignedTo });
      if (guard.expectedVersion !== currentIdentity.version || guard.expectedTextHash !== currentIdentity.textHash) throw new Error('CONFLICT');
      const now = new Date().toISOString();
      const archiveRef = authority.teamRef.collection('archived_waivers').doc(`version_${documentId}_v${version}`);
      const archive = await transaction.get(archiveRef);
      const expectedArchive = archiveData(documentId, current, now, auth.uid);
      if (archive.exists && !canonicalWaiverRecordMatches(archive.data() || {}, expectedArchive)) throw new Error('CONFLICT');
      if (!archive.exists) transaction.create(archiveRef, expectedArchive);
      transaction.update(documentRef, { isActive: false, ...(current.isActive !== false ? { archivedAt: now, archivedBy: auth.uid } : {}), updatedAt: now });
    });
    return NextResponse.json({ success: true, documentId, archived: true });
  } catch (error) {
    return failure(error, 'DELETE');
  }
}
