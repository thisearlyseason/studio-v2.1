import assert from 'node:assert/strict';
import test from 'node:test';
import { communicationDb, loadCommunicationRoute } from './helpers/communication-route-harness.mjs';

test('legacy schedule delete cannot purge League history or projections', async () => {
  const { db, records } = communicationDb({
    'leagues/league-a': { creatorId: 'owner', memberTeamIds: [], teams: {} },
    'leagues/league-a/registrationEntries/entry': { answers: { email: 'private@example.test' } },
    'leagues/league-a/archived_waivers/waiver': { signed: true },
    'leagues/league-a/scoreAudit/score': { score1: 2 },
    'scheduleBookings/booking': { sourceId: 'league:league-a' },
    'teams/team-a/events/game': { leagueId: 'league-a' },
    'publicLeagueViews/league-a': { name: 'Public' },
  });
  // Emulate the destructive SDK boundaries so the old route really deletes
  // these records, rather than failing because the test double lacks a method.
  db.getAll = (...refs) => Promise.all(refs.map(ref => ref.get()));
  db.recursiveDelete = async ref => {
    for (const path of records.keys()) if (path === ref.path || path.startsWith(`${ref.path}/`)) records.delete(path);
  };
  const before = structuredClone([...records]);
  const app = await loadCommunicationRoute('../../src/app/api/leagues/schedule/route.ts', db, { uid: 'owner' });
  try {
    for (const body of [{ action: 'delete', leagueId: 'league-a' }, { action: 'delete', leagueIds: ['league-a'] }]) {
      const response = await app.route.POST(new Request('http://localhost/api/leagues/schedule', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      }));
      assert.equal(response.status, 410);
      assert.deepEqual([...records], before);
    }
  } finally { app.dispose(); }
});

test('ordinary schedule configure and clear still execute through the existing schedule service', async () => {
  const { db, records } = communicationDb({
    'leagues/league-a': { creatorId: 'owner', schedule: [] },
    'leagues/league-a/registrationEntries/entry': { answers: { email: 'private@example.test' } },
    'leagues/league-a/scoreAudit/score': { score1: 2 },
  });
  const app = await loadCommunicationRoute('../../src/app/api/leagues/schedule/route.ts', db, { uid: 'owner' });
  const post = body => app.route.POST(new Request('http://localhost/api/leagues/schedule', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
  try {
    const configured = await post({ action: 'configure', leagueId: 'league-a', config: {
      startDate: '2026-09-01', endDate: '2026-09-30', startTime: '09:00', endTime: '17:00',
      gameLength: '60', breakLength: '15', gamesPerTeam: '4', playDays: [1], selectedFields: ['field-a'],
    } });
    assert.equal(configured.status, 200);
    assert.equal(records.get('leagues/league-a').schedulerConfig.gameLength, '60');
    assert.equal(records.get('leagues/league-a').scheduleUpdatedBy, 'owner');
    records.set('leagues/league-a', { ...records.get('leagues/league-a'), schedule: [{ id: 'game-a' }] });
    records.set('scheduleBookings/booking', { sourceId: 'league:league-a' });
    records.set('teams/team-a/events/game', { leagueId: 'league-a', sourceId: 'league:league-a' });
    const cleared = await post({ action: 'clear', leagueId: 'league-a', mode: 'clear' });
    assert.equal(cleared.status, 200);
    assert.deepEqual(records.get('leagues/league-a').schedule, []);
    assert.equal(records.has('scheduleBookings/booking'), false);
    assert.equal(records.has('teams/team-a/events/game'), false);
    assert.equal(records.has('leagues/league-a/registrationEntries/entry'), true);
    assert.equal(records.has('leagues/league-a/scoreAudit/score'), true);
    assert.equal(records.has('scheduleBookingLocks/global'), false);
  } finally { app.dispose(); }
});
