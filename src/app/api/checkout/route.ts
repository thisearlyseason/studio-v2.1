/**
 * /api/checkout — Legacy checkout route.
 * Delegates to the canonical /api/stripe/create-checkout logic.
 * Kept for backwards compatibility with pricing/page.tsx and StripePaywall.tsx callers.
 */
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
    const limited = await enforceUserRateLimit(auth.uid, 'stripe-checkout', 20, 60 * 60 * 1000);
    if (limited) return limited;

    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 8_000);
    const priceId = body.priceId;
    const userId = body.userId;
    const billingCycle = body.billingCycle ?? 'monthly';
    const extraTeams = body.extraTeams ?? 0;
    const trialDays = body.trialDays ?? 0;
    const newUser = body.newUser === true;

    if (typeof priceId !== 'string' || typeof userId !== 'string' || !priceId || !userId) {
      return NextResponse.json({ error: 'Missing priceId or userId' }, { status: 400 });
    }

    const ownerCheck = assertOwner(auth, userId);
    if (ownerCheck) return ownerCheck;

    // Validate inputs
    if (!PLAN_PRICE_MAP[priceId]) {
      return NextResponse.json({ error: 'Invalid priceId.' }, { status: 400 });
    }
    if (!['monthly', 'annual'].includes(String(billingCycle))) {
      return NextResponse.json({ error: 'billingCycle must be monthly or annual.' }, { status: 400 });
    }
    if (typeof extraTeams !== 'number' || !Number.isInteger(extraTeams) || extraTeams < 0 || extraTeams > 50) {
      return NextResponse.json({ error: 'extraTeams must be between 0 and 50.' }, { status: 400 });
    }
    if (typeof trialDays !== 'number' || !Number.isInteger(trialDays) || ![0, 5].includes(trialDays)) {
      return NextResponse.json({ error: 'trialDays must be 0 or the supported 5-day signup trial.' }, { status: 400 });
    }
    if (trialDays > 0 && !newUser) {
      return NextResponse.json({ error: 'Trials are only available during new account signup.' }, { status: 403 });
    }

    const stripe = getStripe();

    const userRef = adminDb.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const userData = userSnap.data()!;
    if (userData.stripe_subscription_id) {
      return NextResponse.json({ error: 'An existing subscription must be managed from billing.' }, { status: 409 });
    }
    if (trialDays > 0) {
      const createdAtMs = Date.parse(String(userData.createdAt || ''));
      if (!Number.isFinite(createdAtMs) || Date.now() - createdAtMs > 24 * 60 * 60 * 1000) {
        return NextResponse.json({ error: 'This signup trial is no longer available.' }, { status: 403 });
      }
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

    const lineItems: any[] = [{ price: priceId, quantity: 1 }];

    if (extraTeams > 0) {
      const addonPriceId =
        billingCycle === 'annual' ? EXTRA_TEAM_PRICE_IDS.annual : EXTRA_TEAM_PRICE_IDS.monthly;
      lineItems.push({ price: addonPriceId, quantity: extraTeams });
    }

    const origin = getTrustedAppOrigin(req);

    const successUrl = `${origin}/dashboard?success=true${newUser ? '&newUser=true' : ''}`;

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: `${origin}/pricing?canceled=true`,
      metadata: { firebase_uid: userId },
      subscription_data: {
        metadata: { firebase_uid: userId },
        ...(trialDays > 0 ? { trial_period_days: trialDays } : {}),
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    if (err instanceof RequestBodyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[checkout] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
