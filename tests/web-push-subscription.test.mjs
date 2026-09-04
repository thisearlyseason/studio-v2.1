import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  normalizeWebPushSubscription,
  webPushSubscriptionId,
} from '../src/lib/web-push-subscription.ts';

const valid = {
  endpoint: 'https://push.example.test/subscription/abc',
  keys: { p256dh: 'a'.repeat(87), auth: 'b'.repeat(22) },
};

test('normalizes a bounded HTTPS web push subscription', () => {
  assert.deepEqual(normalizeWebPushSubscription(valid), valid);
  assert.match(webPushSubscriptionId(valid), /^[a-f0-9]{64}$/);
});

test('rejects a non-HTTPS or incomplete web push subscription', () => {
  assert.equal(
    normalizeWebPushSubscription({ ...valid, endpoint: 'http://push.example.test/x' }),
    null
  );
  assert.equal(
    normalizeWebPushSubscription({ endpoint: valid.endpoint, keys: { auth: valid.keys.auth } }),
    null
  );
});

test('browser notification registration migrates legacy FCM to standards Web Push', async () => {
  const client = await readFile(
    new URL('../src/lib/client-push-registration.ts', import.meta.url),
    'utf8',
  );
  const provider = await readFile(
    new URL('../src/components/providers/team-provider.tsx', import.meta.url),
    'utf8',
  );

  assert.doesNotMatch(client, /initFCM/);
  assert.match(client, /clearLegacyFcmRegistrations/);
  assert.match(client, /pushManager\.subscribe/);
  assert.match(client, /applicationServerKey: vapidPublicKey/);
  assert.match(provider, /registerPushDevice\(userProfile\.id\)/);
  assert.match(provider, /userProfile\?\.notificationsEnabled/);
});
