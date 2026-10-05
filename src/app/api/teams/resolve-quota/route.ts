import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, assertNonAnonymous } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';
import {
  isEntitledSubscriptionStatus,
  isPaidPlanType,
} from '@/lib/server-team-entitlements';
import { isBillableSquadSeat } from '@/lib/team-seat-policy';
import { isActiveSubscriptionMutationLock } from '@/lib/subscription-seat-policy';

const MAX_OWNED_TEAMS = 200;

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  const anonymousCheck = assertNonAnonymous(auth);
  if (anonymousCheck) return anonymousCheck;

  try {
    const { selectedTeamIds } = await readJsonBodyWithLimit<{
      selectedTeamIds?: unknown;
    }>(req, 16_000);
    if (
      !Array.isArray(selectedTeamIds) ||
      selectedTeamIds.some(teamId => typeof teamId !== 'string' || !teamId) ||
      new Set(selectedTeamIds).size !== selectedTeamIds.length
    ) {
      return NextResponse.json({ error: 'A valid team selection is required.' }, { status: 400 });
    }

    const rateLimit = await enforceUserRateLimit(
      auth.uid,
      'teams-resolve-quota',
      10,
      60 * 60 * 1000
    );
    if (rateLimit) return rateLimit;

    const userRef = adminDb.collection('users').doc(auth.uid);
    const ownedTeamsQuery = adminDb.collection('teams').where('ownerUserId', '==', auth.uid);
    const selected = new Set(selectedTeamIds);

    const releasedTeamIds = await adminDb.runTransaction(async transaction => {
      const [userSnap, teamsSnap] = await Promise.all([
        transaction.get(userRef),
        transaction.get(ownedTeamsQuery),
      ]);
      if (!userSnap.exists) throw new Error('USER_NOT_FOUND');
      if (teamsSnap.size > MAX_OWNED_TEAMS) throw new Error('TOO_MANY_TEAMS');

      const user = userSnap.data()!;
      if (isActiveSubscriptionMutationLock(user.subscriptionMutation, Date.now())) {
        throw new Error('SUBSCRIPTION_MUTATION_IN_PROGRESS');
      }
      if (
        !isPaidPlanType(user.plan_type) ||
        !isEntitledSubscriptionStatus(user.subscription_status)
      ) {
        throw new Error('NO_PAID_PLAN');
      }

      const configuredTeamLimit = Number(user.team_limit);
      const teamLimit = Number.isInteger(configuredTeamLimit) && configuredTeamLimit >= 0
        ? configuredTeamLimit
        : 0;
      if (selected.size > teamLimit) throw new Error('OVER_LIMIT');

      const allocatedTeams = teamsSnap.docs.filter(teamDoc =>
        teamDoc.data().isPro === true && isBillableSquadSeat(teamDoc.data())
      );
      const allocatedIds = new Set(allocatedTeams.map(teamDoc => teamDoc.id));
      if ([...selected].some(teamId => !allocatedIds.has(teamId))) {
        throw new Error('INVALID_SELECTION');
      }

      const updatedAt = new Date().toISOString();
      const released: string[] = [];
      allocatedTeams.forEach(teamDoc => {
        if (selected.has(teamDoc.id)) return;
        const team = teamDoc.data();
        released.push(teamDoc.id);
        transaction.update(teamDoc.ref, {
          isPro: false,
          planId: 'free',
          last_plan_sync: updatedAt,
        });
        transaction.set(
          userRef.collection('teamMemberships').doc(teamDoc.id),
          {
            teamId: teamDoc.id,
            name: team.name || team.teamName || 'Squad',
            ownerUserId: auth.uid,
            ...(team.type ? { type: team.type } : {}),
            ...(team.schoolId ? { schoolId: team.schoolId } : {}),
            isPro: false,
            planId: 'free',
            last_plan_sync: updatedAt,
          },
          { merge: true }
        );
      });

      transaction.update(userRef, {
        quota_resolved_at: updatedAt,
      });
      return released;
    });

    return NextResponse.json({ success: true, releasedTeamIds });
  } catch (err: any) {
    if (err instanceof RequestBodyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err.message === 'USER_NOT_FOUND') {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }
    if (err.message === 'NO_PAID_PLAN') {
      return NextResponse.json({ error: 'An active paid plan is required.' }, { status: 403 });
    }
    if (err.message === 'OVER_LIMIT') {
      return NextResponse.json({ error: 'Selected teams exceed the paid team limit.' }, { status: 409 });
    }
    if (err.message === 'SUBSCRIPTION_MUTATION_IN_PROGRESS') {
      return NextResponse.json({ error: 'A subscription change is still being processed. Try again shortly.' }, { status: 409 });
    }
    if (err.message === 'INVALID_SELECTION') {
      return NextResponse.json({ error: 'Only currently allocated teams can be selected.' }, { status: 400 });
    }
    if (err.message === 'TOO_MANY_TEAMS') {
      return NextResponse.json({ error: 'Too many teams to reconcile automatically.' }, { status: 409 });
    }
    console.error('[teams/resolve-quota] Error:', err.message);
    return NextResponse.json({ error: 'Unable to resolve the team quota.' }, { status: 500 });
  }
}
