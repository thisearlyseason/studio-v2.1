import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebase-admin';
import {
  choosePaidTeamIds,
  isActiveSubscriptionMutationLock,
} from '@/lib/subscription-seat-policy';
import { isBillableSquadSeat } from '@/lib/team-seat-policy';

const MAX_RECONCILED_TEAMS = 200;

export type PaidSeatReconciliation = {
  paidTeamIds: string[];
  releasedTeamIds: string[];
  selectedTeamAllocated: boolean;
};

export async function reconcilePaidTeamSeats(input: {
  userId: string;
  planType: string;
  entitled: boolean;
  capacity: number;
  selectedTeamId?: string | null;
  userUpdates: Record<string, unknown>;
  requiredMutationKey?: string;
}): Promise<PaidSeatReconciliation> {
  const userRef = adminDb.collection('users').doc(input.userId);
  const ownedTeamsQuery = adminDb
    .collection('teams')
    .where('ownerUserId', '==', input.userId);

  return adminDb.runTransaction(async transaction => {
    const [userSnapshot, teamsSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(ownedTeamsQuery),
    ]);
    if (!userSnapshot.exists) throw new Error('ENTITLEMENT_USER_NOT_FOUND');
    const mutationLock = userSnapshot.data()?.subscriptionMutation;
    const mutationLockActive = isActiveSubscriptionMutationLock(
      mutationLock,
      Date.now()
    );
    if (input.requiredMutationKey) {
      if (mutationLock?.key !== input.requiredMutationKey) {
        throw new Error('SUBSCRIPTION_MUTATION_LOCK_LOST');
      }
    } else if (mutationLockActive) {
      throw new Error('SUBSCRIPTION_MUTATION_IN_PROGRESS');
    }

    const allOwnedTeams = new Map(teamsSnapshot.docs.map(teamDoc => [teamDoc.id, teamDoc]));
    const billableTeams = teamsSnapshot.docs.filter(teamDoc =>
      isBillableSquadSeat(teamDoc.data())
    );
    const ownedTeams = new Map(billableTeams.map(teamDoc => [teamDoc.id, teamDoc]));
    const allocatedTeamIds = billableTeams
      .filter(teamDoc => teamDoc.data().isPro === true)
      .map(teamDoc => teamDoc.id);
    const selectedTeamId =
      input.selectedTeamId && ownedTeams.has(input.selectedTeamId)
        ? input.selectedTeamId
        : null;
    const paidTeamIds = choosePaidTeamIds({
      allocatedTeamIds,
      selectedTeamId,
      entitled: input.entitled,
      capacity: input.capacity,
    });
    const paidTeamIdSet = new Set(paidTeamIds);
    const candidateIds = new Set(allocatedTeamIds);
    if (selectedTeamId) candidateIds.add(selectedTeamId);
    teamsSnapshot.docs
      .filter(teamDoc => !isBillableSquadSeat(teamDoc.data()))
      .forEach(teamDoc => candidateIds.add(teamDoc.id));
    const updates = [...candidateIds]
      .map(teamId => allOwnedTeams.get(teamId))
      .filter((teamDoc): teamDoc is FirebaseFirestore.QueryDocumentSnapshot => Boolean(teamDoc));

    if (updates.length > MAX_RECONCILED_TEAMS) {
      throw new Error('TOO_MANY_ALLOCATED_TEAMS');
    }

    const updatedAt = new Date().toISOString();
    transaction.update(userRef, {
      ...input.userUpdates,
      ...(!input.requiredMutationKey && mutationLock
        ? { subscriptionMutation: admin.firestore.FieldValue.delete() }
        : {}),
    });
    updates.forEach(teamDoc => {
      const team = teamDoc.data();
      const keepPaid = isBillableSquadSeat(team)
        ? paidTeamIdSet.has(teamDoc.id)
        : input.entitled;
      const planId = keepPaid ? input.planType : 'free';
      transaction.update(teamDoc.ref, {
        planId,
        isPro: keepPaid,
        last_plan_sync: updatedAt,
      });
      transaction.set(
        userRef.collection('teamMemberships').doc(teamDoc.id),
        {
          teamId: teamDoc.id,
          name: team.name || team.teamName || 'Squad',
          ownerUserId: input.userId,
          ...(team.type ? { type: team.type } : {}),
          ...(team.schoolId ? { schoolId: team.schoolId } : {}),
          planId,
          isPro: keepPaid,
          last_plan_sync: updatedAt,
        },
        { merge: true }
      );
    });

    return {
      paidTeamIds,
      releasedTeamIds: allocatedTeamIds.filter(teamId => !paidTeamIdSet.has(teamId)),
      selectedTeamAllocated: Boolean(
        selectedTeamId && paidTeamIdSet.has(selectedTeamId)
      ),
    };
  });
}
