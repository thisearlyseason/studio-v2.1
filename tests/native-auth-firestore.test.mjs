import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createFirestoreAttemptStore } from '../src/lib/native-auth/firestore-attempt-store.ts';
import { createAttemptService } from '../src/lib/native-auth/attempt-service.ts';
import { randomSecret, hashSecret } from '../src/lib/native-auth/server-crypto.ts';

// npm test does not implicitly connect to providers. This suite runs explicitly.
const enabled = process.env.NATIVE_AUTH_EMULATOR_TEST === '1';
if (enabled && process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8187') throw new Error('Requires the isolated local native-auth emulator');
let app, db;
before(() => { if (enabled) { app = initializeApp({ projectId: 'demo-native-auth-test' }, 'native-auth-tests'); db = getFirestore(app); } });
after(async () => { if (app) await deleteApp(app); });
beforeEach(async () => {
  if (!enabled) return;
  const response = await fetch('http://127.0.0.1:8187/emulator/v1/projects/demo-native-auth-test/databases/(default)/documents', { method: 'DELETE' });
  assert.equal(response.ok, true);
});
function setup() {
  let time = Date.now(), minted = 0;
  const now = () => time, store = createFirestoreAttemptStore(db, now);
  const user = { uid: 'qa-coach', disabled: false, emailVerified: true, email: 'coach@native.test', tokensValidAfterTime: new Date(time - 60000).toISOString() };
  const identity = {
    async verify() { return { uid: user.uid, provider: 'google.com', authTime: Math.floor(time / 1000), emailVerified: true }; },
    async checkActive() { return { user, hasProfile: (await db.doc(`users/${user.uid}`).get()).exists }; },
    async mint(uid) { minted++; return `test-token-for-${uid}`; },
  };
  const service = createAttemptService({ now, random: randomSecret, store, identity });
  const web = randomSecret(), native = randomSecret();
  const begin = () => service.start({ version: 1, provider: 'google.com', webChallenge: hashSecret(web), nativeChallenge: hashSecret(native) });
  const complete = handle => service.complete({ version: 1, handle, nativeSecret: native }, 'native-test-token');
  const redeem = (handle, onboarding) => service.redeem({ version: 1, handle, webVerifier: web, ...(onboarding ? { onboarding } : {}) });
  return { service, store, identity, user, begin, complete, redeem, get minted() { return minted; }, advance(ms) { time += ms; } };
}

test('real Firestore transaction permits only one concurrent redemption and preserves profile', { skip: !enabled }, async () => {
  const profile = { role: 'coach', fullName: 'Original Coach', plan_type: 'pro', subscription_status: 'active' };
  await db.doc('users/qa-coach').set(profile);
  const f = setup(), { handle } = await f.begin(); await f.complete(handle);
  const results = await Promise.allSettled(Array.from({ length: 6 }, () => f.redeem(handle)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.minted, 1);
  assert.deepEqual((await db.doc('users/qa-coach').get()).data(), profile);
  const record = (await db.doc(`nativeAuthAttempts/${handle}`).get()).data();
  assert.equal(record.state, 'consumed');
  assert.equal('nativeChallenge' in record, false);
  assert.equal('webChallenge' in record, false);
  assert.equal(record.expireAt.toMillis(), record.expiresAt);
});

test('transaction rejects a profile suspended after native verification', { skip: !enabled }, async () => {
  await db.doc('users/qa-coach').set({ role: 'coach' });
  const f = setup(), { handle } = await f.begin(); await f.complete(handle);
  await db.doc('users/qa-coach').update({ accountStatus: 'suspended' });
  await assert.rejects(f.redeem(handle), { code: 'account_unavailable' });
  assert.equal(f.minted, 0);
});

test('profileless identity cannot obtain a web credential without onboarding', { skip: !enabled }, async () => {
  const f = setup(), { handle } = await f.begin();
  assert.deepEqual(await f.complete(handle), { needsOnboarding: true });
  await assert.rejects(f.redeem(handle), { code: 'onboarding_required' });
  assert.equal(f.minted, 0);
  assert.equal((await db.doc('users/qa-coach').get()).exists, false);
});

test('real store cannot overwrite a ready attempt with another completion', { skip: !enabled }, async () => {
  await db.doc('users/qa-coach').set({ role: 'coach' });
  const f = setup(), { handle } = await f.begin();
  const completions = await Promise.allSettled([f.complete(handle), f.complete(handle)]);
  assert.equal(completions.filter(r => r.status === 'fulfilled').length, 1);
  f.advance(300000);
  await assert.rejects(f.redeem(handle), { code: 'invalid_attempt' });
});

test('new free profile and consumption are atomic and cannot be overwritten by a second attempt', { skip: !enabled }, async () => {
  const f = setup(), first = await f.begin(), second = await f.begin();
  await f.complete(first.handle); await f.complete(second.handle);
  const form = { fullName: 'New Athlete', role: 'adult_player', adultConfirmed: true, termsAccepted: true, joinCode: ' demo_c ' };
  const result = await f.redeem(first.handle, form);
  assert.equal(result.uid, 'qa-coach');
  assert.equal(result.returnPath, '/teams/join?code=DEMO_C');
  const original = (await db.doc('users/qa-coach').get()).data();
  assert.equal(original.role, 'adult_player');
  assert.equal(original.notificationsEnabled, false);
  assert.equal((await db.doc('players/p_qa-coach').get()).data().userId, 'qa-coach');
  await f.redeem(second.handle, { ...form, role: 'coach', fullName: 'Overwrite' });
  assert.deepEqual((await db.doc('users/qa-coach').get()).data(), original);
  await assert.rejects(f.redeem(first.handle, form), { code: 'invalid_attempt' });
});

test('existing player documents are never overwritten by native onboarding', { skip: !enabled }, async () => {
  await db.doc('players/p_qa-coach').set({ userId: 'someone-else', guardianIds: ['existing-parent'] });
  const f = setup(), { handle } = await f.begin(); await f.complete(handle);
  await assert.rejects(f.redeem(handle, { fullName: 'New Athlete', role: 'adult_player', adultConfirmed: true, termsAccepted: true, joinCode: '' }), { code: 'account_unavailable' });
  assert.equal((await db.doc('users/qa-coach').get()).exists, false);
  assert.equal((await db.doc(`nativeAuthAttempts/${handle}`).get()).data().state, 'ready');
});
