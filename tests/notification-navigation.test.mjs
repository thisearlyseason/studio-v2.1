import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

function worker(existingWindow) {
  const handlers = new Map();
  const destinations = [];
  const notifications = [];
  const clients = {
    matchAll: async () => existingWindow ? [{
      focus: () => {},
      navigate: async url => {
        destinations.push(url);
        return { focus() {} };
      },
    }] : [],
    openWindow: url => destinations.push(url),
  };
  vm.runInNewContext(source, {
    URL, clients,
    self: {
      location: { origin: 'https://www.thesquad.pro' },
      addEventListener: (type, handler) => handlers.set(type, handler),
      registration: { showNotification: async (_title, options) => notifications.push(options) },
    },
  });
  return { handlers, destinations, notifications };
}

const unsafe = [
  '//evil.example/path', '/\\evil.example/path', '/\n/evil.example/path',
  'https://evil.example/path', 'https://www.thesquad.pro:4444/path', 'javascript:alert(1)',
  '/safe/..//evil.example/path', 'https://www.thesquad.pro//evil.example/path',
];

for (const existingWindow of [true, false]) {
  test(`notification clicks stay on the app origin with ${existingWindow ? 'an open' : 'no open'} window`, async () => {
    const { handlers, destinations } = worker(existingWindow);
    for (const url of unsafe) {
      let finished;
      handlers.get('notificationclick')({
        notification: { close() {}, data: { url } },
        waitUntil: promise => { finished = promise; },
      });
      await finished;
      assert.equal(destinations.at(-1), '/dashboard', url);
    }
    let finished;
    handlers.get('notificationclick')({
      notification: { close() {}, data: { url: '/chats/1?teamId=2#latest' } },
      waitUntil: promise => { finished = promise; },
    });
    await finished;
    assert.equal(destinations.at(-1), '/chats/1?teamId=2#latest');
  });
}

test('push payloads store only a same-origin notification destination', async () => {
  const { handlers, notifications } = worker(false);
  for (const url of unsafe) {
    let finished;
    handlers.get('push')({
      data: { json: () => ({ webPush: { title: 'Test', body: 'Test', url } }) },
      waitUntil: promise => { finished = promise; },
    });
    await finished;
    assert.equal(notifications.at(-1).data.url, '/dashboard', url);
  }
});
