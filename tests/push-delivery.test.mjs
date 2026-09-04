import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('web push alerts request a high-priority Android wake-up', async () => {
  const delivery = await import('../src/lib/server-notification-delivery.ts');

  assert.deepEqual(delivery.webPushDeliveryOptions(), {
    TTL: 3_600,
    urgency: 'high',
  });
});

test('team chat sends only to other channel members', async () => {
  const chat = await source('../src/app/api/teams/chat/message/route.ts');
  const sender = await source('../src/lib/server-notification-delivery.ts');
  assert.match(chat, /memberId !== auth\.uid/);
  assert.doesNotMatch(chat, /void Promise\.all/);
  assert.match(chat, /notificationResult = await sendNotificationToUsers/);
  assert.match(chat, /notification: notificationResult/);
  assert.match(sender, /sendEachForMulticast/);
  assert.match(sender, /webpush\.sendNotification/);
  assert.match(sender, /TTL:\s*3_600/);
  assert.match(sender, /app-icon-192-v4\.png/);
});

test('device API can atomically retire all legacy FCM registrations for the signed-in user', async () => {
  const deviceRoute = await source('../src/app/api/notifications/device/route.ts');
  assert.match(deviceRoute, /clearLegacyFcmRegistrations/);
  assert.match(deviceRoute, /notificationDeviceTokens/);
  assert.match(deviceRoute, /fcmTokens:\s*\[\]/);
});

test('notify route keeps authorization before shared delivery', async () => {
  const notify = await source('../src/app/api/notify/route.ts');
  assert.match(notify, /getTeamAuthority/);
  assert.match(notify, /findActiveTeamMember/);
  assert.match(notify, /sendNotificationToUsers/);
});
