import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { parseBegin, parseCancel, parseStart, parseComplete, parseRedeem, parseReply, NativeAuthError } from '../src/lib/native-auth/protocol.ts';
import { readNativeAuthConfig } from '../src/lib/native-auth/config.ts';
import { randomSecret, hashSecret, matchesSecret } from '../src/lib/native-auth/server-crypto.ts';

const secret = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const requestId = '354db8df-388a-4a87-a239-1fa8ce4d8023';
const begin = { version: 1, type: 'begin', requestId, provider: 'google.com', webChallenge: secret };
const start = { version: 1, provider: 'apple.com', webChallenge: secret, nativeChallenge: secret };
const complete = { version: 1, handle: secret, nativeSecret: secret };
const redeem = { version: 1, handle: secret, webVerifier: secret };
const config = {
  NEXT_PUBLIC_APP_DISTRIBUTION: 'store', NATIVE_AUTH_ENABLED: 'true',
  NATIVE_AUTH_STORE_ORIGIN: 'https://STORE.example.test:443/',
  NATIVE_AUTH_ALLOWED_PROVIDERS: 'google.com,apple.com',
};
const invalid = error => error instanceof NativeAuthError && error.code === 'invalid_request' && !error.message.includes(secret);

test('valid native messages preserve their exact meaning', () => {
  assert.deepEqual(parseBegin(begin), begin);
  assert.deepEqual(parseStart(start), start);
  assert.deepEqual(parseComplete(complete), complete);
  assert.deepEqual(parseRedeem(redeem), redeem);
  assert.deepEqual(parseCancel({ version: 1, type: 'cancel', requestId }), { version: 1, type: 'cancel', requestId });
  for (const type of ['cancelled', 'failed']) assert.equal(parseReply({ version: 1, type, requestId }).type, type);
  assert.equal(parseReply({ version: 1, type: 'ready', requestId, handle: secret, needsOnboarding: false }).needsOnboarding, false);
});

for (const [name, parse, value] of [['begin', parseBegin, begin], ['start', parseStart, start], ['complete', parseComplete, complete], ['redeem', parseRedeem, redeem]]) {
  test(`${name} rejects shape/version changes and authority injection`, () => {
    for (const payload of [null, [], 'secret payload', { ...value, version: 2 }, { ...value, uid: 'victim' }, { ...value, role: 'superadmin' }, JSON.parse('{"__proto__":{"polluted":true}}'), Object.assign(Object.create({ inherited: true }), value)]) {
      assert.throws(() => parse(payload), invalid);
    }
  });
}

test('binary credentials must be canonical 32-byte base64url, not decoder aliases', () => {
  for (const raw of ['', 'a', secret + '=', secret.slice(0, -1) + 'B', secret.slice(1), secret + 'A', secret.replace('A', '+'), 'A'.repeat(10000)]) {
    assert.throws(() => parseComplete({ ...complete, nativeSecret: raw }), invalid);
    assert.throws(() => parseStart({ ...start, webChallenge: raw }), invalid);
    assert.throws(() => parseRedeem({ ...redeem, handle: raw }), invalid);
  }
});

test('callbacks and cancellation are bound to a UUID and strict result schema', () => {
  for (const value of [{ ...begin, requestId: '../login' }, { ...begin, provider: 'custom' }]) assert.throws(() => parseBegin(value), invalid);
  assert.throws(() => parseReply({ version: 1, type: 'ready', requestId, handle: secret, needsOnboarding: 'false' }), invalid);
  assert.throws(() => parseCancel({ version: 1, type: 'cancel', requestId, url: 'https://evil.test' }), invalid);
  assert.throws(() => parseReply({ version: 1, type: 'failed', requestId, token: secret }), invalid);
});

test('redeem rejects implicit consent and injected onboarding privileges', () => {
  const profile = { fullName: 'QA Coach', role: 'coach', adultConfirmed: true, termsAccepted: true, joinCode: '' };
  assert.deepEqual(parseRedeem({ ...redeem, onboarding: profile }).onboarding, profile);
  for (const changes of [{ adultConfirmed: false }, { adultConfirmed: 'true' }, { termsAccepted: false }, { role: 'superadmin' }, { isPro: true }]) {
    assert.throws(() => parseRedeem({ ...redeem, onboarding: { ...profile, ...changes } }), invalid);
  }
});

test('explicit store configuration canonicalizes only a valid origin', () => {
  assert.deepEqual(readNativeAuthConfig(config), { origin: 'https://store.example.test', providers: ['google.com', 'apple.com'] });
});

for (const origin of ['', 'http://store.example.test', 'https://localhost', 'https://qa.localhost', 'https://127.0.0.1', 'https://0x7f000001', 'https://[::1]', 'https://user@store.example.test', 'https://store.example.test.', 'https://store.example.test:444', 'https://store.example.test:0443', 'https://store.example.test/login', 'https://store.example.test/../', 'https://store.example.test?', 'https://store.example.test#', 'https://store.example.test\\evil', 'https://store.example.test\n', 'https://stör.example.test', 'https://%73tore.example.test', 'https://-bad.example.test', 'https://a..test']) {
  test(`rejects unsafe configured origin ${JSON.stringify(origin)}`, () => assert.equal(readNativeAuthConfig({ ...config, NATIVE_AUTH_STORE_ORIGIN: origin }), null));
}

test('configuration fails closed without every server-owned requirement', () => {
  for (const key of Object.keys(config)) {
    const copy = { ...config }; delete copy[key];
    assert.equal(readNativeAuthConfig(copy), null, key);
  }
  for (const changes of [{ NEXT_PUBLIC_APP_DISTRIBUTION: 'web' }, { NATIVE_AUTH_ENABLED: '1' }, { NATIVE_AUTH_ENABLED: 'false', NEXT_PUBLIC_NATIVE_AUTH_ENABLED: 'true' }, { NATIVE_AUTH_ALLOWED_PROVIDERS: '*' }, { NATIVE_AUTH_ALLOWED_PROVIDERS: 'google.com,unknown' }, { NATIVE_AUTH_ALLOWED_PROVIDERS: 'google.com,google.com' }]) {
    assert.equal(readNativeAuthConfig({ ...config, ...changes }), null);
  }
});

test('generated secrets are unique, sized correctly, and never match another secret', () => {
  const values = Array.from({ length: 50 }, randomSecret);
  assert.equal(new Set(values).size, 50);
  for (const value of values) assert.match(value, /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/);
  // The digest is independently calculated with the standard crypto primitive.
  assert.equal(hashSecret(secret), createHash('sha256').update(secret, 'ascii').digest('base64url'));
  assert.equal(matchesSecret(secret, hashSecret(secret)), true);
  assert.equal(matchesSecret(values[0], hashSecret(secret)), false);
  assert.equal(matchesSecret(secret, 'bad'), false);
  assert.equal(matchesSecret(secret + '=', hashSecret(secret)), false);
});
