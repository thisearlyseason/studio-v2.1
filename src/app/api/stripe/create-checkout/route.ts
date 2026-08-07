import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe-client';
import { verifyFirebaseToken, assertOwner } from '@/lib/api-auth';
import { EXTRA_TEAM_PRICE_IDS, PLAN_PRICE_MAP } from '@/lib/stripe-price-map';
import {
  enforceUserRateLimit,
  getTrustedAppOrigin,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const limited = await enforceUserRateLimit(auth.uid, 'stripe-create-checkout', 20, 60 * 60 * 1000);
    if (limited) return limited;

    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 8_000);
    const priceId = body.priceId;
    const userId = body.userId;
    const billingCycle = body.billingCycle ?? 'monthly';
    const extraTeamQty = body.extraTeamQty ?? 0;

    if (typeof userId !== 'string' || !userId || (!priceId && extraTeamQty === 0)) {
      return NextResponse.json(
        { error: 'Missing required fields: userId and either priceId or extraTeamQty' },
        { status: 400 }
      );
    }

    const ownerCheck = assertOwner(auth, userId);
    if (ownerCheck) return ownerCheck;

    // Validate priceId is a known Stripe price
    if (priceId != null && (typeof priceId !== 'string' || !PLAN_PRICE_MAP[priceId])) {
      return NextResponse.json({ error: 'Invalid priceId.' }, { status: 400 });
    }

    if (!['monthly', 'annual'].includes(String(billingCycle))) {
      return NextResponse.json({ error: 'billingCycle must be monthly or annual.' }, { status: 400 });
    }

    // Validate extraTeamQty bounds
    if (typeof extraTeamQty !== 'number' || !Number.isInteger(extraTeamQty) || extraTeamQty < 0 || extraTeamQty > 50) {
      return NextResponse.json({ error: 'extraTeamQty must be between 0 and 50.' }, { status: 400 });
    }

    const stripe = getStripe();

    const userRef = adminDb.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const userData = userSnap.data()!;
    if (priceId && userData.stripe_subscription_id) {
      return NextResponse.json({ error: 'An existing subscription must be changed from billing.' }, { status: 409 });
    }
    let stripeCustomerId: string = userData.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: userData.email,
        name: userData.fullName || userData.name,
        metadata: { firebase_uid: userId },
      });
      stripeCustomerId = customer.id;
      await userRef.update({ stripe_customer_id: stripeCustomerId });
    }

    const origin = getTrustedAppOrigin(req);

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
    if (err instanceof RequestBodyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[stripe/create-checkout] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
