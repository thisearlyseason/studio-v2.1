import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveNativeEntitlement, activeNativeEntitlement, nativeProductIds, EMPTY_NATIVE_ENTITLEMENT } from '../src/lib/native-billing/catalog.ts';
import { mergeBillingSources, hasCurrentPaidSubscription } from '../src/lib/native-billing/entitlements.ts';
import { hasUnresolvedSubscription } from '../src/lib/checkout-policy.ts';
import { accountCreationLimit } from '../src/lib/account-creation-policy.ts';
const now = Date.parse('2026-09-28T00:00:00Z');
function payload(plan = 'team', cycle = 'monthly', changes = {}, entitlementChanges = {}) {
  const id = `pro.thesquad.${plan}.${cycle}`;
  return { subscriber: {
    entitlements: { [`squad_${plan}`]: { product_identifier: id, expires_date: '2027-09-28T00:00:00Z', ...entitlementChanges } },
    subscriptions: { [id]: { store: 'app_store', is_sandbox: false, ...changes } },
  } };
}
function nativeInput(native) {
  return { source: 'revenuecat', planType: native.plan, entitled: native.capacity > 0, capacity: native.capacity, userUpdates: { native_subscription: native } };
}
for (const [plan, capacity] of [['team', 1], ['elite', 8], ['league', 18], ['school', 15]]) {
  for (const cycle of ['monthly', 'annual']) test(`${plan} ${cycle} maps verified store access to ${capacity} squads`, () => {
    const grant = resolveNativeEntitlement(payload(plan, cycle), now);
    assert.equal(grant.capacity, capacity); assert.equal(grant.cycle, cycle); assert.equal(grant.plan, plan);
  });
}
test('cancelling auto-renewal retains paid time until expiry', () => {
  const input = payload('team', 'monthly', { unsubscribe_detected_at: '2026-09-20T00:00:00Z' });
  assert.equal(resolveNativeEntitlement(input, now).capacity, 1);
  assert.equal(resolveNativeEntitlement(input, Date.parse('2027-09-28T00:00:00Z')).capacity, 0);
});
test('store grace period preserves access while recovery is allowed', () => {
  const input = payload('team', 'monthly', { grace_period_expires_date: '2026-10-01T00:00:00Z' }, { expires_date: '2026-09-27T00:00:00Z' });
  assert.equal(resolveNativeEntitlement(input, now).expiresAt, '2026-10-01T00:00:00.000Z');
});
test('refunds, unsupported stores, unknown products, and sandbox receipts do not grant production access', () => {
  for (const changes of [{ refunded_at: '2026-09-27' }, { store: 'stripe' }, { store: 'promotional' }, { is_sandbox: true }, { is_sandbox: undefined }]) {
    assert.equal(resolveNativeEntitlement(payload('team', 'monthly', changes), now).capacity, 0);
  }
  assert.equal(resolveNativeEntitlement(payload('team', 'monthly', {}, { product_identifier: 'forged_product' }), now).capacity, 0);
  assert.equal(resolveNativeEntitlement(payload('team', 'monthly', { is_sandbox: true }), now, true).capacity, 1);
});
test('malformed provider replies fail without generating a downgrade', () => {
  for (const input of [null, {}, { subscriber: {} }]) assert.throws(() => resolveNativeEntitlement(input, now));
});
test('Google base plan identifiers work in both v1 subscriber response shapes', () => {
  const id = 'pro.thesquad.elite.annual';
  const input = payload('elite', 'annual', { store: 'play_store', product_plan_identifier: 'annual' });
  assert.equal(resolveNativeEntitlement(input, now).capacity, 8);
  input.subscriber.subscriptions[id + ':annual'] = input.subscriber.subscriptions[id];
  delete input.subscriber.subscriptions[id];
  input.subscriber.entitlements.squad_elite.product_identifier = id + ':annual';
  assert.equal(resolveNativeEntitlement(input, now).capacity, 8);
  input.subscriber.subscriptions[id + ':annual'].product_plan_identifier = 'unapproved';
  assert.equal(resolveNativeEntitlement(input, now).capacity, 0);
});
test('new purchases offer all monthly plans and only Pro Team annually on both stores', () => {
  const offered = ['team.monthly', 'team.annual', 'elite.monthly', 'league.monthly', 'school.monthly'];
  for (const platform of ['ios', 'android']) {
    assert.deepEqual(nativeProductIds(platform), offered.map(product =>
      `pro.thesquad.${product}${platform === 'android' ? ':' + product.split('.')[1] : ''}`));
  }
  // The sales restriction does not invalidate any verified annual entitlement.
  for (const plan of ['elite', 'league', 'school']) {
    assert.equal(resolveNativeEntitlement(payload(plan, 'annual'), now).plan, plan);
  }
});
test('stored grants reject expired, malformed, and unsupported entitlement values', () => {
  const grant = resolveNativeEntitlement(payload(), now);
  assert.ok(activeNativeEntitlement(grant, now));
  for (const changes of [{ expiresAt: 'bad' }, { expiresAt: new Date(now).toISOString() }, { capacity: 100 }, { cycle: 'annual' }, { store: 'promotional' }]) {
    assert.equal(activeNativeEntitlement({ ...grant, ...changes }, now), null);
  }
});
test('late Stripe cancellation cannot revoke a live Apple subscription', () => {
  const native = resolveNativeEntitlement(payload('elite'), now);
  const result = mergeBillingSources({ native_subscription: native }, { planType: 'free', capacity: 0, entitled: false, userUpdates: { subscription_status: 'canceled' } }, now);
  assert.deepEqual(result.grant, { planType: 'elite', capacity: 8, entitled: true });
  assert.equal(result.updates.billing_provider, 'app_store');
  assert.equal(result.updates.subscription_status, 'active');
  assert.equal(result.updates.stripe_subscription_status, 'canceled');
});
test('store expiry preserves legacy web subscriptions and add-on capacity', () => {
  const user = { stripe_subscription_id: 'sub_1', plan_type: 'elite', team_limit: 11, extra_teams: 3, subscription_status: 'active', billing_cycle: 'annual' };
  const result = mergeBillingSources(user, nativeInput(EMPTY_NATIVE_ENTITLEMENT), now);
  assert.deepEqual(result.grant, { planType: 'elite', capacity: 11, entitled: true });
  assert.equal(result.updates.extra_teams, 3); assert.equal(result.updates.billing_cycle, 'annual');
});
test('granting native access and later expiring it restores original Stripe details', () => {
  const user = { stripe_subscription_id: 'sub_1', plan_type: 'team', team_limit: 1, subscription_status: 'trialing', billing_cycle: 'annual' };
  const upgraded = mergeBillingSources(user, nativeInput(resolveNativeEntitlement(payload('league'), now)), now);
  assert.equal(upgraded.grant.capacity, 18);
  const expired = mergeBillingSources({ ...user, ...upgraded.updates }, nativeInput(EMPTY_NATIVE_ENTITLEMENT), now);
  assert.equal(expired.grant.capacity, 1); assert.equal(expired.updates.subscription_status, 'trialing');
  assert.equal(expired.updates.billing_cycle, 'annual');
});
test('overlapping stores never add capacities and losing both releases seats', () => {
  const native = resolveNativeEntitlement(payload('elite'), now);
  const result = mergeBillingSources({ native_subscription: native }, { planType: 'league', capacity: 18, entitled: true, userUpdates: { subscription_status: 'active' } }, now);
  assert.equal(result.grant.capacity, 18);
  const expired = mergeBillingSources({ ...result.updates, native_subscription: native }, { planType: 'free', capacity: 0, entitled: false, userUpdates: { subscription_status: 'canceled' } }, Date.parse('2028-01-01'));
  assert.equal(expired.grant.capacity, 0);
});
test('delayed expiry webhooks do not allow native paid API access or new paid squads', () => {
  const native = resolveNativeEntitlement(payload('elite'), now);
  const user = { native_subscription: native, billing_provider: 'app_store', subscription_status: 'active', plan_type: 'elite', team_limit: 8 };
  assert.equal(hasCurrentPaidSubscription(user, now), true);
  assert.equal(hasCurrentPaidSubscription(user, Date.parse('2028-01-01')), false);
  assert.equal(accountCreationLimit({ ...user, native_subscription: { ...native, expiresAt: '2001-01-01T00:00:00Z' } }), 1);
  assert.equal(hasUnresolvedSubscription({ native_subscription: { ...native, expiresAt: '2099-01-01T00:00:00Z' } }), true);
});

