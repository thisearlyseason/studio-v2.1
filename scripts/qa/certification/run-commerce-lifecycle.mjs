import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import Stripe from 'stripe';

const STAGING_PROJECT_ID = 'the-squad-v2-staging';
const STAGING_ORIGIN = 'https://studio--the-squad-v2-staging.us-east4.hosted.app';
const RUN_ID_PATTERN = /^commerce-cert-[a-z0-9-]{3,64}$/;

function refuse(reason) {
  throw new Error(`Refusing commerce certification: ${reason}`);
}

export function assertCommerceTargetSafety({
  projectId, origin, runId, recipient, approvedRecipient, stripeKey, livemode,
}) {
  if (projectId !== STAGING_PROJECT_ID || origin !== STAGING_ORIGIN) {
    refuse('target is not the isolated staging project and origin');
  }
  if (!RUN_ID_PATTERN.test(String(runId))) refuse('run identifier is not staging-owned');
  if (!recipient || recipient.toLowerCase() !== String(approvedRecipient || '').toLowerCase()) {
    refuse('recipient is not the approved recipient');
  }
  if (!String(stripeKey || '').startsWith('sk_test_') || livemode !== false) {
    refuse('Stripe must be in test mode');
  }
}

export function buildCheckoutMatrix(prices) {
  return [
    ['team', 'monthly', 'NEXT_PUBLIC_STRIPE_PRICE_TEAM_MONTHLY'],
    ['team', 'annual', 'NEXT_PUBLIC_STRIPE_PRICE_TEAM_ANNUAL'],
    ['elite', 'monthly', 'NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_MONTHLY'],
    ['elite', 'annual', 'NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_ANNUAL'],
    ['league', 'monthly', 'NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_MONTHLY'],
    ['league', 'annual', 'NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_ANNUAL'],
    ['school', 'monthly', 'NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_MONTHLY'],
    ['school', 'annual', 'NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_ANNUAL'],
  ].map(([plan, cycle, key]) => ({
    plan,
    cycle,
    priceId: prices[key],
    extraPriceId: prices[cycle === 'annual' ? 'STRIPE_PRICE_EXTRA_TEAM_ANNUAL' : 'STRIPE_PRICE_EXTRA_TEAM_MONTHLY'],
  }));
}

export function buildCommerceCleanupGraph(runId) {
  if (!RUN_ID_PATTERN.test(String(runId))) refuse('run identifier is not staging-owned');
  const userIds = [`${runId}-checkout`, `${runId}-other`, `${runId}-lifecycle`];
  const teamIds = [`${runId}-team`, `${runId}-other-team`];
  return {
    userIds,
    teamIds,
    firestorePaths: [
      ...userIds.map(uid => `users/${uid}`),
      ...teamIds.map(teamId => `teams/${teamId}`),
      `certificationCommerceRuns/${runId}`,
    ],
  };
}

export function paymentMethodIdForCustomerUpdate(paymentMethod) {
  if (typeof paymentMethod?.id !== 'string' || !paymentMethod.id) {
    throw new Error('Stripe did not return an attached PaymentMethod instance');
  }
  return paymentMethod.id;
}

export function assertCommerceCleanupState({ firestore, auth, customers }) {
  const result = { firestore, auth, customers, total: firestore + auth + customers };
  if (result.total !== 0) throw new Error(`Commerce cleanup left ${result.total} residual resource(s)`);
  return result;
}

export async function reconcileOwnedWebhookLedgers({ listOwnedEventIds, deleteLedgers, wait }) {
  const owned = new Set();
  for (let pass = 0; pass < 2; pass += 1) {
    await wait();
    const ids = await listOwnedEventIds();
    ids.forEach(id => owned.add(id));
    await deleteLedgers(ids);
  }
  return [...owned];
}

