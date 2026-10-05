import assert from 'node:assert/strict';
import test from 'node:test';
import { communicationDb, communicationRequest, loadCommunicationRoute } from './helpers/communication-route-harness.mjs';

const teams = ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((name, index) => ({ id: `t${index + 1}`, name }));
const game = (id, team1Id, team2Id, score1, score2) => ({
  id, team1Id, team2Id,
  team1: teams.find(team => team.id === team1Id).name,
  team2: teams.find(team => team.id === team2Id).name,
  score1, score2, date: '2026-09-10', time: '10:00 AM', location: 'Field 1', resourceId: 'field_1',
  isCompleted: true, isDisputed: false, phase: 'preliminary', round: 'Preliminary', stage: 'Preliminary',
});

const tieredPlayoffs = {
  schemaVersion: 1,
  preliminary: { gamesPerTeam: 2, gameDurationMinutes: 60, transitionMinutes: 15, minimumRestMinutes: 60, maximumGamesPerTeamPerDay: 3, schedulingMethod: 'automatic' },
  standings: { pointsEnabled: true, points: { win: 2, tie: 1, loss: 0 }, rankingRules: ['wins', 'differential', 'points_for'], finalResolution: 'manual', maximumDifferentialPerGame: 7 },
  divisions: { sizing: 'custom', definitions: [{ id: 'a', name: 'A Division', size: 2 }, { id: 'b', name: 'B Division', size: 2 }], avoidPreliminaryRematches: false },
  seeding: { status: 'pending', calculated: [], approved: [], standingsFingerprint: null, lockedAt: null, lockedBy: null },
  playoffs: { bracketFormat: 'single_elimination', status: 'pending', publishedAt: null, publishedBy: null },
};

const seed = {
  'teams/team-a': { ownerUserId: 'owner', planId: 'elite', isPro: true },
  'teams/team-a/members/staff': { userId: 'staff', position: 'Coach', status: 'active' },
  'teams/team-a/members/player': { userId: 'player', position: 'Player', status: 'active' },
  'teams/team-b': { ownerUserId: 'other', planId: 'elite', isPro: true },
  'teams/team-a/events/cup': {
    teamId: 'team-a', isTournament: true, tournamentType: 'tiered_playoffs', isArchived: false,
    lifecycleVersion: 1, scheduleVersion: 1, tournamentTeamsData: teams,
    dailyWindows: [{ date: '2026-09-11', startTime: '08:00', endTime: '18:00' }],
    tournamentGames: [game('g1', 't1', 't2', 4, 0), game('g2', 't2', 't3', 3, 0), game('g3', 't3', 't4', 2, 0), game('g4', 't4', 't1', 1, 0)],
    tieredPlayoffs,
  },
};

const command = (action, expectedVersion, payload = {}, requestId = `tiered-${action}-0001`) => ({
  action, requestId, teamId: 'team-a', eventId: 'cup', expectedVersion, expectedScheduleVersion: 1, payload,
});

function divisionlessSeed(gameChanges = {}) {
  const value = structuredClone(seed);
  value['teams/team-a/events/cup'].tieredPlayoffs.divisions = {
    sizing: 'automatic', definitions: [], avoidPreliminaryRematches: false,
  };
  value['teams/team-a/events/cup'].tournamentGames = value['teams/team-a/events/cup'].tournamentGames
    .map(item => ({ ...item, ...gameChanges }));
  return value;
}

async function call(db, body, uid = 'owner') {
  const app = await loadCommunicationRoute('../../src/app/api/tournaments/tiered-playoffs/route.ts', db, { uid });
  try {
    const response = await app.route.POST(communicationRequest(body));
    return { status: response.status, body: await response.json() };
  } finally { app.dispose(); }
}

