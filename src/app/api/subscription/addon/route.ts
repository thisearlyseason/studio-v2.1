import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { initializeFirebase } from '@/firebase/core';
import { doc, getDoc } from 'firebase/firestore';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-03-31.basil',
});

export async function POST(req: NextRequest) {
  try {
    const { userId, quantity, billingCycle = 'monthly' } = await req.json();

    if (!userId || typeof quantity !== 'number') {
      return NextResponse.json({ error: 'userId and quantity are required' }, { status: 400 });
    }

    const { firestore } = initializeFirebase();
    const userRef = doc(firestore, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const subscriptionId = userSnap.data().stripe_subscription_id;
    if (!subscriptionId) {
      return NextResponse.json({ error: 'No active subscription found. You must be on a paid plan to add extra squads.' }, { status: 400 });
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    // Identifiers for add-ons (with hardcoded fallbacks synced with PRICING_CONFIG)
    const monthlyAddonId = process.env.STRIPE_PRICE_EXTRA_TEAM_MONTHLY || 'price_1TL5HSGu1UxxOYbPiidFB9NB';
    const annualAddonId = process.env.STRIPE_PRICE_EXTRA_TEAM_ANNUAL || 'price_1TL5HSGu1UxxOYbPl0Gqarxg';
    
    const targetAddonPriceId = billingCycle === 'annual' ? annualAddonId : monthlyAddonId;

    if (!targetAddonPriceId) {
      return NextResponse.json({ error: 'Add-on price ID not configured' }, { status: 400 });
    }

    // Check if add-on item already exists in subscription
    const addonItem = subscription.items.data.find(item => 
      item.price.id === monthlyAddonId || item.price.id === annualAddonId
    );

    let items: Stripe.SubscriptionUpdateParams.Item[] = [];

    if (addonItem) {
      if (quantity === 0) {
        // Remove add-on
        items.push({ id: addonItem.id, deleted: true });
      } else {
        // Update quantity
        items.push({ id: addonItem.id, quantity });
      }
    } else if (quantity > 0) {
      // Add new add-on item
      items.push({ price: targetAddonPriceId, quantity });
    }

    if (items.length === 0) {
      return NextResponse.json({ message: 'No changes needed' });
    }

    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      items,
      proration_behavior: 'always_invoice',
    });

    return NextResponse.json({ success: true, subscription: updatedSubscription });
  } catch (err: any) {
    console.error('[Addon Update Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
