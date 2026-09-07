import assert from 'node:assert/strict';
import test from 'node:test';
import { generateTournamentSchedule } from '../src/lib/scheduler-utils.ts';
import { canonicalCompetitionRequest } from '../src/lib/server-competition-operation.ts';
import {
  communicationDb,
  communicationRequest,
  loadCommunicationRoute,
} from './helpers/communication-route-harness.mjs';

const baseTeam = { ownerUserId: 'owner', planId: 'elite_squad', isPro: true };
const referee = { id: 'referee-one', name: 'Riley Ref', email: 'riley@example.test', status: 'active' };
const game = (id, time, overrides = {}) => ({
  id,
  team1: 'Alpha',
  team1Id: 'alpha',
  team2: 'Bravo',
  team2Id: 'bravo',
  date: '2026-09-10',
  time,
  durationMinutes: 60,
  location: 'Field 1',
  resourceId: 'facility:field-1',
  round: 'Round 1',
  stage: 'Main',
  isCompleted: false,
  ...overrides,
});
const event = (overrides = {}) => ({
  isTournament: true,
  teamId: 'team-a',
  lifecycleVersion: 2,
  scheduleVersion: 3,
  tournamentType: 'round_robin',
  refereePool: [referee],
  tournamentGames: [game('game-one', '10:00 AM'), game('game-two', '11:00 AM')],
  ...overrides,
});

async function appFor(seed, options = {}) {
  const state = communicationDb(seed, options);
  const app = await loadCommunicationRoute('../../src/app/api/tournaments/schedule/route.ts', state.db, { uid: 'owner', role: 'coach' });
  return { ...state, ...app };
}

async function post(app, body) {
  const response = await app.route.POST(communicationRequest(body));
  return { status: response.status, body: await response.json() };
}

const command = (overrides = {}) => ({
  action: 'assign-referee',
  requestId: 'tournament-schedule-request-0001',
  teamId: 'team-a',
  eventId: 'cup-a',
  expectedVersion: 2,
  expectedScheduleVersion: 3,
  gameId: 'game-one',
  refereeId: referee.id,
  ...overrides,
});

test('referee pool add and remove are server-owned, versioned, and replay safe', async () => {
  const app = await appFor({
    'teams/team-a': { ...baseTeam, planId: 'elite' },
    'teams/team-a/events/cup-a': event({ refereePool: [], tournamentGames: [game('game-one', '10:00 AM')] }),
  });
  try {
    const add = command({
      action: 'add-referee',
      requestId: 'tournament-referee-add-0001',
      refereeId: undefined,
      referee: { name: ' Riley Ref ', email: 'RILEY@example.test', phone: '555-0100', certLevel: 'Regional' },
    });
    const first = await post(app, add);
    const replay = await post(app, add);
    assert.equal(first.status, 200);
    assert.deepEqual(replay.body, first.body);
    assert.equal(app.records.get('teams/team-a/events/cup-a').refereePool.length, 1);
    assert.equal(app.records.get('teams/team-a/events/cup-a').refereePool[0].email, undefined);
    assert.equal([...app.records.values()].find(value => value.eventId === 'cup-a' && value.refereeId)?.email, 'riley@example.test');

    const added = app.records.get('teams/team-a/events/cup-a').refereePool[0];
    const remove = command({
      action: 'remove-referee',
      requestId: 'tournament-referee-remove-0001',
      expectedScheduleVersion: first.body.scheduleVersion,
      refereeId: added.id,
    });
    const removed = await post(app, remove);
    const removedReplay = await post(app, remove);
    assert.equal(removed.status, 200);
    assert.deepEqual(removedReplay.body, removed.body);
    assert.deepEqual(app.records.get('teams/team-a/events/cup-a').refereePool, []);
  } finally { app.dispose(); }
});

