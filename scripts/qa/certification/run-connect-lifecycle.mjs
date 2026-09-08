import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';

const STAGING_PROJECT_ID = 'the-squad-v2-staging';
const STAGING_ORIGIN = 'https://studio--the-squad-v2-staging.us-east4.hosted.app';
const RUN_ID_PATTERN = /^connect-cert-[a-z0-9-]{3,64}$/;

function refuse(reason) {
  throw new Error(`Refusing Connect certification: ${reason}`);
}

export function assertConnectTargetSafety({ projectId, origin, runId, stripeKey, livemode }) {
  if (projectId !== STAGING_PROJECT_ID || origin !== STAGING_ORIGIN) {
    refuse('target is not the isolated staging project and origin');
  }
  if (!RUN_ID_PATTERN.test(String(runId))) refuse('run identifier is not staging-owned');
  if (!String(stripeKey || '').startsWith('sk_test_') || livemode !== false) {
    refuse('Stripe must be in test mode');
  }
}

export function buildConnectCleanupGraph(runId) {
  if (!RUN_ID_PATTERN.test(String(runId))) refuse('run identifier is not staging-owned');
  const userIds = [`${runId}-owner`, `${runId}-other`];
  const teamIds = [`${runId}-team`, `${runId}-other-team`];
  return {
    userIds,
    teamIds,
    firestorePaths: [
      ...userIds.map(uid => `users/${uid}`),
      ...teamIds.map(teamId => `teams/${teamId}`),
      `certificationConnectRuns/${runId}`,
    ],
  };
}

export function requiredConnectObservations() {
  return [
    'connect-onboarding-link-created',
    'connect-status-resolved',
    'connect-cross-tenant-denied',
    'payment-item-created-listed-deleted',
    'fundraising-link-created-deleted',
    'connect-payment-failure-recorded',
    'connect-payment-success-recorded',
    'fundraising-donation-recorded-once',
    'connect-webhook-replay-idempotent',
  ];
}

export function assertConnectCleanupState({ firestore, auth, stripe, ledgers }) {
  const result = { firestore, auth, stripe, ledgers, total: firestore + auth + stripe + ledgers };
  if (result.total !== 0) throw new Error(`Connect cleanup left ${result.total} residual resource(s)`);
  return result;
}

export function selectChargeEnabledTestAccount(accounts, platformLivemode) {
  if (platformLivemode !== false) refuse('connected-account testing requires test mode');
  return accounts.find(account => account.charges_enabled === true);
}

export function connectIntentPaymentMethodPolicy() {
  return { enabled: true, allow_redirects: 'never' };
}

function readSecret(name) {
  return execFileSync('gcloud', [
    'secrets', 'versions', 'access', 'latest',
    `--project=${STAGING_PROJECT_ID}`,
    `--secret=${name}`,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 }).trim();
}

function readSdkConfig() {
  const raw = execFileSync('npx', [
    'firebase', 'apps:sdkconfig', 'WEB',
    '1:100620894746:web:936e8e921c9c41851d87a3',
    `--project=${STAGING_PROJECT_ID}`, '--json',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 });
  return JSON.parse(raw).result.sdkConfig;
}

function stagingServices() {
  if (getApps().length === 0) initializeApp({ projectId: STAGING_PROJECT_ID, credential: applicationDefault() });
  return { auth: getAuth(), db: getFirestore() };
}

async function ensureUser(auth, uid, email, password) {
  try { await auth.deleteUser(uid); } catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }
  await auth.createUser({ uid, email, password, emailVerified: true });
}

async function signIn(apiKey, email, password) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json();
  if (!response.ok || typeof body.idToken !== 'string') throw new Error(`Staging sign-in failed with ${response.status}`);
  return body.idToken;
}

