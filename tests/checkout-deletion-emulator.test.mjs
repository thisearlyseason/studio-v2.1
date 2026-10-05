import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { NextRequest } from 'next/server.js';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PLAN_PRICE_MAP } from '../src/lib/stripe-price-map.ts';

const enabled = process.env.CHECKOUT_DELETION_EMULATOR_TEST === '1';
const origin = 'https://checkout-deletion.example.test';
const boundary = '__checkoutDeletionStripe';
let app, db, auth, routes, actions, bundleDir;
const fixtures = [], sessions = new Map(), idempotency = new Map(), subscriptions = new Map();
let pauseBeforeClaim, pauseCreate, pauseReply, loseCreateReply = false, hideSubscriptions = false;
const stripe = {
  customers: { retrieve: async id => ({ id, object: 'customer', deleted: false }) },
  subscriptions: {
    list: async ({ customer }) => { await pauseBeforeClaim?.(); return { data: hideSubscriptions ? [] : [...subscriptions.values()].filter(s => s.customer === customer), has_more: false }; },
    retrieve: async id => { assert.ok(subscriptions.has(id)); return subscriptions.get(id); },
  },
  checkout: { sessions: {
    list: async ({ customer, status, limit = 10, starting_after }) => {
      const all = [...sessions.values()].filter(s => s.customer === customer);
      const rest = all.slice(starting_after ? all.findIndex(s => s.id === starting_after) + 1 : 0).filter(s => !status || s.status === status);
      return { data: rest.slice(0, limit), has_more: rest.length > limit };
    },
    retrieve: async id => { assert.ok(sessions.has(id)); return structuredClone(sessions.get(id)); },
    expire: async id => { const s = sessions.get(id); assert.ok(s); if (s.status !== 'open') throw Error('Session cannot expire'); s.status = 'expired'; s.url = null; return structuredClone(s); },
    create: async (params, options) => {
      assert.equal(params.mode, 'subscription'); assert.ok(options.idempotencyKey);
      await pauseCreate?.();
      const previous = idempotency.get(options.idempotencyKey);
      if (previous) { assert.deepEqual(previous.params, params, 'Retry must use exact Stripe parameters'); return structuredClone(sessions.get(previous.id)); }
      const id = 'cs_test_' + (sessions.size + 1);
      sessions.set(id, { id, object: 'checkout.session', mode: 'subscription', status: 'open', payment_status: 'unpaid', customer: params.customer, subscription: null, metadata: params.metadata, expires_at: Math.floor(Date.now() / 1000) + 86400, url: 'https://checkout.stripe.com/test/' + id });
      idempotency.set(options.idempotencyKey, { id, params: structuredClone(params) });
      if (loseCreateReply) throw Error('Injected lost Stripe response after session creation');
      const response = structuredClone(sessions.get(id)); await pauseReply?.(); return response;
    },
  } },
};
before(async () => {
  if (!enabled) return;
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8187');
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9197');
  Object.assign(process.env, { NEXT_PUBLIC_APP_DISTRIBUTION: 'web', GCLOUD_PROJECT: 'demo-native-auth-test', NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG: JSON.stringify({ projectId: 'demo-native-auth-test', apiKey: 'emulator-key' }) });
  delete process.env.FIREBASE_WEBAPP_CONFIG;
  app = initializeApp({ projectId: 'demo-native-auth-test' }); db = getFirestore(app); auth = getAuth(app);
  globalThis[boundary] = stripe;
  await mkdir('output', { recursive: true }); bundleDir = await mkdtemp(resolve('output/checkout-deletion-emulator-'));
  await build({ entryPoints: { canonical: 'src/app/api/stripe/create-checkout/route.ts', legacy: 'src/app/api/checkout/route.ts', deletion: 'src/lib/server-account-deletion.ts' }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', outdir: bundleDir, outExtension: { '.js': '.cjs' }, logLevel: 'silent', plugins: [{ name: 'stripe-only-boundary', setup(b) {
    b.onResolve({ filter: /(^|\/)stripe-client$/ }, () => ({ path: 'stripe', namespace: 'controlled-provider' }));
    b.onLoad({ filter: /.*/, namespace: 'controlled-provider' }, () => ({ contents: `export function getStripe(){ return globalThis[${JSON.stringify(boundary)}]; }` }));
  } }] });
  const require = createRequire(import.meta.url);
  routes = Object.fromEntries(['canonical', 'legacy'].map(name => [name, require(bundleDir + '/' + name + '.cjs').POST]));
  actions = require(bundleDir + '/deletion.cjs').createAccountDeletionActions(db, auth);
});
after(async () => {
  if (!enabled) return;
  for (const uid of fixtures) { await auth.deleteUser(uid); await db.doc('users/' + uid).delete(); await db.doc('accountDeletionRequests/' + uid).delete(); }
  delete globalThis[boundary]; await deleteApp(app); await rm(bundleDir, { recursive: true, force: true });
});
async function account(label) {
  const credentials = { email: label + '@checkout-deletion.test', password: 'Emulator-only!12345', returnSecureToken: true };
  const request = endpoint => fetch('http://127.0.0.1:9197/identitytoolkit.googleapis.com/v1/accounts:' + endpoint + '?key=emulator-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
  const signup = await request('signUp'); assert.equal(signup.status, 200); const uid = (await signup.json()).localId; fixtures.push(uid);
  await auth.updateUser(uid, { emailVerified: true });
  await db.doc('users/' + uid).set({ role: 'coach', email: credentials.email, fullName: label, stripe_customer_id: 'cus_' + uid });
  const login = await request('signInWithPassword'); assert.equal(login.status, 200);
  return { uid, token: (await login.json()).idToken };
}

test('recovery checks completed attempts even after the provider idempotency cache is gone', { skip: !enabled }, async () => {
  const who = await account('pruned-idempotency'); loseCreateReply = true;
  try { assert.equal((await create('canonical', who)).status, 500); } finally { loseCreateReply = false; }
  const session = [...sessions.values()].find(s => s.customer === 'cus_' + who.uid);
  session.status = 'complete'; session.subscription = 'sub_pruned';
  subscriptions.set('sub_pruned', { id: 'sub_pruned', status: 'active', customer: session.customer });
  for (const [key, value] of idempotency) if (value.id === session.id) idempotency.delete(key);
  await db.doc('users/' + who.uid).update({ 'pendingCheckout.expiresAt': 0 });
  // Model a stale list/cache before the canonical session is retrieved.
  hideSubscriptions = true;
  try { assert.equal((await create('canonical', who)).status, 409); } finally { hideSubscriptions = false; }
  assert.equal([...sessions.values()].filter(s => s.customer === session.customer).length, 1);
  await assert.rejects(actions.schedule(who.uid), e => e.status === 409);
});

test('deletion expires only its unpaid checkout, then preserves the normal seven-day lifecycle', { skip: !enabled }, async () => {
  const who = await account('unpaid-delete'); assert.equal((await create('canonical', who)).status, 200);
  const session = [...sessions.values()].find(s => s.customer === 'cus_' + who.uid);
  await assert.rejects(actions.schedule(who.uid), e => e.status === 409);
  await actions.eligible(who.uid); await actions.schedule(who.uid);
  assert.equal(session.status, 'expired'); assert.equal((await auth.getUser(who.uid)).disabled, true);
  const record = (await db.doc('accountDeletionRequests/' + who.uid).get()).data();
  assert.equal(record.purgeAt.toMillis() - record.requestedAt.toMillis(), 7 * 86400000);
});

test('delayed active or incomplete subscription blocks deletion despite a stale free profile', { skip: !enabled }, async () => {
  for (const status of ['active', 'incomplete']) {
    const who = await account('delayed-' + status); assert.equal((await create('canonical', who)).status, 200);
    const session = [...sessions.values()].find(s => s.customer === 'cus_' + who.uid);
    session.status = 'complete'; session.subscription = 'sub_' + status;
    subscriptions.set(session.subscription, { id: session.subscription, customer: session.customer, status });
    await assert.rejects(actions.eligible(who.uid), e => e.status === 409);
    assert.equal((await auth.getUser(who.uid)).disabled, false);
    assert.equal((await db.doc('accountDeletionRequests/' + who.uid).get()).exists, false);
    assert.ok((await db.doc('users/' + who.uid).get()).data().pendingCheckout);
  }
});

test('provider lookup failure and expiry/completion race cannot clear the checkout fence', { skip: !enabled }, async () => {
  const who = await account('provider-unavailable'); assert.equal((await create('legacy', who)).status, 200);
  const original = stripe.checkout.sessions.retrieve;
  stripe.checkout.sessions.retrieve = async () => { throw Error('Injected unavailable Stripe'); };
  try { await assert.rejects(actions.eligible(who.uid), e => e.status === 503); } finally { stripe.checkout.sessions.retrieve = original; }
  const expire = stripe.checkout.sessions.expire;
  stripe.checkout.sessions.expire = async id => { sessions.get(id).status = 'complete'; throw Error('Checkout completed before expiry'); };
  try { await assert.rejects(actions.eligible(who.uid), e => e.status === 503); } finally { stripe.checkout.sessions.expire = expire; }
  assert.equal((await auth.getUser(who.uid)).disabled, false);
  assert.ok((await db.doc('users/' + who.uid).get()).data().pendingCheckout);
});

test('normal web retries reuse an open checkout; changing plan expires the former checkout', { skip: !enabled }, async () => {
  const who = await account('normal-plan-change');
  const first = await create('canonical', who), firstUrl = (await first.json()).url;
  const second = await create('canonical', who); assert.equal((await second.json()).url, firstUrl);
  const changed = await create('canonical', who, { extraTeamQty: 1 }); assert.equal(changed.status, 200, await changed.clone().text());
  assert.notEqual((await changed.json()).url, firstUrl);
  const own = [...sessions.values()].filter(s => s.customer === 'cus_' + who.uid);
  assert.equal(own.filter(s => s.status === 'open').length, 1); assert.equal(own.filter(s => s.status === 'expired').length, 1);
});

test('a foreign pending session is not expired or treated as safe to delete', { skip: !enabled }, async () => {
  const who = await account('foreign-session'); assert.equal((await create('canonical', who)).status, 200);
  const session = [...sessions.values()].find(s => s.customer === 'cus_' + who.uid); session.metadata.firebase_uid = 'different-user';
  await assert.rejects(actions.eligible(who.uid), e => e.status === 409);
  assert.equal(session.status, 'open'); assert.equal((await auth.getUser(who.uid)).disabled, false);
});

test('store mode continues to forbid both payment entry points', { skip: !enabled }, async () => {
  const who = await account('store-free-only'), before = sessions.size; process.env.NEXT_PUBLIC_APP_DISTRIBUTION = 'store';
  const require = createRequire(import.meta.url), webRoutes = routes;
  // Distribution is a module/build constant, not a runtime request toggle.
  routes = Object.fromEntries(['canonical', 'legacy'].map(name => { const path = bundleDir + '/' + name + '.cjs'; delete require.cache[path]; return [name, require(path).POST]; }));
  try { for (const name of ['canonical', 'legacy']) assert.equal((await create(name, who)).status, 403); }
  finally { process.env.NEXT_PUBLIC_APP_DISTRIBUTION = 'web'; routes = webRoutes; }
  assert.equal(sessions.size, before);
});

test('preexisting forged recovery parameters cannot create an unauthorized Stripe session', { skip: !enabled }, async () => {
  const who = await account('forged-recovery'); loseCreateReply = true;
  try { assert.equal((await create('canonical', who)).status, 500); } finally { loseCreateReply = false; }
  const session = [...sessions.values()].find(s => s.customer === 'cus_' + who.uid);
  sessions.delete(session.id);
  for (const [key, value] of idempotency) if (value.id === session.id) idempotency.delete(key);
  await db.doc('users/' + who.uid).update({ 'pendingCheckout.expiresAt': 0, 'pendingCheckout.request.subscription_data.trial_period_days': 999 });
  const before = sessions.size;
  assert.equal((await create('canonical', who)).status, 409);
  assert.equal(sessions.size, before);
  await assert.rejects(actions.schedule(who.uid), e => e.status === 409);
});

test('late original provider response cannot restore a fence after recovery and deletion', { skip: !enabled, timeout: 15000 }, async () => {
  const who = await account('late-response'), b = barrier(); pauseReply = b.hold;
  const original = create('canonical', who);
  try {
    await b.reached; pauseReply = undefined;
    await db.doc('users/' + who.uid).update({ 'pendingCheckout.expiresAt': 0 });
    assert.equal((await create('canonical', who)).status, 200);
    await actions.eligible(who.uid); await actions.schedule(who.uid);
    b.release(); assert.equal((await original).status, 409);
    const profile = (await db.doc('users/' + who.uid).get()).data();
    assert.equal(profile.deletionStatus, 'pending'); assert.equal(profile.pendingCheckout, undefined);
  } finally { pauseReply = undefined; b.release(); await original; }
});

test('all pages of older payable checkouts are expired before a new checkout is issued', { skip: !enabled }, async () => {
  const who = await account('paginated-checkouts');
  for (let i = 0; i < 105; i++) {
    const id = 'cs_old_page_' + i;
    sessions.set(id, { id, mode: 'subscription', customer: 'cus_' + who.uid, status: 'open', metadata: { firebase_uid: who.uid }, expires_at: Math.floor(Date.now() / 1000) + 86400, url: 'https://checkout.stripe.com/test/' + id });
  }
  assert.equal((await create('canonical', who)).status, 200);
  const own = [...sessions.values()].filter(s => s.customer === 'cus_' + who.uid);
  assert.equal(own.filter(s => s.status === 'expired').length, 105);
  assert.equal(own.filter(s => s.status === 'open').length, 1);
});
const priceId = Object.keys(PLAN_PRICE_MAP)[0];
const create = (name, who, overrides = {}) => routes[name](new NextRequest(origin + '/api/checkout', { method: 'POST', headers: { Authorization: 'Bearer ' + who.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: who.uid, priceId, billingCycle: 'monthly', ...overrides }) }));
function barrier() { let signal, release; const reached = new Promise(r => { signal = r; }); const waiting = new Promise(r => { release = r; }); return { reached, release, hold: async () => { signal(); await waiting; } }; }

