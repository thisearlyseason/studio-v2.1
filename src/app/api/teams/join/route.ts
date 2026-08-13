import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { assertNonAnonymous, verifyFirebaseToken } from '@/lib/api-auth';
import { safeJoinPosition } from '@/lib/account-membership-policy';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';
import { hasStaffRole } from '@/lib/staff-position';
import { findActiveTeamMember } from '@/lib/server-team-access';
import { permitsLegacyOrPaidPortals } from '@/lib/public-portal-data';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const CODE_PATTERN = /^[A-Z0-9_-]{4,32}$/;

function requestKey(req: NextRequest, suffix: string) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return `${(forwarded || 'local').slice(0, 100)}:${suffix}`;
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function teamAcceptsRegistrations(data: FirebaseFirestore.DocumentData) {
  return data.isArchived !== true && data.isActive !== false && data.rapidJoinEnabled !== false &&
    permitsLegacyOrPaidPortals(data.planId, data.plan_type, data.subscriptionPlanId);
}

async function findTeamByCode(code: string) {
  for (const field of ['code', 'teamCode', 'inviteCode']) {
    const result = await adminDb.collection('teams').where(field, '==', code).limit(1).get();
    if (!result.empty) return result.docs[0];
  }
  return null;
}

function readCode(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')?.trim().toUpperCase() || '';
  return CODE_PATTERN.test(code) ? code : '';
}

