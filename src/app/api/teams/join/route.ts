import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { permitsLegacyOrPaidPortals } from '@/lib/public-portal-data';
import { isActiveTeamMembership } from '@/lib/team-membership-security';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const CODE_PATTERN = /^[A-Z0-9]{3,20}$/;

function requestKey(req: NextRequest, suffix: string) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return `${(forwarded || 'local').slice(0, 100)}:${suffix}`;
}

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function teamAcceptsRegistrations(data: FirebaseFirestore.DocumentData) {
  return data.isArchived !== true && data.isActive !== false &&
    data.rapidJoinEnabled !== false && permitsLegacyOrPaidPortals(data.planId, data.plan_type);
}

async function findTeamByCode(code: string) {
  for (const field of ['teamCode', 'code', 'inviteCode']) {
    const snapshot = await adminDb.collection('teams').where(field, '==', code).limit(1).get();
    if (!snapshot.empty) return snapshot.docs[0];
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const teamId = req.nextUrl.searchParams.get('teamId') || '';
    const code = String(req.nextUrl.searchParams.get('code') || '').trim().toUpperCase();
    if (!ID_PATTERN.test(teamId) || !CODE_PATTERN.test(code)) {
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
    const waiver = waiverQuery.docs.find(snapshot => {
      const data = snapshot.data();
      return data.type === 'waiver';
    });
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

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const limited = await enforceUserRateLimit(auth.uid, 'join-team', 20, 60 * 60 * 1000);
    if (limited) return limited;

    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 8_000);
    const code = String(body.code || '').trim().toUpperCase();
    const sessionToken = String(body.sessionToken || '').trim();
    const playerId = String(body.playerId || '').trim();
    const position = String(body.position || 'Player').trim().slice(0, 100) || 'Player';
    if ((!CODE_PATTERN.test(code) && sessionToken.length < 32) || !ID_PATTERN.test(playerId)) {
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

    const team = sessionRef
      ? await adminDb.collection('teams').doc(String(sessionData.teamId)).get()
      : await findTeamByCode(code);
    if (!team) return NextResponse.json({ error: 'Squad invitation not found.' }, { status: 404 });

    const teamData = team.data() || {};
    if (!teamAcceptsRegistrations(teamData)) {
      return NextResponse.json({ error: 'This squad is not accepting new members.' }, { status: 409 });
    }

    const playerRef = adminDb.collection('players').doc(playerId);
    const userRef = adminDb.collection('users').doc(auth.uid);
    const [player, user] = await Promise.all([playerRef.get(), userRef.get()]);
    if (!player.exists) return NextResponse.json({ error: 'Athlete profile not found.' }, { status: 404 });

    const playerData = player.data() || {};
    const isOwnProfile = playerData.userId === auth.uid || playerId === `p_${auth.uid}`;
    const isGuardian = playerData.parentId === auth.uid;
    if (!isOwnProfile && !isGuardian) {
      return NextResponse.json({ error: 'You can only join a squad for yourself or your linked athlete.' }, { status: 403 });
    }

    const memberId = isGuardian ? playerId : auth.uid;
    const memberRef = team.ref.collection('members').doc(memberId);
    const membershipRef = userRef.collection('teamMemberships').doc(`${team.id}_${memberId}`);
    const userData = user.data() || {};
    const memberName = [playerData.firstName, playerData.lastName].filter(Boolean).join(' ')
      || userData.fullName || userData.name || auth.email || 'Squad Member';
    const joinedAt = new Date().toISOString();

    const result = await adminDb.runTransaction(async transaction => {
      const member = await transaction.get(memberRef);
      if (sessionRef) {
        const freshSession = await transaction.get(sessionRef);
        const freshSessionData = freshSession.data() || {};
        const freshExpiry = typeof freshSessionData.expiresAt?.toMillis === 'function' ? freshSessionData.expiresAt.toMillis() : 0;
        if (!freshSession.exists || freshSessionData.teamId !== team.id || freshExpiry < Date.now()) return 'expired';
      }

      if (!member.exists || !isActiveTeamMembership(member.data())) {
        const capacity = Math.max(0, Number(teamData.rosterLimit || teamData.maxMembers || teamData.capacity || 0));
        if (capacity > 0) {
          const roster = await transaction.get(team.ref.collection('members'));
          const activeRosterSize = roster.docs.filter(snapshot => isActiveTeamMembership(snapshot.data())).length;
          if (activeRosterSize >= capacity) return 'full';
        }
      }

      transaction.set(membershipRef, {
        teamId: team.id,
        playerId: memberId,
        name: teamData.teamName || teamData.name || 'Squad',
        role: 'Member',
        code: teamData.code || teamData.teamCode || teamData.inviteCode,
        joinedAt,
      }, { merge: true });
      transaction.set(memberRef, {
        id: memberId,
        userId: auth.uid,
        playerId,
        parentId: isGuardian ? auth.uid : (playerData.parentId || null),
        name: memberName,
        role: 'Member',
        position,
        joinedAt,
        avatar: playerData.photoURL || userData.avatar || userData.avatarUrl || '',
        ownerUserId: teamData.ownerUserId,
        teamId: team.id,
        schoolId: teamData.schoolId || null,
        email: userData.email || auth.email || null,
        parentEmail: isGuardian ? (userData.email || auth.email || null) : null,
        status: 'active',
      }, { merge: true });
      transaction.set(playerRef, {
        primaryTeamId: playerData.primaryTeamId || team.id,
        joinedTeamIds: FieldValue.arrayUnion(team.id),
      }, { merge: true });
      if (sessionRef) transaction.delete(sessionRef);
      return member.exists && isActiveTeamMembership(member.data()) ? 'existing' : 'joined';
    });

    if (result === 'expired') return NextResponse.json({ error: 'This squad invitation has expired.' }, { status: 410 });
    if (result === 'full') return NextResponse.json({ error: 'This squad is already at capacity.' }, { status: 409 });
    return NextResponse.json({
      success: true,
      teamId: team.id,
      memberId,
      teamName: teamData.teamName || teamData.name || 'Squad',
      alreadyJoined: result === 'existing',
    });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[teams/join] Error:', error);
    return NextResponse.json({ error: 'Unable to join this squad.' }, { status: 500 });
  }
}