test('authenticated referee portal resolves the server-only profile and returns a safe DTO', async () => {
  const state = communicationDb({
    'teams/team-a': { ...baseTeam, planId: 'elite' },
    'teams/team-a/events/cup-a': event({ refereePool: [{ id: referee.id, name: referee.name, status: 'active' }] }),
    'tournamentReferees/private-riley': { teamId: 'team-a', eventId: 'cup-a', refereeId: referee.id, ...referee, phone: '555-0100' },
  });
  const app = await loadCommunicationRoute('../../src/app/api/public/portals/route.ts', state.db, { uid: 'riley', email: referee.email });
  try {
    const request = new Request(`http://127.0.0.1/api/public/portals?kind=tournament&teamId=team-a&eventId=cup-a&refereeEmail=${referee.email}`);
    request.nextUrl = new URL(request.url);
    const response = await app.route.GET(request);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.data.activeReferee, { id: referee.id, name: referee.name });
    assert.equal(JSON.stringify(body).includes(referee.email), false);
    assert.equal(JSON.stringify(body).includes('555-0100'), false);
  } finally { app.dispose(); }
});

test('authenticated referee portal transactionally migrates an untouched legacy contact', async () => {
  const state = communicationDb({
    'teams/team-a': { ...baseTeam, planId: 'elite' },
    'teams/team-a/events/cup-a': event(),
  });
  const app = await loadCommunicationRoute('../../src/app/api/public/portals/route.ts', state.db, { uid: 'riley', email: referee.email });
  try {
    const request = new Request(`http://127.0.0.1/api/public/portals?kind=tournament&teamId=team-a&eventId=cup-a&refereeEmail=${referee.email}`);
    request.nextUrl = new URL(request.url);
    const response = await app.route.GET(request);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.data.activeReferee.id, referee.id);
    assert.equal(state.records.get('teams/team-a/events/cup-a').refereePool[0].email, undefined);
    assert.equal([...state.records.values()].some(value => value.teamId === 'team-a' && value.eventId === 'cup-a' && value.refereeId === referee.id && value.email === referee.email), true);
  } finally { app.dispose(); }
});

test('legacy referee contacts migrate before projection scrubbing and remain assignable', async () => {
  const app = await appFor({
    'teams/team-a': baseTeam,
    'teams/team-a/events/cup-a': event({ tournamentGames: [game('game-one', '10:00 AM')] }),
  });
  try {
    const result = await post(app, command());
    assert.equal(result.status, 200);
    assert.equal(app.records.get('teams/team-a/events/cup-a').refereePool[0].email, undefined);
    const profile = [...app.records.values()].find(value => value.teamId === 'team-a' && value.eventId === 'cup-a' && value.refereeId === referee.id && value.email);
    assert.equal(profile.email, referee.email);
    assert.equal(app.records.get('teams/team-a/events/cup-a').tournamentGames[0].refereeId, referee.id);
  } finally { app.dispose(); }
});

test('redeploy consults authoritative referee assignments even when the event projection is stale', async () => {
  const initial = schedulableEvent({ scheduleVersion: 3 });
  const app = await appFor({
    'teams/team-a': baseTeam,
    'teams/team-a/events/cup-a': initial,
    'tournamentRefereeAssignments/orphan': { teamId: 'team-a', eventId: 'cup-a', gameId: 'reused-game', refereeId: referee.id, refereeKey: referee.email },
  });
  try {
    const generated = generateTournamentSchedule({
      teams: initial.tournamentTeamsData,
      fields: [{ id: 'facility:field-1', name: 'Field 1' }],
      startDate: initial.date, endDate: initial.endDate, startTime: '08:00', endTime: '20:00',
      gameLength: 60, breakLength: 15, gamesPerTeam: 3, maxDailyGamesPerTeam: 6,
      tournamentType: 'single_elimination',
    });
    const response = await post(app, command({ action: 'deploy', requestId: 'tournament-authoritative-redeploy-0001', gameId: undefined, refereeId: undefined, games: generated }));
    assert.equal(response.status, 409);
    assert.deepEqual(app.records.get('teams/team-a/events/cup-a'), initial);
  } finally { app.dispose(); }
});

