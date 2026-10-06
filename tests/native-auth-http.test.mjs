import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNativeAuthHandlers } from '../src/lib/native-auth/http.ts';
import { NativeAuthError } from '../src/lib/native-auth/protocol.ts';
const secret = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const origin = 'https://store.example.test';
const body = { version: 1, provider: 'google.com', webChallenge: secret, nativeChallenge: secret };
const redeem = { version: 1, handle: secret, webVerifier: secret };
function setup(config = { origin, providers: ['google.com'] }) {
  const calls = [];
  const deps = {
    config, async publicLimit(request, action) { calls.push(`limit:${action}`); },
    service: {
      async start(input) { assert.deepEqual(input, body); calls.push('start'); return { handle: secret, expiresAt: 1800000300000 }; },
      async complete(input, token) { assert.equal(token, 'fake-native-token'); calls.push('complete'); return { needsOnboarding: false }; },
      async redeem(input) { assert.deepEqual(input, redeem); calls.push('redeem'); return { uid: 'qa-coach', customToken: 'fake-custom-token', returnPath: null }; },
    },
  };
  return { deps, calls, handlers: createNativeAuthHandlers(deps) };
}
const request = (action, payload, headers = {}, url = origin) => new Request(`${url}/api/native-auth/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof payload === 'string' ? payload : JSON.stringify(payload) });

test('disabled or web mode rejects before body, credentials, and service use', async () => {
  const f = setup(null);
  const res = await f.handlers.start(request('start', body));
  assert.equal(res.status, 404); assert.deepEqual(f.calls, []);
});

test('native start/complete allow absent Origin but never foreign Origin', async () => {
  const f = setup();
  assert.equal((await f.handlers.start(request('start', body))).status, 200);
  assert.equal((await f.handlers.complete(request('complete', { version: 1, handle: secret, nativeSecret: secret }, { Authorization: 'Bearer fake-native-token' }))).status, 200);
  const g = setup();
  for (const Origin of ['https://evil.test', 'null', origin + '.evil.test', origin + '/login']) assert.equal((await g.handlers.start(request('start', body, { Origin }))).status, 403);
  assert.deepEqual(g.calls, []);
});

test('redemption requires exact Origin and configured request destination', async () => {
  const f = setup();
  for (const headers of [{}, { Origin: 'null' }, { Origin: 'https://evil.test' }]) assert.equal((await f.handlers.redeem(request('redeem', redeem, headers))).status, 403);
  assert.equal((await f.handlers.redeem(request('redeem', redeem, { Origin: origin }, 'https://wrong.test'))).status, 403);
  assert.deepEqual(f.calls, []);
  const res = await f.handlers.redeem(request('redeem', redeem, { Origin: origin }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).uid, 'qa-coach');
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), null);
});

test('malformed/oversized payloads, disabled providers and missing native authorization fail', async () => {
  const f = setup();
  for (const payload of ['not json', [], { ...body, uid: 'victim' }, { ...body, provider: 'apple.com' }]) assert.equal((await f.handlers.start(request('start', payload))).status, 400);
  assert.equal((await f.handlers.start(request('start', 'A'.repeat(4097)))).status, 413);
  assert.equal((await f.handlers.complete(request('complete', { version: 1, handle: secret, nativeSecret: secret }))).status, 401);
  assert.equal((await f.handlers.complete(request('complete', { version: 1, handle: secret, nativeSecret: secret }, { Authorization: 'Bearer ' + 'A'.repeat(8193) }))).status, 401);
  assert.equal((await f.handlers.start(request('start', body, { 'Content-Type': 'text/plain' }))).status, 415);
  assert.equal((await f.handlers.start(new Request(origin + '/api/native-auth/start'))).status, 405);
  assert.equal(f.calls.includes('start'), false);
});

test('rate-limit and dependency failures are closed and secret-free', async () => {
  const f = setup(); f.deps.publicLimit = async () => { throw new NativeAuthError('rate_limited'); };
  assert.equal((await f.handlers.start(request('start', body))).status, 429);
  assert.equal(f.calls.includes('start'), false);
  f.deps.publicLimit = async () => { throw new Error('SENSITIVE dependency data'); };
  const res = await f.handlers.start(request('start', body));
  assert.equal(res.status, 503);
  assert.equal((await res.text()).includes('SENSITIVE'), false);
});

test('service failures map to stable status without credential details', async () => {
  for (const [code, status] of [['invalid_attempt', 409], ['invalid_identity', 401], ['account_unavailable', 403], ['onboarding_required', 409], ['unavailable', 503]]) {
    const f = setup(); f.deps.service.redeem = async () => { throw new NativeAuthError(code); };
    const res = await f.handlers.redeem(request('redeem', redeem, { Origin: origin }));
    assert.equal(res.status, status);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
  }
});
