import assert from 'node:assert/strict';
import test from 'node:test';
import * as safeExternalUrl from '../src/lib/safe-external-url.ts';
import * as boundedJson from '../src/lib/bounded-json.ts';
import * as checkoutPolicy from '../src/lib/checkout-policy.ts';
import * as stripePriceMap from '../src/lib/stripe-price-map.ts';
import * as htmlEscape from '../src/lib/html-escape.ts';

const { assertSafeExternalUrl, isPrivateNetworkAddress } = safeExternalUrl;
const { readJsonBodyWithLimit, RequestBodyError } = boundedJson;
const {
  buildCheckoutIdempotencyKey,
  calculateSignupTrialDays,
  hasBlockingSubscription,
  SIGNUP_TRIAL_DAYS,
} = checkoutPolicy;
const {
  PLAN_PRICE_MAP,
  PRICE_BILLING_CYCLE,
  priceMatchesBillingCycle,
} = stripePriceMap;
const { escapeHtml } = htmlEscape;

test('private and special-use IPv4 ranges are rejected', () => {
  for (const address of [
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '198.18.0.1',
    '224.0.0.1',
  ]) {
    assert.equal(isPrivateNetworkAddress(address), true, address);
  }
  assert.equal(isPrivateNetworkAddress('8.8.8.8'), false);
});

test('private IPv6 ranges are rejected', () => {
  for (const address of ['::', '::1', 'fc00::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
    assert.equal(isPrivateNetworkAddress(address), true, address);
  }
  assert.equal(isPrivateNetworkAddress('2606:4700:4700::1111'), false);
});

test('unsafe RSS URL forms are rejected before a request is made', async () => {
  await assert.rejects(() => assertSafeExternalUrl('http://example.com/feed'));
  await assert.rejects(() => assertSafeExternalUrl('https://localhost/feed'));
  await assert.rejects(() => assertSafeExternalUrl('https://127.0.0.1/feed'));
  await assert.rejects(() => assertSafeExternalUrl('https://[::1]/feed'));
  await assert.rejects(() => assertSafeExternalUrl('https://user:pass@example.com/feed'));
  await assert.rejects(() => assertSafeExternalUrl('https://example.com:8443/feed'));
});

test('bounded JSON accepts a valid request within the actual byte limit', async () => {
  const request = new Request('https://example.com/api', {
    method: 'POST',
    body: JSON.stringify({ teamId: 'team-1' }),
  });
  assert.deepEqual(await readJsonBodyWithLimit(request, 1_024), { teamId: 'team-1' });
});

test('bounded JSON rejects oversized streamed bodies without trusting content-length', async () => {
  const request = new Request('https://example.com/api', {
    method: 'POST',
    body: JSON.stringify({ payload: 'x'.repeat(2_000) }),
  });
  await assert.rejects(
    () => readJsonBodyWithLimit(request, 100),
    error => error instanceof RequestBodyError && error.status === 413
  );
});

test('bounded JSON rejects malformed input with a safe client error', async () => {
  const request = new Request('https://example.com/api', {
    method: 'POST',
    body: '{not-json',
  });
  await assert.rejects(
    () => readJsonBodyWithLimit(request, 100),
    error => error instanceof RequestBodyError && error.status === 400
  );
});

test('signup trial policy is server-derived and limited to new accounts', () => {
  const now = Date.now();
  assert.equal(calculateSignupTrialDays({
    accountCreatedAt: now - 60_000,
    now,
    hasStripeSubscriptionId: false,
    priorSubscriptionCount: 0,
  }), SIGNUP_TRIAL_DAYS);
  assert.equal(calculateSignupTrialDays({
    accountCreatedAt: now - 24 * 60 * 60 * 1000,
    now,
    hasStripeSubscriptionId: false,
    priorSubscriptionCount: 0,
  }), 0);
});

test('signup trial policy denies repeat subscriptions', () => {
  const now = Date.now();
  assert.equal(calculateSignupTrialDays({
    accountCreatedAt: now - 60_000,
    now,
    hasStripeSubscriptionId: true,
    priorSubscriptionCount: 0,
  }), 0);
  assert.equal(calculateSignupTrialDays({
    accountCreatedAt: now - 60_000,
    now,
    hasStripeSubscriptionId: false,
    priorSubscriptionCount: 1,
  }), 0);
});

test('checkout idempotency fingerprints all material checkout choices', () => {
  const base = {
    route: 'stripe-create-checkout',
    userId: 'user-1',
    priceId: 'price-monthly',
    billingCycle: 'monthly',
    quantity: 1,
    teamId: 'team-1',
    operationId: 'operation-0000001',
    now: 1_800_000,
  };
  const key = buildCheckoutIdempotencyKey(base);
  assert.equal(buildCheckoutIdempotencyKey({ ...base }), key);
  assert.notEqual(buildCheckoutIdempotencyKey({ ...base, route: 'legacy-checkout' }), key);
  assert.notEqual(buildCheckoutIdempotencyKey({ ...base, quantity: 2 }), key);
  assert.notEqual(buildCheckoutIdempotencyKey({ ...base, teamId: 'team-2' }), key);
  assert.notEqual(
    buildCheckoutIdempotencyKey({ ...base, operationId: 'operation-0000002' }),
    key
  );
  assert.equal(
    buildCheckoutIdempotencyKey({
      ...base,
      now: base.now + 31 * 60 * 1000,
    }),
    key
  );
  assert.notEqual(
    buildCheckoutIdempotencyKey({
      ...base,
      operationId: null,
      now: base.now + 31 * 60 * 1000,
    }),
    buildCheckoutIdempotencyKey({
      ...base,
      operationId: null,
    })
  );
});

test('active and unresolved subscriptions block duplicate base checkout', () => {
  assert.equal(hasBlockingSubscription(['canceled']), false);
  assert.equal(hasBlockingSubscription(['incomplete_expired']), false);
  assert.equal(hasBlockingSubscription(['active']), true);
  assert.equal(hasBlockingSubscription(['past_due']), true);
});

test('authoritative prices enforce billing cycle and 15 school seats', () => {
  const schoolPrice = Object.entries(PLAN_PRICE_MAP)
    .find(([, plan]) => plan.id === 'school' && plan.teamLimit === 15);
  assert.ok(schoolPrice);
  const [priceId] = schoolPrice;
  const cycle = PRICE_BILLING_CYCLE[priceId];
  assert.ok(cycle === 'monthly' || cycle === 'annual');
  assert.equal(priceMatchesBillingCycle(priceId, cycle), true);
  assert.equal(
    priceMatchesBillingCycle(priceId, cycle === 'monthly' ? 'annual' : 'monthly'),
    false
  );
});

test('untrusted notification fields are escaped before HTML rendering', () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)"> & hello'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; hello'
  );
});