async function request(pathname, token, { method = 'GET', body, expectedStatus = 200 } = {}) {
  const response = await fetch(`${STAGING_ORIGIN}${pathname}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  if (response.status !== expectedStatus) {
    throw new Error(`${method} ${pathname} returned ${response.status}, expected ${expectedStatus}: ${payload.error || text.slice(0, 160)}`);
  }
  return payload;
}

async function waitFor(description, check, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try { if (await check()) return; } catch (error) { lastError = error; }
    await new Promise(resolve => setTimeout(resolve, 2_000));
  }
  throw new Error(`${description} did not converge${lastError ? `: ${lastError.message}` : ''}`);
}

async function listOwnedConnectEventIds(stripe, accountId, startedAt, runId) {
  const events = await stripe.events.list({ created: { gte: startedAt }, limit: 100 }, { stripeAccount: accountId });
  return events.data
    .filter(event => JSON.stringify(event.data?.object || {}).includes(runId))
    .map(event => event.id);
}

async function deleteRateLimits(db, userIds) {
  for (const uid of userIds) {
    const snapshot = await db.collection('apiRateLimits').where('userId', '==', uid).get();
    await Promise.all(snapshot.docs.map(doc => doc.ref.delete()));
  }
}

async function archiveConnectArtifacts(stripe, accountId, artifacts) {
  for (const linkId of artifacts.links) {
    await stripe.paymentLinks.update(linkId, { active: false }, { stripeAccount: accountId }).catch(() => {});
  }
  for (const priceId of artifacts.prices) {
    await stripe.prices.update(priceId, { active: false }, { stripeAccount: accountId }).catch(() => {});
  }
  for (const productId of artifacts.products) {
    await stripe.products.update(productId, { active: false }, { stripeAccount: accountId }).catch(() => {});
  }
}

async function countActiveConnectArtifacts(stripe, accountId, artifacts) {
  let active = 0;
  for (const linkId of artifacts.links) {
    const link = await stripe.paymentLinks.retrieve(linkId, {}, { stripeAccount: accountId });
    if (link.active) active += 1;
  }
  for (const priceId of artifacts.prices) {
    const price = await stripe.prices.retrieve(priceId, {}, { stripeAccount: accountId });
    if (price.active) active += 1;
  }
  for (const productId of artifacts.products) {
    const product = await stripe.products.retrieve(productId, {}, { stripeAccount: accountId });
    if (product.active) active += 1;
  }
  return active;
}

export async function main({
  projectId = STAGING_PROJECT_ID,
  origin = STAGING_ORIGIN,
  runId = `connect-cert-${Date.now()}`,
} = {}) {
  const stripeKey = readSecret('STRIPE_SECRET_KEY');
  const connectWebhookSecret = readSecret('STRIPE_CONNECT_WEBHOOK_SECRET');
  const stripe = new Stripe(stripeKey);
  const balance = await stripe.balance.retrieve();
  assertConnectTargetSafety({ projectId, origin, runId, stripeKey, livemode: balance.livemode });

  const connectedAccounts = await stripe.accounts.list({ limit: 100 });
  const paymentAccount = selectChargeEnabledTestAccount(connectedAccounts.data, balance.livemode);
  if (!paymentAccount) throw new Error('No charge-enabled test connected account is available');

  const { auth, db } = stagingServices();
  const graph = buildConnectCleanupGraph(runId);
  const [ownerUid, otherUid] = graph.userIds;
  const [teamId, otherTeamId] = graph.teamIds;
  const password = 'Staging-Connect-QA!4096';
  const ownerEmail = `${runId}-owner@example.invalid`;
  const otherEmail = `${runId}-other@example.invalid`;
  const campaignId = `${runId}-campaign`;
  const itemId = `${runId}-payment-item`;
  const artifacts = { links: new Set(), prices: new Set(), products: new Set() };
  const paymentIntentIds = new Set();
  const observedLedgerIds = new Set();
  const startedAt = Math.floor(Date.now() / 1000) - 5;
  let onboardingAccountId;
  let evidence;

  try {
    await Promise.all([
      ensureUser(auth, ownerUid, ownerEmail, password),
      ensureUser(auth, otherUid, otherEmail, password),
    ]);
    await Promise.all([
      db.doc(`users/${ownerUid}`).set({ email: ownerEmail, fullName: 'Connect QA Owner', role: 'coach', status: 'active', isDemo: false, plan_type: 'team', subscription_status: 'active', fixtureRunId: runId }),
      db.doc(`users/${otherUid}`).set({ email: otherEmail, fullName: 'Connect QA Other', role: 'coach', status: 'active', isDemo: false, plan_type: 'team', subscription_status: 'active', fixtureRunId: runId }),
      db.doc(`teams/${teamId}`).set({ name: runId, ownerUserId: ownerUid, planId: 'team', isPro: true, fixtureRunId: runId }),
      db.doc(`teams/${otherTeamId}`).set({ name: `${runId} other`, ownerUserId: otherUid, planId: 'team', isPro: true, fixtureRunId: runId }),
      db.doc(`teams/${teamId}/fundraising/${campaignId}`).set({ id: campaignId, title: `${runId} campaign`, currentAmount: 0, goalAmount: 100, createdBy: ownerUid, fixtureRunId: runId }),
      db.doc(`certificationConnectRuns/${runId}`).set({ runId, projectId, createdAt: new Date().toISOString() }),
    ]);
    const sdk = readSdkConfig();
    const [ownerToken, otherToken] = await Promise.all([
      signIn(sdk.apiKey, ownerEmail, password),
      signIn(sdk.apiKey, otherEmail, password),
    ]);
    const observations = [];

    const onboarding = await request('/api/stripe/connect/onboard', ownerToken, {
      method: 'POST', body: { userId: ownerUid, teamId, mode: 'user' }, expectedStatus: 200,
    });
    if (typeof onboarding.url !== 'string' || !onboarding.url.startsWith('https://connect.stripe.com/')) throw new Error('Connect onboarding did not return a Stripe URL');
    onboardingAccountId = onboarding.connectAccountId;
    observations.push('connect-onboarding-link-created');

    const status = await request(`/api/stripe/connect/status?userId=${ownerUid}&teamId=${teamId}`, ownerToken);
    if (!status.connected || status.connectAccountId !== onboardingAccountId || status.detailsSubmitted !== false) throw new Error('Connect status did not resolve the onboarding account');
    observations.push('connect-status-resolved');

    await request('/api/stripe/connect/onboard', otherToken, {
      method: 'POST', body: { userId: otherUid, teamId, mode: 'user' }, expectedStatus: 403,
    });
    await request(`/api/stripe/connect/status?userId=${otherUid}&teamId=${teamId}`, otherToken, { expectedStatus: 403 });
    observations.push('connect-cross-tenant-denied');

    await db.doc(`teams/${teamId}`).update({ stripeConnectAccountId: paymentAccount.id, stripeConnectConfiguredBy: ownerUid });
    const item = await request('/api/stripe/payment-items', ownerToken, {
      method: 'POST', expectedStatus: 201,
      body: { userId: ownerUid, teamId, name: `${runId} fee`, description: 'Certification fee', amountDollars: 12.34, category: 'other', currency: 'cad', operationId: itemId },
    });
    if (item.item?.stripeAccountId !== paymentAccount.id || !item.item?.stripePaymentLinkUrl) throw new Error('Payment item did not use the resolved connected account');
    artifacts.links.add(item.item.stripePaymentLinkId);
    artifacts.prices.add(item.item.stripePriceId);
    artifacts.products.add(item.item.stripeProductId);
    const listed = await request(`/api/stripe/payment-items?teamId=${teamId}`, ownerToken);
    if (!listed.items?.some(candidate => candidate.id === itemId)) throw new Error('Payment item was not listed');
    await request('/api/stripe/payment-items', ownerToken, { method: 'DELETE', body: { userId: ownerUid, teamId, itemId } });
    const deactivated = await stripe.paymentLinks.retrieve(item.item.stripePaymentLinkId, {}, { stripeAccount: paymentAccount.id });
    if (deactivated.active) throw new Error('Payment item deletion did not deactivate its Stripe link');
    observations.push('payment-item-created-listed-deleted');

    const fundraising = await request('/api/stripe/fundraising-link', ownerToken, {
      method: 'POST', expectedStatus: 201,
      body: { userId: ownerUid, teamId, campaignId, campaignTitle: `${runId} campaign`, campaignDescription: 'Certification campaign', operationId: `${runId}-fundraising-link` },
    });
    const campaignWithLink = (await db.doc(`teams/${teamId}/fundraising/${campaignId}`).get()).data();
    if (!fundraising.paymentLinkUrl || campaignWithLink?.stripeEnabled !== true) throw new Error('Fundraising link was not persisted');
    artifacts.links.add(campaignWithLink.stripePaymentLinkId);
    artifacts.prices.add(campaignWithLink.stripePriceId);
    artifacts.products.add(campaignWithLink.stripeProductId);
    await request('/api/stripe/fundraising-link', ownerToken, { method: 'DELETE', body: { userId: ownerUid, teamId, campaignId } });
    if ((await db.doc(`teams/${teamId}/fundraising/${campaignId}`).get()).data()?.stripeEnabled !== false) throw new Error('Fundraising link was not disabled');
    observations.push('fundraising-link-created-deleted');

    let failedIntent;
    try {
      failedIntent = await stripe.paymentIntents.create({
        amount: 777, currency: 'cad', confirm: true, payment_method: 'pm_card_chargeCustomerFail',
        automatic_payment_methods: connectIntentPaymentMethodPolicy(),
        receipt_email: ownerEmail,
        metadata: { firebase_team_id: teamId, firebase_payment_item_id: itemId, certification_run_id: runId },
      }, { stripeAccount: paymentAccount.id });
    } catch (error) {
      failedIntent = error?.payment_intent;
      if (!failedIntent?.id) throw error;
    }
    paymentIntentIds.add(failedIntent.id);
    await waitFor('Connect payment failure webhook', async () => (await db.doc(`teams/${teamId}/payments/${failedIntent.id}`).get()).data()?.status === 'failed');
    observations.push('connect-payment-failure-recorded');

    const successfulIntent = await stripe.paymentIntents.create({
      amount: 2500, currency: 'cad', confirm: true, payment_method: 'pm_card_visa',
      automatic_payment_methods: connectIntentPaymentMethodPolicy(),
      receipt_email: ownerEmail,
      metadata: { firebase_team_id: teamId, firebase_campaign_id: campaignId, payment_item_category: 'donation', certification_run_id: runId },
    }, { stripeAccount: paymentAccount.id });
    paymentIntentIds.add(successfulIntent.id);
    await waitFor('Connect payment success webhook', async () => (await db.doc(`teams/${teamId}/payments/${successfulIntent.id}`).get()).data()?.status === 'paid');
    observations.push('connect-payment-success-recorded');
    await waitFor('fundraising donation webhook', async () => {
      const [campaign, donation] = await Promise.all([
        db.doc(`teams/${teamId}/fundraising/${campaignId}`).get(),
        db.doc(`teams/${teamId}/fundraising/${campaignId}/donations/stripe_${successfulIntent.id}`).get(),
      ]);
      return campaign.data()?.currentAmount === 25 && donation.data()?.status === 'verified';
    });
    observations.push('fundraising-donation-recorded-once');

    await waitFor('Connect provider events', async () => {
      const ids = await listOwnedConnectEventIds(stripe, paymentAccount.id, startedAt, runId);
      ids.forEach(id => observedLedgerIds.add(id));
      return ids.length >= 2;
    });
    const successEvents = await stripe.events.list({ type: 'payment_intent.succeeded', created: { gte: startedAt }, limit: 100 }, { stripeAccount: paymentAccount.id });
    const successEvent = successEvents.data.find(event => event.data?.object?.id === successfulIntent.id);
    if (!successEvent) throw new Error('Connected-account success event was not found');
    const replayBody = JSON.stringify(successEvent);
    const signature = stripe.webhooks.generateTestHeaderString({ payload: replayBody, secret: connectWebhookSecret });
    const replayResponse = await fetch(`${STAGING_ORIGIN}/api/stripe/connect/webhook`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: replayBody,
      signal: AbortSignal.timeout(30_000),
    });
    const replayPayload = await replayResponse.json();
    if (replayResponse.status !== 200 || replayPayload.duplicate !== true) throw new Error('Connect webhook replay was not idempotently acknowledged');
    const replayCampaign = (await db.doc(`teams/${teamId}/fundraising/${campaignId}`).get()).data();
    if (replayCampaign?.currentAmount !== 25) throw new Error('Connect webhook replay duplicated the donation total');
    observations.push('connect-webhook-replay-idempotent');

    const required = requiredConnectObservations();
    if (!required.every(value => observations.includes(value))) throw new Error('Connect lifecycle evidence is incomplete');
    evidence = { runId, projectId, origin, providerMode: 'test', paymentAccountId: paymentAccount.id, observations };
  } finally {
    await archiveConnectArtifacts(stripe, paymentAccount.id, artifacts);
    for (const paymentIntentId of paymentIntentIds) {
      const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {}, { stripeAccount: paymentAccount.id }).catch(() => null);
      if (intent && !['succeeded', 'canceled'].includes(intent.status)) await stripe.paymentIntents.cancel(intent.id, {}, { stripeAccount: paymentAccount.id }).catch(() => {});
    }
    await new Promise(resolve => setTimeout(resolve, 3_000));
    for (const id of await listOwnedConnectEventIds(stripe, paymentAccount.id, startedAt, runId).catch(() => [])) observedLedgerIds.add(id);
    await Promise.all([...observedLedgerIds].map(id => db.doc(`stripeConnectWebhookEvents/${id}`).delete().catch(() => {})));
    await deleteRateLimits(db, graph.userIds);
    await Promise.all(graph.firestorePaths.map(path => db.recursiveDelete(db.doc(path)).catch(() => {})));
    await Promise.all(graph.userIds.map(async uid => {
      try { await auth.deleteUser(uid); } catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }
    }));
    if (onboardingAccountId) await stripe.accounts.del(onboardingAccountId).catch(() => {});

    const firestoreResiduals = (await Promise.all(graph.firestorePaths.map(path => db.doc(path).get()))).filter(snapshot => snapshot.exists).length;
    const authResiduals = (await Promise.all(graph.userIds.map(async uid => {
      try { await auth.getUser(uid); return true; } catch (error) { if (error?.code === 'auth/user-not-found') return false; throw error; }
    }))).filter(Boolean).length;
    const activeStripeResiduals = await countActiveConnectArtifacts(stripe, paymentAccount.id, artifacts);
    const ledgerResiduals = (await Promise.all([...observedLedgerIds].map(id => db.doc(`stripeConnectWebhookEvents/${id}`).get()))).filter(snapshot => snapshot.exists).length;
    const cleanup = assertConnectCleanupState({ firestore: firestoreResiduals, auth: authResiduals, stripe: activeStripeResiduals, ledgers: ledgerResiduals });
    if (evidence) evidence.cleanup = { ...cleanup, checkedFirestorePaths: graph.firestorePaths.length, checkedWebhookLedgers: observedLedgerIds.size };
  }
  return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch(error => {
    process.stderr.write(`Connect certification failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
