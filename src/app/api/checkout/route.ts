import { prepareCheckoutBillingCountry, BillingCountryDeclarationError } from '@/lib/checkout-billing-country';
import { schoolPlanEligibilityError } from '@/lib/school-plan-eligibility';
import { PLAN_PRICE_MAP as SCHOOL_PLAN_PRICE_MAP } from '@/lib/stripe-price-map';
import { platformSaasCheckoutParameters, managedSaasMetadata, managedSaasEnabled, ManagedCheckoutUnavailable, ManagedCoverageUnavailable } from '@/lib/stripe-managed-checkout';
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
      billingCycle = 'monthly',
      extraTeams = 0,
      newUser = false,
    } = await readJsonBodyWithLimit<{
      priceId?: unknown;
      organizationDeclaration?: unknown;
      billingCountry?: unknown;
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
    if (!ACTIVE_PLAN_PRICE_IDS.has(priceId)) {
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

    if (countryPreparation.existingAddress) {
      await stripe.customers.update(stripeCustomerId, { address: countryPreparation.existingAddress });
    }

    const successUrl = `${origin}/dashboard?success=true${newUser === true ? '&newUser=true' : ''}`;
    const idempotencyKey = buildCheckoutIdempotencyKey({
      route: 'legacy-checkout',
      userId,
      priceId,
      billingCycle,
      quantity: extraTeams as number,
      customerId: stripeCustomerId,
      now: Date.now(),
    });
    const session = await createCheckoutSessionWithLock(userRef, idempotencyKey, {
      customer: stripeCustomerId,
      mode: 'subscription',
      ...platformSaasCheckoutParameters(),
      currency: 'usd',
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: `${origin}/pricing?canceled=true`,
      metadata: { ...managedSaasMetadata(), firebase_uid: userId },
      subscription_data: {
        metadata: { ...managedSaasMetadata(), firebase_uid: userId },
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
    console.error('[checkout] Error:', err.message);
    return NextResponse.json({ error: 'Checkout could not be started.' }, { status: 500 });
  }
}