test('native client transport correlates replies and releases cancelled operations', async () => {
  const { nativeBilling } = await import('../src/lib/native-billing/client.ts');
  const original = globalThis.window;
  try {
    globalThis.window = {};
    await assert.rejects(nativeBilling('catalog', 'token'), /Update The Squad/);
    globalThis.window = { webkit: { messageHandlers: { squadNativeBilling: {
      postMessage: async request => ({ requestId: request.requestId, cancelled: true }),
    } } } };
    assert.equal((await nativeBilling('purchase', 'token', 'package')).cancelled, true);
    assert.equal((await nativeBilling('purchase', 'token', 'package')).cancelled, true);
    globalThis.window = { squadNativeBilling: { postMessage(message) {
      const request = JSON.parse(message);
      this.onmessage({ data: '{malformed' });
      this.onmessage({ data: JSON.stringify({ requestId: 'old-request', error: 'stale' }) });
      this.onmessage({ data: JSON.stringify({ requestId: request.requestId, packages: [] }) });
    } } };
    assert.deepEqual((await nativeBilling('catalog', 'token')).packages, []);
    assert.equal(globalThis.window.squadNativeBilling.onmessage, undefined);
  } finally { globalThis.window = original; }
});
test('invalid expiration and invalid provider objects cannot cause an accidental downgrade', () => {
  for (const value of [{ subscriber: { entitlements: [], subscriptions: {} } }, payload('team', 'monthly', {}, { expires_date: 'bad-date' })]) {
    assert.throws(() => resolveNativeEntitlement(value, now));
  }
});
