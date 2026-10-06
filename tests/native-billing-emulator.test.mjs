import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { NextRequest } from 'next/server.js';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const enabled = process.env.NATIVE_BILLING_EMULATOR_TEST === '1';
let app, db, auth, routes, bundleDir, rules;
const realFetch = globalThis.fetch;
const subscribers = new Map();
let providerStatus = 200;
const authHeader = 'Bearer isolated-test-webhook-authorization-123456';
const origin = 'https://native-billing.example.test';
const fixtures = [];
function subscriber(active = true, overrides = {}) {
  return { subscriber: { entitlements: active ? { squad_elite: { product_identifier: 'pro.thesquad.elite.monthly', expires_date: '2099-01-01T00:00:00Z' } } : {},
    subscriptions: active ? { 'pro.thesquad.elite.monthly': { store: 'app_store', is_sandbox: false, ...overrides } } : {} } };
}
before(async () => {
  if (!enabled) return;
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8289');
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9299');
  Object.assign(process.env, { NEXT_PUBLIC_APP_DISTRIBUTION: 'store', GCLOUD_PROJECT: 'demo-native-billing-test', NATIVE_BILLING_ENABLED: 'true', REVENUECAT_SERVER_API_KEY: 'isolated-test-only', REVENUECAT_WEBHOOK_AUTHORIZATION: authHeader, REVENUECAT_IOS_PUBLIC_KEY: 'appl_test', REVENUECAT_ANDROID_PUBLIC_KEY: 'goog_test' });
  app = initializeApp({ projectId: 'demo-native-billing-test' }); db = getFirestore(app); auth = getAuth(app);
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith('https://api.revenuecat.com/v1/subscribers/')) {
      assert.equal(options.headers.Authorization, 'Bearer isolated-test-only');
      assert.equal(options.redirect, 'error');
      const uid = decodeURIComponent(String(url).split('/').at(-1));
      return new Response(JSON.stringify(subscribers.get(uid) || subscriber(false)), { status: providerStatus });
    }
    return realFetch(url, options);
  };
  await mkdir('output', { recursive: true }); bundleDir = await mkdtemp(resolve('output/native-billing-emulator-'));
  await build({ entryPoints: Object.fromEntries(['session', 'sync', 'webhook'].map(name => [name, `src/app/api/native-billing/${name}/route.ts`])), bundle: true, platform: 'node', format: 'cjs', packages: 'external', outdir: bundleDir, outExtension: { '.js': '.cjs' }, logLevel: 'silent' });
  const require = createRequire(import.meta.url);
  routes = Object.fromEntries(['session', 'sync', 'webhook'].map(name => [name, require(bundleDir + '/' + name + '.cjs').POST]));
  rules = await initializeTestEnvironment({ projectId: 'demo-native-billing-test', firestore: { host: '127.0.0.1', port: 8289, rules: await readFile('firestore.rules', 'utf8') } });
});
after(async () => {
  if (!enabled) return;
  globalThis.fetch = realFetch;
  for (const uid of fixtures) { await auth.deleteUser(uid); await db.recursiveDelete(db.doc('users/' + uid)); await db.doc('teams/team_' + uid).delete(); }
  await rules?.cleanup(); await deleteApp(app); await rm(bundleDir, { recursive: true, force: true });
});
async function account(label, profile = {}) {
  const credentials = { email: label + '@native-billing.test', password: 'Emulator-only!12345', returnSecureToken: true };
  const request = endpoint => realFetch('http://127.0.0.1:9299/identitytoolkit.googleapis.com/v1/accounts:' + endpoint + '?key=emulator-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
  const signup = await request('signUp'); assert.equal(signup.status, 200); const uid = (await signup.json()).localId; fixtures.push(uid);
  await auth.updateUser(uid, { emailVerified: true });
  await db.doc('users/' + uid).set({ role: 'coach', email: credentials.email, fullName: label, ...profile });
  await db.doc('teams/team_' + uid).set({ name: label, ownerUserId: uid, type: 'adult', isPro: false, planId: 'free' });
  const login = await request('signInWithPassword'); assert.equal(login.status, 200);
  return { uid, token: (await login.json()).idToken };
}
function invoke(route, token, body) {
  return routes[route](new NextRequest(origin + '/api/native-billing/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { authorization: token.startsWith('Bearer ') ? token : 'Bearer ' + token } : {}) }, body: JSON.stringify(body) }));
}

test('native routes reject unauthenticated and spoofed-account purchase attempts', { skip: !enabled }, async () => {
  assert.equal((await invoke('session', null, { platform: 'ios', action: 'purchase', userId: 'victim' })).status, 401);
  const who = await account('identity');
  const response = await invoke('session', who.token, { platform: 'android', action: 'catalog', userId: 'victim', plan: 'league' });
  assert.equal(response.status, 200); const body = await response.json();
  assert.equal(body.userId, who.uid); assert.equal(body.apiKey, 'goog_test');
  assert.equal(body.productIds.length, 5); assert.ok(body.productIds.every(id => id.includes(':')));
  assert.deepEqual(body.productIds.filter(id => id.endsWith(':annual')), ['pro.thesquad.team.annual:annual']);
  assert.equal((await db.doc('users/victim').get()).exists, false);
});
test('purchase sync allocates only owned squads and cannot grant from client payloads', { skip: !enabled }, async () => {
  const who = await account('buyer'), foreign = await account('foreign');
  assert.equal((await invoke('sync', who.token, { plan: 'league', active: true })).status, 200);
  assert.equal((await db.doc('users/' + who.uid).get()).data().team_limit ?? 0, 0);
  subscribers.set(who.uid, subscriber());
  assert.equal((await invoke('sync', who.token, { teamId: 'team_' + foreign.uid })).status, 503);
  assert.equal((await db.doc('teams/team_' + foreign.uid).get()).data().isPro, false);
  assert.equal((await invoke('sync', who.token, { teamId: 'team_' + who.uid })).status, 200);
  assert.equal((await db.doc('teams/team_' + who.uid).get()).data().isPro, true);
  assert.equal((await db.doc('users/' + who.uid).get()).data().team_limit, 8);
  assert.equal((await invoke('session', who.token, { platform: 'ios', action: 'purchase' })).status, 409);
});
test('provider outages do not revoke access and webhook retries reconcile latest provider state', { skip: !enabled }, async () => {
  const who = await account('webhook'); subscribers.set(who.uid, subscriber());
  const event = { event: { type: 'INITIAL_PURCHASE', app_user_id: who.uid } };
  assert.equal((await invoke('webhook', 'wrong-secret', event)).status, 401);
  assert.equal((await invoke('webhook', authHeader, event)).status, 200);
  assert.equal((await db.doc('teams/team_' + who.uid).get()).data().isPro, true);
  providerStatus = 503;
  try { assert.equal((await invoke('webhook', authHeader, event)).status, 503); } finally { providerStatus = 200; }
  assert.equal((await db.doc('teams/team_' + who.uid).get()).data().isPro, true);
  subscribers.set(who.uid, subscriber(false));
  // Old purchase payload is deliberately replayed after the subscription ended.
  assert.equal((await invoke('webhook', authHeader, event)).status, 200);
  assert.equal((await db.doc('teams/team_' + who.uid).get()).data().isPro, false);
  assert.equal((await invoke('webhook', authHeader, event)).status, 200);
  assert.equal((await invoke('webhook', authHeader, { event: { type: 'EXPIRATION', app_user_id: 'deleted-user' } })).status, 200);
  assert.equal((await db.doc('users/deleted-user').get()).exists, false);
});
test('web and pending checkout subscribers cannot start a second subscription in the app', { skip: !enabled }, async () => {
  for (const [label, profile] of [['web', { stripe_subscription_id: 'sub_active', subscription_status: 'active', plan_type: 'team', team_limit: 1 }], ['pending', { pendingCheckout: { sessionId: 'cs_open' } }]]) {
    const who = await account(label, profile);
    assert.equal((await invoke('session', who.token, { platform: 'ios', action: 'purchase' })).status, 409);
  }
});
test('sandbox access is restricted to explicitly allowlisted QA accounts', { skip: !enabled }, async () => {
  const who = await account('sandbox'); subscribers.set(who.uid, subscriber(true, { is_sandbox: true }));
  process.env.NATIVE_BILLING_ALLOW_SANDBOX = 'true';
  assert.equal((await (await invoke('sync', who.token, {})).json()).active, false);
  process.env.NATIVE_BILLING_TEST_USER_IDS = who.uid;
  assert.equal((await (await invoke('sync', who.token, {})).json()).active, true);
  delete process.env.NATIVE_BILLING_ALLOW_SANDBOX; delete process.env.NATIVE_BILLING_TEST_USER_IDS;
});
test('Firestore denies forged store entitlements at creation and update', { skip: !enabled }, async () => {
  const fields = ['native_subscription', 'native_subscription_synced_at', 'stripe_seat_grant', 'billing_provider'];
  for (const field of fields) {
    const uid = 'forged_' + field;
    const db = rules.authenticatedContext(uid, { email_verified: true }).firestore();
    await assertFails(setDoc(doc(db, 'users/' + uid), { role: 'coach', [field]: 'forged' }));
  }
  const who = await account('rules');
  const client = rules.authenticatedContext(who.uid, { email_verified: true }).firestore();
  for (const field of fields) await assertFails(updateDoc(doc(client, 'users/' + who.uid), { [field]: 'forged' }));
});
test('browsing a catalog with no store purchase preserves existing beta access', { skip: !enabled }, async () => {
  const who = await account('beta', { isBetaTester: true, plan_type: 'team', team_limit: 1, subscription_status: 'active' });
  assert.equal((await invoke('session', who.token, { platform: 'ios', action: 'catalog' })).status, 200);
  const saved = (await db.doc('users/' + who.uid).get()).data();
  assert.equal(saved.plan_type, 'team'); assert.equal(saved.team_limit, 1);
});


test('pre-release sandbox access is limited to the authenticated allowlisted account', { skip: !enabled }, async () => {
  const tester = await account('allowlisted-tester'), other = await account('non-tester');
  const saved = Object.fromEntries(['NATIVE_BILLING_ENABLED','NATIVE_BILLING_ALLOW_SANDBOX','NATIVE_BILLING_TEST_USER_IDS'].map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, { NATIVE_BILLING_ENABLED: 'false', NATIVE_BILLING_ALLOW_SANDBOX: 'true', NATIVE_BILLING_TEST_USER_IDS: tester.uid });
    assert.equal((await invoke('session', tester.token, { platform: 'android', action: 'catalog' })).status, 200);
    assert.equal((await invoke('session', other.token, { platform: 'android', action: 'catalog', userId: tester.uid })).status, 503);
    assert.equal((await invoke('sync', other.token, {})).status, 503);
    process.env.NATIVE_BILLING_ALLOW_SANDBOX = 'false';
    assert.equal((await invoke('session', tester.token, { platform: 'android', action: 'catalog' })).status, 503);
  } finally {
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