test('a downgraded team cannot mutate an advanced tournament but can clear it safely', async () => {
  const advanced = event({ tournamentType: 'single_elimination', tournamentGames: [game('game-one', '10:00 AM')] });
  const blocked = await appFor({ 'teams/team-a': { ownerUserId: 'owner', planId: 'team', isPro: false }, 'teams/team-a/events/cup-a': advanced });
  try { assert.equal((await post(blocked, command({ action: 'add-referee', requestId: 'tournament-downgrade-mutation-0001', refereeId: undefined, referee: { name: 'New', email: 'new@example.test' } }))).status, 403); }
  finally { blocked.dispose(); }
  const cleanup = await appFor({ 'teams/team-a': { ownerUserId: 'owner', planId: 'team', isPro: false }, 'teams/team-a/events/cup-a': advanced });
  try { assert.equal((await post(cleanup, command({ action: 'clear', requestId: 'tournament-downgrade-clear-0001', gameId: undefined, refereeId: undefined }))).status, 200); }
  finally { cleanup.dispose(); }
});

test('near-limit clear removes all authoritative state and replays only after complete', async () => {
  const fixtures = {
    'teams/team-a': baseTeam,
    'teams/team-a/events/cup-a': event({ tournamentGames: [game('game-one', '10:00 AM')] }),
  };
  for (let index = 0; index < 300; index++) {
    fixtures[`scheduleBookings/b-${index}`] = { sourceId: 'tournament:team-a:cup-a' };
    fixtures[`tournamentRefereeAssignments/a-${index}`] = { teamId: 'team-a', eventId: 'cup-a', gameId: `g-${index}` };
  }
  const app = await appFor(fixtures, { serializeTransactions: true, maxTransactionWrites: 500 });
  try {
    const clear = command({ action: 'clear', requestId: 'tournament-near-limit-clear-0001', gameId: undefined, refereeId: undefined });
    const first = await post(app, clear);
    assert.equal(first.status, 200);
    assert.equal([...app.records.keys()].some(path => path.startsWith('scheduleBookings/')), false);
    assert.equal([...app.records.keys()].some(path => path.startsWith('tournamentRefereeAssignments/')), false);
    assert.deepEqual((await post(app, clear)).body, first.body);
  } finally { app.dispose(); }
});

test('clear rejects a colliding request and resumes the stable in-progress operation', async () => {
  const clear = command({ action: 'clear', requestId: 'tournament-resumable-clear-0001', gameId: undefined, refereeId: undefined });
  const payload = { action: clear.action, teamId: clear.teamId, eventId: clear.eventId, expectedVersion: clear.expectedVersion, expectedScheduleVersion: clear.expectedScheduleVersion };
  const identity = canonicalCompetitionRequest({ requestId: clear.requestId, tenantId: clear.teamId, kind: 'tournament-schedule', payload });
  const source = event({ scheduleClearOperationId: identity.operationId });
  const app = await appFor({
    'teams/team-a': baseTeam,
    'teams/team-a/events/cup-a': source,
    [`competitionOperationProgress/${identity.operationId}`]: { requestId: identity.requestId, payloadHash: identity.payloadHash, actorUid: 'owner', teamId: 'team-a', eventId: 'cup-a', state: 'clearing' },
    'scheduleBookings/pending': { sourceId: 'tournament:team-a:cup-a' },
  });
  try {
    assert.equal((await post(app, { ...clear, requestId: 'tournament-colliding-clear-0002' })).status, 409);
    const resumed = await post(app, clear);
    assert.equal(resumed.status, 200);
    assert.equal(app.records.has('scheduleBookings/pending'), false);
    assert.equal(app.records.has(`competitionOperationProgress/${identity.operationId}`), false);
  } finally { app.dispose(); }
});

test('referee assignment rejects stale versions without changing the schedule', async () => {
  const original = event();
  const app = await appFor({ 'teams/team-a': baseTeam, 'teams/team-a/events/cup-a': original });
  try {
    const result = await post(app, command({ expectedScheduleVersion: 2 }));
    assert.equal(result.status, 409);
    assert.deepEqual(app.records.get('teams/team-a/events/cup-a'), original);
  } finally { app.dispose(); }
});

