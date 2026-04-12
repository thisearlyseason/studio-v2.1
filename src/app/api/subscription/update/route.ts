import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { initializeFirebase } from '@/firebase/core';
import { doc, getDoc } from 'firebase/firestore';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-03-31.basil',
});

export async function POST(req: NextRequest) {
  try {
    const { userId, newPriceId } = await req.json();

    if (!userId || !newPriceId) {
      return NextResponse.json({ error: 'userId and newPriceId are required' }, { status: 400 });
    }

    const { firestore } = initializeFirebase();
    const userRef = doc(firestore, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userData = userSnap.data();

    const subscriptionId = userData.stripe_subscription_id;
    if (!subscriptionId) return NextResponse.json({ error: 'No active subscription found' }, { status: 400 });

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    // Find the current plan item (the one that ISN'T an add-on)
    // In our setup, we could have multiple items, but the plan is usually the primary one.
    // We'll look for the item that doesn't correspond to an extra team price.
    const EXTRA_TEAM_PRICE_IDS = [
      process.env.STRIPE_PRICE_EXTRA_TEAM_MONTHLY,
      process.env.STRIPE_PRICE_EXTRA_TEAM_ANNUAL
    ];

    const planItem = subscription.items.data.find(item => !EXTRA_TEAM_PRICE_IDS.includes(item.price.id));

    if (!planItem) {
      return NextResponse.json({ error: 'Main plan item not found in subscription' }, { status: 400 });
    }

    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: planItem.id,
          price: newPriceId,
        },
      ],
      proration_behavior: 'always_invoice',
    });

    return NextResponse.json({ success: true, subscription: updatedSubscription });
  } catch (err: any) {
    console.error('[Subscription Update Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
