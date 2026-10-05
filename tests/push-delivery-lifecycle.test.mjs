import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { communicationDb } from './helpers/communication-route-harness.mjs';
import { webPushSubscriptionId } from '../src/lib/web-push-subscription.ts';

async function loadDelivery(harness) {
  const key = `push_delivery_${Date.now()}_${Math.random()}`;
  globalThis[key] = harness;
  const stubs = {
    'firebase-admin': `export function messaging(){return globalThis[${JSON.stringify(key)}].messaging;}`,
    'web-push': `export function setVapidDetails(...args){globalThis[${JSON.stringify(key)}].vapid=args;} export async function sendNotification(subscription,payload,options){return globalThis[${JSON.stringify(key)}].sendNotification(subscription,payload,options);}`,
    '@/lib/firebase-admin': `export const adminDb=globalThis[${JSON.stringify(key)}].db;`,
    '@/lib/server-outbound-provider-policy': `export function assertOutboundProviderAllowed(kind){globalThis[${JSON.stringify(key)}].providerChecks.push(kind);}`,
  };
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../src/lib/server-notification-delivery.ts', import.meta.url))],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
    plugins: [{
      name: 'push-delivery-boundaries',
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

function withVapid(t) {
  const prior = {
    subject: process.env.WEB_PUSH_VAPID_SUBJECT,
    publicKey: process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY,
    privateKey: process.env.WEB_PUSH_VAPID_PRIVATE_KEY,
  };
  process.env.WEB_PUSH_VAPID_SUBJECT = 'mailto:push@example.test';
  process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY = 'public-test-key';
  process.env.WEB_PUSH_VAPID_PRIVATE_KEY = 'private-test-key';
  t.after(() => {
    for (const [name, value] of Object.entries({
      WEB_PUSH_VAPID_SUBJECT: prior.subject,
      NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY: prior.publicKey,
      WEB_PUSH_VAPID_PRIVATE_KEY: prior.privateKey,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

function pushSubscription(name) {
  return {
    endpoint: `https://push.example.test/subscription/${name}`,
    keys: { p256dh: `p-${name}`.padEnd(87, 'p'), auth: `a-${name}`.padEnd(22, 'a') },
  };
}

for (const staleStatus of [404, 410]) {
  test(`${staleStatus} Web Push response deletes only the stale endpoint and matching ownership record`, async t => {
    withVapid(t);
    const stale = pushSubscription(`stale-${staleStatus}`);
    const healthy = pushSubscription(`healthy-${staleStatus}`);
    const staleId = webPushSubscriptionId(stale);
    const healthyId = webPushSubscriptionId(healthy);
    const { db, records } = communicationDb({
      'users/user-a': { notificationsEnabled: true, webPushSubscriptions: [stale, healthy] },
      [`notificationWebPushSubscriptions/${staleId}`]: { userId: 'user-a' },
      [`notificationWebPushSubscriptions/${healthyId}`]: { userId: 'user-a' },
    });
    const sent = [];
    const harness = {
      db,
      messaging: { sendEachForMulticast: async () => ({ successCount: 0, failureCount: 0 }) },
      providerChecks: [],
      async sendNotification(subscription) {
        sent.push(subscription.endpoint);
        if (subscription.endpoint === stale.endpoint) throw Object.assign(new Error('gone'), { statusCode: staleStatus });
      },
    };
    const loaded = await loadDelivery(harness);
    t.after(loaded.dispose);

    const result = await loaded.module.sendNotificationToUsers({
      recipientUserIds: ['user-a'],
      title: 'Update',
      body: 'Body',
    });

    assert.deepEqual(new Set(sent), new Set([stale.endpoint, healthy.endpoint]));
    assert.equal(result.webPushSuccessCount, 1);
    assert.equal(result.webPushFailureCount, 1);
    assert.deepEqual(records.get('users/user-a').webPushSubscriptions, [healthy]);
    assert.equal(records.has(`notificationWebPushSubscriptions/${staleId}`), false);
    assert.equal(records.get(`notificationWebPushSubscriptions/${healthyId}`).userId, 'user-a');
  });
}

test('delivery deduplicates recipients, fans out to every enrolled device, and honors opt-out', async t => {
  withVapid(t);
  const first = pushSubscription('first');
  const second = pushSubscription('second');
  const disabled = pushSubscription('disabled');
  const { db } = communicationDb({
    'users/user-a': { notificationsEnabled: true, webPushSubscriptions: [first, second] },
    'users/user-disabled': { notificationsEnabled: false, webPushSubscriptions: [disabled] },
  });
  const sent = [];
  const harness = {
    db,
    messaging: { sendEachForMulticast: async () => ({ successCount: 0, failureCount: 0 }) },
    providerChecks: [],
    async sendNotification(subscription, payload, options) {
      sent.push({ subscription, payload: JSON.parse(payload), options });
    },
  };
  const loaded = await loadDelivery(harness);
  t.after(loaded.dispose);

  const result = await loaded.module.sendNotificationToUsers({
    recipientUserIds: ['user-a', 'user-a', 'user-disabled', 'missing-user'],
    title: 'Team update',
    body: 'Practice moved',
    url: '/calendar',
  });

  assert.deepEqual(sent.map(item => item.subscription.endpoint).sort(), [first.endpoint, second.endpoint].sort());
  assert.equal(sent.every(item => item.payload.webPush.url === '/calendar'), true);
  assert.equal(sent.every(item => item.options.urgency === 'high'), true);
  assert.equal(result.webPushSuccessCount, 2);
  assert.equal(result.webPushFailureCount, 0);
  assert.deepEqual(harness.providerChecks, ['notification']);
});
