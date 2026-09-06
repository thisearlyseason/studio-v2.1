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
