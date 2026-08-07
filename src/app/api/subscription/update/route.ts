import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe-client';
import { verifyFirebaseToken, assertOwner } from '@/lib/api-auth';
import { PLAN_PRICE_MAP } from '@/lib/stripe-price-map';
import { resolveSubscriptionEntitlements } from '@/lib/subscription-entitlements';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';

export async function POST(req: NextRequest) {
  // Authenticate caller
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const limited = await enforceUserRateLimit(auth.uid, 'subscription-update', 20, 60 * 60 * 1000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 8_000);
    const userId = body.userId;
    const newPriceId = body.newPriceId;

    if (typeof userId !== 'string' || !userId || typeof newPriceId !== 'string' || !newPriceId) {
      return NextResponse.json({ error: 'userId and newPriceId are required' }, { status: 400 });
    }

    // Verify the caller owns this account
    const ownerCheck = assertOwner(auth, userId);
    if (ownerCheck) return ownerCheck;

    // Validate the priceId is a known plan
    const resolvedPlan = PLAN_PRICE_MAP[newPriceId];
    if (!resolvedPlan) {
      return NextResponse.json({ error: 'Invalid priceId: not a recognized plan.' }, { status: 400 });
    }

    const stripe = getStripe();

    const userRef = adminDb.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const subscriptionId = userSnap.data()!.stripe_subscription_id;
    if (!subscriptionId) {
      return NextResponse.json({ error: 'No active subscription found.' }, { status: 400 });
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Find the current base plan item
    const basePlanItem = subscription.items.data.find(item =>
      PLAN_PRICE_MAP[item.price.id] != null
    );

    if (!basePlanItem) {
      return NextResponse.json({ error: 'Could not find base plan item in subscription.' }, { status: 400 });
    }

    // Update the subscription item to the new price
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: basePlanItem.id, price: newPriceId }],
      proration_behavior: 'always_invoice',
    });

    const entitlements = resolveSubscriptionEntitlements(updatedSubscription);

    // Sync the Stripe-confirmed state to Firestore without dropping add-on teams.
    await userRef.update({
      plan_type: entitlements.planType,
      team_limit: entitlements.teamLimit,
      extra_teams: entitlements.extraTeams,
      subscription_status: entitlements.subscriptionStatus,
      last_sync_method: 'direct_upgrade',
      last_webhook_sync: new Date().toISOString(),
    });

    // CASCADE: Update all teams owned by this user
    try {
      const teamsSnap = await adminDb
        .collection('teams')
        .where('ownerUserId', '==', userId)
        .get();
      if (!teamsSnap.empty) {
        const batch = adminDb.batch();
        teamsSnap.docs.forEach(teamDoc => {
          batch.update(teamDoc.ref, {
            planId: entitlements.planType,
            isPro: entitlements.isEntitled,
            last_plan_sync: new Date().toISOString(),
          });
        });
        await batch.commit();
      }
    } catch (cascadeErr: any) {
      console.error('[subscription/update] Team cascade error:', cascadeErr.message);
    }

    return NextResponse.json({ success: true, subscription: updatedSubscription });
  } catch (err: any) {
    if (err instanceof RequestBodyError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[subscription/update] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
