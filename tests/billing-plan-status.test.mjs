import assert from 'node:assert/strict';
import test from 'node:test';

import { getBillingPlanStatusLabel } from '../src/lib/billing-plan-status.ts';

test('paid demos are labelled as demo plans without pretending to be free', () => {
  assert.equal(getBillingPlanStatusLabel({ isDemo: true }), 'Demo plan');
});

test('live billing states retain their customer-facing status', () => {
  assert.equal(getBillingPlanStatusLabel({ isCancelling: true }), 'Cancellation Pending');
  assert.equal(getBillingPlanStatusLabel({ isStripeLinked: true }), 'Active - Renews automatically');
  assert.equal(getBillingPlanStatusLabel({}), 'Free tier');
});
