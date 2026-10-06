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
import { createAccountDeletionActions } from '../src/lib/server-account-deletion.ts';

const enabled = process.env.APPLE_DELETION_EMULATOR_TEST === '1';
const origin = 'https://apple-deletion.example.test';
let app, db, auth, runtime, deletionRoute, teamRoute, leagueRoute, nativeFetch, bundleDir, revoked = 0, providerFails = false;
const fixtures = [];
before(async () => {
  if (!enabled) return;
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8187');
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9197');
  Object.assign(process.env, { NEXT_PUBLIC_APP_DISTRIBUTION: 'store', NATIVE_AUTH_ENABLED: 'true', NATIVE_AUTH_ALLOWED_PROVIDERS: 'apple.com', NATIVE_AUTH_STORE_ORIGIN: origin, GCLOUD_PROJECT: 'demo-native-auth-test', NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG: JSON.stringify({ projectId: 'demo-native-auth-test', apiKey: 'emulator-key' }) });
  delete process.env.FIREBASE_WEBAPP_CONFIG;
  app = initializeApp({ projectId: 'demo-native-auth-test' }); db = getFirestore(app); auth = getAuth(app);
  // Match Next's bundled CJS interop for the existing firebase-admin namespace.
  // Running that source directly as ESM makes admin.auth/apps undefined.
  await mkdir('output', { recursive: true });
  bundleDir = await mkdtemp(resolve('output/apple-deletion-emulator-'));
  await build({ entryPoints: { runtime: 'src/lib/apple-deletion/runtime.ts', route: 'src/app/api/account/deletion-request/route.ts', team: 'src/app/api/teams/create/route.ts', league: 'src/app/api/leagues/lifecycle/route.ts' }, bundle: true, platform: 'node', format: 'cjs', packages: 'external', outdir: bundleDir, outExtension: { '.js': '.cjs' }, logLevel: 'silent' });
  const require = createRequire(import.meta.url);
  ({ appleDeletionRequest: runtime } = require(bundleDir + '/runtime.cjs'));
  ({ POST: deletionRoute } = require(bundleDir + '/route.cjs'));
  ({ POST: teamRoute } = require(bundleDir + '/team.cjs'));
  ({ POST: leagueRoute } = require(bundleDir + '/league.cjs'));
  nativeFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://identitytoolkit.googleapis.com/v2/accounts:revokeToken')) {
      revoked++; const body = JSON.parse(init.body);
      assert.equal(body.providerId, 'apple.com'); assert.equal(body.token, 'disposable-code');
      return new Response('{}', { status: providerFails ? 400 : 200 });
    }
    return nativeFetch(url, init);
  };
});
after(async () => {
  if (!enabled) return;
  globalThis.fetch = nativeFetch;
  for (const uid of fixtures) { await auth.deleteUser(uid); await db.doc('users/' + uid).delete(); await db.doc('accountDeletionRequests/' + uid).delete(); }
  // The explicitly isolated demo emulator is discarded by emulators:exec.
  await deleteApp(app);
  await rm(bundleDir, { recursive: true, force: true });
});
async function account(label, apple = true) {
  const email = label + '@apple-deletion.test';
  const endpoint = apple ? 'signInWithIdp' : 'signUp';
  const body = apple ? { requestUri: origin, postBody: new URLSearchParams({ providerId: 'apple.com', id_token: JSON.stringify({ sub: label, email, email_verified: true }) }).toString(), returnSecureToken: true } : { email, password: 'Emulator-only-not-a-real-secret123!', returnSecureToken: true };
  const r = await nativeFetch(`http://127.0.0.1:9197/identitytoolkit.googleapis.com/v1/accounts:${endpoint}?key=emulator-key`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(r.status, 200); const value = await r.json(); fixtures.push(value.localId);
  await auth.updateUser(value.localId, { emailVerified: true });
  await db.doc('users/' + value.localId).set({ role: 'adult_player', fullName: label, email });
  if (!apple) {
    const login = await nativeFetch('http://127.0.0.1:9197/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-key', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { uid: value.localId, token: (await login.json()).idToken };
  }
  return { uid: value.localId, token: value.idToken };
}
const req = (action, body, token) => new Request(`${origin}/api/account/apple-deletion/${action}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body) });
const prepare = who => runtime('prepare', req('prepare', {}, who.token));
const complete = (handle, who) => runtime('complete', req('complete', { handle, credential: 'disposable-code', credentialType: 'CODE' }, who.token));

test('real Auth/Firestore routes bind native deletion, deny bypass/foreign UID and schedule only after revocation', { skip: !enabled }, async () => {
  const a = await account('native-owner-a'), b = await account('native-owner-b');
  const bypass = await deletionRoute(new NextRequest(origin + '/api/account/deletion-request', { method: 'POST', headers: { Authorization: 'Bearer ' + a.token } }));
  assert.equal(bypass.status, 409); assert.equal((await bypass.json()).code, 'apple_confirmation_required');
  const intent = await prepare(a); assert.equal(intent.status, 200); const { handle } = await intent.json();
  const foreign = await complete(handle, b); assert.equal(foreign.status, 401); assert.equal(revoked, 0);
  // Hold the provider request so the second completion deterministically sees
  // an in-flight claim rather than a valid already-completed receipt.
  const providerFetch = globalThis.fetch;
  let entered, release;
  const arrived = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://identitytoolkit.googleapis.com/v2/accounts:revokeToken')) {
      entered(); await gate;
    }
    return providerFetch(url, init);
  };
  const first = complete(handle, a);
  let second;
  try {
    await arrived;
    second = await complete(handle, a);
    assert.equal(second.status, 409);
  } finally { release(); globalThis.fetch = providerFetch; }
  const outcomes = [await first, second];
  assert.equal(outcomes.filter(r => r.status === 200).length, 1); assert.equal(revoked, 1);
  assert.equal((await auth.getUser(a.uid)).disabled, true); assert.equal((await auth.getUser(b.uid)).disabled, false);
  const deletion = (await db.doc('accountDeletionRequests/' + a.uid).get()).data();
  assert.equal(deletion.status, 'pending'); assert.equal(deletion.purgeAt.toMillis() - deletion.requestedAt.toMillis(), 7 * 86400000);
  assert.equal((await db.doc('accountDeletionRequests/' + b.uid).get()).exists, false);
  // Admin SDK deliberately forces disabled/revoked checks in emulator mode,
  // even for verifyIdToken(token, false). Unlike production, it cannot model
  // signature-only receipt recovery once the account is already disabled.
  // The completed receipt's idempotent reply is covered by service tests;
  // do not substitute decoded tokens or weaken runtime checks to fake it here.
  assert.equal((await complete(handle, a)).status, 401);
  assert.equal((await complete(handle, b)).status, 401); assert.equal(revoked, 1);
});
test('actual pending profile recovers with fresh Apple authentication after a transient Auth-disable failure', { skip: !enabled }, async () => {
  const a = await account('native-recovery'), prepared = await prepare(a);
  assert.equal(prepared.status, 200); const { handle } = await prepared.json();
  // Auth revocation timestamps have one-second resolution. Ensure this token
  // predates the revocation instead of depending on the wall-clock boundary.
  await new Promise(resolve => setTimeout(resolve, 1100));
  const originalUpdate = auth.updateUser.bind(auth), beforeCount = revoked;
  auth.updateUser = async (uid, input) => { if (uid === a.uid && input.disabled) throw Error('injected-disable-failure'); return originalUpdate(uid, input); };
  try { assert.equal((await complete(handle, a)).status, 503); }
  finally { auth.updateUser = originalUpdate; }
  assert.equal((await db.doc('users/' + a.uid).get()).data().deletionStatus, 'pending');
  assert.equal((await auth.getUser(a.uid)).disabled, false);
  const deadline = (await db.doc('accountDeletionRequests/' + a.uid).get()).data().purgeAt.toMillis();
  // The emulator enforces revocation even with checkRevoked=false. Confirm
  // the stale credential is denied, then authenticate the same Apple identity
  // again without resetting the pending profile or durable deletion receipt.
  assert.equal((await complete(handle, a)).status, 401);
  await new Promise(resolve => setTimeout(resolve, 1100));
  const login = await nativeFetch('http://127.0.0.1:9197/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=emulator-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestUri: origin, postBody: new URLSearchParams({ providerId: 'apple.com', id_token: JSON.stringify({ sub: 'native-recovery', email: 'native-recovery@apple-deletion.test', email_verified: true }) }).toString(), returnSecureToken: true }),
  });
  assert.equal(login.status, 200);
  const credential = await login.json();
  assert.equal(credential.localId, a.uid);
  a.token = credential.idToken;
  assert.equal((await complete(handle, a)).status, 200);
  assert.equal((await db.doc('accountDeletionRequests/' + a.uid).get()).data().purgeAt.toMillis(), deadline);
  assert.equal((await auth.getUser(a.uid)).disabled, true); assert.equal(revoked - beforeCount, 1);
});
test('real route revocation failure leaves account enabled and unscheduled', { skip: !enabled }, async () => {
  const a = await account('native-failure'); providerFails = true;
  const prepared = await prepare(a); assert.equal(prepared.status, 200);
  const { handle } = await prepared.json();
  assert.equal((await complete(handle, a)).status, 503);
  assert.equal((await auth.getUser(a.uid)).disabled, false);
  assert.equal((await db.doc('accountDeletionRequests/' + a.uid).get()).exists, false);
  providerFails = false;
});
test('normal web and non-Apple store deletion preserve the existing lifecycle', { skip: !enabled }, async () => {
  for (const distribution of ['web', 'store']) {
    const a = await account('password-' + distribution, false); process.env.NEXT_PUBLIC_APP_DISTRIBUTION = distribution;
    const response = await deletionRoute(new NextRequest(origin + '/api/account/deletion-request', { method: 'POST', headers: { Authorization: 'Bearer ' + a.token } }));
    assert.equal(response.status, 200); assert.equal((await auth.getUser(a.uid)).disabled, true);
  }
  process.env.NEXT_PUBLIC_APP_DISTRIBUTION = 'store';
});

for (const kind of ['team', 'league']) {
  const collection = kind === 'team' ? 'teams' : 'leagues';
  const ownerField = kind === 'team' ? 'ownerUserId' : 'creatorId';
  const create = who => {
    const body = kind === 'team'
      ? { name: 'Disposable race squad', type: 'adult', position: 'Coach' }
      : { action: 'create', requestId: `race-create-${who.uid}`, name: 'Disposable race league', sport: 'Soccer' };
    return (kind === 'team' ? teamRoute : leagueRoute)(new NextRequest(origin + '/api/' + kind, {
      method: 'POST', headers: { Authorization: 'Bearer ' + who.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
  };
  test(`real transactions: ${kind} created after eligibility prevents deletion from committing`, { skip: !enabled }, async () => {
    const who = await account(kind + '-creation-first', false);
    await db.doc('users/' + who.uid).update({ role: 'league_creator' });
    const actions = createAccountDeletionActions(db, auth);
    await actions.eligible(who.uid);
    const response = await create(who);
    assert.equal(response.status, 201, await response.text());
    await assert.rejects(actions.schedule(who.uid), error => error.status === 409);
    assert.equal((await auth.getUser(who.uid)).disabled, false);
    assert.equal((await db.doc('accountDeletionRequests/' + who.uid).get()).exists, false);
    assert.equal((await db.collection(collection).where(ownerField, '==', who.uid).get()).size, 1);
  });
  test(`real transactions: deletion wins while authenticated ${kind} creation is in flight`, { skip: !enabled }, async () => {
    const who = await account(kind + '-deletion-first', false);
    await db.doc('users/' + who.uid).update({ role: 'league_creator' });
    const original = db.runTransaction.bind(db);
    let release, reached, count = 0, timeout;
    const gate = new Promise(resolve => { release = resolve; });
    const arrived = new Promise(resolve => { reached = resolve; });
    // Hold at the mutation boundary AFTER real token validation and, for
    // leagues, after the separate preflight authority transaction.
    db.runTransaction = async (...args) => {
      if (++count === (kind === 'team' ? 1 : 2)) { reached(); await gate; }
      return original(...args);
    };
    const creating = create(who);
    try {
      await Promise.race([arrived, new Promise((_, reject) => { timeout = setTimeout(() => reject(Error('Mutation boundary not reached')), 10_000); })]);
      await createAccountDeletionActions(db, auth).schedule(who.uid);
      release();
      const response = await creating;
      assert.ok([403, 409].includes(response.status), await response.text());
      assert.equal((await db.collection(collection).where(ownerField, '==', who.uid).get()).empty, true);
      assert.equal((await db.doc('users/' + who.uid).get()).data().deletionStatus, 'pending');
      assert.equal((await auth.getUser(who.uid)).disabled, true);
    } finally { clearTimeout(timeout); release(); db.runTransaction = original; await creating; }
  });
  test(`real transactions: simultaneous ${kind} creation and deletion cannot both succeed`, { skip: !enabled }, async () => {
    const who = await account(kind + '-simultaneous', false);
    await db.doc('users/' + who.uid).update({ role: 'league_creator' });
    const [creation, deletion] = await Promise.allSettled([create(who), createAccountDeletionActions(db, auth).schedule(who.uid)]);
    assert.equal(creation.status, 'fulfilled');
    const created = creation.value.status === 201, deleted = deletion.status === 'fulfilled';
    assert.notEqual(created, deleted, 'Exactly one operation may commit');
    assert.equal((await db.collection(collection).where(ownerField, '==', who.uid).get()).empty, !created);
    assert.equal((await auth.getUser(who.uid)).disabled, deleted);
  });
}
