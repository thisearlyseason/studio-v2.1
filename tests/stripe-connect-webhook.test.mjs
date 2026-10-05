import assert from 'node:assert/strict';
import test from 'node:test';
import * as webhookSecurityModule from '../src/lib/stripe-connect-webhook-security.ts';

const {
  isSafeFirestoreId,
  shouldApplyStripePaymentStatus,
  storedPaymentSourceMatches,
  stripePaymentDocumentId,
} = webhookSecurityModule;

test('connected payment sources must match both stored account and payment link', () => {
  const item = {
    stripeAccountId: 'acct_team_owner',
    stripePaymentLinkId: 'plink_team_fee',
  };
  assert.equal(storedPaymentSourceMatches(item, 'acct_team_owner', 'plink_team_fee'), true);
  assert.equal(storedPaymentSourceMatches(item, 'acct_staff_member', 'plink_team_fee'), false);
  assert.equal(storedPaymentSourceMatches(item, 'acct_team_owner', 'plink_forged'), false);

  const campaign = {
    stripeConnectAccountId: 'acct_hub',
    stripePaymentLinkId: 'plink_campaign',
  };
  assert.equal(storedPaymentSourceMatches(campaign, 'acct_hub', 'plink_campaign'), true);
});

test('Stripe Checkout and PaymentIntent events use one stable payment document', () => {
  assert.equal(stripePaymentDocumentId('pi_123', 'evt_checkout'), 'stripe_pi_123');
  assert.equal(stripePaymentDocumentId('pi_123', 'evt_succeeded'), 'stripe_pi_123');
  assert.equal(stripePaymentDocumentId(null, 'evt_checkout'), 'evt_checkout');
});

test('Firestore IDs reject nested paths from webhook metadata', () => {
  assert.equal(isSafeFirestoreId('team_123'), true);
  assert.equal(isSafeFirestoreId('victim/payments/forged'), false);
  assert.equal(isSafeFirestoreId(''), false);
});

test('Stripe payment status is monotonic across duplicate and out-of-order events', () => {
  const paid = { status: 'paid', eventCreated: 200, eventId: 'evt_paid' };
  const earlierFailure = { status: 'failed', eventCreated: 100, eventId: 'evt_failed_early' };
  const laterFailure = { status: 'failed', eventCreated: 300, eventId: 'evt_failed_late' };

  assert.equal(shouldApplyStripePaymentStatus(null, earlierFailure), true);
  assert.equal(shouldApplyStripePaymentStatus(earlierFailure, paid), true);
  assert.equal(shouldApplyStripePaymentStatus(paid, earlierFailure), false);
  assert.equal(shouldApplyStripePaymentStatus(paid, laterFailure), false);
  assert.equal(shouldApplyStripePaymentStatus(paid, paid), false);
});
