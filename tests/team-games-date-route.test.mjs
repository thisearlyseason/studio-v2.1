import assert from 'node:assert/strict';
import test from 'node:test';
import { communicationDb, loadCommunicationRoute } from './helpers/communication-route-harness.mjs';

const routePath = '../../src/app/api/teams/games/route.ts';
const request = body => new Request('http://localhost/api/teams/games', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ teamId: 'squad', opponent: 'Tigers', myScore: 3, opponentScore: 1, ...body }),
});

for (const [date, expected] of [
  ['2026-10-01', '2026-10-01'],
  ['2028-02-29', '2028-02-29'],
  ['2026-10-01T12:00:00-06:00', '2026-10-01T18:00:00.000Z'],
]) test(`score create and edit retain the date contract for ${date}`, async () => {
  const { db, records } = communicationDb({ 'teams/squad': { ownerUserId: 'coach' } });
  const app = await loadCommunicationRoute(routePath, db, { uid: 'coach' });
  try {
    const created = await app.route.POST(request({ date }));
    assert.equal(created.status, 200);
    const { gameId } = await created.json();
    assert.equal(records.get(`teams/squad/games/${gameId}`).date, expected);
    const edited = await app.route.POST(request({ date, gameId, myScore: 0, opponentScore: 0 }));
    assert.equal(edited.status, 200);
    const persisted = records.get(`teams/squad/games/${gameId}`);
    assert.equal(persisted.date, expected);
    assert.equal(persisted.result, 'Tie');
    assert.equal(persisted.myScore, 0);
    assert.equal(persisted.opponentScore, 0);
  } finally { app.dispose(); }
});

for (const date of ['2026-02-30', '2026/10/01', 'not-a-date', '']) {
  test(`invalid score date ${JSON.stringify(date)} is rejected without a write`, async () => {
    const { db, records } = communicationDb({ 'teams/squad': { ownerUserId: 'coach' } });
    const app = await loadCommunicationRoute(routePath, db, { uid: 'coach' });
    try {
      assert.equal((await app.route.POST(request({ date }))).status, 400);
      assert.deepEqual([...records.keys()], ['teams/squad']);
    } finally { app.dispose(); }
  });
}

test('score date handling does not allow a non-staff user to write scores', async () => {
  const { db, records } = communicationDb({
    'teams/squad': { ownerUserId: 'coach' },
    'teams/squad/members/player': { userId: 'player', position: 'Player', status: 'active' },
  });
  const app = await loadCommunicationRoute(routePath, db, { uid: 'player' });
  try {
    assert.equal((await app.route.POST(request({ date: '2026-10-01' }))).status, 403);
    assert.equal([...records.keys()].some(path => path.includes('/games/')), false);
  } finally { app.dispose(); }
});
