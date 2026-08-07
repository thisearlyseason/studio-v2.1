import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe-client';
import { verifyFirebaseToken, assertOwner } from '@/lib/api-auth';
import { resolveSubscriptionEntitlements, selectSubscriptionForSync } from '@/lib/subscription-entitlements';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';
import { PLAN_TEAM_LIMITS } from '@/lib/plan-catalog';

export async function POST(req: NextRequest) {
  // Authenticate caller
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const limited = await enforceUserRateLimit(auth.uid, 'subscription-sync', 30, 60 * 60 * 1000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 4_000);
    const userId = body.userId;

    if (typeof userId !== 'string' || !userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

    // Verify the caller owns this account
    const ownerCheck = assertOwner(auth, userId);
    if (ownerCheck) return ownerCheck;

    const stripe = getStripe();

    const userRef = adminDb.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const userData = userSnap.data()!;
    const customerId = userData.stripe_customer_id;

    if (!customerId) {
      return NextResponse.json({ error: 'No Stripe customer associated with this account.' }, { status: 400 });
    }

    // List ALL subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 5,
    });

    const selectedSubscription = selectSubscriptionForSync(subscriptions.data);
    const entitlements = selectedSubscription
      ? resolveSubscriptionEntitlements(selectedSubscription)
      : { planType: 'free', teamLimit: PLAN_TEAM_LIMITS.free, extraTeams: 0, subscriptionStatus: 'none', isEntitled: false };

    await userRef.update({
      stripe_subscription_id: selectedSubscription?.id || null,
      subscription_status: entitlements.subscriptionStatus,
      plan_type: entitlements.planType,
      team_limit: entitlements.teamLimit,
      extra_teams: entitlements.extraTeams,
      last_webhook_sync: new Date().toISOString(),
    });

    // CASCADE: Update all teams owned by this user (chunked to stay under Firestore's 500-op batch limit)
    try {
      const teamsSnap = await adminDb
        .collection('teams')
        .where('ownerUserId', '==', userId)
        .get();
      if (!teamsSnap.empty) {
        const CHUNK = 400;
        for (let i = 0; i < teamsSnap.docs.length; i += CHUNK) {
          const chunk = teamsSnap.docs.slice(i, i + CHUNK);
          const batch = adminDb.batch();
          chunk.forEach(teamDoc => {
            batch.update(teamDoc.ref, {
              planId: entitlements.planType,
              isPro: entitlements.isEntitled,
              last_plan_sync: new Date().toISOString(),
            });
          });
          await batch.commit();
        }
      }
    } catch (cascadeErr: any) {
      console.error('[subscription/sync] Team cascade error:', cascadeErr.message);
    }

    return NextResponse.json({ success: true, subscriptionId: selectedSubscription?.id || null });
  } catch (err: any) {
    if (err instanceof RequestBodyError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[subscription/sync] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
