import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb, ensureAdminInit } from '@/lib/firebase-admin';
import { youthInvitationEmail } from '@/lib/email-templates';
import { getResend } from '@/lib/server-resend-client';
import {
  captureYouthInvitePlayerState,
  INVITE_PLAYER_FIELDS,
  youthInviteRollbackPlan,
  type YouthInvitePlayerState,
} from '@/lib/youth-invite-rotation';
import {
  enforcePublicRateLimit,
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

const TOKEN_PATTERN = /^[a-f0-9]{48}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const FROM = 'The Squad Pro <noreply@thesquad.pro>';

function cleanChildId(value: unknown): string | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) return null;
  return value;
}

function inviteIsUsable(data: Record<string, any>): boolean {
  if (data.used === true || typeof data.expiresAt !== 'string') return false;
  const expiry = new Date(data.expiresAt).getTime();
  return Number.isFinite(expiry) && expiry > Date.now();
}

async function invitationWasConsumed(
  inviteRef: FirebaseFirestore.DocumentReference,
  timeoutMs = 750
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  do {
    const snapshot = await inviteRef.get();
    if (!snapshot.exists || !inviteIsUsable(snapshot.data() || {})) return true;
    if (Date.now() >= deadline) return false;
    await new Promise(resolve => setTimeout(resolve, 25));
  } while (true);
}

async function rollbackYouthInviteDelivery(
  inviteRef: FirebaseFirestore.DocumentReference,
  playerRef: FirebaseFirestore.DocumentReference,
  token: string,
  previousInviteRef: FirebaseFirestore.DocumentReference | null,
  previousInvite: Record<string, unknown> | null,
  previousPlayer: YouthInvitePlayerState,
) {
  await adminDb.runTransaction(async transaction => {
    const [inviteSnapshot, playerSnapshot] = await Promise.all([
      transaction.get(inviteRef),
      transaction.get(playerRef),
    ]);
    const plan = youthInviteRollbackPlan({
      currentToken: playerSnapshot.data()?.inviteToken,
      replacementToken: token,
      previousInvite,
      previousPlayer,
    });
    if (!plan) return;
    if (inviteSnapshot.exists && inviteSnapshot.data()?.token === token) {
      transaction.delete(inviteRef);
    }
    if (previousInviteRef && plan.restorePreviousInvite) {
      transaction.set(previousInviteRef, plan.restorePreviousInvite);
    }
    const restorePlayer = Object.fromEntries(INVITE_PLAYER_FIELDS.map(field => [
      field,
      Object.prototype.hasOwnProperty.call(plan.restorePlayer, field)
        ? plan.restorePlayer[field]
        : admin.firestore.FieldValue.delete(),
    ]));
    transaction.update(playerRef, restorePlayer);
  });
}

type AuthorizedMembershipBinding = {
  teamId: string;
  memberId: string;
};

function activeChildRosterBinding(
  childId: string,
  parentId: string,
  path: string,
  data: Record<string, any>
): AuthorizedMembershipBinding | null {
  const segments = path.split('/');
  if (
    segments.length !== 4 ||
    segments[0] !== 'teams' ||
    segments[2] !== 'members' ||
    data.parentId !== parentId ||
    data.status === 'removed' ||
    data.isDeleted === true ||
    (data.playerId !== childId && segments[3] !== childId)
  ) {
    return null;
  }
  const teamId = cleanChildId(segments[1]);
  const memberId = cleanChildId(segments[3]);
  return teamId && memberId ? { teamId, memberId } : null;
}

async function findAuthorizedMemberships(
  childId: string,
  parentId: string
): Promise<AuthorizedMembershipBinding[]> {
  const candidates = await adminDb
    .collectionGroup('members')
    .where('parentId', '==', parentId)
    .limit(200)
    .get();
  const bindings = candidates.docs
    .map(snapshot => activeChildRosterBinding(childId, parentId, snapshot.ref.path, snapshot.data()))
    .filter((binding): binding is AuthorizedMembershipBinding => binding !== null);
  return [...new Map(bindings.map(binding => [`${binding.teamId}/${binding.memberId}`, binding])).values()];
}

