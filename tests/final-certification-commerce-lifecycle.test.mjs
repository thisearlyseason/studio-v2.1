import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertCommerceTargetSafety,
  assertCommerceCleanupState,
  assertPaymentLifecycleStates,
  buildCheckoutMatrix,
  buildCommerceCleanupGraph,
  paymentMethodIdForCustomerUpdate,
  reconcileOwnedWebhookLedgers,
  assertSingleConcurrentCheckout,
} from '../scripts/qa/certification/run-commerce-lifecycle.mjs';

test('concurrent Checkout evidence requires one unique response and one open provider session', () => {
  assert.deepEqual(assertSingleConcurrentCheckout({
    responses: [{ status: 200, sessionId: 'cs_one' }, { status: 200, sessionId: 'cs_one' }],
    openSessionIds: ['cs_one'],
  }), { sessionId: 'cs_one', statuses: [200, 200] });
  assert.deepEqual(assertSingleConcurrentCheckout({
    responses: [{ status: 200, sessionId: 'cs_one' }, { status: 409 }],
    openSessionIds: ['cs_one'],
  }), { sessionId: 'cs_one', statuses: [200, 409] });
  assert.throws(() => assertSingleConcurrentCheckout({
    responses: [{ status: 200, sessionId: 'cs_one' }, { status: 200, sessionId: 'cs_two' }],
    openSessionIds: ['cs_one', 'cs_two'],
  }), /exactly one Checkout Session/i);
});

const prices = {
  NEXT_PUBLIC_STRIPE_PRICE_TEAM_MONTHLY: 'price_team_monthly',
  NEXT_PUBLIC_STRIPE_PRICE_TEAM_ANNUAL: 'price_team_annual',
  NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_MONTHLY: 'price_elite_monthly',
  NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_ANNUAL: 'price_elite_annual',
  NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_MONTHLY: 'price_league_monthly',
  NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_ANNUAL: 'price_league_annual',
  NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_MONTHLY: 'price_school_monthly',
  NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_ANNUAL: 'price_school_annual',
  STRIPE_PRICE_EXTRA_TEAM_MONTHLY: 'price_extra_monthly',
  STRIPE_PRICE_EXTRA_TEAM_ANNUAL: 'price_extra_annual',
};

test('commerce lifecycle refuses production, live Stripe, and unapproved recipients', () => {
  assert.throws(() => assertCommerceTargetSafety({
    projectId: 'the-squad-v2-10575712-17216', origin: 'https://thesquad.pro', runId: 'commerce-cert-safe',
    recipient: 'qa@example.test', approvedRecipient: 'qa@example.test', stripeKey: 'sk_test_safe', livemode: false,
  }), /isolated staging project/i);
  assert.throws(() => assertCommerceTargetSafety({
    projectId: 'the-squad-v2-staging', origin: 'https://studio--the-squad-v2-staging.us-east4.hosted.app', runId: 'commerce-cert-safe',
    recipient: 'qa@example.test', approvedRecipient: 'qa@example.test', stripeKey: 'sk_live_forbidden', livemode: true,
  }), /test mode/i);
  assert.throws(() => assertCommerceTargetSafety({
    projectId: 'the-squad-v2-staging', origin: 'https://studio--the-squad-v2-staging.us-east4.hosted.app', runId: 'commerce-cert-safe',
    recipient: 'wrong@example.test', approvedRecipient: 'qa@example.test', stripeKey: 'sk_test_safe', livemode: false,
  }), /approved recipient/i);
});

test('checkout matrix covers every plan and billing cycle with matching add-on', () => {
  assert.deepEqual(buildCheckoutMatrix(prices), [
    { plan: 'team', cycle: 'monthly', priceId: 'price_team_monthly', extraPriceId: 'price_extra_monthly' },
    { plan: 'team', cycle: 'annual', priceId: 'price_team_annual', extraPriceId: 'price_extra_annual' },
    { plan: 'elite', cycle: 'monthly', priceId: 'price_elite_monthly', extraPriceId: 'price_extra_monthly' },
    { plan: 'elite', cycle: 'annual', priceId: 'price_elite_annual', extraPriceId: 'price_extra_annual' },
    { plan: 'league', cycle: 'monthly', priceId: 'price_league_monthly', extraPriceId: 'price_extra_monthly' },
    { plan: 'league', cycle: 'annual', priceId: 'price_league_annual', extraPriceId: 'price_extra_annual' },
    { plan: 'school', cycle: 'monthly', priceId: 'price_school_monthly', extraPriceId: 'price_extra_monthly' },
    { plan: 'school', cycle: 'annual', priceId: 'price_school_annual', extraPriceId: 'price_extra_annual' },
  ]);
});

test('commerce cleanup graph is bounded to the staging-owned run', () => {
  const graph = buildCommerceCleanupGraph('commerce-cert-20260908-0225');
  assert.equal(graph.userIds.length, 3);
  assert.equal(graph.teamIds.length, 2);
  assert.ok(graph.firestorePaths.every(path => path.includes('commerce-cert-20260908-0225')));
  assert.equal(new Set(graph.firestorePaths).size, graph.firestorePaths.length);
});

test('customer default uses the attached PaymentMethod instance rather than its test token', () => {
  assert.equal(paymentMethodIdForCustomerUpdate({ id: 'pm_attached_customer_copy' }), 'pm_attached_customer_copy');
  assert.throws(() => paymentMethodIdForCustomerUpdate({ id: '' }), /attached PaymentMethod/i);
});

test('commerce evidence cannot pass with Firestore, Auth, or customer residue', () => {
  assert.deepEqual(assertCommerceCleanupState({ firestore: 0, auth: 0, customers: 0 }), {
    firestore: 0, auth: 0, customers: 0, total: 0,
  });
  assert.throws(
    () => assertCommerceCleanupState({ firestore: 1, auth: 0, customers: 0 }),
    /cleanup left 1 residual/i,
  );
});

test('webhook cleanup performs a quiet-period pass for late provider delivery', async () => {
  const deliveries = [['evt_initial'], ['evt_initial', 'evt_late']];
  const deleted = [];
  const result = await reconcileOwnedWebhookLedgers({
    listOwnedEventIds: async () => deliveries.shift() || ['evt_initial', 'evt_late'],
    deleteLedgers: async ids => deleted.push(...ids),
    wait: async () => {},
  });
  assert.deepEqual(result.sort(), ['evt_initial', 'evt_late']);
  assert.deepEqual([...new Set(deleted)].sort(), ['evt_initial', 'evt_late']);
});

test('payment lifecycle requires trial, past-due revocation, and active recovery in order', () => {
  assert.deepEqual(assertPaymentLifecycleStates({ created: 'trialing', failed: 'past_due', recovered: 'active' }), {
    created: 'trialing', failed: 'past_due', recovered: 'active',
  });
  assert.throws(
    () => assertPaymentLifecycleStates({ created: 'trialing', failed: 'active', recovered: 'active' }),
    /past_due/i,
  );
});
