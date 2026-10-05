import assert from 'node:assert/strict';
import test from 'node:test';
import { createAttemptService } from '../src/lib/native-auth/attempt-service.ts';
import { randomSecret, hashSecret } from '../src/lib/native-auth/server-crypto.ts';
import { NativeAuthError } from '../src/lib/native-auth/protocol.ts';
import { memoryAttemptStore } from './helpers/native-auth-memory-store.mjs';

function fixture(allowedProviders) {
  let time = 1800000000000, minted = 0, verified = 0;
  const now = () => time;
  const store = memoryAttemptStore(now), web = randomSecret(), native = randomSecret();
  const user = { uid: 'existing-coach', disabled: false, emailVerified: true, tokensValidAfterTime: new Date(time - 60000).toISOString() };
  const identity = {
    async verify(token) { verified++; assert.equal(token, 'native-test-token'); return { uid: user.uid, provider: 'google.com', authTime: time / 1000, emailVerified: true }; },
    async checkActive(uid) { assert.equal(uid, user.uid); return { user, hasProfile: true }; },
    async mint(uid) { assert.equal(uid, user.uid); minted++; return 'custom-test-token'; },
  };
  const service = createAttemptService({ now, random: randomSecret, store, identity, allowedProviders });
  const begin = () => service.start({ version: 1, provider: 'google.com', webChallenge: hashSecret(web), nativeChallenge: hashSecret(native) });
  const complete = handle => service.complete({ version: 1, handle, nativeSecret: native }, 'native-test-token');
  const redeem = handle => service.redeem({ version: 1, handle, webVerifier: web });
  return { service, store, identity, user, begin, complete, redeem, web, native, get minted() { return minted; }, get verified() { return verified; }, advance(ms) { time += ms; } };
}

test('a verified account gets exactly one handoff under concurrent redemption', async () => {
  const f = fixture(), { handle } = await f.begin();
  assert.deepEqual(await f.complete(handle), { needsOnboarding: false });
  const results = await Promise.allSettled([f.redeem(handle), f.redeem(handle)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.deepEqual(results.find(r => r.status === 'fulfilled').value, { customToken: 'custom-test-token', uid: 'existing-coach', returnPath: null });
  assert.equal(f.minted, 1);
  assert.equal(f.store.records.get(handle).state, 'consumed');
  assert.equal('webChallenge' in f.store.records.get(handle), false);
});

test('disabling a provider also denies its pending and ready handoffs', async () => {
  for (const stage of ['pending', 'ready']) {
    const providers = ['google.com'], f = fixture(providers), { handle } = await f.begin();
    if (stage === 'ready') await f.complete(handle);
    providers.splice(0);
    await assert.rejects(stage === 'ready' ? f.redeem(handle) : f.complete(handle), { code: 'invalid_attempt' });
    assert.equal(f.minted, 0);
  }
});

test('wrong native secret never invokes identity verification or marks ready', async () => {
  const f = fixture(), { handle } = await f.begin();
  await assert.rejects(f.service.complete({ version: 1, handle, nativeSecret: randomSecret() }, 'native-test-token'), { code: 'invalid_attempt' });
  assert.equal(f.verified, 0);
  assert.equal(f.store.records.get(handle).state, 'pending');
});

test('wrong web verifier cannot consume or mint', async () => {
  const f = fixture(), { handle } = await f.begin(); await f.complete(handle);
  await assert.rejects(f.service.redeem({ version: 1, handle, webVerifier: randomSecret() }), { code: 'invalid_attempt' });
  assert.equal(f.minted, 0);
  assert.equal(f.store.records.get(handle).state, 'ready');
});

for (const change of [{ provider: 'apple.com' }, { provider: 'custom' }, { provider: 'anonymous' }, { emailVerified: false }, { authTime: 1799999939 }, { authTime: 1800000061 }, { uid: '' }]) {
  test(`completion refuses invalid identity ${JSON.stringify(change)}`, async () => {
    const f = fixture(), { handle } = await f.begin();
    const original = f.identity.verify;
    f.identity.verify = async token => ({ ...await original(token), ...change });
    await assert.rejects(f.complete(handle), { code: 'invalid_identity' });
    assert.equal(f.minted, 0);
    assert.equal(f.store.records.get(handle).state, 'pending');
  });
}

test('expiry is enforced at five minutes, including a slow verifier', async () => {
  const f = fixture(), { handle } = await f.begin();
  f.advance(300000);
  await assert.rejects(f.complete(handle), { code: 'invalid_attempt' });
  const g = fixture(), started = await g.begin();
  const original = g.identity.checkActive;
  g.identity.checkActive = async uid => { g.advance(300000); return original(uid); };
  await assert.rejects(g.complete(started.handle), { code: 'invalid_attempt' });
});

test('duplicate completion, missing handle, and pending redemption fail closed', async () => {
  const f = fixture(), { handle } = await f.begin();
  await assert.rejects(f.redeem(handle), { code: 'invalid_attempt' });
  await assert.rejects(f.complete(randomSecret()), { code: 'invalid_attempt' });
  await f.complete(handle);
  await assert.rejects(f.complete(handle), { code: 'invalid_attempt' });
});

test('mint failure leaves the consumed attempt unusable', async () => {
  const f = fixture(), { handle } = await f.begin(); await f.complete(handle);
  f.identity.mint = async () => { throw new Error('SENSITIVE_PROVIDER_DIAGNOSTIC'); };
  await assert.rejects(f.redeem(handle), error => error.code === 'unavailable' && !String(error).includes('SENSITIVE'));
  await assert.rejects(f.redeem(handle), { code: 'invalid_attempt' });
});

test('disabled or newly revoked accounts cannot redeem a completed attempt', async () => {
  for (const change of [{ disabled: true }, { emailVerified: false }, { tokensValidAfterTime: new Date(1800000001000).toISOString() }]) {
    const f = fixture(), { handle } = await f.begin(); await f.complete(handle);
    Object.assign(f.user, change);
    await assert.rejects(f.redeem(handle), { code: 'account_unavailable' });
    assert.equal(f.minted, 0);
  }
});

test('account access and completion limiter reject before readiness is stored', async () => {
  const f = fixture(), { handle } = await f.begin();
  f.identity.checkActive = async () => { throw new NativeAuthError('account_unavailable'); };
  await assert.rejects(f.complete(handle), { code: 'account_unavailable' });
  assert.equal(f.store.records.get(handle).state, 'pending');
});

test('attempt storage contains hashes but never raw secrets or native credentials', async () => {
  const f = fixture(), { handle } = await f.begin(); await f.complete(handle);
  const stored = JSON.stringify(f.store.records.get(handle));
  for (const raw of [f.native, f.web, 'native-test-token', 'custom-test-token']) assert.equal(stored.includes(raw), false);
});
