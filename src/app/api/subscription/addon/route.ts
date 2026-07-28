import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe-client';
import { assertNonAnonymous, verifyFirebaseToken, assertOwner } from '@/lib/api-auth';
import {
  EXTRA_TEAM_PRICE_IDS,
  PLAN_PRICE_MAP,
  PRICE_BILLING_CYCLE,
} from '@/lib/stripe-price-map';
import { isEntitledSubscriptionStatus } from '@/lib/server-team-entitlements';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';
import { buildCheckoutIdempotencyKey } from '@/lib/checkout-policy';
import { reconcilePaidTeamSeats } from '@/lib/server-subscription-seats';
import { hasPendingSubscriptionUpdate } from '@/lib/subscription-seat-policy';
import {
  claimSubscriptionMutation,
  releaseSubscriptionMutation,
  SubscriptionMutationInProgressError,
} from '@/lib/server-subscription-mutation-lock';

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  const anonymousCheck = assertNonAnonymous(auth);
  if (anonymousCheck) return anonymousCheck;
  let claimedMutation: {
    userRef: FirebaseFirestore.DocumentReference;
    key: string;
  } | null = null;

  try {
    const { userId, quantity, operationId } = await readJsonBodyWithLimit<{
      userId?: unknown;
      quantity?: unknown;
      operationId?: unknown;
    }>(req, 16_000);

    if (
      typeof userId !== 'string' ||
      typeof quantity !== 'number' ||
      typeof operationId !== 'string' ||
      !/^[A-Za-z0-9_-]{16,100}$/.test(operationId)
    ) {
      return NextResponse.json(
        { error: 'userId, quantity, and a valid operationId are required.' },
        { status: 400 }
      );
    }

    // Validate quantity bounds
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 50) {
      return NextResponse.json({ error: 'quantity must be between 0 and 50.' }, { status: 400 });
    }

    const ownerCheck = assertOwner(auth, userId);
    if (ownerCheck) return ownerCheck;
    const rateLimit = await enforceUserRateLimit(
      auth.uid,
      'subscription-addon',
      10,
      60 * 60 * 1000
    );
    if (rateLimit) return rateLimit;

    const userRef = adminDb.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (userSnap.data()?.isDemo === true) {
      return NextResponse.json({ error: 'Billing is unavailable in demo workspaces.' }, { status: 403 });
    }

    const subscriptionId = userSnap.data()!.stripe_subscription_id;
    if (!subscriptionId) {
      return NextResponse.json({
        error: 'No active subscription. You must be on a paid plan to add extra squads.',
      }, { status: 400 });
    }
    const mutationKey = `addon:${operationId}:${quantity}`;
    await claimSubscriptionMutation(userRef, mutationKey);
    claimedMutation = { userRef, key: mutationKey };

    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    if (hasPendingSubscriptionUpdate(subscription.pending_update)) {
      return NextResponse.json(
        {
          error:
            'A subscription payment is already pending. Complete or resolve it before changing seats.',
        },
        { status: 409 }
      );
    }
    if (!isEntitledSubscriptionStatus(subscription.status)) {
      return NextResponse.json(
        { error: 'The subscription is not active. Resolve billing before changing seats.' },
        { status: 409 }
      );
    }
    const basePlanItem = subscription.items.data.find(item => PLAN_PRICE_MAP[item.price.id]);
    const billingCycle = basePlanItem
      ? PRICE_BILLING_CYCLE[basePlanItem.price.id]
      : null;
    if (!billingCycle) {
      return NextResponse.json({ error: 'Could not determine the subscription billing cycle.' }, { status: 409 });
    }

    const targetAddonPriceId =
      billingCycle === 'annual' ? EXTRA_TEAM_PRICE_IDS.annual : EXTRA_TEAM_PRICE_IDS.monthly;

    // Check if add-on item already exists
    const addonItem = subscription.items.data.find(
      item =>
        item.price.id === EXTRA_TEAM_PRICE_IDS.monthly ||
        item.price.id === EXTRA_TEAM_PRICE_IDS.annual
    );

    const items: any[] = [];

    if (addonItem) {
      if (quantity === 0) {
        items.push({ id: addonItem.id, deleted: true });
      } else {
        items.push({ id: addonItem.id, price: targetAddonPriceId, quantity });
      }
    } else if (quantity > 0) {
      items.push({ price: targetAddonPriceId, quantity });
    }

    const idempotencyKey = buildCheckoutIdempotencyKey({
      route: 'subscription-addon',
      userId,
      priceId: targetAddonPriceId,
      billingCycle,
      quantity,
      operationId,
      now: Date.now(),
    });
    const updatedSubscription =
      items.length > 0
        ? await stripe.subscriptions.update(
            subscriptionId,
            {
              items,
              proration_behavior: 'always_invoice',
              payment_behavior: 'pending_if_incomplete',
            },
            {
              idempotencyKey,
            }
          )
        : subscription;

    if (updatedSubscription.pending_update) {
      return NextResponse.json(
        {
          pending: true,
          message: 'Payment confirmation is pending. Seats will update after Stripe confirms payment.',
        },
        { status: 202 }
      );
    }

    const updatedBaseItem = updatedSubscription.items.data.find(
      item => PLAN_PRICE_MAP[item.price.id]
    );
    const resolvedPlan = updatedBaseItem
      ? PLAN_PRICE_MAP[updatedBaseItem.price.id]
      : null;
    if (!resolvedPlan) {
      return NextResponse.json(
        { error: 'Could not determine the subscription plan after the seat update.' },
        { status: 409 }
      );
    }
    const hasPaidEntitlement = isEntitledSubscriptionStatus(updatedSubscription.status);
    const confirmedExtraTeams = updatedSubscription.items.data.reduce((total, item) => {
      if (
        item.price.id === EXTRA_TEAM_PRICE_IDS.monthly ||
        item.price.id === EXTRA_TEAM_PRICE_IDS.annual
      ) {
        return total + (item.quantity || 0);
      }
      return total;
    }, 0);
    const paidTeamLimit = hasPaidEntitlement
      ? resolvedPlan.teamLimit + confirmedExtraTeams
      : 0;

    await reconcilePaidTeamSeats({
      userId,
      planType: resolvedPlan.id,
      entitled: hasPaidEntitlement,
      capacity: paidTeamLimit,
      requiredMutationKey: claimedMutation?.key,
      userUpdates: {
        plan_type: hasPaidEntitlement ? resolvedPlan.id : 'free',
        team_limit: paidTeamLimit,
        extra_teams: hasPaidEntitlement ? confirmedExtraTeams : 0,
        subscription_status: updatedSubscription.status,
        cancel_at_period_end: updatedSubscription.cancel_at_period_end,
        billing_cycle: billingCycle,
        last_sync_method: 'direct_addon_update',
        last_webhook_sync: new Date().toISOString(),
      },
    });

    return NextResponse.json({ success: true, subscription: updatedSubscription });
  } catch (err: any) {
    if (err instanceof SubscriptionMutationInProgressError) {
      return NextResponse.json(
        { error: 'Another subscription change is already being processed.' },
        { status: 409 }
      );
    }
    if (err instanceof RequestBodyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[subscription/addon] Error:', err.message);
    return NextResponse.json({ error: 'Unable to update extra squad seats.' }, { status: 500 });
  } finally {
    if (claimedMutation) {
      await releaseSubscriptionMutation(
        claimedMutation.userRef,
        claimedMutation.key
      ).catch(error => {
        console.error('[subscription/addon] Mutation lock release error:', error);
      });
    }
  }
}