export async function GET(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get('teamId') || '';
  const code = readCode(req);

  // Shared rapid-join links must resolve before the recipient signs in. The
  // team ID and invite code are both required and must identify the same team.
  if (teamId) {
    try {
      if (!ID_PATTERN.test(teamId) || !code) {
        return NextResponse.json({ error: 'Invalid or incomplete squad invitation.' }, { status: 400 });
      }
      const limited = await enforceUserRateLimit(requestKey(req, teamId), 'rapid-join-session', 20, 60 * 60 * 1000);
      if (limited) return limited;

      const teamRef = adminDb.collection('teams').doc(teamId);
      const team = await teamRef.get();
      const teamData = team.data() || {};
      const validCodes = [teamData.teamCode, teamData.code, teamData.inviteCode]
        .map(value => String(value || '').trim().toUpperCase())
        .filter(Boolean);
      if (!team.exists || !validCodes.includes(code) || !teamAcceptsRegistrations(teamData)) {
        return NextResponse.json({ error: 'This squad invitation is invalid or no longer active.' }, { status: 404 });
      }

      const waiverQuery = await teamRef.collection('documents').where('isActive', '==', true).limit(20).get();
      const waiver = waiverQuery.docs.find(snapshot => snapshot.data().type === 'waiver');
      const sessionToken = randomBytes(32).toString('base64url');
      const expiresAt = Timestamp.fromMillis(Date.now() + 15 * 60 * 1000);
      await adminDb.collection('team_join_sessions').doc(tokenHash(sessionToken)).set({
        teamId,
        expiresAt,
        createdAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({
        data: {
          team: { id: team.id, name: String(teamData.teamName || teamData.name || 'Squad') },
          waiver: waiver ? {
            id: waiver.id,
            title: String(waiver.data().title || 'Participation Waiver'),
            content: String(waiver.data().content || '').slice(0, 50_000),
          } : null,
          sessionToken,
          expiresAt: expiresAt.toDate().toISOString(),
        },
      });
    } catch (error) {
      console.error('[teams/join] Session error:', error);
      return NextResponse.json({ error: 'Unable to open this squad invitation.' }, { status: 500 });
    }
  }

  // The dashboard's code preview remains authenticated and returns only the
  // minimal squad identity needed for its confirmation dialog.
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  if (!code) return NextResponse.json({ error: 'Enter a valid squad code.' }, { status: 400 });
  const limited = await enforceUserRateLimit(auth.uid, 'team-join-preview', 30, 10 * 60 * 1000);
  if (limited) return limited;
  const teamSnapshot = await findTeamByCode(code);
  if (!teamSnapshot) return NextResponse.json({ error: 'Squad code not found.' }, { status: 404 });
  const team = teamSnapshot.data() || {};
  return NextResponse.json({ teamId: teamSnapshot.id, teamName: String(team.name || team.teamName || 'Squad') });
}

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  const nonAnonymous = assertNonAnonymous(auth);
  if (nonAnonymous) return nonAnonymous;

  try {
    const limited = await enforceUserRateLimit(auth.uid, 'team-join', 10, 60 * 60 * 1000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 8_000);
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    const sessionToken = typeof body.sessionToken === 'string' ? body.sessionToken.trim() : '';
    const requestedPlayerId = typeof body.playerId === 'string' ? body.playerId : '';
    const requestedPlayerEnrollment = body.enrollmentIntent === 'player' || sessionToken.length >= 32;
    const playerId = requestedPlayerId || `p_${auth.uid}`;
    if ((!CODE_PATTERN.test(code) && sessionToken.length < 32) || !/^p_[A-Za-z0-9_-]{1,200}$/.test(playerId)) {
      return NextResponse.json({ error: 'A valid squad invitation and athlete are required.' }, { status: 400 });
    }

    const sessionRef = sessionToken
      ? adminDb.collection('team_join_sessions').doc(tokenHash(sessionToken))
      : null;
    const session = sessionRef ? await sessionRef.get() : null;
    const sessionData = session?.data() || {};
    const sessionExpiry = typeof sessionData.expiresAt?.toMillis === 'function' ? sessionData.expiresAt.toMillis() : 0;
    if (sessionRef && (!session?.exists || !ID_PATTERN.test(String(sessionData.teamId || '')) || sessionExpiry < Date.now())) {
      return NextResponse.json({ error: 'This squad invitation has expired. Open the shared link again.' }, { status: 410 });
    }

    const teamSnapshot = sessionRef
      ? await adminDb.collection('teams').doc(String(sessionData.teamId)).get()
      : await findTeamByCode(code);
    if (!teamSnapshot?.exists) return NextResponse.json({ error: 'Squad invitation not found.' }, { status: 404 });
    const team = teamSnapshot.data() || {};
    if (sessionRef && !teamAcceptsRegistrations(team)) {
      return NextResponse.json({ error: 'This squad is not accepting new members.' }, { status: 409 });
    }

    const now = new Date().toISOString();
    const existingSelfMembership = playerId === `p_${auth.uid}`
      ? await findActiveTeamMember(teamSnapshot.id, auth.uid)
      : null;
    if (requestedPlayerEnrollment && hasStaffRole(existingSelfMembership?.data)) {
      return NextResponse.json({ error: 'You already have staff access to this squad.' }, { status: 409 });
    }
    const userRef = adminDb.collection('users').doc(auth.uid);
    const playerRef = adminDb.collection('players').doc(playerId);
    const memberRef = existingSelfMembership?.ref
      || teamSnapshot.ref.collection('members').doc(playerId === `p_${auth.uid}` ? auth.uid : playerId);
    const membershipRef = userRef.collection('teamMemberships').doc(teamSnapshot.id);

    const result = await adminDb.runTransaction(async transaction => {
      const [userSnapshot, memberSnapshot, playerSnapshot, freshSession] = await Promise.all([
        transaction.get(userRef),
        transaction.get(memberRef),
        transaction.get(playerRef),
        sessionRef ? transaction.get(sessionRef) : Promise.resolve(null),
      ]);
      if (sessionRef) {
        const freshSessionData = freshSession?.data() || {};
        const freshExpiry = typeof freshSessionData.expiresAt?.toMillis === 'function' ? freshSessionData.expiresAt.toMillis() : 0;
        if (!freshSession?.exists || freshSessionData.teamId !== teamSnapshot.id || freshExpiry < Date.now()) return 'expired';
      }

      const user = userSnapshot.data() || {};
      const existingPlayer = playerSnapshot.data() || {};
      if (playerId !== `p_${auth.uid}` && existingPlayer.parentId !== auth.uid) throw new Error('CHILD_FORBIDDEN');
      if (requestedPlayerEnrollment && hasStaffRole(memberSnapshot.data())) throw new Error('STAFF_MEMBERSHIP_EXISTS');
      const position = safeJoinPosition({
        profileRole: user.role,
        joiningLinkedChild: playerId !== `p_${auth.uid}`,
        requestedPlayerEnrollment,
      });
      const displayName = String(
        existingPlayer.firstName
          ? `${existingPlayer.firstName} ${existingPlayer.lastName || ''}`.trim()
          : user.name || user.fullName || auth.email?.split('@')[0] || 'Athlete'
      );
      const avatar = String(user.avatar || user.avatarUrl || '');
      if (!playerSnapshot.exists) {
        const [firstName = 'Athlete', ...lastName] = displayName.split(/\s+/).filter(Boolean);
        transaction.create(playerRef, {
          id: playerId, firstName, lastName: lastName.join(' '), userId: auth.uid,
          parentId: null, isMinor: false, hasLogin: true, createdAt: now, joinedTeamIds: [teamSnapshot.id],
        });
      } else {
        transaction.set(playerRef, { userId: auth.uid, hasLogin: true, joinedTeamIds: FieldValue.arrayUnion(teamSnapshot.id), updatedAt: now }, { merge: true });
      }
      transaction.set(memberRef, {
        ...(memberSnapshot.data() || {}),
        id: memberRef.id, userId: existingPlayer.userId || auth.uid, playerId, teamId: teamSnapshot.id,
        name: displayName, avatar, parentId: existingPlayer.parentId || null, role: 'Member', position, jersey: '',
        status: 'active', joinedAt: memberSnapshot.data()?.joinedAt || now,
      }, { merge: true });
      transaction.set(membershipRef, {
        teamId: teamSnapshot.id, name: String(team.name || team.teamName || 'Squad'), role: 'Member',
        code: code || team.code || team.teamCode || team.inviteCode || '', joinedAt: now,
        type: team.type || 'team', isPro: team.isPro === true, planId: team.planId || 'free',
      }, { merge: true });
      if (sessionRef) transaction.delete(sessionRef);
      return memberSnapshot.exists ? 'existing' : 'joined';
    });

    if (result === 'expired') return NextResponse.json({ error: 'This squad invitation has expired.' }, { status: 410 });
    return NextResponse.json({
      ok: true,
      success: true,
      teamId: teamSnapshot.id,
      playerId,
      memberId: memberRef.id,
      teamName: String(team.name || team.teamName || 'Squad'),
      alreadyJoined: result === 'existing',
    });
  } catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message === 'CHILD_FORBIDDEN') return NextResponse.json({ error: 'You can only enroll a linked child profile.' }, { status: 403 });
    if (error instanceof Error && error.message === 'STAFF_MEMBERSHIP_EXISTS') return NextResponse.json({ error: 'You already have staff access to this squad.' }, { status: 409 });
    console.error('[teams/join] Error:', error);
    return NextResponse.json({ error: 'Unable to join the squad.' }, { status: 500 });
  }
}
