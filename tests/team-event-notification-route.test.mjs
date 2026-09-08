import assert from 'node:assert/strict';
import test from 'node:test';
import {
  communicationDb,
  communicationRequest,
  loadCommunicationRoute,
} from './helpers/communication-route-harness.mjs';

async function call(db, body) {
  const app = await loadCommunicationRoute(
    '../../src/app/api/teams/events/action/route.ts',
    db,
    { uid: 'owner', role: 'coach' },
  );
  try {
    return await app.route.POST(communicationRequest(body));
  } finally {
    app.dispose();
  }
}

const seed = {
  'teams/team-a': { ownerUserId: 'owner', name: 'Alpha', features: {} },
  'teams/team-a/members/owner': { userId: 'owner', position: 'Coach', status: 'active' },
  'teams/team-a/members/player': { userId: 'player', position: 'Player', status: 'active' },
  'teams/team-a/members/removed': { userId: 'removed', position: 'Player', status: 'removed' },
};

test('committed event creation dispatches one authoritative tactical alert to active recipients', async () => {
  const { db, notifications } = communicationDb(seed);
  const response = await call(db, {
    action: 'create',
    teamId: 'team-a',
    event: {
      title: 'Physical Reminder Test',
      eventType: 'game',
      date: '2026-09-08',
      endDate: '2026-09-08',
      startTime: '18:30',
      location: 'Central Field',
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(notifications, [{
    recipientUserIds: ['player'],
    title: 'New game: Physical Reminder Test',
    body: 'September 8, 2026 at 6:30 PM · Central Field',
    url: '/calendar',
  }]);
});

test('failed event creation never dispatches a tactical alert', async () => {
  const { db, notifications } = communicationDb(seed);
  const response = await call(db, {
    action: 'create',
    teamId: 'team-a',
    event: { title: 'Invalid', date: '2026-09-08', startTime: '' },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(notifications, []);
});

test('demo event creation remains local and never dispatches providers', async () => {
  const { db, notifications } = communicationDb({
    ...seed,
    'teams/team-a': { ...seed['teams/team-a'], isDemo: true },
  });
  const response = await call(db, {
    action: 'create',
    teamId: 'team-a',
    event: {
      title: 'Demo Event', eventType: 'game', date: '2026-09-08',
      startTime: '19:00', location: 'Demo Field',
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(notifications, []);
});
