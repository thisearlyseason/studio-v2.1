import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { initializeFirebase } from '@/firebase/core';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { EXTRA_TEAM_CONFIG } from '@/lib/pricing';

function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  return new Stripe(key, { apiVersion: '2025-03-31.basil' });
}

export async function POST(req: NextRequest) {
  try {
    const { priceId, userId, billingCycle = 'monthly', extraTeams = 0 } = await req.json();

    if (!priceId || !userId) {
      return NextResponse.json({ error: 'Missing priceId or userId' }, { status: 400 });
    }

    const stripe = getStripeClient();
    const { firestore } = initializeFirebase();

    // 1. Resolve or Create Stripe Customer
    const userRef = doc(firestore, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const userData = userSnap.data();
    let stripeCustomerId: string = userData.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: userData.email,
        name: userData.fullName || userData.name,
        metadata: { firebase_uid: userId },
      });
      stripeCustomerId = customer.id;
      await updateDoc(userRef, { stripe_customer_id: stripeCustomerId });
    }

    // 2. Build Line Items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { price: priceId, quantity: 1 },
    ];

    // Add Extra Team Add-on if requested
    if (extraTeams > 0) {
      const addonPriceId = billingCycle === 'annual' 
        ? EXTRA_TEAM_CONFIG.annualPriceId 
        : EXTRA_TEAM_CONFIG.monthlyPriceId;
      
      lineItems.push({
        price: addonPriceId,
        quantity: extraTeams
      });
    }

    const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:9002';

    // 3. Create Session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: lineItems,
      success_url: `${origin}/dashboard?success=true`,
      cancel_url: `${origin}/pricing?canceled=true`,
      subscription_data: {
        metadata: { firebase_uid: userId },
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('[Checkout API Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
