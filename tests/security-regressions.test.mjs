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
  const update = await readSource('../src/app/api/subscription/update/route.ts');
  const sync = await readSource('../src/app/api/subscription/sync/route.ts');
  const webhook = await readSource('../src/app/api/webhook/route.ts');
  assert.match(cancel, /cancel_at_period_end: updatedSubscription\.cancel_at_period_end/);
  assert.match(update, /buildSubscriptionResumeStripeUpdate/);
  assert.match(update, /idempotencyKey: `resume-\$\{idempotencyKey\}`/);
  assert.ok(
    update.indexOf('if (updatedSubscription.pending_update)') <
      update.indexOf('buildSubscriptionResumeStripeUpdate()')
  );
  assert.match(sync, /cancel_at_period_end: activeSub\?\.cancel_at_period_end === true/);
  assert.match(webhook, /cancel_at_period_end: subscription\.cancel_at_period_end/);
});

test('both checkout routes apply the guarded signup trial policy', async () => {
  const legacy = await readSource('../src/app/api/checkout/route.ts');
  const canonical = await readSource('../src/app/api/stripe/create-checkout/route.ts');
  for (const source of [legacy, canonical]) {
    assert.match(source, /calculateSignupTrialDays/);
    assert.match(source, /trial_period_days: serverTrialDays/);
    assert.match(source, /resolvePortalCustomerId/);
    assert.match(source, /buildStripeCustomerIdempotencyKey/);
    assert.doesNotMatch(source, /idempotencyKey: `customer-\$\{userId\}`/);
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

test('anonymous league creation is limited to server-seeded League Creator demos', async () => {
  const route = await readSource('../src/app/api/leagues/create/route.ts');
  const seedRoute = await readSource('../src/app/api/demo/seed/route.ts');
  const seeder = await readSource('../src/lib/db-seeder.ts');
  const leaguePage = await readSource('../src/app/(dashboard)/leagues/leagues-page-content.tsx');
  const rules = await readSource('../firestore.rules');

  assert.match(route, /assertNonAnonymous/);
  assert.match(route, /profileData\?\.isDemo === true/);
  assert.match(route, /profileData\?\.role === 'league_creator'/);
  assert.match(route, /if \(isAnonymous && !isAnonymousDemo\)/);
  assert.match(route, /league\.data\(\)\.demoSeeded !== true/);
  assert.match(route, /demoSessionOwnerId: auth\.uid/);
  assert.match(route, /demoSeeded: false/);
  for (const source of [seedRoute, seeder]) {
    assert.match(source, /demoSessionOwnerId:/);
    assert.match(source, /demoSeeded: true/);
  }
  assert.match(rules, /request\.resource\.data\.get\('demoSessionOwnerId', ''\) == resource\.data\.get\('demoSessionOwnerId', ''\)/);
  assert.match(rules, /request\.resource\.data\.get\('demoSeeded', false\) == resource\.data\.get\('demoSeeded', false\)/);
  assert.match(leaguePage, /const canManageLeagues = isStaff \|\| userProfile\?\.role === 'league_creator'/);
  assert.match(leaguePage, /const canManageLeague = isStaff \|\| user\?\.role === 'league_creator'/);
  assert.match(leaguePage, /if \(!isStaff && user\?\.role !== 'league_creator'\)/);
  assert.match(leaguePage, /league\.creatorId === authUser\?\.uid && league\.demoSeeded !== true/);
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
  assert.match(route, /hasUnresolvedSubscription\(profile\)/);
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

test('referee assignments cannot be enumerated by anonymous email lookup', async () => {
  const [route, page] = await Promise.all([
    readSource('../src/app/api/public/portals/route.ts'),
    readSource('../src/app/tournaments/referee/[teamId]/[eventId]/page.tsx'),
  ]);
  assert.match(route, /verifyFirebaseToken\(req\)/);
  assert.match(route, /assertNonAnonymous\(auth\)/);
  assert.match(route, /authenticatedEmail !== refereeEmail/);
  assert.match(page, /firebaseUser\.getIdToken\(\)/);
  assert.match(page, /Sign In to Continue/);
  assert.doesNotMatch(page, /Find My Assignments/);
  assert.doesNotMatch(page, /No referee found for/);
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
  assert.match(route, /process\.env\.CALENDAR_FEED_BASE_URL/);
  assert.doesNotMatch(route, /getcalendarfeed-jscic6vsuq-uc/);
  assert.match(functions, /hasCurrentCalendarTeamAccess/);
  assert.match(functions, /\^\[a-f0-9\]\{64\}\$/);
  assert.match(functions, /private, no-store, max-age=0/);
  assert.match(functions, /buildCalendarFeed/);
  assert.match(functions, /serverIssued !== true/);
  assert.match(functions, /Squad Access Revoked/);
  assert.doesNotMatch(functions, /GOOGLE_REDIRECT_URI|connectGoogleCalendar|google\.auth\.OAuth2/);
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

test('notification delivery resolves canonical users through active membership records', async () => {
  const [notify, email, access] = await Promise.all([
    readSource('../src/app/api/notify/route.ts'),
    readSource('../src/app/api/email/send/route.ts'),
    readSource('../src/lib/server-team-access.ts'),
  ]);

  for (const source of [notify, email]) {
    assert.match(source, /findActiveTeamMember\(teamId, id\)/);
    assert.match(source, /members\.some\(member => !member\)/);
  }
  assert.match(notify, /member\?\.data\.userId/);
  assert.match(access, /members\.where\('userId', '==', uid\)/);
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

test('organization squad seats are explicit, capacity-bound, and organizer-controlled', async () => {
  const route = await readSource('../src/app/api/organizations/squads/route.ts');
  const provider = await readSource('../src/components/providers/team-provider.tsx');
  const hub = await readSource('../src/app/(dashboard)/club/page.tsx');

  assert.match(route, /verifyFirebaseToken/);
  assert.match(route, /adminDb\.runTransaction/);
  assert.match(route, /hub\.ownerUserId === auth\.uid/);
  assert.match(route, /includesUser\(hub\.schoolAdminIds, auth\.uid\)/);
  assert.match(route, /team\.ownerUserId !== organization\.ownerId/);
  assert.match(route, /otherAllocated >= organization\.teamLimit/);
  assert.match(route, /isPro: allocated/);
  assert.match(route, /const allocatedSnapshots = organizationTeams\.filter/);
  assert.match(route, /allocated: allocatedCount/);
  assert.match(route, /squads,/);
  assert.match(route, /const teams = organizationTeams/);
  assert.match(route, /teams,/);
  assert.match(route, /planId: allocated \? organization\.planId : 'free'/);
  assert.match(route, /schoolId:[\s\S]*FieldValue\.delete\(\)/);
  assert.match(route, /clubId:[\s\S]*FieldValue\.delete\(\)/);

  assert.match(provider, /return activeTeam\?\.isPro === true/);
  assert.doesNotMatch(provider, /activeTeam\?\.clubId && clubData\?\.subscriptionStatus/);
  assert.doesNotMatch(provider, /activeTeam\?\.type === 'school' \|\| activeTeam\?\.type === 'school_squad' \|\| activeTeam\?\.schoolId/);

  assert.match(hub, /if \(!allocatedMembershipIds\.has\(team\.id\)\) return false/);
  assert.match(hub, /isBillableSquadSeat\(t\)/);
  assert.match(hub, /Math\.max\(0, limit - remaining\)/);
  assert.match(hub, /allocated: payload\.allocated, remaining: payload\.remaining/);
  assert.match(hub, /Available Starter Squads/);
  assert.match(hub, /fetch\('\/api\/organizations\/squads'/);
  assert.match(hub, /Return to Starter/);
  assert.doesNotMatch(hub, /await deleteTeam\(teamToDelete\.id\)/);
});