test('referee assignment uses actual intervals and permits an exact back-to-back boundary', async () => {
  const app = await appFor({
    'teams/team-a': baseTeam,
    'teams/team-a/events/cup-a': event({
      tournamentGames: [
        game('game-one', '10:00 AM'),
        game('game-two', '11:00 AM', { refereeId: referee.id, refereeName: referee.name }),
      ],
    }),
    'tournamentRefereeAssignments/existing': {
      teamId: 'team-a', eventId: 'cup-a', gameId: 'game-two', refereeId: referee.id,
      refereeKey: 'riley@example.test', date: '2026-09-10', startMinute: 660, endMinute: 720,
    },
  });
  try {
    const result = await post(app, command());
    assert.equal(result.status, 200);
    assert.equal(app.records.get('teams/team-a/events/cup-a').tournamentGames[0].refereeId, referee.id);
  } finally { app.dispose(); }
});

test('referee assignment rejects a cross-event actual interval overlap', async () => {
  const original = event({ tournamentGames: [game('game-one', '10:00 AM')] });
  const app = await appFor({
    'teams/team-a': baseTeam,
    'teams/team-a/events/cup-a': original,
    'teams/team-a/events/cup-b': event({ teamId: 'team-a', tournamentGames: [game('foreign-game', '10:30 AM', { refereeId: referee.id })] }),
    'tournamentRefereeAssignments/foreign': {
      teamId: 'team-a', eventId: 'cup-b', gameId: 'foreign-game', refereeId: referee.id,
      refereeKey: 'riley@example.test', date: '2026-09-10', startMinute: 630, endMinute: 690,
    },
  });
  try {
    const result = await post(app, command());
    assert.equal(result.status, 409);
    assert.deepEqual(app.records.get('teams/team-a/events/cup-a'), original);
  } finally { app.dispose(); }
});

test('same-event authoritative overlap conflicts while stale client-array assignments are discarded', async () => {
  const original = event({
    tournamentGames: [
      game('game-one', '10:00 AM'),
      game('game-two', '10:30 AM', { refereeId: referee.id, refereeName: referee.name }),
    ],
  });
  const blocked = await appFor({
    'teams/team-a': baseTeam,
    'teams/team-a/events/cup-a': original,
    'tournamentRefereeAssignments/existing': {
      teamId: 'team-a', eventId: 'cup-a', gameId: 'game-two', refereeId: referee.id,
      refereeKey: 'riley@example.test', date: '2026-09-10', startMinute: 630, endMinute: 690,
    },
  });
  try {
    assert.equal((await post(blocked, command())).status, 409);
    assert.deepEqual(blocked.records.get('teams/team-a/events/cup-a'), original);
  } finally { blocked.dispose(); }

  const stale = await appFor({ 'teams/team-a': baseTeam, 'teams/team-a/events/cup-a': original });
  try {
    const result = await post(stale, command());
    assert.equal(result.status, 200);
    const stored = stale.records.get('teams/team-a/events/cup-a').tournamentGames;
    assert.equal(stored[0].refereeId, referee.id);
    assert.equal(stored[1].refereeId, undefined);
  } finally { stale.dispose(); }
});

test('transaction-time organizer demotion denies the assignment', async () => {
  let transactions = 0;
  const original = event({ tournamentGames: [game('game-one', '10:00 AM')] });
  const app = await appFor({
    'teams/team-a': { ...baseTeam, ownerUserId: 'different-owner' },
    'teams/team-a/members/owner': { userId: 'owner', teamId: 'team-a', role: 'member', position: 'Assistant Coach', status: 'active' },
    'teams/team-a/events/cup-a': original,
  }, {
    beforeTransaction({ records }) {
      transactions += 1;
      if (transactions === 2) records.set('teams/team-a/members/owner', { userId: 'owner', teamId: 'team-a', role: 'player', status: 'removed' });
    },
  });
  try {
    const result = await post(app, command());
    assert.equal(result.status, 403);
    assert.deepEqual(app.records.get('teams/team-a/events/cup-a'), original);
  } finally { app.dispose(); }
});

