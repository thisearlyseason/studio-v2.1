import assert from 'node:assert/strict';
import test from 'node:test';

import * as safety from '../scripts/qa/certification/provider-safety.mjs';
import * as runner from '../scripts/qa/certification/run-provider-batches.mjs';

const safe = {
  projectId: 'the-squad-v2-staging',
  origin: 'https://studio--the-squad-v2-staging.us-east4.hosted.app',
  recipient: 'qa-recipient@example.test',
  approvedRecipient: 'qa-recipient@example.test',
  stripeKey: 'sk_test_example',
  livemode: false,
};

test('provider certification accepts only the isolated staging origin and test-mode providers', () => {
  assert.equal(safety.assertProviderTargetSafety(safe), true);
  assert.equal(typeof safety.assertProviderSafety, 'function');
  assert.equal(safety.assertProviderSafety(safe), true);
});

test('provider certification refuses production, live Stripe, wrong recipient, and live objects', () => {
  for (const input of [
    { ...safe, projectId: 'studio-6850142148-fe343' },
    { ...safe, origin: 'https://www.thesquad.pro' },
    { ...safe, stripeKey: 'sk_live_example' },
    { ...safe, recipient: 'other@example.test' },
    { ...safe, livemode: true },
  ]) assert.throws(() => safety.assertProviderSafety(input), /refus/i);
  assert.throws(() => safety.assertProviderTargetSafety({
    ...safe,
    projectId: 'production-project',
    stripeKey: undefined,
  }), /refus/i);
});

test('provider probe plan is exact-origin, replay-aware, and owns every staging ledger mutation', () => {
  const plan = runner.buildProviderProbePlan({
    origin: safe.origin,
    runId: 'provider-cert-123',
    recipient: safe.recipient,
  });
  assert.deepEqual(plan.map(probe => probe.pathname), [
    '/api/webhook',
    '/api/stripe/connect/webhook',
    '/api/webhooks/resend',
  ]);
  assert.equal(plan.every(probe => probe.url.startsWith(`${safe.origin}/api/`)), true);
  assert.equal(plan.every(probe => probe.replay === true), true);
  assert.equal(plan.every(probe => probe.cleanupPaths.length > 0), true);
});

test('provider evidence sanitizer retains outcomes but removes secret and provider identifiers', () => {
  const evidence = runner.sanitizeProviderEvidence({
    runId: 'provider-cert-123',
    stripeKey: 'sk_test_secret',
    webhookSecret: 'whsec_secret',
    providerObjectId: 'evt_123',
    status: 200,
    duplicate: true,
  });
  assert.deepEqual(evidence, {
    runId: 'provider-cert-123',
    status: 200,
    duplicate: true,
  });
});

test('provider ledger completion recognizes each endpoint authoritative record shape', () => {
  assert.equal(runner.providerLedgerCompleted('stripe-standard', { status: 'completed' }), true);
  assert.equal(runner.providerLedgerCompleted('stripe-connect', { status: 'completed' }), true);
  assert.equal(runner.providerLedgerCompleted('resend-delivery', { status: 'completed' }), true);
  assert.equal(runner.providerLedgerCompleted('resend-email-event', {
    eventType: 'email.sent',
    emailId: 'email_provider_cert_123',
  }), true);
  assert.equal(runner.providerLedgerCompleted('resend-email-event', { status: 'completed' }), false);
});
