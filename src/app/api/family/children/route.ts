import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { assertNonAnonymous, verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const FAMILY_ROLES = new Set(['parent', 'guardian']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

async function familyActor(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  const anonymous = assertNonAnonymous(auth);
  if (anonymous) return anonymous;
  const profile = await adminDb.collection('users').doc(auth.uid).get();
  const role = String(profile.data()?.role || auth.role || '').toLowerCase();
  return FAMILY_ROLES.has(role) ? auth : NextResponse.json({ error: 'Family access required.' }, { status: 403 });
}

async function ownedChild(uid: string, childId: unknown) {
  if (typeof childId !== 'string' || !ID_PATTERN.test(childId)) return null;
  const ref = adminDb.collection('players').doc(childId);
  const snapshot = await ref.get();
  return snapshot.exists && snapshot.data()?.parentId === uid ? { ref, snapshot } : null;
}

export async function POST(req: NextRequest) {
  const auth = await familyActor(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const limited = await enforceUserRateLimit(auth.uid, 'family-child-create', 30, 60 * 60 * 1000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 8_000);
    const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
    const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
    const dateOfBirth = typeof body.dateOfBirth === 'string' ? body.dateOfBirth.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!firstName || firstName.length > 80 || !lastName || lastName.length > 80 || !DATE_PATTERN.test(dateOfBirth) || email.length > 254) {
      return NextResponse.json({ error: 'Valid athlete identity fields are required.' }, { status: 400 });
    }
    const requestId = typeof body.requestId === 'string' && ID_PATTERN.test(body.requestId) ? body.requestId : '';
    const childId = `child_${requestId || randomBytes(12).toString('hex')}`;
    const childRef = adminDb.collection('players').doc(childId);
    if ((await childRef.get()).exists) return NextResponse.json({ error: 'Athlete request already exists.' }, { status: 409 });
    await childRef.set({
      id: childId, firstName, lastName, dateOfBirth, isMinor: true,
      parentId: auth.uid, userId: null, guardianIds: [], joinedTeamIds: [],
      hasLogin: false, recruitingProfileEnabled: false,
      ...(email ? { pendingInviteEmail: email } : {}),
      createdAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, childId }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Unable to create athlete.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await familyActor(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 4_000);
    const child = await ownedChild(auth.uid, body.childId);
    const teamId = typeof body.teamId === 'string' && ID_PATTERN.test(body.teamId) ? body.teamId : '';
    if (!child || !teamId || !Array.isArray(child.snapshot.data()?.joinedTeamIds) || !child.snapshot.data()!.joinedTeamIds.includes(teamId)) {
      return NextResponse.json({ error: 'Linked athlete not found.' }, { status: 404 });
    }
    const memberId = typeof child.snapshot.data()?.userId === 'string' && child.snapshot.data()!.userId
      ? child.snapshot.data()!.userId : child.snapshot.id;
    const batch = adminDb.batch();
    batch.update(child.ref, { joinedTeamIds: FieldValue.arrayRemove(teamId) });
    batch.delete(adminDb.collection('teams').doc(teamId).collection('members').doc(memberId));
    await batch.commit();
    return NextResponse.json({ ok: true, childId: child.snapshot.id, teamId });
  } catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Unable to unlink athlete.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await familyActor(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 4_000);
    const child = await ownedChild(auth.uid, body.childId);
    if (!child) return NextResponse.json({ error: 'Athlete not found.' }, { status: 404 });
    const data = child.snapshot.data() || {};
    // A child with any account linkage requires the dedicated account-lifecycle
    // flow. Deleting only the player and team-member documents would leave the
    // independently authenticated youth account with stale user projections.
    if (data.hasLogin === true || (typeof data.userId === 'string' && data.userId.trim())) {
      return NextResponse.json({ error: 'Login-enabled athlete removal requires account lifecycle support.' }, { status: 409 });
    }
    const memberId = typeof data.userId === 'string' && data.userId ? data.userId : child.snapshot.id;
    const teamIds = Array.isArray(data.joinedTeamIds) ? data.joinedTeamIds.filter((id): id is string => typeof id === 'string' && ID_PATTERN.test(id)) : [];
    const batch = adminDb.batch();
    for (const teamId of teamIds) batch.delete(adminDb.collection('teams').doc(teamId).collection('members').doc(memberId));
    await batch.commit();
    await adminDb.recursiveDelete(child.ref);
    return NextResponse.json({ ok: true, childId: child.snapshot.id });
  } catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Unable to remove athlete.' }, { status: 500 });
  }
}
