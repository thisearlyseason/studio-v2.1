import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';
import { hasStaffRole, isStaffPosition } from '@/lib/staff-position';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const MAX_REPAIRS_PER_REQUEST = 200;

function identityForMember(teamId: string, memberId: string, member: FirebaseFirestore.DocumentData) {
  const userId = typeof member.userId === 'string' && ID_PATTERN.test(member.userId) ? member.userId : '';
  return userId ? `p_${userId}` : `legacy_${teamId}_${memberId}`;
}

function namesFromMember(member: FirebaseFirestore.DocumentData) {
  const name = typeof member.name === 'string' ? member.name.trim() : '';
  const [firstName = 'Athlete', ...lastName] = name.split(/\s+/).filter(Boolean);
  return { firstName, lastName: lastName.join(' ') };
}

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
    return member.status !== 'removed' && member.isDeleted !== true && hasStaffRole(member);
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
    const teamId = typeof body.teamId === 'string' && ID_PATTERN.test(body.teamId) ? body.teamId : '';
    const memberId = typeof body.memberId === 'string' && ID_PATTERN.test(body.memberId) ? body.memberId : null;
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

    const eligible = members.filter(snapshot => {
      const member = snapshot.data();
      return snapshot.exists && member?.status !== 'removed' && member?.isDeleted !== true && !member?.playerId && !isStaffPosition(member?.position);
    });
    if (memberId && !members[0]?.exists) return NextResponse.json({ error: 'Roster member not found.' }, { status: 404 });

    const now = new Date().toISOString();
    const batch = adminDb.batch();
    const repairs: { memberId: string; playerId: string; created: boolean }[] = [];
    for (const memberSnapshot of eligible) {
      const member = memberSnapshot.data() || {};
      const playerId = identityForMember(teamId, memberSnapshot.id, member);
      const playerRef = adminDb.collection('players').doc(playerId);
      const playerSnapshot = await playerRef.get();
      const { firstName, lastName } = namesFromMember(member);
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
          joinedTeamIds: admin.firestore.FieldValue.arrayUnion(teamId),
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
