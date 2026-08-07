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
      teamId,
      billingCycle = 'monthly',
      extraTeamQty = 0,
    } = await readJsonBodyWithLimit<{
      priceId?: unknown;
      userId?: unknown;
      teamId?: unknown;
      billingCycle?: unknown;
      extraTeamQty?: unknown;
    }>(req, 32_000);

    if (
      typeof userId !== 'string' ||
      !priceId
    ) {
      return NextResponse.json(
        { error: 'A base plan priceId is required for checkout.' },
        { status: 400 }
      );
    }

    const ownerCheck = assertOwner(auth, userId);
    if (ownerCheck) return ownerCheck;
    const rateLimit = await enforceUserRateLimit(
      auth.uid,
      'stripe-create-checkout',
      10,
      60 * 60 * 1000
    );
    if (rateLimit) return rateLimit;
    const targetTeamId = typeof teamId === 'string' && teamId ? teamId : null;

    // A paid upgrade may target one existing squad. Resolve ownership on the
    // server so Checkout metadata can never be used to upgrade another team.
    if (teamId !== undefined && !targetTeamId) {
      return NextResponse.json({ error: 'Invalid teamId.' }, { status: 400 });
    }
    if (targetTeamId) {
      const teamSnap = await adminDb.collection('teams').doc(targetTeamId).get();
      if (!teamSnap.exists || teamSnap.data()!.ownerUserId !== auth.uid) {
        return NextResponse.json({ error: 'Team not found or not owned by this account.' }, { status: 403 });
      }
    }

    // Validate priceId is a known Stripe price
    if (priceId && (typeof priceId !== 'string' || !PLAN_PRICE_MAP[priceId])) {
      return NextResponse.json({ error: 'Invalid priceId.' }, { status: 400 });
    }

    if (!['monthly', 'annual'].includes(String(billingCycle))) {
      return NextResponse.json({ error: 'billingCycle must be monthly or annual.' }, { status: 400 });
    }

    // Validate extraTeamQty bounds
    if (
      !Number.isInteger(extraTeamQty) ||
      (extraTeamQty as number) < 0 ||
      (extraTeamQty as number) > 50
    ) {
      return NextResponse.json({ error: 'extraTeamQty must be between 0 and 50.' }, { status: 400 });
    }
    if (billingCycle !== 'monthly' && billingCycle !== 'annual') {
      return NextResponse.json({ error: 'Invalid billingCycle.' }, { status: 400 });
    }
    if (
      typeof priceId !== 'string' ||
      !priceMatchesBillingCycle(priceId, billingCycle)
    ) {
      return NextResponse.json(
        { error: 'The selected price does not match the billing cycle.' },
        { status: 400 }
      );
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
    let stripeCustomerId: string = userData.stripe_customer_id;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: userData.email,
        name: userData.fullName || userData.name,
        metadata: { firebase_uid: userId },
      }, {
        idempotencyKey: `customer-${userId}`,
      });
      stripeCustomerId = customer.id;
      await userRef.update({ stripe_customer_id: stripeCustomerId });
    }
    const priorSubscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      status: 'all',
      limit: 10,
    });
    if (hasBlockingSubscription(priorSubscriptions.data.map(item => item.status))) {
      return NextResponse.json(
        { error: 'An active subscription already exists. Use billing settings to change it.' },
        { status: 409 }
      );
    }
    const authUser = await admin.auth().getUser(userId);
    const accountCreatedAt = Date.parse(authUser.metadata.creationTime);
    const serverTrialDays = calculateSignupTrialDays({
      accountCreatedAt,
      now: Date.now(),
      hasStripeSubscriptionId: Boolean(userData.stripe_subscription_id),
      priorSubscriptionCount: priorSubscriptions.data.length,
    });

    const origin = process.env.NEXT_PUBLIC_APP_URL ?? req.nextUrl.origin;

    const lineItems: any[] = [];

    if (priceId) {
      lineItems.push({ price: priceId, quantity: 1 });
    }

    const extraTeamPriceId =
      billingCycle === 'annual' ? EXTRA_TEAM_PRICE_IDS.annual : EXTRA_TEAM_PRICE_IDS.monthly;

    if ((extraTeamQty as number) > 0 && extraTeamPriceId) {
      lineItems.push({ price: extraTeamPriceId, quantity: extraTeamQty as number });
    }

    if (lineItems.length === 0) {
      return NextResponse.json({ error: 'No items selected for checkout.' }, { status: 400 });
    }

    const idempotencyKey = buildCheckoutIdempotencyKey({
      route: 'stripe-create-checkout',
      userId,
      priceId,
      billingCycle,
      quantity: extraTeamQty as number,
      teamId: targetTeamId,
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
      success_url: `${origin}/dashboard/billing?stripe_success=true`,
      cancel_url: `${origin}/dashboard/billing?stripe_canceled=true`,
      metadata: { firebase_uid: userId, ...(targetTeamId ? { team_id: targetTeamId } : {}) },
      subscription_data: {
        metadata: { firebase_uid: userId, ...(targetTeamId ? { team_id: targetTeamId } : {}) },
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
    console.error('[stripe/create-checkout] Error:', err.message);
    return NextResponse.json({ error: 'Checkout could not be started.' }, { status: 500 });
  }
}
