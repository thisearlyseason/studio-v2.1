import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb, ensureAdminInit } from '@/lib/firebase-admin';
import {
  enforcePublicRateLimit,
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

const TOKEN_PATTERN = /^[a-f0-9]{48}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

function cleanChildId(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) return null;
  return value;
}

function inviteIsUsable(data: Record<string, any>): boolean {
  if (data.used === true || typeof data.expiresAt !== 'string') return false;
  const expiry = new Date(data.expiresAt).getTime();
  return Number.isFinite(expiry) && expiry > Date.now();
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token') || '';
    if (!TOKEN_PATTERN.test(token)) {
      return NextResponse.json({ error: 'Invitation not found.' }, { status: 404 });
    }
    const rateLimit = await enforcePublicRateLimit(
      req,
      'youth-invite-lookup',
      30,
      10 * 60 * 1000,
      token
    );
    if (rateLimit) return rateLimit;
    const snapshot = await adminDb.collection('invites').doc(token).get();
    const data = snapshot.data() || {};
    if (!snapshot.exists || !inviteIsUsable(data)) {
      return NextResponse.json({ error: 'Invitation not found or expired.' }, { status: 404 });
    }

    return NextResponse.json({
      invite: {
        childFirstName:
          typeof data.childFirstName === 'string' ? data.childFirstName : 'Athlete',
        childLastName:
          typeof data.childLastName === 'string' ? data.childLastName : '',
      },
    });
  } catch (error: any) {
    console.error('[invites/youth GET] Error:', error?.message || error);
    return NextResponse.json({ error: 'Unable to verify this invitation.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const rateLimit = await enforceUserRateLimit(
      auth.uid,
      'youth-invite-manage',
      10,
      60 * 60 * 1000
    );
    if (rateLimit) return rateLimit;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 16_000);
    const action = body.action;
    const childId = cleanChildId(body.childId);
    if (!childId || (action !== 'create' && action !== 'revoke')) {
      return NextResponse.json({ error: 'Invalid invitation request.' }, { status: 400 });
    }

    const playerRef = adminDb.collection('players').doc(childId);
    const playerSnapshot = await playerRef.get();
    const player = playerSnapshot.data() || {};
    if (
      !playerSnapshot.exists ||
      (auth.role !== 'superadmin' && player.parentId !== auth.uid)
    ) {
      return NextResponse.json({ error: 'Child profile not found.' }, { status: 404 });
    }

    if (action === 'revoke') {
      const batch = adminDb.batch();
      if (typeof player.inviteToken === 'string' && TOKEN_PATTERN.test(player.inviteToken)) {
        batch.delete(adminDb.collection('invites').doc(player.inviteToken));
      }
      batch.update(playerRef, {
        pendingInviteEmail: admin.firestore.FieldValue.delete(),
        inviteToken: admin.firestore.FieldValue.delete(),
        inviteSentAt: admin.firestore.FieldValue.delete(),
        inviteExpiresAt: admin.firestore.FieldValue.delete(),
      });
      await batch.commit();
      return NextResponse.json({ ok: true });
    }

    const email =
      typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (player.hasLogin === true || (typeof player.userId === 'string' && player.userId)) {
      return NextResponse.json(
        { error: 'This child already has a login.' },
        { status: 409 }
      );
    }

    const token = randomBytes(24).toString('hex');
    const sentAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + INVITE_LIFETIME_MS).toISOString();
    const inviteRef = adminDb.collection('invites').doc(token);
    const batch = adminDb.batch();
    if (typeof player.inviteToken === 'string' && TOKEN_PATTERN.test(player.inviteToken)) {
      batch.delete(adminDb.collection('invites').doc(player.inviteToken));
    }
    batch.create(inviteRef, {
      token,
      childId,
      childFirstName: typeof player.firstName === 'string' ? player.firstName : 'Athlete',
      childLastName: typeof player.lastName === 'string' ? player.lastName : '',
      parentId: auth.uid,
      createdBy: auth.uid,
      email,
      expiresAt,
      used: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.update(playerRef, {
      pendingInviteEmail: email,
      inviteToken: token,
      inviteSentAt: sentAt,
      inviteExpiresAt: expiresAt,
    });
    await batch.commit();

    return NextResponse.json({ ok: true, token, expiresAt });
  } catch (error: any) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[invites/youth POST] Error:', error?.message || error);
    return NextResponse.json({ error: 'Unable to update this invitation.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  let createdUid: string | null = null;
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 16_000);
    const token = typeof body.token === 'string' ? body.token : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!TOKEN_PATTERN.test(token) || password.length < 8 || password.length > 128) {
      return NextResponse.json({ error: 'Invalid invitation or password.' }, { status: 400 });
    }
    const rateLimit = await enforcePublicRateLimit(
      req,
      'youth-invite-redeem',
      5,
      60 * 60 * 1000,
      token
    );
    if (rateLimit) return rateLimit;

    const inviteRef = adminDb.collection('invites').doc(token);
    const inviteSnapshot = await inviteRef.get();
    const invite = inviteSnapshot.data() || {};
    if (!inviteSnapshot.exists || !inviteIsUsable(invite) || typeof invite.email !== 'string') {
      return NextResponse.json({ error: 'Invitation not found or expired.' }, { status: 404 });
    }

    ensureAdminInit();
    const displayName = `${invite.childFirstName || ''} ${invite.childLastName || ''}`.trim();
    const userRecord = await admin.auth().createUser({
      email: invite.email,
      password,
      displayName,
      // Possession of the single-use invitation delivered to this address is
      // the verification ceremony for a youth account.
      emailVerified: true,
    });
    createdUid = userRecord.uid;

    await adminDb.runTransaction(async transaction => {
      const [freshInviteSnapshot, playerSnapshot] = await Promise.all([
        transaction.get(inviteRef),
        transaction.get(adminDb.collection('players').doc(invite.childId)),
      ]);
      const freshInvite = freshInviteSnapshot.data() || {};
      if (!freshInviteSnapshot.exists || !inviteIsUsable(freshInvite)) {
        throw new Error('Invitation no longer available.');
      }
      if (
        freshInvite.childId !== invite.childId ||
        freshInvite.email !== invite.email ||
        !playerSnapshot.exists ||
        playerSnapshot.data()?.parentId !== freshInvite.parentId
      ) {
        throw new Error('Invitation data does not match the child profile.');
      }

      const userRef = adminDb.collection('users').doc(userRecord.uid);
      const playerRef = adminDb.collection('players').doc(freshInvite.childId);
      transaction.create(userRef, {
        id: userRecord.uid,
        fullName: displayName,
        name: displayName,
        email: invite.email,
        role: 'youth_player',
        linkedPlayerId: freshInvite.childId,
        parentId: freshInvite.parentId,
        createdAt: new Date().toISOString(),
        avatarUrl: `https://picsum.photos/seed/${userRecord.uid}/150/150`,
        notificationsEnabled: true,
        upcomingEventNotificationsEnabled: true,
      });
      transaction.update(playerRef, {
        hasLogin: true,
        userId: userRecord.uid,
        loginEmail: invite.email,
        pendingInviteEmail: admin.firestore.FieldValue.delete(),
        inviteToken: admin.firestore.FieldValue.delete(),
        inviteSentAt: admin.firestore.FieldValue.delete(),
        inviteExpiresAt: admin.firestore.FieldValue.delete(),
      });
      transaction.delete(inviteRef);
    });

    return NextResponse.json({
      ok: true,
      displayName,
      childFirstName:
        typeof invite.childFirstName === 'string' ? invite.childFirstName : 'Athlete',
    });
  } catch (error: any) {
    if (createdUid) {
      ensureAdminInit();
      await admin.auth().deleteUser(createdUid).catch(() => {});
    }
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const conflict =
      error?.code === 'auth/email-already-exists' ||
      error?.code === 'auth/email-already-in-use';
    console.error('[invites/youth PUT] Error:', error?.code || error?.message || error);
    return NextResponse.json(
      {
        error: conflict
          ? 'An account with this email already exists.'
          : 'Unable to create the youth account.',
      },
      { status: conflict ? 409 : 400 }
    );
  }
}
