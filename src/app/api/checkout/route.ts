/**
 * /api/checkout — Legacy checkout route.
 * Delegates to the canonical /api/stripe/create-checkout logic.
 * Kept for backwards compatibility with pricing/page.tsx and StripePaywall.tsx callers.
 */
import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe-client';
import { assertNonAnonymous, verifyFirebaseToken, assertOwner } from '@/lib/api-auth';
import {
  EXTRA_TEAM_PRICE_IDS,
  PLAN_PRICE_MAP,
  priceMatchesBillingCycle,
} from '@/lib/stripe-price-map';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';
import {
  buildCheckoutIdempotencyKey,
  calculateSignupTrialDays,
  hasBlockingSubscription,
} from '@/lib/checkout-policy';
import {
  claimCheckoutLock,
  finalizeCheckoutLock,
  releaseCheckoutLock,
} from '@/lib/server-checkout-lock';
import {
  buildStripeCustomerIdempotencyKey,
  resolvePortalCustomerId,
} from '@/lib/stripe-portal-customer';

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  const anonymousCheck = assertNonAnonymous(auth);
  if (anonymousCheck) return anonymousCheck;
  let claimedLock: {
    userRef: FirebaseFirestore.DocumentReference;
    key: string;
  } | null = null;

  try {
    const {
      priceId,
      userId,
      billingCycle = 'monthly',
      extraTeams = 0,
      newUser = false,
    } = await readJsonBodyWithLimit<{
      priceId?: unknown;
      userId?: unknown;
      billingCycle?: unknown;
      extraTeams?: unknown;
      newUser?: unknown;
    }>(req, 32_000);

    if (typeof priceId !== 'string' || typeof userId !== 'string') {
      return NextResponse.json({ error: 'Missing priceId or userId' }, { status: 400 });
    }

    const ownerCheck = assertOwner(auth, userId);
    if (ownerCheck) return ownerCheck;
    const rateLimit = await enforceUserRateLimit(
      auth.uid,
      'checkout',
      10,
      60 * 60 * 1000
    );
    if (rateLimit) return rateLimit;

    // Validate inputs
    if (!PLAN_PRICE_MAP[priceId]) {
      return NextResponse.json({ error: 'Invalid priceId.' }, { status: 400 });
    }
    if (billingCycle !== 'monthly' && billingCycle !== 'annual') {
      return NextResponse.json({ error: 'Invalid billingCycle.' }, { status: 400 });
    }
    if (!priceMatchesBillingCycle(priceId, billingCycle)) {
      return NextResponse.json(
        { error: 'The selected price does not match the billing cycle.' },
        { status: 400 }
      );
    }
    if (!Number.isInteger(extraTeams) || (extraTeams as number) < 0 || (extraTeams as number) > 50) {
      return NextResponse.json({ error: 'extraTeams must be between 0 and 50.' }, { status: 400 });
    }

    const userRef = adminDb.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const userData = userSnap.data()!;
    if (userData.isDemo === true) {
      return NextResponse.json(
        { error: 'Billing is unavailable in demo workspaces.' },
        { status: 403 }
      );
    }
    const stripe = getStripe();
    const previousCustomerId = typeof userData.stripe_customer_id === 'string'
      ? userData.stripe_customer_id
      : null;
    let stripeCustomerId = await resolvePortalCustomerId(stripe, userId, userData);

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: userData.email,
        name: userData.fullName || userData.name,
        metadata: { firebase_uid: userId },
      }, {
        idempotencyKey: buildStripeCustomerIdempotencyKey(userId, previousCustomerId),
      });
      stripeCustomerId = customer.id;
      await userRef.update({ stripe_customer_id: stripeCustomerId });
    }

    const lineItems: any[] = [{ price: priceId, quantity: 1 }];

    if ((extraTeams as number) > 0) {
      const addonPriceId =
        billingCycle === 'annual' ? EXTRA_TEAM_PRICE_IDS.annual : EXTRA_TEAM_PRICE_IDS.monthly;
      lineItems.push({ price: addonPriceId, quantity: extraTeams as number });
    }

    const origin = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;
    const authUser = await admin.auth().getUser(userId);
    const accountCreatedAt = Date.parse(authUser.metadata.creationTime);
    const priorSubscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'all',
      limit: 10,
    });
    if (hasBlockingSubscription(priorSubscriptions.data.map(item => item.status))) {
      return NextResponse.json(
        { error: 'An active subscription already exists. Manage it from billing settings.' },
        { status: 409 }
      );
    }
    const serverTrialDays = calculateSignupTrialDays({
      accountCreatedAt,
      now: Date.now(),
      hasStripeSubscriptionId: Boolean(userData.stripe_subscription_id),
      priorSubscriptionCount: priorSubscriptions.data.length,
    });

    const successUrl = `${origin}/dashboard?success=true${newUser === true ? '&newUser=true' : ''}`;
    const idempotencyKey = buildCheckoutIdempotencyKey({
      route: 'legacy-checkout',
      userId,
      priceId,
      billingCycle,
      quantity: extraTeams as number,
      now: Date.now(),
    });
    let lockClaim = await claimCheckoutLock(userRef, idempotencyKey);
    if (!lockClaim.claimed) {
      return NextResponse.json(
        { error: 'Another checkout is being prepared. Please wait a moment.' },
        { status: 409 }
      );
    }
    if (lockClaim.existingSessionId) {
      const existingSession = await stripe.checkout.sessions.retrieve(
        lockClaim.existingSessionId
      );
      if (existingSession.status === 'open' && existingSession.url) {
        return NextResponse.json({ url: existingSession.url });
      }
      await releaseCheckoutLock(userRef, idempotencyKey);
      lockClaim = await claimCheckoutLock(userRef, idempotencyKey);
      if (!lockClaim.claimed) {
        return NextResponse.json(
          { error: 'Another checkout is being prepared. Please wait a moment.' },
          { status: 409 }
        );
      }
    }
    claimedLock = { userRef, key: idempotencyKey };
    const openSessions = await stripe.checkout.sessions.list({
      customer: stripeCustomerId,
      status: 'open',
      limit: 10,
    });
    for (const openSession of openSessions.data) {
      await stripe.checkout.sessions.expire(openSession.id);
    }

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: `${origin}/pricing?canceled=true`,
      metadata: { firebase_uid: userId },
      subscription_data: {
        metadata: { firebase_uid: userId },
        ...(serverTrialDays > 0 ? { trial_period_days: serverTrialDays } : {}),
      },
      allow_promotion_codes: true,
    }, {
      idempotencyKey,
    });
    await finalizeCheckoutLock(
      userRef,
      idempotencyKey,
      session.id,
      session.expires_at * 1000
    );
    claimedLock = null;

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    if (claimedLock) {
      await releaseCheckoutLock(claimedLock.userRef, claimedLock.key).catch(() => {});
    }
    if (err instanceof RequestBodyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[checkout] Error:', err.message);
    return NextResponse.json({ error: 'Checkout could not be started.' }, { status: 500 });
  }
}
