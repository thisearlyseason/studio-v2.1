import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { initializeFirebase } from '@/firebase/core';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  return new Stripe(key, { apiVersion: '2025-03-31.basil' });
}

/**
 * POST /api/stripe/create-checkout
 * Body: { priceId: string, userId: string, extraTeamQty?: number }
 *
 * Creates a Stripe Checkout Session and returns the URL.
 */
export async function POST(req: NextRequest) {
  try {
    // { priceId: string, userId: string, billingCycle: 'monthly' | 'annual', extraTeamQty?: number }
    const { priceId, userId, billingCycle = 'monthly', extraTeamQty = 0 } = await req.json();

    if (!userId || (!priceId && extraTeamQty === 0)) {
      return NextResponse.json({ error: 'Missing required fields: userId and either priceId or extraTeamQty' }, { status: 400 });
    }

    const stripe = getStripeClient();
    const { firestore } = initializeFirebase();

    // Load user from Firestore to retrieve or create Stripe Customer
    const userRef = doc(firestore, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userSnap.data();
    let stripeCustomerId: string = userData.stripe_customer_id;

    if (!stripeCustomerId) {
      // Create a new Stripe Customer and store the ID
      const customer = await stripe.customers.create({
        email: userData.email,
        name: userData.fullName || userData.name,
        metadata: {
          firebase_uid: userId,
        },
      });
      stripeCustomerId = customer.id;
      await updateDoc(userRef, { stripe_customer_id: stripeCustomerId });
    }

    const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:9002';

    // Build line items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
    
    // Add base plan if provided
    if (priceId) {
      lineItems.push({ price: priceId, quantity: 1 });
    }

    // Optionally add extra-team add-on
    const { EXTRA_TEAM_CONFIG } = await import('@/lib/pricing');
    const extraTeamPriceId = billingCycle === 'annual'
      ? EXTRA_TEAM_CONFIG.annualPriceId
      : EXTRA_TEAM_CONFIG.monthlyPriceId;

    if (extraTeamQty > 0 && extraTeamPriceId) {
      lineItems.push({ price: extraTeamPriceId, quantity: extraTeamQty });
    }

    if (lineItems.length === 0) {
      return NextResponse.json({ error: 'No items selected for checkout' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: lineItems,
      success_url: `${origin}/dashboard/billing?stripe_success=true`,
      cancel_url:  `${origin}/dashboard/billing?stripe_canceled=true`,
      metadata: {
        firebase_uid: userId, // Added here for session completion awareness
      },
      subscription_data: {
        metadata: {
          firebase_uid: userId, // Added here for future subscription updates
        },
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('[create-checkout] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
