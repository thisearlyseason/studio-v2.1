import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe-client';
import { verifyFirebaseToken, assertOwner, assertNonAnonymous } from '@/lib/api-auth';
import {
  PLAN_PRICE_MAP,
  EXTRA_TEAM_PRICE_IDS,
  PRICE_BILLING_CYCLE,
} from '@/lib/stripe-price-map';
import { isEntitledSubscriptionStatus } from '@/lib/server-team-entitlements';
import { reconcilePaidTeamSeats } from '@/lib/server-subscription-seats';
import { chooseAuthoritativeSubscriptionId } from '@/lib/subscription-seat-policy';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';
import {
  claimSubscriptionMutation,
  releaseSubscriptionMutation,
  SubscriptionMutationInProgressError,
} from '@/lib/server-subscription-mutation-lock';

function hasRecognizedBasePlan(subscription: Stripe.Subscription): boolean {
  return subscription.items.data.some(item => Boolean(PLAN_PRICE_MAP[item.price.id]));
}

export async function POST(req: NextRequest) {
  // Authenticate caller
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  const anonymousCheck = assertNonAnonymous(auth);
  if (anonymousCheck) return anonymousCheck;
  let claimed: { ref: FirebaseFirestore.DocumentReference; key: string } | null = null;

  try {
    const { userId, operationId } = await readJsonBodyWithLimit<{
      userId?: unknown;
      operationId?: unknown;
    }>(req, 8_000);

    if (
      typeof userId !== 'string' ||
      typeof operationId !== 'string' ||
      !/^[A-Za-z0-9_-]{16,100}$/.test(operationId)
    ) return NextResponse.json({ error: 'A valid subscription sync request is required.' }, { status: 400 });

    // Verify the caller owns this account
    const ownerCheck = assertOwner(auth, userId);
    if (ownerCheck) return ownerCheck;
    const rateLimit = await enforceUserRateLimit(auth.uid, 'subscription-sync', 12, 60 * 60 * 1000);
    if (rateLimit) return rateLimit;

    const stripe = getStripe();

    const userRef = adminDb.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const userData = userSnap.data()!;
    const customerId = userData.stripe_customer_id;

    if (!customerId) {
      return NextResponse.json({ error: 'No Stripe customer associated with this account.' }, { status: 400 });
    }
    const mutationKey = `sync:${operationId}`;
    await claimSubscriptionMutation(userRef, mutationKey);
    claimed = { ref: userRef, key: mutationKey };

    // List ALL subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
    });

    const fallbackSubscriptionId =
      userData.stripe_subscription_id || subscriptions.data[0]?.id || '';
    const authoritativeSubscriptionId = fallbackSubscriptionId
      ? chooseAuthoritativeSubscriptionId({
          eventSubscriptionId: fallbackSubscriptionId,
          subscriptions: subscriptions.data.map(subscription => ({
            id: subscription.id,
            status: subscription.status,
            created: subscription.created,
            hasRecognizedBasePlan: hasRecognizedBasePlan(subscription),
          })),
        })
      : '';
    const activeSub = subscriptions.data.find(
      subscription => subscription.id === authoritativeSubscriptionId &&
        isEntitledSubscriptionStatus(subscription.status) &&
        hasRecognizedBasePlan(subscription)
    );

    let planType = 'free';
    let baseTeamLimit = 0;
    let extraTeams = 0;
    let billingCycle: 'monthly' | 'annual' | null = null;

    if (activeSub) {
      for (const item of activeSub.items.data) {
        const resolved = PLAN_PRICE_MAP[item.price.id];
        if (resolved) {
          planType = resolved.id;
          baseTeamLimit = resolved.teamLimit;
          billingCycle = PRICE_BILLING_CYCLE[item.price.id] || null;
        } else if (
          item.price.id === EXTRA_TEAM_PRICE_IDS.monthly ||
          item.price.id === EXTRA_TEAM_PRICE_IDS.annual
        ) {
          extraTeams = item.quantity || 0;
        }
      }
    }
    const hasPaidEntitlement = Boolean(activeSub && planType !== 'free');
    const totalTeamLimit = hasPaidEntitlement ? baseTeamLimit + extraTeams : 0;
    const subscriptionStatus = activeSub?.status || 'inactive';

    // Keep only already-allocated squads within the current paid seat capacity.
    // Missing, canceled, incomplete, or unknown subscriptions revoke all seats.
    await reconcilePaidTeamSeats({
      userId,
      planType,
      entitled: hasPaidEntitlement,
      capacity: totalTeamLimit,
      userUpdates: {
        stripe_subscription_id: activeSub?.id || null,
        subscription_status: subscriptionStatus,
        cancel_at_period_end: activeSub?.cancel_at_period_end === true,
        billing_cycle: billingCycle,
        plan_type: hasPaidEntitlement ? planType : 'free',
        team_limit: totalTeamLimit,
        extra_teams: hasPaidEntitlement ? extraTeams : 0,
        last_webhook_sync: new Date().toISOString(),
      },
      requiredMutationKey: mutationKey,
    });

    return NextResponse.json({
      success: true,
      subscriptionId: activeSub?.id || null,
      subscriptionStatus,
      planType: hasPaidEntitlement ? planType : 'free',
      teamLimit: totalTeamLimit,
    });
  } catch (err: any) {
    if (err instanceof RequestBodyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof SubscriptionMutationInProgressError) {
      return NextResponse.json({ error: 'Another subscription change is already in progress.' }, { status: 409 });
    }
    console.error('[subscription/sync] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (claimed) await releaseSubscriptionMutation(claimed.ref, claimed.key).catch(() => {});
  }
}
