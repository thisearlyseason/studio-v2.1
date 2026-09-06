import assert from 'node:assert/strict';
import test from 'node:test';

import { runUpcomingEventReminderCore } from '../functions/src/event-reminder-runner.ts';

test('scheduler core records a durable sent ledger through its injected safe transport', async () => {
  const writes = [];
  const result = await runUpcomingEventReminderCore({
    now: new Date('2026-07-24T14:00:00.000Z'),
    listEvents: async () => [{ teamId: 'team-a', eventId: 'event-a', event: { date: '2026-07-24', startTime: '10:30', eventType: 'game', location: 'Arena' } }],
    getTeam: async () => ({ timeZone: 'America/Edmonton' }),
    listMembers: async () => [{ userId: 'player-a', status: 'active' }],
    getUser: async () => ({ role: 'adult_player', notificationsEnabled: true, upcomingEventNotificationsEnabled: true, fcmTokens: ['safe-fcm'] }),
    claim: async () => true,
    markSent: async entry => writes.push(['sent', entry]),
    markFailed: async entry => writes.push(['failed', entry]),
    deliver: async () => ({ successCount: 1, failureCount: 0 }),
  });
  assert.equal(result.sentCount, 1);
  assert.deepEqual(writes, [['sent', { teamId: 'team-a', eventId: 'event-a', userId: 'player-a', successCount: 1, failureCount: 0 }]]);
});

test('scheduler core records a durable failure and permits its next invocation to retry', async () => {
  const failures = [];
  let attempts = 0;
  const adapter = {
    now: new Date('2026-07-24T14:00:00.000Z'),
    listEvents: async () => [{ teamId: 'team-a', eventId: 'event-a', event: { date: '2026-07-24', startTime: '10:30' } }],
    getTeam: async () => ({ timeZone: 'America/Edmonton' }),
    listMembers: async () => [{ userId: 'player-a', status: 'active' }],
    getUser: async () => ({ role: 'adult_player', notificationsEnabled: true, upcomingEventNotificationsEnabled: true, webPushSubscriptions: [{ endpoint: 'https://push.example.test/safe', keys: { p256dh: 'key', auth: 'key' } }] }),
    claim: async () => true,
    markSent: async () => assert.fail('must not mark sent'),
    markFailed: async entry => failures.push(entry),
    deliver: async () => { attempts += 1; throw new Error('safe injected failure'); },
  };
  const result = await runUpcomingEventReminderCore(adapter);
  assert.equal(result.sentCount, 0);
  assert.equal(attempts, 1);
  assert.deepEqual(failures, [{ teamId: 'team-a', eventId: 'event-a', userId: 'player-a', diagnostic: 'safe injected failure' }]);
});

test('scheduler core selects FCM and Web Push once, excludes ineligible members, and retries only failed ledger work', async () => {
  const ledger = new Map();
  const deliveries = [];
  let retryFails = true;
  const now = new Date('2026-03-08T15:00:00.000Z'); // 09:00 after Edmonton DST change
  const adapter = {
    now,
    listEvents: async () => [
      { teamId: 'team-a', eventId: 'eligible', event: { date: '2026-03-08', startTime: '11:00', eventType: 'game' } },
      { teamId: 'team-a', eventId: 'retry', event: { date: '2026-03-08', startTime: '11:30', eventType: 'practice' } },
      { teamId: 'team-a', eventId: 'invalid', event: { date: '2026-03-08', startTime: '25:00' } },
    ],
    getTeam: async () => ({ timeZone: 'America/Edmonton' }),
    listMembers: async () => [
      { userId: 'eligible', status: 'active' }, { userId: 'pref-off', status: 'active' },
      { userId: 'removed', status: 'removed' }, { userId: 'coach', status: 'active' },
    ],
    getUser: async userId => ({
      eligible: { role: 'adult_player', notificationsEnabled: true, upcomingEventNotificationsEnabled: true, fcmTokens: ['safe-fcm'], webPushSubscriptions: [{ endpoint: 'https://push.example.test/safe', keys: { p256dh: 'p', auth: 'a' } }] },
      'pref-off': { role: 'adult_player', notificationsEnabled: true, upcomingEventNotificationsEnabled: false, fcmTokens: ['never-used'] },
      removed: { role: 'adult_player', notificationsEnabled: true, upcomingEventNotificationsEnabled: true, fcmTokens: ['never-used'] },
      coach: { role: 'coach', notificationsEnabled: true, upcomingEventNotificationsEnabled: true, fcmTokens: ['never-used'] },
    }[userId]),
    claim: async entry => {
      const key = `${entry.eventId}/${entry.userId}`;
      if (ledger.get(key)?.status === 'sent') return false;
      ledger.set(key, { status: 'processing' });
      return true;
    },
    markSent: async entry => ledger.set(`${entry.eventId}/${entry.userId}`, { status: 'sent', ...entry }),
    markFailed: async entry => ledger.set(`${entry.eventId}/${entry.userId}`, { status: 'failed', ...entry }),
    deliver: async input => {
      deliveries.push(input);
      if (input.entry.eventId === 'retry' && retryFails) {
        retryFails = false;
        throw new Error('safe retry failure');
      }
      return { successCount: 1, failureCount: 0 };
    },
  };
  const first = await runUpcomingEventReminderCore(adapter);
  const second = await runUpcomingEventReminderCore(adapter);
  assert.deepEqual(first, { sentCount: 1, failedCount: 1, claimedCount: 2 });
  assert.deepEqual(second, { sentCount: 1, failedCount: 0, claimedCount: 1 });
  assert.equal(ledger.get('eligible/eligible').status, 'sent');
  assert.equal(ledger.get('retry/eligible').status, 'sent');
  assert.equal(deliveries[0].targets.fcmTokens.length, 1);
  assert.equal(deliveries[0].targets.webPushSubscriptions.length, 1);
  assert.equal(deliveries.some(delivery => delivery.entry.userId !== 'eligible'), false);
});
