import assert from 'node:assert/strict';
import test from 'node:test';

import { getBillingPlanStatusLabel, isDemoBillingIdentity } from '../src/lib/billing-plan-status.ts';

test('paid demos are labelled as demo plans without pretending to be free', () => {
  assert.equal(getBillingPlanStatusLabel({ isDemo: true }), 'Demo plan');
});

test('live billing states retain their customer-facing status', () => {
  assert.equal(getBillingPlanStatusLabel({ isCancelling: true }), 'Cancellation Pending');
  assert.equal(getBillingPlanStatusLabel({ isStripeLinked: true }), 'Active - Renews automatically');
  assert.equal(getBillingPlanStatusLabel({}), 'Free tier');
});

test('registered organizers keep live account billing when they also view demo teams', () => {
  assert.equal(isDemoBillingIdentity({anonymous:false,profileIsDemo:false}),false);
  assert.equal(isDemoBillingIdentity({anonymous:true}),true);
  assert.equal(isDemoBillingIdentity({profileIsDemo:true}),true);
  assert.equal(getBillingPlanStatusLabel({hasManagedAccess:true}), 'Active - managed plan');
  assert.equal(getBillingPlanStatusLabel({hasManagedAccess:true,isDemo:true}), 'Demo plan');
});
