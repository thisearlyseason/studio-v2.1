import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { assertNonAnonymous, verifyFirebaseToken } from '@/lib/api-auth';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';
import { hasStaffRole } from '@/lib/staff-position';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

function ownerId(team: FirebaseFirestore.DocumentData): string {
  return String(team.ownerUserId || team.ownerId || team.createdBy || '');
}

function activeMember(member: FirebaseFirestore.DocumentData | undefined): boolean {
  return Boolean(member) && member?.status !== 'removed' && member?.isDeleted !== true;
}

function validStoredDocumentId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 1_500 && !value.includes('/');
}

export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;
  const anonymousError = assertNonAnonymous(auth);
  if (anonymousError) return anonymousError;

  try {
    const limited = await enforceUserRateLimit(auth.uid, 'team-member-lifecycle', 30, 10 * 60 * 1000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<{
      teamId?: unknown;
      memberId?: unknown;
      action?: unknown;
      reason?: unknown;
    }>(request, 8_000);
    const teamId = typeof body.teamId === 'string' ? body.teamId.trim() : '';
    const memberId = typeof body.memberId === 'string' ? body.memberId.trim() : '';
    const action = body.action === 'remove' || body.action === 'reinstate' ? body.action : null;
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (!ID_PATTERN.test(teamId) || !ID_PATTERN.test(memberId) || !action) {
      return NextResponse.json({ error: 'Invalid squad member lifecycle request.' }, { status: 400 });
    }
    if (action === 'remove' && (reason.length < 2 || reason.length > 1_000)) {
      return NextResponse.json({ error: 'Provide a valid decommission reason.' }, { status: 400 });
    }

    const teamRef = adminDb.collection('teams').doc(teamId);
    const membersRef = teamRef.collection('members');
    const targetRef = membersRef.doc(memberId);
    const linkedActorQuery = membersRef.where('userId', '==', auth.uid).limit(10);

    await adminDb.runTransaction(async transaction => {
      // All authorization and lifecycle reads happen before any write so the
      // decision cannot be raced by a concurrent member removal.
      const [teamSnapshot, targetSnapshot, directActorSnapshot, linkedActors] = await Promise.all([
        transaction.get(teamRef),
        transaction.get(targetRef),
        transaction.get(membersRef.doc(auth.uid)),
        transaction.get(linkedActorQuery),
      ]);
      if (!teamSnapshot.exists || !targetSnapshot.exists) throw new Error('NOT_FOUND');

      const team = teamSnapshot.data() || {};
      const target = targetSnapshot.data() || {};
      const linkedActor = linkedActors.docs.find(snapshot => activeMember(snapshot.data()));
      const actorMember = activeMember(directActorSnapshot.data())
        ? directActorSnapshot.data()
        : linkedActor?.data();
      const isOwner = ownerId(team) === auth.uid;
      const isSuperAdmin = auth.role === 'superadmin';
      const isStaff = isOwner || isSuperAdmin || (activeMember(actorMember) && hasStaffRole(actorMember));

      if (!isStaff) throw new Error('FORBIDDEN');
      const targetUserId = typeof target.userId === 'string' ? target.userId : '';
      if ((targetUserId && targetUserId === ownerId(team)) || memberId === ownerId(team)) throw new Error('OWNER_PROTECTED');
      if (!isOwner && !isSuperAdmin && hasStaffRole(target)) throw new Error('PRIVILEGED_TARGET');

      const playerId = typeof target.playerId === 'string' && ID_PATTERN.test(target.playerId)
        ? target.playerId
        : '';
      const playerRef = playerId ? adminDb.collection('players').doc(playerId) : null;
      const playerSnapshot = playerRef ? await transaction.get(playerRef) : null;

      if (action === 'remove') {
        transaction.update(targetRef, {
          status: 'removed',
          removalReason: reason,
          removedAt: FieldValue.serverTimestamp(),
          removedBy: auth.uid,
        });
        if (validStoredDocumentId(targetUserId)) {
          transaction.delete(adminDb.collection('users').doc(targetUserId).collection('teamMemberships').doc(teamId));
        }
        if (playerRef && playerSnapshot?.exists) {
          const player = playerSnapshot.data() || {};
          const joinedTeamIds = Array.isArray(player.joinedTeamIds)
            ? [...new Set(player.joinedTeamIds.filter((id): id is string => typeof id === 'string' && id !== teamId))]
            : [];
          transaction.set(playerRef, {
            joinedTeamIds,
            ...(player.primaryTeamId === teamId ? { primaryTeamId: joinedTeamIds[0] || null } : {}),
          }, { merge: true });
        }
        return;
      }

      transaction.update(targetRef, {
        status: 'active',
        removalReason: FieldValue.delete(),
        removedAt: FieldValue.delete(),
        removedBy: FieldValue.delete(),
      });
      if (validStoredDocumentId(targetUserId)) {
        transaction.set(adminDb.collection('users').doc(targetUserId).collection('teamMemberships').doc(teamId), {
          teamId,
          teamName: String(team.teamName || team.name || 'Squad'),
          name: String(team.teamName || team.name || 'Squad'),
          role: target.role || 'Player',
          position: target.position || 'Player',
          ownerUserId: ownerId(team),
          isPro: team.isPro === true,
          planId: team.planId || team.plan_type || 'free',
          type: team.type || null,
          clubId: team.clubId || null,
          schoolId: team.schoolId || null,
          status: 'active',
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
      if (playerRef && playerSnapshot?.exists) {
        const player = playerSnapshot.data() || {};
        const joinedTeamIds = Array.isArray(player.joinedTeamIds)
          ? [...new Set([...player.joinedTeamIds.filter((id): id is string => typeof id === 'string'), teamId])]
          : [teamId];
        transaction.set(playerRef, { joinedTeamIds }, { merge: true });
      }
    });

    return NextResponse.json({ ok: true, action });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const code = error instanceof Error ? error.message : '';
    if (code === 'NOT_FOUND') return NextResponse.json({ error: 'Squad member not found.' }, { status: 404 });
    if (code === 'FORBIDDEN' || code === 'PRIVILEGED_TARGET' || code === 'OWNER_PROTECTED') {
      return NextResponse.json({ error: 'You do not have permission to change this squad member.' }, { status: 403 });
    }
    console.error('[teams/members/lifecycle] Error:', code || error);
    return NextResponse.json({ error: 'Unable to update this squad member.' }, { status: 500 });
  }
}
