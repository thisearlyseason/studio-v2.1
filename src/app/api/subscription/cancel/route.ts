import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebase } from '@/firebase/core';
import { doc, getDoc } from 'firebase/firestore';
import { getStripe } from '@/lib/stripe-client';
import { verifyFirebaseToken, assertOwner } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { userId } = await req.json();

    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

    const ownerCheck = assertOwner(auth, userId);
    if (ownerCheck) return ownerCheck;

    const stripe = getStripe();
    const { firestore } = initializeFirebase();
    const userSnap = await getDoc(doc(firestore, 'users', userId));
    if (!userSnap.exists()) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const subscriptionId = userSnap.data().stripe_subscription_id;
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
    console.error('[subscription/cancel] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
