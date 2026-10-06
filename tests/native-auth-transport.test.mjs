import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nativeBrowserTransport } from '../src/lib/native-auth/transport.ts';
const id = '354db8df-388a-4a87-a239-1fa8ce4d8023';
const begin = { version: 1, type: 'begin', requestId: id, provider: 'google.com', webChallenge: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' };
test('capability absence and unknown providers do not enable native auth', () => {
  assert.equal(nativeBrowserTransport({}), null);
  assert.equal(nativeBrowserTransport({ squadNativeAuthCapabilities: { version: 2, providers: ['google.com'] } }), null);
  assert.equal(nativeBrowserTransport({ squadNativeAuthCapabilities: { version: 1, providers: ['evil'] } }), null);
});
test('iOS sends only typed messages and checks the native reply', async () => {
  const messages = [];
  const transport = nativeBrowserTransport({ squadNativeAuthCapabilities: { version: 1, providers: ['google.com', 'apple.com'] }, webkit: { messageHandlers: { squadNativeAuth: { async postMessage(message) { messages.push(message); return { version: 1, type: 'cancelled', requestId: message.requestId }; } } } } });
  assert.equal((await transport.begin(begin)).type, 'cancelled');
  assert.deepEqual(messages[0], begin);
  transport.dispose();
});
test('Android resolves only the matching request and releases on cancellation', async () => {
  const messages = [], bridge = { postMessage: message => messages.push(JSON.parse(message)) };
  const transport = nativeBrowserTransport({ squadNativeAuthCapabilities: { version: 1, providers: ['google.com'] }, squadNativeAuth: bridge });
  const promise = transport.begin(begin);
  bridge.onmessage({ data: JSON.stringify({ version: 1, type: 'cancelled', requestId: 'f5801d35-1363-4545-9752-748934131339' }) });
  transport.cancel(id);
  assert.equal((await promise).type, 'cancelled');
  assert.deepEqual(messages.map(m => m.type), ['begin', 'cancel']);
  transport.dispose();
});
