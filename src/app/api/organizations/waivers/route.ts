import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { filterGlobalWaiverDeploymentCopies, getGlobalWaiverDeploymentId, type GlobalWaiverDocument } from '@/lib/global-waiver-policy';
import { readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';

const DOCUMENT_ID = /^[A-Za-z0-9_-]{1,200}$/;

async function resolveDeployment(uid: string, documentId: string) {
  let deploymentId = getGlobalWaiverDeploymentId({ id: documentId });
  let masterRef = adminDb.collection('users').doc(uid).collection('clubDocuments').doc(documentId);
  let masterSnapshot = await masterRef.get();
  if (masterSnapshot.exists) {
    const master = { id: masterSnapshot.id, ...masterSnapshot.data() } as GlobalWaiverDocument;
    if (master.isClubMaster !== true) return null;
    deploymentId = getGlobalWaiverDeploymentId(master);
  } else {
    masterRef = adminDb.collection('users').doc(uid).collection('clubDocuments').doc(`${deploymentId}_global`);
    masterSnapshot = await masterRef.get();
  }
  const copiesSnapshot = await adminDb.collectionGroup('documents').where('ownerUserId', '==', uid).get();
  const candidates = copiesSnapshot.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() } as GlobalWaiverDocument));
  const selectedIds = new Set(filterGlobalWaiverDeploymentCopies(candidates, deploymentId).map(candidate => candidate.id));
  const copies = copiesSnapshot.docs.filter(snapshot => selectedIds.has(snapshot.id));
  if (!masterSnapshot.exists && copies.length === 0) return null;
  return { masterRef, masterExists: masterSnapshot.exists, copies };
}

export async function PATCH(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(request, 64_000);
    const documentId = String(body.documentId || '').trim();
    if (!DOCUMENT_ID.test(documentId)) {
      return NextResponse.json({ error: 'A valid global waiver is required.' }, { status: 400 });
    }
    const deployment = await resolveDeployment(auth.uid, documentId);
    if (!deployment) return NextResponse.json({ error: 'Global waiver not found.' }, { status: 404 });

    const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (typeof body.title === 'string') updates.title = body.title.trim().slice(0, 200);
    if (typeof body.content === 'string') updates.content = body.content.trim().slice(0, 50_000);
    if (typeof body.isActive === 'boolean') updates.isActive = body.isActive;
    if (body.waiverAudience === 'participant' || body.waiverAudience === 'team') {
      updates.waiverAudience = body.waiverAudience;
    }
    if ((Object.hasOwn(updates, 'title') && !updates.title) || (Object.hasOwn(updates, 'content') && !updates.content)) {
      return NextResponse.json({ error: 'Waiver title and content cannot be empty.' }, { status: 400 });
    }

    const batch = adminDb.batch();
    if (deployment.masterExists) batch.update(deployment.masterRef, updates);
    deployment.copies.forEach(snapshot => batch.update(snapshot.ref, updates));
    await batch.commit();
    return NextResponse.json({ success: true, updatedCopies: deployment.copies.length + (deployment.masterExists ? 1 : 0) });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[organizations/waivers PATCH]', error);
    return NextResponse.json({ error: 'Unable to update this global waiver.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(request, 8_000);
    const documentId = String(body.documentId || '').trim();
    if (!DOCUMENT_ID.test(documentId)) {
      return NextResponse.json({ error: 'A valid global waiver is required.' }, { status: 400 });
    }
    const deployment = await resolveDeployment(auth.uid, documentId);
    if (!deployment) return NextResponse.json({ error: 'Global waiver not found.' }, { status: 404 });

    const batch = adminDb.batch();
    if (deployment.masterExists) batch.delete(deployment.masterRef);
    deployment.copies.forEach(snapshot => batch.delete(snapshot.ref));
    await batch.commit();
    return NextResponse.json({ success: true, deletedCopies: deployment.copies.length + (deployment.masterExists ? 1 : 0) });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[organizations/waivers DELETE]', error);
    return NextResponse.json({ error: 'Unable to delete this global waiver.' }, { status: 500 });
  }
}
