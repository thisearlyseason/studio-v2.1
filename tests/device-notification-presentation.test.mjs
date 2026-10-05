import assert from 'node:assert/strict';
import test from 'node:test';

test('reading one team chat clears only its notification and preserves other pending badges', async t => {
  const presentation = await import('../src/lib/device-notification-presentation.ts').catch(() => ({}));
  assert.equal(typeof presentation.clearDeviceNotifications, 'function');
  const oldNavigator = globalThis.navigator, oldWindow = globalThis.window;
  const closed = [], badges = [];
  const notifications = ['team-a', 'team-b'].map(team => ({
    data: { url: `/chats/shared-id?teamId=${team}` }, close: () => closed.push(team),
  }));
  globalThis.window = { location: { origin: 'https://example.test' } };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    serviceWorker: { getRegistration: async () => ({ getNotifications: async () => notifications }) },
    setAppBadge: async count => badges.push(count), clearAppBadge: async () => badges.push(0),
  } });
  t.after(() => {
    globalThis.window = oldWindow;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: oldNavigator });
  });
  await presentation.clearDeviceNotifications({ chatId: 'shared-id', teamId: 'team-a' });
  assert.deepEqual(closed, ['team-a']); assert.deepEqual(badges, [1]);
  await presentation.clearDeviceNotifications();
  assert.equal(badges.at(-1), 0);
});

test('badge or notification API rejection never prevents logout cleanup from settling', async t => {
  const presentation = await import('../src/lib/device-notification-presentation.ts').catch(() => ({}));
  assert.equal(typeof presentation.clearDeviceNotifications, 'function');
  const oldNavigator = globalThis.navigator, oldWindow = globalThis.window;
  let cleared = false;
  globalThis.window = {};
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    serviceWorker: { getRegistration: async () => { throw Error('Unavailable'); } },
    clearAppBadge: async () => { cleared = true; throw Error('Denied'); },
  } });
  t.after(() => {
    globalThis.window = oldWindow;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: oldNavigator });
  });
  await presentation.clearDeviceNotifications(); assert.equal(cleared, true);
});