export function assertPaymentLifecycleStates(states) {
  if (states.created !== 'trialing' || states.failed !== 'past_due' || states.recovered !== 'active') {
    throw new Error(`Payment lifecycle must transition trialing -> past_due -> active, received ${states.created} -> ${states.failed} -> ${states.recovered}`);
  }
  return states;
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

async function ensureRegisteredUser(auth, uid, email, password) {
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

async function requestJson(pathname, token, body, expectedStatus) {
  const response = await fetch(`${STAGING_ORIGIN}${pathname}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  const text = await response.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  if (response.status !== expectedStatus) {
    throw new Error(`${pathname} returned ${response.status}, expected ${expectedStatus}: ${payload.error || 'unknown response'}`);
  }
  return { status: response.status, body: payload };
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

async function expireOpenSessions(stripe, customerId) {
  if (!customerId) return 0;
  const sessions = await stripe.checkout.sessions.list({ customer: customerId, status: 'open', limit: 100 });
  await Promise.all(sessions.data.map(session => stripe.checkout.sessions.expire(session.id)));
  return sessions.data.length;
}

async function deleteCustomer(stripe, customerId) {
  if (!customerId) return;
  try { await stripe.customers.del(customerId); } catch (error) {
    if (error?.code !== 'resource_missing') throw error;
  }
}

export async function main({
  projectId = STAGING_PROJECT_ID,
  origin = STAGING_ORIGIN,
  runId = `commerce-cert-${Date.now()}`,
} = {}) {
  const stripeKey = readSecret('STRIPE_SECRET_KEY');
  const recipient = readSecret('OWNER_NOTIFICATION_EMAIL');
  const stripe = new Stripe(stripeKey);
  const balance = await stripe.balance.retrieve();
  assertCommerceTargetSafety({
    projectId, origin, runId, recipient, approvedRecipient: recipient, stripeKey, livemode: balance.livemode,
  });
  const secretNames = [
    'NEXT_PUBLIC_STRIPE_PRICE_TEAM_MONTHLY', 'NEXT_PUBLIC_STRIPE_PRICE_TEAM_ANNUAL',
    'NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_MONTHLY', 'NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_ANNUAL',
    'NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_MONTHLY', 'NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_ANNUAL',
    'NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_MONTHLY', 'NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_ANNUAL',
    'STRIPE_PRICE_EXTRA_TEAM_MONTHLY', 'STRIPE_PRICE_EXTRA_TEAM_ANNUAL',
  ];
  const prices = Object.fromEntries(secretNames.map(name => [name, readSecret(name)]));
  const matrix = buildCheckoutMatrix(prices);
  for (const entry of matrix) {
    const price = await stripe.prices.retrieve(entry.priceId);
    const extra = await stripe.prices.retrieve(entry.extraPriceId);
    if (!price.active || price.livemode || price.type !== 'recurring' || price.recurring?.interval !== (entry.cycle === 'annual' ? 'year' : 'month')) {
      throw new Error(`${entry.plan}/${entry.cycle} base price is not an active matching test recurring price`);
    }
    if (!extra.active || extra.livemode || extra.recurring?.interval !== price.recurring?.interval) {
      throw new Error(`${entry.plan}/${entry.cycle} add-on price does not match its base price`);
    }
  }

  const graph = buildCommerceCleanupGraph(runId);
  const { auth, db } = stagingServices();
  const password = 'Staging-Commerce-QA!4096';
  const emails = Object.fromEntries(graph.userIds.map((uid, index) => [uid, `${runId}-${index}@example.invalid`]));
  const customerIds = new Set();
  const subscriptionIds = new Set();
  const observations = [];
  const startedAt = Math.floor(Date.now() / 1000) - 5;
  let evidence;
  try {
    await Promise.all(graph.userIds.map(uid => ensureRegisteredUser(auth, uid, emails[uid], password)));
    await Promise.all([
      db.doc(`users/${graph.userIds[0]}`).set({ email: emails[graph.userIds[0]], fullName: 'Checkout QA', role: 'coach', status: 'active', isDemo: false, plan_type: 'free', fixtureRunId: runId }),
      db.doc(`users/${graph.userIds[1]}`).set({ email: emails[graph.userIds[1]], fullName: 'Other QA', role: 'coach', status: 'active', isDemo: false, plan_type: 'free', fixtureRunId: runId }),
      db.doc(`users/${graph.userIds[2]}`).set({ email: emails[graph.userIds[2]], fullName: 'Lifecycle QA', role: 'coach', status: 'active', isDemo: false, plan_type: 'free', fixtureRunId: runId }),
      db.doc(`teams/${graph.teamIds[0]}`).set({ name: runId, ownerUserId: graph.userIds[2], planId: 'starter_squad', fixtureRunId: runId }),
      db.doc(`teams/${graph.teamIds[1]}`).set({ name: `${runId} other`, ownerUserId: graph.userIds[1], planId: 'starter_squad', fixtureRunId: runId }),
      db.doc(`certificationCommerceRuns/${runId}`).set({ runId, projectId, createdAt: new Date().toISOString() }),
    ]);
    const sdk = readSdkConfig();
    const [checkoutToken, otherToken, lifecycleToken] = await Promise.all(graph.userIds.map(uid => signIn(sdk.apiKey, emails[uid], password)));

    for (const entry of matrix) {
      const result = await requestJson('/api/stripe/create-checkout', checkoutToken, {
        userId: graph.userIds[0], priceId: entry.priceId, billingCycle: entry.cycle, extraTeamQty: 1,
      }, 200);
      if (typeof result.body.url !== 'string' || !result.body.url.startsWith('https://checkout.stripe.com/')) {
        throw new Error(`${entry.plan}/${entry.cycle} did not return a Stripe Checkout URL`);
      }
      const user = (await db.doc(`users/${graph.userIds[0]}`).get()).data();
      const customerId = user?.stripe_customer_id;
      if (typeof customerId !== 'string') throw new Error('Checkout did not persist its Stripe customer');
      customerIds.add(customerId);
      const open = await stripe.checkout.sessions.list({ customer: customerId, status: 'open', limit: 10 });
      if (open.data.length !== 1) throw new Error(`${entry.plan}/${entry.cycle} did not leave exactly one current Checkout session`);
      const lineItems = await stripe.checkout.sessions.listLineItems(open.data[0].id, { limit: 10 });
      const ids = new Set(lineItems.data.map(item => item.price?.id));
      if (!ids.has(entry.priceId) || !ids.has(entry.extraPriceId)) throw new Error(`${entry.plan}/${entry.cycle} Checkout line items were incorrect`);
      observations.push(`checkout-${entry.plan}-${entry.cycle}`);
    }

    await requestJson('/api/stripe/create-checkout', otherToken, { userId: graph.userIds[1], priceId: 'price_invalid', billingCycle: 'monthly' }, 400);
    await requestJson('/api/stripe/create-checkout', otherToken, { userId: graph.userIds[1], priceId: matrix[0].priceId, billingCycle: 'annual' }, 400);
    await requestJson('/api/stripe/create-checkout', checkoutToken, { userId: graph.userIds[1], priceId: matrix[0].priceId, billingCycle: 'monthly' }, 403);
    await requestJson('/api/stripe/create-checkout', otherToken, { userId: graph.userIds[1], teamId: graph.teamIds[0], priceId: matrix[0].priceId, billingCycle: 'monthly' }, 403);
    await requestJson('/api/stripe/create-checkout', otherToken, { userId: graph.userIds[1], priceId: matrix[0].priceId, billingCycle: 'monthly', extraTeamQty: 51 }, 400);
    observations.push('checkout-negative-boundaries');

    const concurrentBody = { userId: graph.userIds[2], teamId: graph.teamIds[0], priceId: matrix[0].priceId, billingCycle: 'monthly', extraTeamQty: 0 };
    const concurrent = await Promise.all([
      requestJson('/api/stripe/create-checkout', lifecycleToken, concurrentBody, 200).then(() => 200).catch(error => error.message.includes('returned 409') ? 409 : Promise.reject(error)),
      requestJson('/api/stripe/create-checkout', lifecycleToken, concurrentBody, 200).then(() => 200).catch(error => error.message.includes('returned 409') ? 409 : Promise.reject(error)),
    ]);
    if (!concurrent.includes(200) || !concurrent.every(status => [200, 409].includes(status))) {
      throw new Error(`Concurrent Checkout returned unsupported statuses ${concurrent.join(',')}`);
    }
    observations.push(`checkout-concurrency-${concurrent.sort().join('-')}`);

    const lifecycleUserRef = db.doc(`users/${graph.userIds[2]}`);
    const lifecycleUser = (await lifecycleUserRef.get()).data();
    const customerId = lifecycleUser?.stripe_customer_id;
    if (typeof customerId !== 'string') throw new Error('Lifecycle Checkout did not persist a Stripe customer');
    customerIds.add(customerId);
    await expireOpenSessions(stripe, customerId);
    const attachedPaymentMethod = await stripe.paymentMethods.attach('pm_card_visa', { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodIdForCustomerUpdate(attachedPaymentMethod) },
    });
    let subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: matrix[0].priceId }],
      trial_period_days: 1,
      metadata: { firebase_uid: graph.userIds[2], team_id: graph.teamIds[0], certification_run_id: runId },
    });
    subscriptionIds.add(subscription.id);
    await waitFor('subscription create webhook', async () => {
      const user = (await lifecycleUserRef.get()).data();
      return user?.stripe_subscription_id === subscription.id && user?.subscription_status === 'trialing' && user?.plan_type === 'team';
    });
    observations.push('subscription-created-trialing');

    const baseItem = subscription.items.data.find(item => item.price.id === matrix[0].priceId);
    if (!baseItem) throw new Error('Lifecycle subscription base item is missing');
    subscription = await stripe.subscriptions.update(subscription.id, {
      items: [
        { id: baseItem.id, price: matrix[3].priceId },
        { price: matrix[3].extraPriceId, quantity: 2 },
      ],
      proration_behavior: 'none',
    });
    await waitFor('subscription upgrade webhook', async () => {
      const user = (await lifecycleUserRef.get()).data();
      return user?.plan_type === 'elite' && user?.billing_cycle === 'annual' && user?.extra_teams === 2 && user?.team_limit === 10;
    });
    observations.push('subscription-upgraded-with-addons');

    subscription = await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true });
    await waitFor('cancel-at-period-end webhook', async () => (await lifecycleUserRef.get()).data()?.cancel_at_period_end === true);
    observations.push('subscription-cancel-scheduled');
    subscription = await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: false });
    await waitFor('reactivation webhook', async () => (await lifecycleUserRef.get()).data()?.cancel_at_period_end === false);
    observations.push('subscription-reactivated');

    const portal = await requestJson('/api/stripe/customer-portal', lifecycleToken, { userId: graph.userIds[2] }, 200);
    if (typeof portal.body.url !== 'string' || !portal.body.url.startsWith('https://billing.stripe.com/')) throw new Error('Customer portal URL was not returned');
    observations.push('customer-portal-created');

    await stripe.subscriptions.cancel(subscription.id);
    await waitFor('subscription deletion webhook', async () => {
      const user = (await lifecycleUserRef.get()).data();
      return user?.subscription_status === 'canceled' && user?.plan_type === 'free' && user?.team_limit === 0;
    });
    observations.push('subscription-canceled-entitlement-revoked');

    await deleteCustomer(stripe, customerId);
    await requestJson('/api/stripe/customer-portal', lifecycleToken, { userId: graph.userIds[2] }, 409);
    const recovered = await requestJson('/api/stripe/create-checkout', lifecycleToken, {
      userId: graph.userIds[2], teamId: graph.teamIds[0], priceId: matrix[0].priceId, billingCycle: 'monthly', extraTeamQty: 0,
    }, 200);
    if (typeof recovered.body.url !== 'string') throw new Error('Deleted-customer recovery did not return Checkout');
    const recoveredUser = (await lifecycleUserRef.get()).data();
    if (typeof recoveredUser?.stripe_customer_id !== 'string' || recoveredUser.stripe_customer_id === customerId) {
      throw new Error('Deleted Stripe customer was not replaced');
    }
    customerIds.add(recoveredUser.stripe_customer_id);
    observations.push('deleted-customer-recovered');

    evidence = {
      runId, projectId, origin, providerMode: 'test',
      priceMatrix: matrix.length,
      observations,
    };
  } finally {
    for (const customerId of customerIds) {
      await expireOpenSessions(stripe, customerId).catch(() => {});
      const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 100 }).catch(() => ({ data: [] }));
      for (const subscription of subscriptions.data) {
        if (subscription.status !== 'canceled') await stripe.subscriptions.cancel(subscription.id).catch(() => {});
        await db.doc(`subscriptions/${subscription.id}`).delete().catch(() => {});
      }
      await deleteCustomer(stripe, customerId).catch(() => {});
    }
    const ownedEventIds = await reconcileOwnedWebhookLedgers({
      listOwnedEventIds: async () => {
        const recentEvents = await stripe.events.list({ created: { gte: startedAt }, limit: 100 }).catch(() => ({ data: [] }));
        return recentEvents.data
          .filter(event => JSON.stringify(event.data?.object || {}).includes(runId))
          .map(event => event.id);
      },
      deleteLedgers: ids => Promise.all(ids.map(id => db.doc(`stripeWebhookEvents/${id}`).delete().catch(() => {}))),
      wait: () => new Promise(resolve => setTimeout(resolve, 3_000)),
    });
    const cleanupFirestorePaths = [
      ...graph.firestorePaths,
      ...[...subscriptionIds].map(id => `subscriptions/${id}`),
      ...ownedEventIds.map(id => `stripeWebhookEvents/${id}`),
    ];
    await Promise.all(cleanupFirestorePaths.map(path => db.recursiveDelete(db.doc(path)).catch(() => {})));
    await Promise.all(graph.userIds.map(async uid => {
      try { await auth.deleteUser(uid); } catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }
    }));
    const firestoreResiduals = (await Promise.all(cleanupFirestorePaths.map(path => db.doc(path).get())))
      .filter(snapshot => snapshot.exists).length;
    const authResiduals = (await Promise.all(graph.userIds.map(async uid => {
      try { await auth.getUser(uid); return true; } catch (error) {
        if (error?.code === 'auth/user-not-found') return false;
        throw error;
      }
    }))).filter(Boolean).length;
    const customerResiduals = (await Promise.all([...customerIds].map(async id => {
      try {
        const customer = await stripe.customers.retrieve(id);
        return customer.deleted !== true;
      } catch (error) {
        if (error?.code === 'resource_missing') return false;
        throw error;
      }
    }))).filter(Boolean).length;
    const cleanup = assertCommerceCleanupState({
      firestore: firestoreResiduals,
      auth: authResiduals,
      customers: customerResiduals,
    });
    if (evidence) evidence.cleanup = { ...cleanup, checkedFirestorePaths: cleanupFirestorePaths.length };
  }
  return evidence;
}

export async function runPaymentRecovery({
  projectId = STAGING_PROJECT_ID,
  origin = STAGING_ORIGIN,
  runId = `commerce-cert-clock-${Date.now()}`,
} = {}) {
  const stripeKey = readSecret('STRIPE_SECRET_KEY');
  const recipient = readSecret('OWNER_NOTIFICATION_EMAIL');
  const stripe = new Stripe(stripeKey);
  const balance = await stripe.balance.retrieve();
  assertCommerceTargetSafety({
    projectId, origin, runId, recipient, approvedRecipient: recipient, stripeKey, livemode: balance.livemode,
  });
  const annualElitePrice = readSecret('NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_ANNUAL');
  const annualExtraPrice = readSecret('STRIPE_PRICE_EXTRA_TEAM_ANNUAL');
  const monthlyTeamPrice = readSecret('NEXT_PUBLIC_STRIPE_PRICE_TEAM_MONTHLY');
  const uid = `${runId}-lifecycle`;
  const teamId = `${runId}-team`;
  const email = `${runId}@example.invalid`;
  const password = 'Staging-Clock-QA!4096';
  const { auth, db } = stagingServices();
  const startedAt = Math.floor(Date.now() / 1000) - 5;
  let clock;
  let customer;
  let subscription;
  let evidence;
  const observations = [];
  try {
    await ensureRegisteredUser(auth, uid, email, password);
    await Promise.all([
      db.doc(`users/${uid}`).set({ email, fullName: 'Payment Recovery QA', role: 'coach', status: 'active', isDemo: false, plan_type: 'free', fixtureRunId: runId }),
      db.doc(`teams/${teamId}`).set({ name: runId, ownerUserId: uid, planId: 'starter_squad', fixtureRunId: runId }),
    ]);
    const now = Math.floor(Date.now() / 1000);
    clock = await stripe.testHelpers.testClocks.create({ frozen_time: now, name: `The Squad ${runId}` });
    customer = await stripe.customers.create({ test_clock: clock.id, email, metadata: { firebase_uid: uid, certification_run_id: runId } });
    const failingMethod = await stripe.paymentMethods.attach('pm_card_chargeCustomerFail', { customer: customer.id });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: paymentMethodIdForCustomerUpdate(failingMethod) },
    });
    subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [
        { price: annualElitePrice },
        { price: annualExtraPrice, quantity: 2 },
      ],
      trial_period_days: 1,
      metadata: { firebase_uid: uid, team_id: teamId, certification_run_id: runId },
    });
    await waitFor('trialing entitlement webhook', async () => {
      const user = (await db.doc(`users/${uid}`).get()).data();
      return user?.stripe_subscription_id === subscription.id && user?.subscription_status === 'trialing' &&
        user?.plan_type === 'elite' && user?.billing_cycle === 'annual' && user?.extra_teams === 2 && user?.team_limit === 10;
    });
    const states = { created: subscription.status, failed: '', recovered: '' };
    observations.push('trialing-entitlement-with-annual-addons');

    await stripe.testHelpers.testClocks.advance(clock.id, { frozen_time: now + (2 * 24 * 60 * 60) });
    await waitFor('Stripe test clock advancement', async () => {
      clock = await stripe.testHelpers.testClocks.retrieve(clock.id);
      return clock.status === 'ready';
    });
    subscription = await stripe.subscriptions.retrieve(subscription.id);
    states.failed = subscription.status;
    const invoices = await stripe.invoices.list({ customer: customer.id, status: 'open', limit: 10 });
    const failedInvoice = invoices.data.find(invoice => invoice.attempted && invoice.paid !== true);
    if (!failedInvoice) throw new Error('Stripe test clock did not produce an attempted open invoice');
    await waitFor('past-due entitlement revocation webhook', async () => {
      const user = (await db.doc(`users/${uid}`).get()).data();
      return user?.subscription_status === 'past_due' && user?.plan_type === 'free' && user?.team_limit === 0;
    });
    observations.push('past-due-entitlement-revoked');

    const successfulMethod = await stripe.paymentMethods.attach('pm_card_visa', { customer: customer.id });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: paymentMethodIdForCustomerUpdate(successfulMethod) },
    });
    await stripe.invoices.pay(failedInvoice.id, { payment_method: successfulMethod.id });
    await waitFor('subscription payment recovery', async () => {
      subscription = await stripe.subscriptions.retrieve(subscription.id);
      const user = (await db.doc(`users/${uid}`).get()).data();
      return subscription.status === 'active' && user?.subscription_status === 'active' &&
        user?.plan_type === 'elite' && user?.team_limit === 10;
    });
    states.recovered = subscription.status;
    assertPaymentLifecycleStates(states);
    observations.push('payment-recovered-entitlement-restored');

    const baseItem = subscription.items.data.find(item => item.price.id === annualElitePrice);
    const addonItem = subscription.items.data.find(item => item.price.id === annualExtraPrice);
    if (!baseItem || !addonItem) throw new Error('Recovered subscription items did not match the annual plan and add-on');
    subscription = await stripe.subscriptions.update(subscription.id, {
      items: [
        { id: baseItem.id, price: monthlyTeamPrice },
        { id: addonItem.id, deleted: true },
      ],
      proration_behavior: 'none',
    });
    await waitFor('downgrade and interval webhook', async () => {
      const user = (await db.doc(`users/${uid}`).get()).data();
      return user?.subscription_status === 'active' && user?.plan_type === 'team' &&
        user?.billing_cycle === 'monthly' && user?.extra_teams === 0 && user?.team_limit === 1;
    });
    observations.push('downgrade-interval-change-addon-removed');
    evidence = { runId, projectId, origin, providerMode: 'test', observations, states };
  } finally {
    if (subscription && subscription.status !== 'canceled') await stripe.subscriptions.cancel(subscription.id).catch(() => {});
    if (customer) await deleteCustomer(stripe, customer.id).catch(() => {});
    if (clock) await stripe.testHelpers.testClocks.del(clock.id).catch(() => {});
    const ownedEventIds = await reconcileOwnedWebhookLedgers({
      listOwnedEventIds: async () => {
        const recent = await stripe.events.list({ created: { gte: startedAt }, limit: 100 }).catch(() => ({ data: [] }));
        return recent.data.filter(event => JSON.stringify(event.data?.object || {}).includes(runId)).map(event => event.id);
      },
      deleteLedgers: ids => Promise.all(ids.map(id => db.doc(`stripeWebhookEvents/${id}`).delete().catch(() => {}))),
      wait: () => new Promise(resolve => setTimeout(resolve, 3_000)),
    });
    const paths = [
      `users/${uid}`,
      `teams/${teamId}`,
      ...(subscription ? [`subscriptions/${subscription.id}`] : []),
      ...ownedEventIds.map(id => `stripeWebhookEvents/${id}`),
    ];
    await Promise.all(paths.map(path => db.recursiveDelete(db.doc(path)).catch(() => {})));
    try { await auth.deleteUser(uid); } catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }
    const firestoreResiduals = (await Promise.all(paths.map(path => db.doc(path).get()))).filter(snapshot => snapshot.exists).length;
    let authResiduals = 0;
    try { await auth.getUser(uid); authResiduals = 1; } catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }
    let customerResiduals = 0;
    if (customer) {
      try { customerResiduals = (await stripe.customers.retrieve(customer.id)).deleted === true ? 0 : 1; }
      catch (error) { if (error?.code !== 'resource_missing') throw error; }
    }
    const cleanup = assertCommerceCleanupState({ firestore: firestoreResiduals, auth: authResiduals, customers: customerResiduals });
    if (evidence) evidence.cleanup = { ...cleanup, checkedFirestorePaths: paths.length };
  }
  return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runner = process.argv[2] === 'clock' ? runPaymentRecovery : main;
  runner().then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch(error => {
    process.stderr.write(`Commerce certification failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