function readAuthorizedMemberships(value: unknown): AuthorizedMembershipBinding[] | null {
  // Invitations created before membership binding remain redeemable, but they
  // cannot mint team authority. Teamless children intentionally use [].
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const bindings: AuthorizedMembershipBinding[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') return null;
    const teamId = cleanChildId((candidate as Record<string, unknown>).teamId);
    const memberId = cleanChildId((candidate as Record<string, unknown>).memberId);
    if (!teamId || !memberId) return null;
    bindings.push({ teamId, memberId });
  }
  return [...new Map(bindings.map(binding => [`${binding.teamId}/${binding.memberId}`, binding])).values()];
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

    const authorizedMemberships = await findAuthorizedMemberships(childId, auth.uid);
    const token = randomBytes(24).toString('hex');
    const sentAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + INVITE_LIFETIME_MS).toISOString();
    const inviteRef = adminDb.collection('invites').doc(token);
    const previousPlayer = captureYouthInvitePlayerState(player);
    const previousToken = typeof player.inviteToken === 'string' && TOKEN_PATTERN.test(player.inviteToken)
      ? player.inviteToken
      : null;
    const previousInviteRef = previousToken ? adminDb.collection('invites').doc(previousToken) : null;
    const previousInviteSnapshot = previousInviteRef ? await previousInviteRef.get() : null;
    const previousInviteData = previousInviteSnapshot?.data() || null;
    const previousInvite = previousInviteSnapshot?.exists && previousInviteData && inviteIsUsable(previousInviteData)
      ? previousInviteData
      : null;
    const batch = adminDb.batch();
    if (previousInviteRef) {
      batch.delete(previousInviteRef);
    }
    batch.create(inviteRef, {
      token,
      childId,
      childFirstName: typeof player.firstName === 'string' ? player.firstName : 'Athlete',
      childLastName: typeof player.lastName === 'string' ? player.lastName : '',
      parentId: auth.uid,
      createdBy: auth.uid,
      email,
      authorizedMemberships,
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

    const childName = [player.firstName, player.lastName]
      .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      .join(' ')
      .trim() || 'Athlete';
    const guardian = await adminDb.collection('users').doc(auth.uid).get();
    const guardianName = typeof guardian.data()?.fullName === 'string'
      ? guardian.data()!.fullName
      : '';
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://www.thesquad.pro').replace(/\/$/, '');
    const invitationLink = `${appUrl}/signup/youth?token=${encodeURIComponent(token)}`;
    const invitation = youthInvitationEmail({ childName, guardianName, invitationLink, expiresAt });
    try {
      const { data, error } = await getResend().emails.send({
        from: FROM,
        to: [email],
        subject: invitation.subject,
        html: invitation.html,
      });
      if (error || !data?.id) throw new Error('Resend did not accept the invitation.');
    } catch (deliveryError) {
      await rollbackYouthInviteDelivery(
        inviteRef,
        playerRef,
        token,
        previousInviteRef,
        previousInvite,
        previousPlayer,
      );
      console.error('[invites/youth POST] Email delivery failed:', deliveryError);
      throw new RequestBodyError('Invitation email delivery failed.', 502);
    }

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
  let redeemInviteRef: FirebaseFirestore.DocumentReference | null = null;
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
    redeemInviteRef = inviteRef;
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
      const playerData = playerSnapshot.data() || {};
      const authorizedMemberships = readAuthorizedMemberships(freshInvite.authorizedMemberships);
      if (!freshInviteSnapshot.exists || !inviteIsUsable(freshInvite)) {
        throw new Error('Invitation no longer available.');
      }
      if (
        freshInvite.childId !== invite.childId ||
        freshInvite.email !== invite.email ||
        !playerSnapshot.exists ||
        playerData.parentId !== freshInvite.parentId ||
        authorizedMemberships === null
      ) {
        throw new Error('Invitation data does not match the child profile.');
      }

      const boundMemberships = await Promise.all(authorizedMemberships.map(async binding => {
        const memberRef = adminDb
          .collection('teams')
          .doc(binding.teamId)
          .collection('members')
          .doc(binding.memberId);
        const teamRef = adminDb.collection('teams').doc(binding.teamId);
        const [memberSnapshot, teamSnapshot] = await Promise.all([
          transaction.get(memberRef),
          transaction.get(teamRef),
        ]);
        const memberData = memberSnapshot.data() || {};
        const activeBinding = activeChildRosterBinding(
          freshInvite.childId,
          freshInvite.parentId,
          memberRef.path,
          memberData
        );
        if (
          !memberSnapshot.exists ||
          !teamSnapshot.exists ||
          !activeBinding ||
          activeBinding.teamId !== binding.teamId ||
          activeBinding.memberId !== binding.memberId
        ) {
          throw new RequestBodyError('The child roster membership changed after this invitation was created.', 409);
        }
        return { binding, memberData, team: teamSnapshot.data() || {} };
      }));

      const userRef = adminDb.collection('users').doc(userRecord.uid);
      const playerRef = adminDb.collection('players').doc(freshInvite.childId);
      const joinedAt = new Date().toISOString();
      transaction.create(userRef, {
        id: userRecord.uid,
        fullName: displayName,
        name: displayName,
        email: invite.email,
        role: 'youth_player',
        linkedPlayerId: freshInvite.childId,
        parentId: freshInvite.parentId,
        createdAt: joinedAt,
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
      for (const { binding, memberData, team } of boundMemberships) {
        transaction.create(
          adminDb.collection('teams').doc(binding.teamId).collection('members').doc(userRecord.uid),
          {
            id: userRecord.uid,
            userId: userRecord.uid,
            name: displayName,
            email: invite.email,
            role: 'Member',
            position: 'Player',
            status: 'active',
            isDeleted: false,
            playerId: freshInvite.childId,
            parentId: freshInvite.parentId,
            teamId: binding.teamId,
            ownerUserId: team.ownerUserId || memberData.ownerUserId || null,
            joinedAt,
          }
        );
        transaction.create(
          adminDb.collection('users').doc(userRecord.uid).collection('teamMemberships').doc(binding.teamId),
          {
            teamId: binding.teamId,
            name: team.teamName || team.name || 'Squad',
            teamName: team.teamName || team.name || 'Squad',
            userId: userRecord.uid,
            status: 'active',
            role: 'Member',
            position: 'Player',
            playerId: freshInvite.childId,
            ownerUserId: team.ownerUserId || memberData.ownerUserId || null,
            planId: team.planId || null,
            plan_type: team.plan_type || 'free',
            isPro: team.isPro === true,
            isDemo: team.isDemo === true,
            outboundProvidersEnabled: team.outboundProvidersEnabled === true,
            type: team.type || 'team',
            ...(team.schoolId ? { schoolId: team.schoolId } : {}),
            joinedAt,
          }
        );
      }
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
    if (conflict && redeemInviteRef && await invitationWasConsumed(redeemInviteRef)) {
      return NextResponse.json(
        { error: 'Invitation not found or expired.' },
        { status: 404 }
      );
    }
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
