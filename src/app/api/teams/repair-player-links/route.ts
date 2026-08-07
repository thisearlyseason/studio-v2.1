import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';
import {
  isRepairableAthlete,
  isValidRepairId,
  playerIdentityForMember,
  playerNamesFromMember,
} from '@/lib/player-link-repair';

const MAX_REPAIRS_PER_REQUEST = 200;

const STAFF_POSITIONS = new Set(['coach', 'head coach', 'assistant coach', 'manager', 'squad leader', 'athletic director', 'staff']);

async function hasRepairAuthority(teamId: string, uid: string, role?: string) {
  const teamRef = adminDb.collection('teams').doc(teamId);
  const teamSnapshot = await teamRef.get();
  if (!teamSnapshot.exists) return null;
  if (role === 'superadmin' || teamSnapshot.data()?.ownerUserId === uid) return teamRef;
  const membersRef = teamRef.collection('members');
  const direct = await membersRef.doc(uid).get();
  const candidates = direct.exists ? [direct] : (await membersRef.where('userId', '==', uid).limit(10).get()).docs;
  const membership = candidates.find(snapshot => {
    const member = snapshot.data() || {};
    const position = String(member.position || '').trim().toLowerCase();
    return member.status !== 'removed' && member.isDeleted !== true && (member.role === 'Admin' || STAFF_POSITIONS.has(position));
  });
  return membership ? teamRef : null;
}

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const limited = await enforceUserRateLimit(auth.uid, 'repair-player-links', 10, 60 * 60 * 1000);
    if (limited) return limited;

    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 8_000);
    const teamId = isValidRepairId(body.teamId) ? body.teamId : '';
    const memberId = isValidRepairId(body.memberId) ? body.memberId : null;
    if (!teamId) return NextResponse.json({ error: 'Invalid squad.' }, { status: 400 });

    const teamRef = await hasRepairAuthority(teamId, auth.uid, auth.role);
    if (!teamRef) {
      return NextResponse.json({ error: 'Only authorized squad staff can repair athlete identities.' }, { status: 403 });
    }

    const membersRef = teamRef.collection('members');
    const members = memberId
      ? [await membersRef.doc(memberId).get()]
      : (await membersRef.limit(MAX_REPAIRS_PER_REQUEST + 1).get()).docs;
    if (members.length > MAX_REPAIRS_PER_REQUEST) {
      return NextResponse.json({ error: 'Squad has too many members to repair at once.' }, { status: 400 });
    }

    const eligible = members.filter(snapshot => snapshot.exists && isRepairableAthlete(snapshot.data()));
    if (memberId && !members[0]?.exists) return NextResponse.json({ error: 'Roster member not found.' }, { status: 404 });

    const now = new Date().toISOString();
    const batch = adminDb.batch();
    const repairs: { memberId: string; playerId: string; created: boolean }[] = [];
    for (const memberSnapshot of eligible) {
      const member = memberSnapshot.data() || {};
      const playerId = playerIdentityForMember(teamId, memberSnapshot.id, member);
      const playerRef = adminDb.collection('players').doc(playerId);
      const playerSnapshot = await playerRef.get();
      const { firstName, lastName } = playerNamesFromMember(member);
      if (!playerSnapshot.exists) {
        batch.create(playerRef, {
          id: playerId,
          firstName,
          lastName,
          isMinor: member.isMinor === true,
          parentId: typeof member.parentId === 'string' ? member.parentId : null,
          userId: typeof member.userId === 'string' ? member.userId : null,
          hasLogin: Boolean(member.userId),
          createdAt: now,
          joinedTeamIds: [teamId],
          migratedFromMemberId: memberSnapshot.id,
        });
      } else {
        batch.set(playerRef, {
          joinedTeamIds: FieldValue.arrayUnion(teamId),
          updatedAt: now,
        }, { merge: true });
      }
      batch.update(memberSnapshot.ref, { playerId, playerLinkRepairedAt: now, playerLinkRepairedBy: auth.uid });
      repairs.push({ memberId: memberSnapshot.id, playerId, created: !playerSnapshot.exists });
    }
    if (repairs.length) await batch.commit();

    return NextResponse.json({ ok: true, repaired: repairs.length, repairs });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[teams/repair-player-links] Error:', error);
    return NextResponse.json({ error: 'Unable to repair athlete identities.' }, { status: 500 });
  }
}
