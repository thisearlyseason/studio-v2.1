import { prepareCheckoutBillingCountry, BillingCountryDeclarationError } from '@/lib/checkout-billing-country';
import { schoolPlanEligibilityError } from '@/lib/school-plan-eligibility';
import { PLAN_PRICE_MAP as SCHOOL_PLAN_PRICE_MAP } from '@/lib/stripe-price-map';
import { platformSaasCheckoutParameters, managedSaasMetadata, managedSaasEnabled, ManagedCheckoutUnavailable, ManagedCoverageUnavailable } from '@/lib/stripe-managed-checkout';
import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe-client';
import { assertNonAnonymous, verifyFirebaseToken, assertOwner } from '@/lib/api-auth';
import {
  EXTRA_TEAM_PRICE_IDS,
  ACTIVE_PLAN_PRICE_IDS,
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
import { CheckoutLifecycleError, createCheckoutSessionWithLock } from '@/lib/server-checkout-lock';
import {
  buildStripeCustomerIdempotencyKey,
  resolvePortalCustomerId,
} from '@/lib/stripe-portal-customer';
import { storePurchaseResponse } from '@/lib/store-request-guard';

export async function POST(req: NextRequest) {
  const blocked = storePurchaseResponse();
  if (blocked) return blocked;
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  const anonymousCheck = assertNonAnonymous(auth);
  if (anonymousCheck) return anonymousCheck;

  try {
    const {
      priceId,
      organizationDeclaration,
      billingCountry,
      userId,
      teamId,
      billingCycle = 'monthly',
      extraTeamQty = 0,
    } = await readJsonBodyWithLimit<{
      priceId?: unknown;
      organizationDeclaration?: unknown;
      billingCountry?: unknown;
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
    if (priceId && (typeof priceId !== 'string' || !ACTIVE_PLAN_PRICE_IDS.has(priceId))) {
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
    const eligibilityError = schoolPlanEligibilityError(SCHOOL_PLAN_PRICE_MAP[priceId as string]?.id || '', userData, organizationDeclaration);
    if (eligibilityError) return NextResponse.json({ error: eligibilityError }, { status: 403 });
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

    const countryPreparation = await prepareCheckoutBillingCountry({ enabled: managedSaasEnabled(), stripe, customerId: stripeCustomerId, userId, billingCountry });

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: userData.email,
        name: userData.fullName || userData.name,
        metadata: { firebase_uid: userId },
        ...(countryPreparation.newAddress ? { address: countryPreparation.newAddress } : {}),
      }, {
        idempotencyKey: buildStripeCustomerIdempotencyKey(userId, previousCustomerId),
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

    if (countryPreparation.existingAddress) {
      await stripe.customers.update(stripeCustomerId, { address: countryPreparation.existingAddress });
    }

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
      customerId: stripeCustomerId,
      now: Date.now(),
    });
    const session = await createCheckoutSessionWithLock(userRef, idempotencyKey, {
      customer: stripeCustomerId,
      mode: 'subscription',
      ...platformSaasCheckoutParameters(),
      currency: 'usd',
      line_items: lineItems,
      success_url: `${origin}/dashboard/billing?stripe_success=true`,
      cancel_url: `${origin}/dashboard/billing?stripe_canceled=true`,
      metadata: { ...managedSaasMetadata(), firebase_uid: userId, ...(targetTeamId ? { team_id: targetTeamId } : {}) },
      subscription_data: {
        metadata: { ...managedSaasMetadata(), firebase_uid: userId, ...(targetTeamId ? { team_id: targetTeamId } : {}) },
        ...(serverTrialDays > 0 ? { trial_period_days: serverTrialDays } : {}),
      },
      allow_promotion_codes: true,
    }, stripe);

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    if (err instanceof BillingCountryDeclarationError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    if (err instanceof ManagedCheckoutUnavailable || err instanceof ManagedCoverageUnavailable) return NextResponse.json({ error: err.message }, { status: 409 });
    if (err instanceof CheckoutLifecycleError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof RequestBodyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[stripe/create-checkout] Error:', err.message);
    return NextResponse.json({ error: 'Checkout could not be started.' }, { status: 500 });
  }
}
