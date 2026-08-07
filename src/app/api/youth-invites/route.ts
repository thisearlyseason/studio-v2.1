import { randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function inviteResponse(data: Record<string, unknown>) {
  return {
    childFirstName: String(data.childFirstName || '').slice(0, 100),
    childLastName: String(data.childLastName || '').slice(0, 100),
    email: String(data.email || '').slice(0, 254),
    expiresAt: data.expiresAt,
  };
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || '';
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return NextResponse.json({ error: 'This invitation link is invalid or has already been used.' }, { status: 404 });
  }

  const fingerprint = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';
  const limited = await enforceUserRateLimit(fingerprint, 'read-youth-invite', 60, 60 * 60 * 1000);
  if (limited) return limited;

  const snapshot = await adminDb.collection('invites').doc(token).get();
  const data = snapshot.data() || {};
  if (!snapshot.exists || data.used === true || typeof data.expiresAt !== 'string' || Date.parse(data.expiresAt) <= Date.now()) {
    return NextResponse.json({ error: 'This invitation link is invalid, expired, or has already been used.' }, { status: 404 });
  }
  return NextResponse.json(inviteResponse(data), { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const limited = await enforceUserRateLimit(auth.uid, 'write-youth-invite', 20, 60 * 60 * 1000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 8_000);
    const action = String(body.action || '');

    if (action === 'create') {
      const childId = String(body.childId || '').trim();
      const email = normalizeEmail(body.email);
      if (!ID_PATTERN.test(childId) || !EMAIL_PATTERN.test(email) || email.length > 254) {
        return NextResponse.json({ error: 'A valid athlete and email address are required.' }, { status: 400 });
      }

      const playerRef = adminDb.collection('players').doc(childId);
      const token = randomBytes(32).toString('hex');
      const inviteRef = adminDb.collection('invites').doc(token);
      const sentAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      await adminDb.runTransaction(async transaction => {
        const player = await transaction.get(playerRef);
        if (!player.exists) throw new RequestBodyError('Athlete not found.', 404);
        const data = player.data() || {};
        const guardians = Array.isArray(data.guardianIds) ? data.guardianIds : [];
        if (data.parentId !== auth.uid && !guardians.includes(auth.uid)) {
          throw new RequestBodyError('Only a linked guardian can invite this athlete.', 403);
        }
        if (data.hasLogin === true || data.userId) {
          throw new RequestBodyError('This athlete already has a login.', 409);
        }

        const previousToken = typeof data.inviteToken === 'string' ? data.inviteToken : '';
        if (previousToken && previousToken !== token) {
          transaction.delete(adminDb.collection('invites').doc(previousToken));
        }
        transaction.set(inviteRef, {
          childId,
          childFirstName: data.firstName || '',
          childLastName: data.lastName || '',
          parentId: auth.uid,
          email,
          expiresAt,
          used: false,
          createdAt: FieldValue.serverTimestamp(),
        });
        transaction.update(playerRef, {
          pendingInviteEmail: email,
          inviteToken: token,
          inviteSentAt: sentAt,
          inviteExpiresAt: expiresAt,
        });
      });

      return NextResponse.json({ signupUrl: `/signup/youth?token=${token}`, expiresAt });
    }

    if (action === 'revoke') {
      const childId = String(body.childId || '').trim();
      if (!ID_PATTERN.test(childId)) {
        return NextResponse.json({ error: 'A valid athlete is required.' }, { status: 400 });
      }
      const playerRef = adminDb.collection('players').doc(childId);
      await adminDb.runTransaction(async transaction => {
        const player = await transaction.get(playerRef);
        if (!player.exists) throw new RequestBodyError('Athlete not found.', 404);
        const data = player.data() || {};
        const guardians = Array.isArray(data.guardianIds) ? data.guardianIds : [];
        if (data.parentId !== auth.uid && !guardians.includes(auth.uid)) {
          throw new RequestBodyError('Only a linked guardian can revoke this invitation.', 403);
        }
        if (typeof data.inviteToken === 'string') {
          transaction.delete(adminDb.collection('invites').doc(data.inviteToken));
        }
        transaction.update(playerRef, {
          pendingInviteEmail: FieldValue.delete(),
          inviteToken: FieldValue.delete(),
          inviteSentAt: FieldValue.delete(),
          inviteExpiresAt: FieldValue.delete(),
        });
      });
      return NextResponse.json({ success: true });
    }

    if (action === 'claim') {
      const token = String(body.token || '').trim();
      if (!/^[a-f0-9]{64}$/.test(token) || !auth.email) {
        return NextResponse.json({ error: 'A valid invitation and authenticated email are required.' }, { status: 400 });
      }
      const inviteRef = adminDb.collection('invites').doc(token);
      const result = await adminDb.runTransaction(async transaction => {
        const invite = await transaction.get(inviteRef);
        if (!invite.exists) throw new RequestBodyError('This invitation is invalid or has been revoked.', 404);
        const data = invite.data() || {};
        if (data.used === true) {
          if (data.usedBy === auth.uid) return inviteResponse(data);
          throw new RequestBodyError('This invitation has already been used.', 409);
        }
        if (typeof data.expiresAt !== 'string' || Date.parse(data.expiresAt) <= Date.now()) {
          throw new RequestBodyError('This invitation has expired.', 410);
        }
        if (normalizeEmail(data.email) !== normalizeEmail(auth.email)) {
          throw new RequestBodyError('The signed-in email does not match this invitation.', 403);
        }

        const childId = String(data.childId || '');
        if (!ID_PATTERN.test(childId)) throw new RequestBodyError('Invitation data is invalid.', 409);
        const playerRef = adminDb.collection('players').doc(childId);
        const player = await transaction.get(playerRef);
        if (!player.exists) throw new RequestBodyError('Athlete not found.', 404);
        const playerData = player.data() || {};
        if (playerData.inviteToken !== token || playerData.parentId !== data.parentId) {
          throw new RequestBodyError('This invitation is no longer active.', 409);
        }
        if (playerData.userId && playerData.userId !== auth.uid) {
          throw new RequestBodyError('This athlete is already linked to another account.', 409);
        }

        const displayName = [data.childFirstName, data.childLastName].filter(Boolean).join(' ').trim() || 'Athlete';
        transaction.set(adminDb.collection('users').doc(auth.uid), {
          id: auth.uid,
          fullName: displayName,
          email: normalizeEmail(auth.email),
          role: 'youth_player',
          linkedPlayerId: childId,
          parentId: data.parentId,
          createdAt: new Date().toISOString(),
          activePlanId: null,
          notificationsEnabled: true,
        }, { merge: true });
        transaction.update(playerRef, {
          hasLogin: true,
          userId: auth.uid,
          loginEmail: normalizeEmail(auth.email),
          pendingInviteEmail: FieldValue.delete(),
          inviteToken: FieldValue.delete(),
          inviteSentAt: FieldValue.delete(),
          inviteExpiresAt: FieldValue.delete(),
        });
        transaction.update(inviteRef, {
          used: true,
          usedBy: auth.uid,
          usedAt: FieldValue.serverTimestamp(),
        });
        return inviteResponse(data);
      });
      return NextResponse.json({ success: true, invite: result });
    }

    return NextResponse.json({ error: 'Unsupported invitation action.' }, { status: 400 });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[youth-invites] Request failed:', error);
    return NextResponse.json({ error: 'Unable to process the invitation.' }, { status: 500 });
  }
}