test('organizer previews, locks, generates, and publishes independent Tiered brackets transactionally', async () => {
  const { db, records } = communicationDb(seed, { serializeTransactions: true });
  const preview = await call(db, command('preview-seeding', 1));
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.deepEqual(preview.body.approved.map(row => row.teamId), ['t1', 't2', 't3', 't4']);
  assert.equal(records.get('teams/team-a/events/cup').tieredPlayoffs.seeding.status, 'review');

  assert.equal((await call(db, command('lock-seeding', 2))).status, 200);
  assert.equal(records.get('teams/team-a/events/cup').tieredPlayoffs.seeding.status, 'locked');
  assert.equal((await call(db, command('generate-brackets', 3))).status, 200);
  const generated = records.get('teams/team-a/events/cup');
  assert.equal(generated.tournamentGames.filter(item => item.phase === 'playoff').length, 2);
  assert.equal(generated.tournamentGames.filter(item => item.phase === 'playoff').every(item => item.date === '2026-09-11' && item.time && item.resourceId), true);
  assert.deepEqual([...new Set(generated.tournamentGames.filter(item => item.phase === 'playoff').map(item => item.playoffDivisionId))].sort(), ['a', 'b']);
  assert.equal((await call(db, command('publish-playoffs', 4))).status, 200);
  assert.equal(records.get('teams/team-a/events/cup').tieredPlayoffs.playoffs.status, 'published');
});

test('organizer configures playoff divisions only after every preliminary result is complete', async () => {
  const { db, records } = communicationDb(divisionlessSeed(), { serializeTransactions: true });
  const result = await call(db, command('configure-divisions', 1, {
    sizing: 'automatic', divisionNames: ['Championship', 'Consolation'], avoidPreliminaryRematches: true,
  }));
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const stored = records.get('teams/team-a/events/cup').tieredPlayoffs;
  assert.deepEqual(stored.divisions.definitions, [
    { id: 'tier_1', name: 'Championship', size: 2 },
    { id: 'tier_2', name: 'Consolation', size: 2 },
  ]);
  assert.equal(stored.divisions.avoidPreliminaryRematches, true);
  assert.equal(stored.seeding.status, 'pending');
});

test('division configuration is blocked before preliminary completion and rejects incomplete custom sizing', async () => {
  const incomplete = communicationDb(divisionlessSeed({ isCompleted: false }));
  assert.equal((await call(incomplete.db, command('configure-divisions', 1, {
    sizing: 'automatic', divisionNames: ['A', 'B'], avoidPreliminaryRematches: false,
  }))).status, 409);

  const invalid = communicationDb(divisionlessSeed());
  assert.equal((await call(invalid.db, command('configure-divisions', 1, {
    sizing: 'custom', divisionNames: ['A', 'B'], divisionSizes: [2, 1], avoidPreliminaryRematches: false,
  }))).status, 400);
});

test('Tiered commands are replay safe and reject non-organizers, cross-tenant IDs, and stale versions', async () => {
  const { db, records } = communicationDb(seed, { serializeTransactions: true });
  const body = command('preview-seeding', 1);
  const first = await call(db, body);
  const after = structuredClone([...records]);
  assert.deepEqual(await call(db, body), first);
  assert.deepEqual([...records], after);
  assert.equal((await call(db, command('lock-seeding', 1, {}, 'tiered-lock-stale-1'))).status, 409);
  assert.equal((await call(db, command('preview-seeding', 1, {}, 'tiered-player-0001'), 'player')).status, 403);
  assert.equal((await call(db, { ...command('preview-seeding', 1, {}, 'tiered-foreign-0001'), teamId: 'team-b' }, 'owner')).status, 403);
});

test('missing or disputed preliminary results block seeding without partial state', async () => {
  for (const change of [{ isCompleted: false }, { isDisputed: true }]) {
    const recordsSeed = structuredClone(seed);
    recordsSeed['teams/team-a/events/cup'].tournamentGames[0] = { ...recordsSeed['teams/team-a/events/cup'].tournamentGames[0], ...change };
    const { db, records } = communicationDb(recordsSeed);
    const before = structuredClone([...records]);
    assert.equal((await call(db, command('preview-seeding', 1))).status, 409);
    assert.deepEqual([...records], before);
  }
});