for (const name of ['canonical', 'legacy']) {
  test(`${name}: deletion wins after checkout authentication but before its claim`, { skip: !enabled, timeout: 15000 }, async () => {
    const who = await account(name + '-delete-first'), b = barrier(); pauseBeforeClaim = b.hold;
    const creating = create(name, who);
    try {
      await b.reached; await actions.schedule(who.uid); b.release();
      assert.equal((await creating).status, 409);
      assert.equal([...sessions.values()].some(s => s.customer === 'cus_' + who.uid), false);
    } finally { pauseBeforeClaim = undefined; b.release(); await creating; }
  });
  test(`${name}: a checkout in flight prevents deletion and remains usable`, { skip: !enabled, timeout: 15000 }, async () => {
    const who = await account(name + '-checkout-first'), b = barrier(); pauseCreate = b.hold;
    const creating = create(name, who);
    try {
      await b.reached;
      await assert.rejects(actions.schedule(who.uid), error => error.status === 409);
      assert.equal((await auth.getUser(who.uid)).disabled, false);
      b.release(); const response = await creating; assert.equal(response.status, 200); assert.match((await response.json()).url, /^https:\/\/checkout.stripe.com\//);
    } finally { pauseCreate = undefined; b.release(); await creating; }
  });
  test(`${name}: lost provider reply retains the deletion fence and a retry recovers one session`, { skip: !enabled }, async () => {
    const who = await account(name + '-lost-reply'); loseCreateReply = true;
    try { assert.equal((await create(name, who)).status, 500); } finally { loseCreateReply = false; }
    await assert.rejects(actions.schedule(who.uid), error => error.status === 409);
    await db.doc('users/' + who.uid).update({ 'pendingCheckout.expiresAt': 0 });
    const retry = await create(name, who); assert.equal(retry.status, 200, await retry.clone().text());
    const own = [...sessions.values()].filter(s => s.customer === 'cus_' + who.uid);
    assert.equal(own.length, 1); assert.equal(own[0].status, 'open');
    assert.equal((await retry.json()).url, own[0].url);
  });
}

for (const route of ['canonical','legacy']) test(`standard mode ${route}: new reservation is explicit, legacy uncertain payload stays exact`, {skip:!enabled}, async()=>{
  const who=await account('standard-'+route);
  assert.equal((await create(route,who)).status,200);
  const ref=db.doc('users/'+who.uid), profile=(await ref.get()).data(), lock=profile.pendingCheckout;
  assert.deepEqual(lock.request.managed_payments,{enabled:false});
  assert.match(lock.attemptId,/^checkout-attempt-standard-v2-/);
  const oldRequest=structuredClone(lock.request); delete oldRequest.managed_payments;
  const oldAttempt='checkout-attempt-legacy-'+who.uid;
  oldRequest.metadata.checkout_attempt=oldAttempt;
  sessions.delete(lock.sessionId);
  await ref.update({pendingCheckout:{...lock,attemptId:oldAttempt,sessionId:null,expiresAt:0,request:oldRequest}});
  assert.equal((await create(route,who)).status,200);
  assert.deepEqual(idempotency.get(oldAttempt).params,oldRequest);
  assert.equal(Object.hasOwn(idempotency.get(oldAttempt).params,'managed_payments'),false);
});
test('standard mode recovery rejects forged enabled Managed Payments payload', {skip:!enabled},async()=>{
 const who=await account('standard-forged'); assert.equal((await create('canonical',who)).status,200);
 const ref=db.doc('users/'+who.uid),lock=(await ref.get()).data().pendingCheckout;
 sessions.delete(lock.sessionId);
 const attempt='checkout-attempt-forged-'+who.uid;
 await ref.update({pendingCheckout:{...lock,attemptId:attempt,sessionId:null,expiresAt:0,request:{...lock.request,metadata:{...lock.request.metadata,checkout_attempt:attempt},managed_payments:{enabled:true}}}});
 assert.equal((await create('canonical',who)).status,409);assert.equal(idempotency.has(attempt),false);
});
