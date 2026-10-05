import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertConnectCleanupState,
  assertConnectTargetSafety,
  buildConnectCleanupGraph,
  requiredConnectObservations,
  selectChargeEnabledTestAccount,
  connectIntentPaymentMethodPolicy,
} from '../scripts/qa/certification/run-connect-lifecycle.mjs';

const safe = {
  projectId: 'the-squad-v2-staging',
  origin: 'https://studio--the-squad-v2-staging.us-east4.hosted.app',
  runId: 'connect-cert-test-run',
  stripeKey: 'sk_test_example',
  livemode: false,
};

test('Connect lifecycle refuses production, live Stripe, and unowned runs', () => {
  assert.doesNotThrow(() => assertConnectTargetSafety(safe));
  assert.throws(() => assertConnectTargetSafety({ ...safe, projectId: 'the-squad-v2' }), /Refusing/);
  assert.throws(() => assertConnectTargetSafety({ ...safe, stripeKey: 'sk_live_example', livemode: true }), /Refusing/);
  assert.throws(() => assertConnectTargetSafety({ ...safe, runId: 'manual' }), /Refusing/);
});

test('Connect cleanup is bounded to run-owned Firebase and Stripe resources', () => {
  const graph = buildConnectCleanupGraph(safe.runId);
  assert.deepEqual(graph.userIds, ['connect-cert-test-run-owner', 'connect-cert-test-run-other']);
  assert.deepEqual(graph.teamIds, ['connect-cert-test-run-team', 'connect-cert-test-run-other-team']);
  assert.equal(graph.firestorePaths.every(path => path.includes(safe.runId)), true);
});

test('Connect evidence covers onboarding, authorization, item, fundraising, webhook, and deletion', () => {
  assert.deepEqual(requiredConnectObservations(), [
    'connect-onboarding-link-created',
    'connect-status-resolved',
    'connect-cross-tenant-denied',
    'payment-item-created-listed-deleted',
    'fundraising-link-created-deleted',
    'connect-payment-failure-recorded',
    'connect-payment-success-recorded',
    'fundraising-donation-recorded-once',
    'connect-webhook-replay-idempotent',
  ]);
});

test('Connect cleanup requires zero active/onboarding residue and reports retained archived provider records', () => {
  assert.deepEqual(assertConnectCleanupState({ firestore: 0, auth: 0, activeStripe: 0, onboardingAccounts: 0, ledgers: 0, archivedStripe: 3 }), {
    firestore: 0, auth: 0, activeStripe: 0, onboardingAccounts: 0, ledgers: 0, archivedStripe: 3, blockingTotal: 0,
  });
  assert.throws(
    () => assertConnectCleanupState({ firestore: 0, auth: 0, activeStripe: 0, onboardingAccounts: 1, ledgers: 0, archivedStripe: 3 }),
    /residual/,
  );
});

test('charge-enabled account selection relies on the separately verified test-mode platform', () => {
  const accounts = [{ id: 'disabled', charges_enabled: false }, { id: 'enabled', charges_enabled: true }];
  assert.equal(selectChargeEnabledTestAccount(accounts, false)?.id, 'enabled');
  assert.throws(() => selectChargeEnabledTestAccount(accounts, true), /test mode/);
});

test('Connect intent probes disable redirect payment methods for server confirmation', () => {
  assert.deepEqual(connectIntentPaymentMethodPolicy(), {
    enabled: true,
    allow_redirects: 'never',
  });
});
