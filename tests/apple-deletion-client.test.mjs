import assert from 'node:assert/strict';
import test from 'node:test';
import { requestNativeAppleDeletion } from '../src/lib/apple-deletion/client.ts';
const handle = Buffer.alloc(32, 1).toString('base64url');
const id = '354db8df-388a-4a87-a239-1fa8ce4d8023';
function setup(reply) {
  const messages = [], fetches = [];
  const scope = { squadNativeAuthCapabilities: { version: 1, providers: ['apple.com'], appleDeletion: true }, webkit: { messageHandlers: { squadNativeAuth: { postMessage: async value => { messages.push(value); return { version: 1, requestId: id, ...reply }; } } } } };
  const fetcher = async (...args) => { fetches.push(args); return Response.json({ handle, expiresAt: Date.now() + 300000 }); };
  return { scope, fetcher, messages, fetches };
}
test('browser sends no UID, token or code through the native deletion bridge', async () => {
  const f = setup({ type: 'deleted', purgeAt: '2027-01-22T08:00:00.000Z' });
  assert.deepEqual(await requestNativeAppleDeletion(f.scope, 'private-firebase-token', f.fetcher, () => id), { purgeAt: '2027-01-22T08:00:00.000Z' });
  assert.deepEqual(f.messages, [{ version: 1, type: 'deleteAppleAccount', requestId: id, handle }]);
  assert.equal(f.fetches[0][0], '/api/account/apple-deletion/prepare');
});
test('cancel, mismatch, failed and malformed replies never report deletion success', async () => {
  for (const reply of [{ type: 'cancelled' }, { type: 'failed' }, { type: 'deleted', requestId: 'wrong' }, { type: 'deleted', purgeAt: 'invalid-date' }]) {
    const f = setup(reply);
    await assert.rejects(requestNativeAppleDeletion(f.scope, 'token', f.fetcher, () => id));
    assert.equal(f.fetches.length, 1);
  }
});
test('older app and no Apple capability fail before creating a deletion intent', async () => {
  const f = setup({ type: 'deleted' }); delete f.scope.squadNativeAuthCapabilities.appleDeletion;
  await assert.rejects(requestNativeAppleDeletion(f.scope, 'token', f.fetcher, () => id), /Update/);
  assert.equal(f.fetches.length, 0);
});
