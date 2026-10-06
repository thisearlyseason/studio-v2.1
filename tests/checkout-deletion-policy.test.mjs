import assert from 'node:assert/strict';
import test from 'node:test';
import { hasUnresolvedSubscription } from '../src/lib/checkout-policy.ts';

test('a canceled legacy alias cannot mask an active subscription in another stored status field', () => {
  assert.equal(hasUnresolvedSubscription({ subscriptionStatus: 'canceled', subscription_status: 'active', stripe_subscription_id: 'sub_active' }), true);
  assert.equal(hasUnresolvedSubscription({ subscriptionStatus: 'inactive', stripe_subscription_status: 'incomplete' }), true);
});
test('terminal subscriptions remain deletable and ambiguous subscription IDs remain blocked', () => {
  assert.equal(hasUnresolvedSubscription({ subscription_status: 'canceled', stripe_subscription_id: 'sub_old' }), false);
  assert.equal(hasUnresolvedSubscription({ subscriptionStatus: 'canceled', subscription_status: 'unknown', stripe_subscription_id: 'sub_unknown' }), true);
  assert.equal(hasUnresolvedSubscription({ stripe_subscription_id: 'sub_unknown' }), true);
  assert.equal(hasUnresolvedSubscription({}), false);
});
