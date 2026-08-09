import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { assertNonAnonymous, verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb, getAdminAuth } from '@/lib/firebase-admin';
import { readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ADMINS = 3;

function normalizeEmail(value: unknown) {
  if (typeof value !== 'string') return '';
  const email = value.trim().toLowerCase().slice(0, 254);
  return EMAIL_PATTERN.test(email) ? email : '';
}

function normalizeId(value: unknown) {
  if (typeof value !== 'string') return '';
  const id = value.trim();
  return id && id.length <= 200 && !id.includes('/') ? id : '';
}

function membershipData(team: Record<string, any>, teamId: string, now: string) {
  return {
    teamId,
    name: String(team.name || team.teamName || team.schoolName || 'School Hub'),
    role: 'Admin',
    position: 'Athletic Director',
    code: String(team.code || team.teamCode || team.inviteCode || ''),
    joinedAt: now,
    type: team.type || 'school',
    isPro: team.isPro === true,
    planId: team.planId || 'school',
    ownerUserId: team.ownerUserId,
  };
}

async function grantAdmin(teamRef: FirebaseFirestore.DocumentReference, userId: string, email: string) {
  const now = new Date().toISOString();
  await adminDb.runTransaction(async transaction => {
    const teamSnapshot = await transaction.get(teamRef);
    if (!teamSnapshot.exists) throw new Error('SCHOOL_NOT_FOUND');
    const team = teamSnapshot.data() || {};
    const admins = Array.isArray(team.schoolAdminIds) ? team.schoolAdminIds : [];
    if (!admins.includes(userId) && admins.length >= MAX_ADMINS) throw new Error('ADMIN_LIMIT');

    transaction.update(teamRef, {
      schoolAdminIds: admin.firestore.FieldValue.arrayUnion(userId),
      pendingAdminEmails: admin.firestore.FieldValue.arrayRemove(email),
    });
    transaction.set(
      adminDb.collection('users').doc(userId).collection('teamMemberships').doc(teamRef.id),
      membershipData(team, teamRef.id, now),
      { merge: true },
    );
    transaction.set(
      teamRef.collection('members').doc(userId),
      {
        id: userId,
        userId,
        teamId: teamRef.id,
        name: email.split('@')[0] || 'School Administrator',
        email,
        role: 'Admin',
        position: 'Athletic Director',
        status: 'active',
        joinedAt: now,
      },
      { merge: true },
    );
  });
}

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  const anonymousError = assertNonAnonymous(auth);
  if (anonymousError) return anonymousError;

  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 4_000);
    const teamId = normalizeId(body.teamId);
    const email = normalizeEmail(body.email);
    if (!teamId || !email) {
      return NextResponse.json({ error: 'A valid school and email address are required.' }, { status: 400 });
    }

    const teamRef = adminDb.collection('teams').doc(teamId);
    const [teamSnapshot, targetAccount] = await Promise.all([
      teamRef.get(),
      getAdminAuth().getUserByEmail(email).catch(error => {
        if (error?.code === 'auth/user-not-found') return null;
        throw error;
      }),
    ]);
    if (!teamSnapshot.exists) return NextResponse.json({ error: 'School Hub not found.' }, { status: 404 });
    const team = teamSnapshot.data() || {};
    if (team.ownerUserId !== auth.uid && auth.role !== 'superadmin') {
      return NextResponse.json({ error: 'Only the School Hub owner can manage administrators.' }, { status: 403 });
    }

    const admins = Array.isArray(team.schoolAdminIds) ? team.schoolAdminIds : [];
    const pending = Array.isArray(team.pendingAdminEmails) ? team.pendingAdminEmails : [];
    const targetUserId = targetAccount?.uid || '';
    if (targetUserId && (admins.includes(targetUserId) || team.ownerUserId === targetUserId)) {
      return NextResponse.json({ error: 'This user already has School Hub access.' }, { status: 409 });
    }
    if (!targetUserId && pending.includes(email)) {
      return NextResponse.json({ error: 'An invitation is already pending for this email.' }, { status: 409 });
    }
    const pendingAfterConversion = targetUserId ? pending.filter(item => item !== email) : pending;
    if (admins.length + pendingAfterConversion.length >= MAX_ADMINS) {
      return NextResponse.json({ error: `A School Hub can have at most ${MAX_ADMINS} additional administrators.` }, { status: 409 });
    }

    if (targetUserId) {
      await grantAdmin(teamRef, targetUserId, email);
      return NextResponse.json({ ok: true, status: 'added', userId: targetUserId });
    }

    await teamRef.update({ pendingAdminEmails: admin.firestore.FieldValue.arrayUnion(email) });
    return NextResponse.json({ ok: true, status: 'pending' });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const code = error instanceof Error ? error.message : '';
    if (code === 'ADMIN_LIMIT') return NextResponse.json({ error: 'The School Hub administrator limit has been reached.' }, { status: 409 });
    console.error('[schools/admins] Failed to add administrator:', error);
    return NextResponse.json({ error: 'Unable to add the School Hub administrator.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  const anonymousError = assertNonAnonymous(auth);
  if (anonymousError) return anonymousError;
  const email = normalizeEmail(auth.email);
  if (!email) return NextResponse.json({ ok: true, claimed: 0 });

  try {
    const pending = await adminDb.collection('teams').where('pendingAdminEmails', 'array-contains', email).limit(10).get();
    let claimed = 0;
    for (const team of pending.docs) {
      await grantAdmin(team.ref, auth.uid, email);
      claimed += 1;
    }
    return NextResponse.json({ ok: true, claimed });
  } catch (error) {
    const code = error instanceof Error ? error.message : '';
    if (code === 'ADMIN_LIMIT') return NextResponse.json({ error: 'The School Hub administrator limit has been reached.' }, { status: 409 });
    console.error('[schools/admins] Failed to claim invitations:', error);
    return NextResponse.json({ error: 'Unable to claim School Hub invitations.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  const anonymousError = assertNonAnonymous(auth);
  if (anonymousError) return anonymousError;

  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 4_000);
    const teamId = normalizeId(body.teamId);
    const userId = normalizeId(body.userId);
    const email = normalizeEmail(body.email);
    if (!teamId || (!userId && !email)) {
      return NextResponse.json({ error: 'A valid school and administrator are required.' }, { status: 400 });
    }

    const teamRef = adminDb.collection('teams').doc(teamId);
    const teamSnapshot = await teamRef.get();
    if (!teamSnapshot.exists) return NextResponse.json({ error: 'School Hub not found.' }, { status: 404 });
    if (teamSnapshot.data()?.ownerUserId !== auth.uid && auth.role !== 'superadmin') {
      return NextResponse.json({ error: 'Only the School Hub owner can manage administrators.' }, { status: 403 });
    }

    const batch = adminDb.batch();
    if (userId) {
      batch.update(teamRef, { schoolAdminIds: admin.firestore.FieldValue.arrayRemove(userId) });
      batch.delete(adminDb.collection('users').doc(userId).collection('teamMemberships').doc(teamId));
      batch.delete(teamRef.collection('members').doc(userId));
    }
    if (email) batch.update(teamRef, { pendingAdminEmails: admin.firestore.FieldValue.arrayRemove(email) });
    await batch.commit();
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[schools/admins] Failed to revoke administrator:', error);
    return NextResponse.json({ error: 'Unable to revoke the School Hub administrator.' }, { status: 500 });
  }
}
