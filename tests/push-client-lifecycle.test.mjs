import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

async function loadPushClient(harness) {
  const key = `push_client_${Date.now()}_${Math.random()}`;
  globalThis[key] = harness;
  const stubs = {
    'firebase/app': `export function getApp(){return {};}`,
    'firebase/auth': `export function getAuth(){return globalThis[${JSON.stringify(key)}].auth;}`,
    '@/lib/service-worker-registration': `export async function registerPrimaryServiceWorker(){globalThis[${JSON.stringify(key)}].workerRegistrations += 1;return globalThis[${JSON.stringify(key)}].registration;}`,
  };
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../src/lib/client-push-registration.ts', import.meta.url))],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
    plugins: [{
      name: 'push-client-boundaries',
      setup(bundler) {
        bundler.onResolve({ filter: /.*/ }, args =>
          Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: 'boundary' } : null
        );
        bundler.onLoad({ filter: /.*/, namespace: 'boundary' }, args => ({
          contents: stubs[args.path],
          loader: 'js',
        }));
      },
    }],
  });
  const loadedModule = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  return { module: loadedModule, dispose: () => delete globalThis[key] };
}

function installBrowserGlobals(t, harness) {
  const prior = {
    window: globalThis.window,
    navigator: globalThis.navigator,
    Notification: globalThis.Notification,
    fetch: globalThis.fetch,
    vapid: process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY,
  };
  const notification = {
    permission: harness.permission,
    async requestPermission() {
      harness.permissionRequests += 1;
      return harness.permission;
    },
  };
  globalThis.Notification = notification;
  globalThis.window = { Notification: notification, PushManager: class PushManager {} };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { serviceWorker: { getRegistration: async () => harness.registration } },
  });
  globalThis.fetch = async (url, init) => {
    harness.calls.push({ url, init: structuredClone(init) });
    return { ok: true };
  };
  process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY = 'AQ';
  t.after(() => {
    globalThis.window = prior.window;
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: prior.navigator });
    globalThis.Notification = prior.Notification;
    globalThis.fetch = prior.fetch;
    if (prior.vapid === undefined) delete process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY;
    else process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY = prior.vapid;
  });
}

test('denied notification permission performs no service-worker or device registration work', async t => {
  const harness = {
    auth: { currentUser: { uid: 'user-a', getIdToken: async () => 'token-a' } },
    calls: [],
    permission: 'denied',
    permissionRequests: 0,
    registration: null,
    workerRegistrations: 0,
  };
  installBrowserGlobals(t, harness);
  const loaded = await loadPushClient(harness);
  t.after(loaded.dispose);

  assert.equal(await loaded.module.registerPushDevice('user-a'), null);
  assert.equal(harness.permissionRequests, 1);
  assert.equal(harness.workerRegistrations, 0);
  assert.deepEqual(harness.calls, []);
});

test('opt-out deletes the authenticated server endpoint before unsubscribing the browser', async t => {
  const order = [];
  const subscription = {
    endpoint: 'https://push.example.test/subscription/a',
    keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) },
    toJSON() { return { endpoint: this.endpoint, keys: this.keys }; },
    async unsubscribe() { order.push('browser-unsubscribe'); return true; },
  };
  const harness = {
    auth: { currentUser: { uid: 'user-a', getIdToken: async () => 'token-a' } },
    calls: [],
    permission: 'granted',
    permissionRequests: 0,
    registration: { pushManager: { getSubscription: async () => subscription } },
    workerRegistrations: 0,
  };
  installBrowserGlobals(t, harness);
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    order.push(body.clearLegacyFcmRegistrations ? 'server-clear-legacy' : 'server-delete-web-push');
    harness.calls.push({ url, init, body });
    return { ok: true };
  };
  const loaded = await loadPushClient(harness);
  t.after(loaded.dispose);

  await loaded.module.deletePushDevice('user-a');

  assert.deepEqual(order, ['server-clear-legacy', 'server-delete-web-push', 'browser-unsubscribe']);
  assert.equal(harness.calls.length, 2);
  assert.equal(harness.calls.every(call => call.init.headers.Authorization === 'Bearer token-a'), true);
  assert.equal(harness.calls[1].init.method, 'DELETE');
  assert.equal(harness.calls[1].body.subscription.endpoint, subscription.endpoint);
});

test('push cleanup refuses to delete User A endpoints after authentication switches to User B', async t => {
  const harness = {
    auth: { currentUser: { uid: 'user-b', getIdToken: async () => 'token-b' } },
    calls: [],
    permission: 'granted',
    permissionRequests: 0,
    registration: { pushManager: { getSubscription: async () => ({
      toJSON: () => ({
        endpoint: 'https://push.example.test/subscription/a',
        keys: { p256dh: 'p'.repeat(87), auth: 'a'.repeat(22) },
      }),
      unsubscribe: async () => true,
    }) } },
    workerRegistrations: 0,
  };
  installBrowserGlobals(t, harness);
  const loaded = await loadPushClient(harness);
  t.after(loaded.dispose);

  await assert.rejects(loaded.module.deletePushDevice('user-a'), /signed-in account is required/i);
  assert.deepEqual(harness.calls, []);
});
