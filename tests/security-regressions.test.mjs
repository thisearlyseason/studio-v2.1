import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readSource = path => readFile(new URL(path, import.meta.url), 'utf8');

test('connected-account webhooks bind payment metadata to the configured team payout account', async () => {
  const webhook = await readSource('../src/app/api/stripe/connect/webhook/route.ts');
  const resolver = await readSource('../src/lib/server-stripe-connect.ts');
  assert.match(webhook, /connectAccountOwnsTeam/);
  assert.match(webhook, /Connected account does not own the referenced team/);
  assert.match(resolver, /team\.ownerUserId/);
  assert.doesNotMatch(resolver, /requesting user's personal connected account/);
});

test('team payment destinations and Stripe object creation are idempotent', async () => {
  const onboard = await readSource('../src/app/api/stripe/connect/onboard/route.ts');
  const paymentItems = await readSource('../src/app/api/stripe/payment-items/route.ts');
  const fundraising = await readSource('../src/app/api/stripe/fundraising-link/route.ts');
  assert.match(onboard, /stripeConnectAccountId/);
  assert.match(onboard, /idempotencyKey: `connect-account:/);
  assert.match(paymentItems, /operationId/);
  assert.match(paymentItems, /idempotencyKey: `payment-item:/);
  assert.match(fundraising, /operationId/);
  assert.match(fundraising, /idempotencyKey: `fundraising:/);
});

test('subscription mutations are bounded, rate limited, locked, and deterministic', async () => {
  const cancel = await readSource('../src/app/api/subscription/cancel/route.ts');
  const sync = await readSource('../src/app/api/subscription/sync/route.ts');
  for (const source of [cancel, sync]) {
    assert.match(source, /readJsonBodyWithLimit/);
    assert.match(source, /enforceUserRateLimit/);
    assert.match(source, /claimSubscriptionMutation/);
    assert.match(source, /releaseSubscriptionMutation/);
  }
  assert.match(sync, /chooseAuthoritativeSubscriptionId/);
});

test('stale Stripe webhook processing leases can be reclaimed', async () => {
  const webhook = await readSource('../src/app/api/webhook/route.ts');
  assert.match(webhook, /WEBHOOK_PROCESSING_LEASE_MS/);
  assert.match(webhook, /processingStartedAt/);
  assert.match(webhook, /claimResult === 'active'/);
  assert.match(webhook, /status: 409/);
});

test('subscription clients satisfy mutation idempotency contracts', async () => {
  const pricing = await readSource('../src/app/(dashboard)/pricing/page.tsx');
  const billing = await readSource('../src/app/(dashboard)/dashboard/billing/page.tsx');
  assert.match(pricing, /newPriceId: priceId,[\s\S]*operationId: crypto\.randomUUID\(\)/);
  assert.match(billing, /subscription\/sync[\s\S]*operationId: crypto\.randomUUID\(\)/);
});

test('scheduled cancellation state is persisted by direct changes and webhooks', async () => {
  const cancel = await readSource('../src/app/api/subscription/cancel/route.ts');
  const sync = await readSource('../src/app/api/subscription/sync/route.ts');
  const webhook = await readSource('../src/app/api/webhook/route.ts');
  assert.match(cancel, /cancel_at_period_end: updatedSubscription\.cancel_at_period_end/);
  assert.match(sync, /cancel_at_period_end: activeSub\?\.cancel_at_period_end === true/);
  assert.match(webhook, /cancel_at_period_end: subscription\.cancel_at_period_end/);
});

test('both checkout routes apply the guarded signup trial policy', async () => {
  const legacy = await readSource('../src/app/api/checkout/route.ts');
  const canonical = await readSource('../src/app/api/stripe/create-checkout/route.ts');
  for (const source of [legacy, canonical]) {
    assert.match(source, /calculateSignupTrialDays/);
    assert.match(source, /trial_period_days: serverTrialDays/);
  }
});

test('quota resolution uses an authenticated atomic server transaction', async () => {
  const provider = await readSource('../src/components/providers/team-provider.tsx');
  const route = await readSource('../src/app/api/teams/resolve-quota/route.ts');
  assert.match(provider, /fetch\('\/api\/teams\/resolve-quota'/);
  assert.doesNotMatch(provider, /batch\.update\(doc\(db, 'teams', t\.id\), \{ isPro: false/);
  assert.match(route, /verifyFirebaseToken/);
  assert.match(route, /adminDb\.runTransaction/);
  assert.match(route, /selected\.size > teamLimit/);
});

test('live deletion immediately revokes access and purges on a short schedule', async () => {
  const route = await readSource('../src/app/api/account/deletion-request/route.ts');
  const functions = await readSource('../functions/src/index.ts');
  assert.match(route, /revokeRefreshTokens\(auth\.uid\)/);
  assert.match(route, /updateUser\(auth\.uid, \{ disabled: true \}\)/);
  assert.match(functions, /purgeExpiredDeletionRequests = onSchedule\('every 15 minutes'/);
});

test('removed members cannot use payment or poll member access checks', async () => {
  const items = await readSource('../src/app/api/stripe/payment-items/route.ts');
  const vote = await readSource('../src/app/api/teams/chat/vote/route.ts');
  for (const source of [items, vote]) {
    assert.match(source, /status !== 'removed'/);
    assert.match(source, /isDeleted !== true/);
  }
});
