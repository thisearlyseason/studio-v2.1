import assert from 'node:assert/strict';
import test from 'node:test';
import { createAppleDeletionHandler, revokeAppleCredential } from '../src/lib/apple-deletion/http.ts';

const origin = 'https://qa.example.com', handle = Buffer.alloc(32, 9).toString('base64url');
const request = (action, body, headers = {}) => new Request(`${origin}/api/account/apple-deletion/${action}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Authorization: 'Bearer firebase-token', ...headers }, body: JSON.stringify(body) });
test('handler validates origin, bearer and payload before the deletion service', async () => {
  let calls = 0;
  const handler = createAppleDeletionHandler({ origin, limit: async () => {}, service: { prepare: async () => { calls++; return { handle }; } } });
  assert.equal((await handler('prepare', request('prepare', {}))).status, 200);
  for (const r of [request('prepare', {}, { Origin: 'https://attacker.example' }), request('prepare', { uid: 'victim' }), request('prepare', {}, { Authorization: '' })]) assert.notEqual((await handler('prepare', r)).status, 200);
  assert.equal(calls, 1);
});
test('native challenge needs only the opaque handle, and complete passes credentials solely to server service', async () => {
  const handler = createAppleDeletionHandler({ origin, limit: async () => {}, service: {
    challenge: async value => { assert.equal(value, handle); return { uid: 'u', appleSubject: 'a' }; },
    complete: async (...args) => { assert.deepEqual(args, [handle, 'firebase-token', 'apple-code', 'CODE']); return { purgeAt: '2027-01-22T08:00:00.000Z' }; },
  } });
  const challenge = request('challenge', { handle }); challenge.headers.delete('Origin'); challenge.headers.delete('Authorization');
  assert.deepEqual(await (await handler('challenge', challenge)).json(), { uid: 'u', appleSubject: 'a' });
  const response = await handler('complete', request('complete', { handle, credential: 'apple-code', credentialType: 'CODE' }));
  assert.equal(response.status, 200); assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.text()).includes('apple-code'), false);
});
test('revocation uses only the pinned Firebase endpoint and scrubs provider failures', async () => {
  let sent;
  await revokeAppleCredential('project-api-key', 'id-token', 'apple-code', 'CODE', async (url, init) => { sent = { url, ...init }; return new Response('{}', { status: 200 }); });
  assert.equal(sent.url, 'https://identitytoolkit.googleapis.com/v2/accounts:revokeToken?key=project-api-key');
  assert.equal(sent.redirect, 'error');
  assert.deepEqual(JSON.parse(sent.body), { providerId: 'apple.com', tokenType: 'CODE', token: 'apple-code', idToken: 'id-token' });
  await assert.rejects(revokeAppleCredential('key', 'id', 'code', 'CODE', async () => new Response('private-provider-data', { status: 400 })), /^Error: revocation_failed$/);
});
