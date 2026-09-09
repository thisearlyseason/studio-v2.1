import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
function harness({ supported = true, rejects = false, locks = true, lockRejects = false, showRejects = false } = {}) {
  const handlers = new Map(), notifications = new Map(), badges = [], navigations = [];
  const lockQueues = new Map();
  let beforeRead, showAttempts = 0;
  const navigator = supported ? {
    async setAppBadge(count) { badges.push(count); if (rejects) throw Error('OS denied'); },
    async clearAppBadge() { badges.push(0); if (rejects) throw Error('OS denied'); },
  } : {};
  if (locks) navigator.locks = { request(name, operation) {
    if (lockRejects) return Promise.reject(Error('Lock unavailable'));
    const result = (lockQueues.get(name) || Promise.resolve()).then(operation);
    lockQueues.set(name, result.catch(() => {}));
    return result;
  } };
  const registration = {
    async getNotifications() {
      const snapshot = [...notifications.values()];
      const pause = beforeRead; beforeRead = undefined;
      if (pause) await pause();
      return snapshot;
    },
    async showNotification(title, options) {
      showAttempts += 1;
      if (showRejects) throw Error('Notification denied');
      const notification = { title, ...options, close() {
        if (notifications.get(options.tag) === notification) notifications.delete(options.tag);
      } };
      notifications.set(options.tag, notification);
    },
  };
  navigator.serviceWorker = { getRegistration: async () => registration };
  const clients = { matchAll: async () => [], openWindow: async url => navigations.push(url) };
  vm.runInNewContext(source, { URL, clients, console, self: {
    navigator, clients, skipWaiting() {},
    registration,
    addEventListener: (type, fn) => handlers.set(type, fn),
  } });
  async function dispatch(type, fields) {
    let completion;
    assert.ok(handlers.has(type), `${type} handler must exist`);
    handlers.get(type)({ ...fields, waitUntil(promise) { completion = promise; } });
    await completion;
  }
  const push = () => dispatch('push', { data: { json: () => ({ webPush: {
    title: 'Team message', body: 'Synthetic badge test', url: '/chats/qa?teamId=team-a',
  } }) } });
  return { dispatch, push, badges, notifications, navigations, navigator,
    get showAttempts() { return showAttempts; },
    pauseNextRead(callback) { beforeRead = callback; },
  };
}

test('a rejected Web Lock acquisition falls back without dropping push delivery', async () => {
  const h = harness({ lockRejects: true });
  await h.push();
  assert.equal(h.notifications.size, 1);
  assert.equal(h.badges.at(-1), 1);
  assert.equal(h.showAttempts, 1);
});

test('a notification failure inside an acquired lock is never retried as a lock failure', async () => {
  const h = harness({ showRejects: true });
  await assert.rejects(h.push(), /Notification denied/);
  assert.equal(h.showAttempts, 1);
});

for (const locks of [true, false]) {
  test(`a delayed notification click cannot clear a newer push badge (Web Locks: ${locks})`, async () => {
    const h = harness({ locks }); await h.push();
    let release, entered;
    const waiting = new Promise(resolve => { entered = resolve; });
    h.pauseNextRead(() => { entered(); return new Promise(resolve => { release = resolve; }); });
    const click = h.dispatch('notificationclick', { notification: [...h.notifications.values()][0] });
    await waiting;
    const push = h.push();
    await new Promise(resolve => setImmediate(resolve));
    release(); await Promise.all([click, push]);
    assert.equal(h.notifications.size, 1);
    assert.equal(h.badges.at(-1), 1);
  });
}

test('window read cleanup and worker push share the same presentation lock', async t => {
  const { clearDeviceNotifications } = await import('../src/lib/device-notification-presentation.ts');
  const h = harness(); await h.push();
  const oldNavigator = globalThis.navigator, oldWindow = globalThis.window;
  globalThis.window = { location: { origin: 'https://example.test' } };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: h.navigator });
  t.after(() => {
    globalThis.window = oldWindow;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: oldNavigator });
  });
  let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  h.pauseNextRead(() => { entered(); return new Promise(resolve => { release = resolve; }); });
  const clear = clearDeviceNotifications({ chatId: 'qa', teamId: 'team-a' });
  await waiting;
  const push = h.push();
  await new Promise(resolve => setImmediate(resolve));
  release(); await Promise.all([clear, push]);
  assert.equal(h.notifications.size, 1);
  assert.equal(h.badges.at(-1), 1);
});

test('push updates the app badge with outstanding notifications, without inflating replacement deliveries', async () => {
  const h = harness();
  await h.push(); await h.push();
  assert.deepEqual(h.badges, [1, 1]);
  assert.equal(h.notifications.size, 1);
});

test('tapping a notification clears its app badge and still opens the exact chat', async () => {
  const h = harness(); await h.push();
  await h.dispatch('notificationclick', { notification: [...h.notifications.values()][0] });
  assert.equal(h.badges.at(-1), 0);
  assert.deepEqual(h.navigations, ['/chats/qa?teamId=team-a']);
});

test('dismissing the final notification clears the launcher badge', async () => {
  const h = harness(); await h.push();
  const notification = [...h.notifications.values()][0]; notification.close();
  await h.dispatch('notificationclose', { notification });
  assert.equal(h.badges.at(-1), 0);
});

for (const options of [{ supported: false }, { rejects: true }]) {
  test(`unsupported or rejected app badging does not break push or tap-through: ${JSON.stringify(options)}`, async () => {
    const h = harness(options); await h.push();
    assert.equal(h.notifications.size, 1);
    await h.dispatch('notificationclick', { notification: [...h.notifications.values()][0] });
    assert.deepEqual(h.navigations, ['/chats/qa?teamId=team-a']);
  });
}
