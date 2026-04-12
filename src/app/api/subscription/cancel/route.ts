import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { initializeFirebase } from '@/firebase/core';
import { doc, getDoc } from 'firebase/firestore';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-03-31.basil',
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const { firestore } = initializeFirebase();
    const userRef = doc(firestore, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const subscriptionId = userSnap.data().stripe_subscription_id;
    if (!subscriptionId) return NextResponse.json({ error: 'No active subscription' }, { status: 400 });

    // Cancel at period end
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    return NextResponse.json({ 
      success: true, 
      message: 'Subscription will be canceled at the end of the current billing period.',
      subscription: updatedSubscription 
    });
  } catch (err: any) {
    console.error('[Subscription Cancel Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