test('removed referees and referee identities from another tournament fail closed', async () => {
  for (const pool of [
    [{ ...referee, status: 'removed' }],
    [{ id: 'other-referee', name: 'Other', email: 'other@example.test', status: 'active' }],
  ]) {
    const original = event({ refereePool: pool, tournamentGames: [game('game-one', '10:00 AM')] });
    const app = await appFor({ 'teams/team-a': baseTeam, 'teams/team-a/events/cup-a': original });
    try {
      const result = await post(app, command());
      assert.ok([403, 404].includes(result.status));
      assert.deepEqual(app.records.get('teams/team-a/events/cup-a'), original);
    } finally { app.dispose(); }
  }

  const foreign = event({ teamId: 'team-b', tournamentGames: [game('game-one', '10:00 AM')] });
  const app = await appFor({ 'teams/team-a': baseTeam, 'teams/team-a/events/cup-a': foreign });
  try {
    assert.equal((await post(app, command())).status, 403);
    assert.deepEqual(app.records.get('teams/team-a/events/cup-a'), foreign);
  } finally { app.dispose(); }
});

function schedulableEvent(overrides = {}) {
  const teams = Array.from({ length: 4 }, (_, index) => ({ id: `team-${index + 1}`, name: `Team ${index + 1}` }));
  return event({
    date: '2026-09-10', endDate: '2026-09-11', gameLength: 60, breakLength: 15,
    gamesPerTeam: 3, maxDailyGamesPerTeam: 6, tournamentType: 'single_elimination',
    tournamentTeamsData: teams, selectedFields: ['facility:field-1'], tournamentGames: [], refereePool: [],
    ...overrides,
  });
}

test('concurrent schedule deploys produce one version winner and no partial loser', async () => {
  const source = schedulableEvent({ scheduleVersion: 1 });
  const games = generateTournamentSchedule({
    teams: source.tournamentTeamsData,
    fields: [{ id: 'facility:field-1', name: 'Field 1' }],
    startDate: source.date, endDate: source.endDate, startTime: '08:00', endTime: '20:00',
    gameLength: 60, breakLength: 15, gamesPerTeam: 3, maxDailyGamesPerTeam: 6,
    tournamentType: 'single_elimination',
  });
  const app = await appFor({ 'teams/team-a': baseTeam, 'teams/team-a/events/cup-a': source }, { serializeTransactions: true });
  try {
    const base = command({ action: 'deploy', expectedScheduleVersion: 1, games, refereeId: undefined, gameId: undefined });
    const results = await Promise.all([
      post(app, { ...base, requestId: 'tournament-deploy-race-0001' }),
      post(app, { ...base, requestId: 'tournament-deploy-race-0002' }),
    ]);
    assert.equal(results.filter(result => result.status === 200).length, 1);
    assert.equal(results.filter(result => result.status === 409).length, 1);
    assert.equal(results.find(result => result.status === 200).body.scheduleVersion, 2);
    assert.equal(app.records.get('teams/team-a/events/cup-a').scheduleVersion, 2);
  } finally { app.dispose(); }
});

test('pool seeding is replay safe and a new reseed is locked', async () => {
  const teams = Array.from({ length: 8 }, (_, index) => ({ id: `team-${index + 1}`, name: `Team ${index + 1}` }));
  const generated = generateTournamentSchedule({
    teams,
    fields: [{ id: 'facility:field-1', name: 'Field 1' }],
    startDate: '2026-09-10', endDate: '2026-09-12', startTime: '08:00', endTime: '22:00',
    gameLength: 60, breakLength: 15, gamesPerTeam: 3, maxDailyGamesPerTeam: 12,
    tournamentType: 'pool_play_knockout', poolCount: 2, advancePerPool: 2,
  }).map(gameValue => gameValue.stage === 'Pool'
    ? { ...gameValue, score1: 2, score2: 1, isCompleted: true }
    : gameValue);
  const source = schedulableEvent({
    tournamentType: 'pool_play_knockout', poolCount: 2, advancePerPool: 2,
    tournamentTeamsData: teams, tournamentGames: generated,
  });
  const app = await appFor({ 'teams/team-a': baseTeam, 'teams/team-a/events/cup-a': source });
  try {
    const seed = command({ action: 'seed-pools', requestId: 'tournament-seed-pools-0001', refereeId: undefined, gameId: undefined });
    const first = await post(app, seed);
    const replay = await post(app, seed);
    assert.equal(first.status, 200);
    assert.deepEqual(replay.body, first.body);
    const reseed = await post(app, { ...seed, requestId: 'tournament-seed-pools-0002', expectedScheduleVersion: first.body.scheduleVersion });
    assert.equal(reseed.status, 409);
  } finally { app.dispose(); }
});

