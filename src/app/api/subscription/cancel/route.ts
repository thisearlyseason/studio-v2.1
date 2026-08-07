import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe-client';
import { verifyFirebaseToken, assertOwner, assertNonAnonymous } from '@/lib/api-auth';
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

export async function POST(req: NextRequest) {
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
    ) return NextResponse.json({ error: 'A valid cancellation request is required.' }, { status: 400 });

    const ownerCheck = assertOwner(auth, userId);
    if (ownerCheck) return ownerCheck;
    const rateLimit = await enforceUserRateLimit(auth.uid, 'subscription-cancel', 5, 60 * 60 * 1000);
    if (rateLimit) return rateLimit;

    const stripe = getStripe();
    const userRef = adminDb.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const subscriptionId = userSnap.data()!.stripe_subscription_id;
    if (!subscriptionId) return NextResponse.json({ error: 'No active subscription.' }, { status: 400 });
    const mutationKey = `cancel:${operationId}`;
    await claimSubscriptionMutation(userRef, mutationKey);
    claimed = { ref: userRef, key: mutationKey };

    // Cancel at period end — does NOT cancel immediately
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    }, { idempotencyKey: mutationKey });

    await userRef.update({
      cancel_at_period_end: updatedSubscription.cancel_at_period_end,
      last_webhook_sync: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: 'Subscription will be canceled at the end of the current billing period.',
      subscription: updatedSubscription,
    });
  } catch (err: any) {
    if (err instanceof RequestBodyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof SubscriptionMutationInProgressError) {
      return NextResponse.json({ error: 'Another subscription change is already in progress.' }, { status: 409 });
    }
    console.error('[subscription/cancel] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    if (claimed) await releaseSubscriptionMutation(claimed.ref, claimed.key).catch(() => {});
  }
}
