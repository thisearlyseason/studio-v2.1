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
