/**
 * /api/checkout — Legacy checkout route.
 * Delegates to the canonical /api/stripe/create-checkout logic.
 * Kept for backwards compatibility with pricing/page.tsx and StripePaywall.tsx callers.
 */
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
    const { priceId, userId, billingCycle = 'monthly', extraTeams = 0 } = await req.json();

    if (!priceId || !userId) {
      return NextResponse.json({ error: 'Missing priceId or userId' }, { status: 400 });
    }

    const ownerCheck = assertOwner(auth, userId);
    if (ownerCheck) return ownerCheck;

    // Validate inputs
    if (!ALL_KNOWN_PRICE_IDS.has(priceId)) {
      return NextResponse.json({ error: 'Invalid priceId.' }, { status: 400 });
    }
    if (extraTeams < 0 || extraTeams > 50) {
      return NextResponse.json({ error: 'extraTeams must be between 0 and 50.' }, { status: 400 });
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

    const lineItems: any[] = [{ price: priceId, quantity: 1 }];

    if (extraTeams > 0) {
      const addonPriceId =
        billingCycle === 'annual' ? EXTRA_TEAM_PRICE_IDS.annual : EXTRA_TEAM_PRICE_IDS.monthly;
      lineItems.push({ price: addonPriceId, quantity: extraTeams });
    }

    const origin =
      req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:9002';

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: lineItems,
      success_url: `${origin}/dashboard?success=true`,
      cancel_url: `${origin}/pricing?canceled=true`,
      metadata: { firebase_uid: userId },
      subscription_data: { metadata: { firebase_uid: userId } },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error('[checkout] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