test('pre-seeding withdrawal preserves history, excludes the team, and recalculates a valid field', async () => {
  const { db, records } = communicationDb(seed, { serializeTransactions: true });
  const removed = await call(db, command('withdraw-team', 1, { teamId: 't1', reason: 'Unable to attend' }));
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  const stored = records.get('teams/team-a/events/cup');
  assert.equal(stored.tournamentTeamsData.find(team => team.id === 't1').tieredStatus, 'withdrawn');
  assert.equal(stored.tournamentGames.length, 4, 'historical preliminary games must remain');
  assert.equal(stored.tieredPlayoffs.divisions.definitions.reduce((sum, division) => sum + division.size, 0), 3);
  const preview = await call(db, command('preview-seeding', 2, {}, 'tiered-preview-after-withdrawal'));
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.approved.some(row => row.teamId === 't1'), false);
});

test('pre-division withdrawal preserves the divisionless phase and lets organizers configure the remaining field', async () => {
  const { db, records } = communicationDb(divisionlessSeed(), { serializeTransactions: true });
  const removed = await call(db, command('withdraw-team', 1, { teamId: 't1', reason: 'Unable to attend' }));
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  const stored = records.get('teams/team-a/events/cup');
  assert.equal(stored.tournamentTeamsData.find(team => team.id === 't1').tieredStatus, 'withdrawn');
  assert.deepEqual(stored.tieredPlayoffs.divisions.definitions, []);
  assert.equal(stored.tournamentGames.length, 4, 'historical preliminary games must remain');

  const configured = await call(db, command('configure-divisions', 2, {
    sizing: 'automatic', divisionNames: ['Championship'], avoidPreliminaryRematches: true,
  }, 'tiered-configure-after-withdrawal'));
  assert.equal(configured.status, 200, JSON.stringify(configured.body));
  assert.deepEqual(records.get('teams/team-a/events/cup').tieredPlayoffs.divisions.definitions, [
    { id: 'tier_1', name: 'Championship', size: 3 },
  ]);
});

test('post-generation disqualification forfeits only playable matches without deleting bracket history', async () => {
  const { db, records } = communicationDb(seed, { serializeTransactions: true });
  assert.equal((await call(db, command('preview-seeding', 1))).status, 200);
  assert.equal((await call(db, command('lock-seeding', 2))).status, 200);
  assert.equal((await call(db, command('generate-brackets', 3))).status, 200);
  const before = records.get('teams/team-a/events/cup').tournamentGames.map(game => game.id);
  const response = await call(db, command('disqualify-team', 4, { teamId: 't1', reason: 'Eligibility ruling' }));
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const stored = records.get('teams/team-a/events/cup');
  assert.deepEqual(stored.tournamentGames.map(game => game.id), before);
  assert.equal(stored.tournamentTeamsData.find(team => team.id === 't1').tieredStatus, 'disqualified');
  const affected = stored.tournamentGames.find(game => game.phase === 'playoff' && (game.team1Id === 't1' || game.team2Id === 't1'));
  assert.equal(affected.isCompleted, true);
  assert.notEqual(affected.winnerId, 't1');
});

test('stale locked placement can be explicitly reopened only before playoff results exist', async () => {
  for (const playoffCompleted of [false, true]) {
    const { db, records } = communicationDb(seed, { serializeTransactions: true });
    assert.equal((await call(db, command('preview-seeding', 1))).status, 200);
    assert.equal((await call(db, command('lock-seeding', 2))).status, 200);
    assert.equal((await call(db, command('generate-brackets', 3))).status, 200);
    const event = records.get('teams/team-a/events/cup');
    event.tieredPlayoffs.seeding.status = 'stale';
    if (playoffCompleted) event.tournamentGames.find(game => game.phase === 'playoff').isCompleted = true;
    const before = structuredClone([...records]);
    const response = await call(db, command('reopen-seeding', 4, {}, `tiered-reopen-${playoffCompleted}`));
    assert.equal(response.status, playoffCompleted ? 409 : 200);
    if (playoffCompleted) assert.deepEqual([...records], before);
    else {
      const stored = records.get('teams/team-a/events/cup');
      assert.equal(stored.tieredPlayoffs.seeding.status, 'pending');
      assert.equal(stored.tournamentGames.some(game => game.phase === 'playoff'), false);
    }
  }
});