test('unresolved disputed pool result blocks knockout seeding', async () => {
  const teams = Array.from({ length: 8 }, (_, index) => ({ id: `team-${index + 1}`, name: `Team ${index + 1}` }));
  const generated = generateTournamentSchedule({
    teams, fields: [{ id: 'facility:field-1', name: 'Field 1' }],
    startDate: '2026-09-10', endDate: '2026-09-12', startTime: '08:00', endTime: '22:00',
    gameLength: 60, breakLength: 15, gamesPerTeam: 3, maxDailyGamesPerTeam: 12,
    tournamentType: 'pool_play_knockout', poolCount: 2, advancePerPool: 2,
  }).map((gameValue, index) => gameValue.stage === 'Pool'
    ? { ...gameValue, score1: 2, score2: 1, isCompleted: true, ...(index === 0 ? { isDisputed: true } : {}) }
    : gameValue);
  const source = schedulableEvent({ tournamentType: 'pool_play_knockout', poolCount: 2, advancePerPool: 2, tournamentTeamsData: teams, tournamentGames: generated });
  const app = await appFor({ 'teams/team-a': baseTeam, 'teams/team-a/events/cup-a': source });
  try {
    const response = await post(app, command({ action: 'seed-pools', requestId: 'tournament-disputed-pool-0001', refereeId: undefined, gameId: undefined }));
    assert.equal(response.status, 409);
    assert.deepEqual(app.records.get('teams/team-a/events/cup-a'), source);
  } finally { app.dispose(); }
});

test('archived and explicitly inactive tournaments reject schedule mutations', async () => {
  for (const state of [{ isArchived: true }, { is_active: false }, { status: 'cancelled' }]) {
    const source = event(state);
    const app = await appFor({ 'teams/team-a': baseTeam, 'teams/team-a/events/cup-a': source });
    try { assert.equal((await post(app, command())).status, 409); assert.deepEqual(app.records.get('teams/team-a/events/cup-a'), source); }
    finally { app.dispose(); }
  }
});

test('schedule clear atomically removes owned bookings and referee assignments but preserves foreign tenants', async () => {
  const source = event({ tournamentGames: [game('game-one', '10:00 AM', { refereeId: referee.id, refereeName: referee.name })] });
  const app = await appFor({
    'teams/team-a': baseTeam,
    'teams/team-a/events/cup-a': source,
    'scheduleBookings/owned': { sourceId: 'tournament:team-a:cup-a' },
    'tournamentRefereeAssignments/owned': { teamId: 'team-a', eventId: 'cup-a', gameId: 'game-one', refereeId: referee.id },
    'tournamentRefereeAssignments/foreign': { teamId: 'team-b', eventId: 'cup-a', gameId: 'foreign', refereeId: referee.id },
  });
  try {
    const result = await post(app, command({ action: 'clear', requestId: 'tournament-clear-schedule-0001', refereeId: undefined, gameId: undefined }));
    assert.equal(result.status, 200);
    assert.deepEqual(app.records.get('teams/team-a/events/cup-a').tournamentGames, []);
    assert.equal(app.records.has('scheduleBookings/owned'), false);
    assert.equal(app.records.has('tournamentRefereeAssignments/owned'), false);
    assert.equal(app.records.has('tournamentRefereeAssignments/foreign'), true);
  } finally { app.dispose(); }
});
