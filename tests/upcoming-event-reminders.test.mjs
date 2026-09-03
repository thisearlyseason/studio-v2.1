import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  buildUpcomingEventMessage,
  candidateDateKeys,
  formatClockTime,
  normalizeEventKind,
  shouldSendSameDayReminder,
} from '../functions/src/event-reminders.ts';

test('same-day reminder copy includes event type, friendly time, and location', () => {
  const event = {
    eventType: 'game',
    startTime: '18:30',
    location: 'North Community Arena',
  };
  assert.equal(formatClockTime(event.startTime), '6:30 PM');
  assert.equal(normalizeEventKind(event), 'game');
  assert.equal(
    buildUpcomingEventMessage(event),
    'You have an upcoming game at 6:30 PM, North Community Arena.'
  );
});

test('event kind supports common schedule labels and safe fallbacks', () => {
  assert.equal(normalizeEventKind({ eventType: 'League Match' }), 'game');
  assert.equal(normalizeEventKind({ title: 'Training Session' }), 'practice');
  assert.equal(
    buildUpcomingEventMessage({ eventType: 'other', startTime: '9:00 am' }),
    'You have an upcoming event at 9:00 AM, a location to be confirmed.'
  );
});

test('reminders are limited to future events on the local calendar day', () => {
  const now = new Date('2026-07-24T14:00:00.000Z'); // 08:00 in Edmonton
  const event = { date: '2026-07-24', startTime: '10:30', eventType: 'game' };
  assert.equal(shouldSendSameDayReminder(event, now, 'America/Edmonton'), true);
  assert.equal(
    shouldSendSameDayReminder({ ...event, startTime: '07:30' }, now, 'America/Edmonton'),
    false
  );
  assert.equal(
    shouldSendSameDayReminder({ ...event, date: '2026-07-25' }, now, 'America/Edmonton'),
    false
  );
  assert.equal(
    shouldSendSameDayReminder({ ...event, status: 'cancelled' }, now, 'America/Edmonton'),
    false
  );
});

test('scheduler searches the UTC boundary dates needed for local-time filtering', () => {
  assert.deepEqual(candidateDateKeys(new Date('2026-07-24T12:00:00.000Z')), [
    '2026-07-23',
    '2026-07-24',
    '2026-07-25',
  ]);
});

test('notification controls are enforced by the UI, API, rules, and scheduler', () => {
  const settings = fs.readFileSync(new URL('../src/app/(dashboard)/settings/page.tsx', import.meta.url), 'utf8');
  const notifyRoute = fs.readFileSync(new URL('../src/app/api/notify/route.ts', import.meta.url), 'utf8');
  const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const scheduler = fs.readFileSync(new URL('../functions/src/index.ts', import.meta.url), 'utf8');

  assert.match(settings, /Game-Day Reminders/);
  assert.match(settings, /upcomingEventNotificationsEnabled/);
  assert.match(notifyRoute, /notificationsEnabled === false/);
  assert.match(rules, /upcomingEventNotificationsEnabled/);
  assert.match(scheduler, /eventReminderDeliveries/);
  assert.match(scheduler, /user\.upcomingEventNotificationsEnabled === false/);
});

test('push opt-in is branded, explicit, and registers the device through a protected route', () => {
  const settings = fs.readFileSync(new URL('../src/app/(dashboard)/settings/page.tsx', import.meta.url), 'utf8');
  const provider = fs.readFileSync(new URL('../src/firebase/provider.tsx', import.meta.url), 'utf8');
  const client = fs.readFileSync(new URL('../src/lib/fcm-client.ts', import.meta.url), 'utf8');
  const deviceRoute = fs.readFileSync(new URL('../src/app/api/notifications/device/route.ts', import.meta.url), 'utf8');
  const serviceWorker = fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
  const signup = fs.readFileSync(new URL('../src/app/signup/page.tsx', import.meta.url), 'utf8');

  assert.match(settings, /The Squad wants to send you notifications/);
  assert.match(settings, /Allow Notifications/);
  assert.match(settings, /await initFCM\(user\.id\)/);
  assert.doesNotMatch(provider, /initFCM/);
  assert.match(client, /\/api\/notifications\/device/);
  assert.match(client, /serviceWorkerUrl\(\)/);
  assert.doesNotMatch(client, /updateDoc\(doc\(db, 'users'/);
  assert.match(deviceRoute, /verifyFirebaseToken/);
  assert.match(deviceRoute, /assertNonAnonymous/);
  assert.match(deviceRoute, /MAX_DEVICES_PER_ACCOUNT = 10/);
  assert.match(deviceRoute, /notificationDeviceTokens/);
  assert.match(serviceWorker, /searchParams\.get\('firebaseConfig'\)/);
  assert.match(signup, /notificationsEnabled: false/);
});

test('protected device registration supports FCM and web push subscriptions', () => {
  const deviceRoute = fs.readFileSync(new URL('../src/app/api/notifications/device/route.ts', import.meta.url), 'utf8');
  assert.match(deviceRoute, /normalizeWebPushSubscription/);
  assert.match(deviceRoute, /notificationWebPushSubscriptions/);
  assert.match(deviceRoute, /webPushSubscriptions/);
  assert.match(deviceRoute, /assertNonAnonymous/);
  assert.match(deviceRoute, /MAX_DEVICES_PER_ACCOUNT = 10/);
});
