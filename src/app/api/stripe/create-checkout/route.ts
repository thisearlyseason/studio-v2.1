import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebase } from '@/firebase/core';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getStripe } from '@/lib/stripe-client';
import { verifyFirebaseToken, assertOwner } from '@/lib/api-auth';
import { EXTRA_TEAM_PRICE_IDS, ALL_KNOWN_PRICE_IDS } from '@/lib/stripe-price-map';

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { priceId, userId, billingCycle = 'monthly', extraTeamQty = 0 } = await req.json();

    if (!userId || (!priceId && extraTeamQty === 0)) {
      return NextResponse.json(
        { error: 'Missing required fields: userId and either priceId or extraTeamQty' },
        { status: 400 }
      );
    }

    const ownerCheck = assertOwner(auth, userId);
    if (ownerCheck) return ownerCheck;

    // Validate priceId is a known Stripe price
    if (priceId && !ALL_KNOWN_PRICE_IDS.has(priceId)) {
      return NextResponse.json({ error: 'Invalid priceId.' }, { status: 400 });
    }

    // Validate extraTeamQty bounds
    if (extraTeamQty < 0 || extraTeamQty > 50) {
      return NextResponse.json({ error: 'extraTeamQty must be between 0 and 50.' }, { status: 400 });
    }

    const stripe = getStripe();
    const { firestore } = initializeFirebase();

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

    const origin =
      req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:9002';

    const lineItems: any[] = [];

    if (priceId) {
      lineItems.push({ price: priceId, quantity: 1 });
    }

    const extraTeamPriceId =
      billingCycle === 'annual' ? EXTRA_TEAM_PRICE_IDS.annual : EXTRA_TEAM_PRICE_IDS.monthly;

    if (extraTeamQty > 0 && extraTeamPriceId) {
      lineItems.push({ price: extraTeamPriceId, quantity: extraTeamQty });
    }

    if (lineItems.length === 0) {
      return NextResponse.json({ error: 'No items selected for checkout.' }, { status: 400 });
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: lineItems,
      success_url: `${origin}/dashboard/billing?stripe_success=true`,
      cancel_url: `${origin}/dashboard/billing?stripe_canceled=true`,
      metadata: { firebase_uid: userId },
      subscription_data: { metadata: { firebase_uid: userId } },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('[stripe/create-checkout] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
