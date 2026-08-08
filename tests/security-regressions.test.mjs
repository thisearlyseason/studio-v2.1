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

test('Stripe Connect webhooks are leased, deduplicated, and order-safe', async () => {
  const webhook = await readSource('../src/app/api/stripe/connect/webhook/route.ts');
  const ordering = await readSource('../src/lib/stripe-connect-webhook-security.ts');

  assert.match(webhook, /WEBHOOK_PROCESSING_LEASE_MS/);
  assert.match(webhook, /stripeConnectWebhookEvents/);
  assert.match(webhook, /claimResult === 'completed'/);
  assert.match(webhook, /claimResult === 'active'/);
  assert.match(webhook, /finishWebhookEvent\(event\.id, 'failed'/);
  assert.match(webhook, /shouldApplyStripePaymentStatus/);
  assert.doesNotMatch(webhook, /console\.log\([^\n]*payerEmail/);
  assert.match(ordering, /current\.status === 'paid' && incoming\.status !== 'paid'/);
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
  assert.match(functions, /purgeExpiredDeletionRequests = onSchedule\(\{[\s\S]*?schedule: 'every 15 minutes',[\s\S]*?region: 'us-central1'/);
});

test('Super Admin account controls fail closed and use the seven-day purge lifecycle', async () => {
  const route = await readSource('../src/app/api/admin/users/[uid]/account-control/route.ts');
  const adminPage = await readSource('../src/app/admin/page.tsx');

  assert.match(route, /auth\.role !== 'superadmin'/);
  assert.match(route, /uid === auth\.uid/);
  assert.match(route, /profileRole === 'superadmin' \|\| authRole === 'superadmin'/);
  assert.match(route, /confirmationEmail !== targetEmail/);
  assert.match(route, /isActiveSubscription\(profile\)/);
  assert.match(route, /findOwnedOrganizations\(uid\)/);
  assert.match(route, /RETENTION_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(route, /revokeRefreshTokens\(uid\)/);
  assert.match(route, /updateUser\(uid, \{ disabled: true \}\)/);
  assert.match(route, /adminAuditLogs/);
  assert.match(route, /transaction\.delete\(deletionRef\)/);
  assert.doesNotMatch(route, /admin\.auth\(\)\.deleteUser/);

  assert.match(adminPage, /Schedule Account Deletion/);
  assert.match(adminPage, /Type the account email to confirm/);
  assert.match(adminPage, /Cancel Deletion/);
  assert.match(adminPage, /u\.id !== user\?\.id/);
  assert.match(adminPage, /String\(u\.role \|\| ''\)\.toLowerCase\(\) !== 'superadmin'/);
});

test('removed members cannot use payment or poll member access checks', async () => {
  const items = await readSource('../src/app/api/stripe/payment-items/route.ts');
  const vote = await readSource('../src/app/api/teams/chat/vote/route.ts');
  for (const source of [items, vote]) {
    assert.match(source, /status !== 'removed'/);
    assert.match(source, /isDeleted !== true/);
  }
});

test('calendar feeds are server-issued and revalidate current squad membership', async () => {
  const provider = await readSource('../src/components/providers/team-provider.tsx');
  const route = await readSource('../src/app/api/calendar/feed/route.ts');
  const functions = await readSource('../functions/src/index.ts');
  const indexes = JSON.parse(await readSource('../firestore.indexes.json'));

  assert.match(provider, /fetch\('\/api\/calendar\/feed'/);
  assert.doesNotMatch(provider, /collection\(db, 'calendarFeeds'/);
  assert.doesNotMatch(provider, /Math\.random\(\)[\s\S]*calendarFeeds/);
  assert.match(route, /verifyFirebaseToken/);
  assert.match(route, /assertNonAnonymous/);
  assert.match(route, /randomBytes\(32\)/);
  assert.match(route, /serverIssued: true/);
  assert.match(route, /canAccessTeam/);
  assert.match(functions, /hasCurrentCalendarTeamAccess/);
  assert.match(functions, /serverIssued !== true/);
  assert.match(functions, /Squad Access Revoked/);
  for (const fieldPath of ['userId', 'parentId']) {
    assert.ok(indexes.fieldOverrides.some(override =>
      override.collectionGroup === 'members' &&
      override.fieldPath === fieldPath &&
      override.indexes?.some(index =>
        index.order === 'ASCENDING' && index.queryScope === 'COLLECTION_GROUP'
      )
    ));
  }
});

test('offline payments are validated and written only through the finance-authorized API', async () => {
  const page = await readSource('../src/app/(dashboard)/coaches-corner/page.tsx');
  const memberPayments = await readSource('../src/components/finance/MyPaymentsView.tsx');
  const route = await readSource('../src/app/api/payments/offline/route.ts');
  const indexes = JSON.parse(await readSource('../firestore.indexes.json'));

  assert.match(page, /fetch\('\/api\/payments\/offline'/);
  assert.doesNotMatch(page, /addDoc\(collection\(db, 'teams',[\s\S]*'payments'/);
  assert.match(route, /verifyFirebaseToken/);
  assert.match(route, /getTeamFinanceAccess/);
  assert.match(route, /payment_method: 'offline'/);
  assert.match(route, /recorded_by: auth\.uid/);
  assert.match(memberPayments, /where\('payer_email', '==', userEmail\.toLowerCase\(\)\)/);
  assert.match(memberPayments, /orderBy\('createdAt', 'desc'\)/);
  assert.ok(indexes.indexes.some(index =>
    index.collectionGroup === 'payments' &&
    index.queryScope === 'COLLECTION' &&
    index.fields?.some(field => field.fieldPath === 'payer_email' && field.order === 'ASCENDING') &&
    index.fields?.some(field => field.fieldPath === 'createdAt' && field.order === 'DESCENDING')
  ));
});
