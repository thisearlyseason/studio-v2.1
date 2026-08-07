import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe-client';
import { verifyFirebaseToken, assertOwner } from '@/lib/api-auth';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const limited = await enforceUserRateLimit(auth.uid, 'subscription-cancel', 10, 60 * 60 * 1000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 4_000);
    const userId = body.userId;

    if (typeof userId !== 'string' || !userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

    const ownerCheck = assertOwner(auth, userId);
    if (ownerCheck) return ownerCheck;

    const stripe = getStripe();
    const userSnap = await adminDb.collection('users').doc(userId).get();
    if (!userSnap.exists) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const subscriptionId = userSnap.data()!.stripe_subscription_id;
    if (!subscriptionId) return NextResponse.json({ error: 'No active subscription.' }, { status: 400 });

    // Cancel at period end — does NOT cancel immediately
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    return NextResponse.json({
      success: true,
      message: 'Subscription will be canceled at the end of the current billing period.',
      subscription: updatedSubscription,
    });
  } catch (err: any) {
    if (err instanceof RequestBodyError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[subscription/cancel] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
