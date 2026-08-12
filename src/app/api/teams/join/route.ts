import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebase-admin';
import { assertNonAnonymous, verifyFirebaseToken } from '@/lib/api-auth';
import { safeJoinPosition } from '@/lib/account-membership-policy';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';
import { hasStaffRole } from '@/lib/staff-position';
import { findActiveTeamMember } from '@/lib/server-team-access';

const CODE_PATTERN = /^[A-Z0-9_-]{4,32}$/;

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
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  const code = readCode(req);
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
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 4_000);
    const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : '';
    if (!CODE_PATTERN.test(code)) return NextResponse.json({ error: 'Enter a valid squad code.' }, { status: 400 });
    const requestedPlayerId = typeof body.playerId === 'string' ? body.playerId : '';
    const requestedPlayerEnrollment = body.enrollmentIntent === 'player';
    const playerId = requestedPlayerId || `p_${auth.uid}`;
    if (!/^p_[A-Za-z0-9_-]{1,200}$/.test(playerId)) return NextResponse.json({ error: 'Invalid athlete identity.' }, { status: 400 });
    const teamSnapshot = await findTeamByCode(code);
    if (!teamSnapshot) return NextResponse.json({ error: 'Squad code not found.' }, { status: 404 });
    const team = teamSnapshot.data() || {};
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

    await adminDb.runTransaction(async transaction => {
      const [userSnapshot, memberSnapshot, playerSnapshot] = await Promise.all([
        transaction.get(userRef), transaction.get(memberRef), transaction.get(playerRef),
      ]);
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
        transaction.set(playerRef, { userId: auth.uid, hasLogin: true, joinedTeamIds: admin.firestore.FieldValue.arrayUnion(teamSnapshot.id), updatedAt: now }, { merge: true });
      }
      transaction.set(memberRef, {
        ...(memberSnapshot.data() || {}),
        id: memberRef.id, userId: typeof existingPlayer.userId === 'string' || playerId === `p_${auth.uid}` ? (existingPlayer.userId || auth.uid) : auth.uid, playerId, teamId: teamSnapshot.id,
        name: displayName, avatar, parentId: existingPlayer.parentId || null, role: 'Member', position, jersey: '',
        status: 'active', joinedAt: memberSnapshot.data()?.joinedAt || now,
      }, { merge: true });
      transaction.set(membershipRef, {
        teamId: teamSnapshot.id, name: String(team.name || team.teamName || 'Squad'), role: 'Member',
        code, joinedAt: now, type: team.type || 'team', isPro: team.isPro === true, planId: team.planId || 'free',
      }, { merge: true });
    });
    return NextResponse.json({ ok: true, teamId: teamSnapshot.id, playerId });
  } catch (error) {
    if (error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message === 'CHILD_FORBIDDEN') return NextResponse.json({ error: 'You can only enroll a linked child profile.' }, { status: 403 });
    if (error instanceof Error && error.message === 'STAFF_MEMBERSHIP_EXISTS') return NextResponse.json({ error: 'You already have staff access to this squad.' }, { status: 409 });
    console.error('[teams/join] Error:', error);
    return NextResponse.json({ error: 'Unable to join the squad.' }, { status: 500 });
  }
}
