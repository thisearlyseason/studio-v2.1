import assert from 'node:assert/strict';
import test from 'node:test';
import { communicationDb, communicationRequest, loadCommunicationRoute } from './helpers/communication-route-harness.mjs';
import { hashTournamentScorekeeperCode } from '../src/lib/server-competition-credential.ts';

process.env.COMPETITION_CREDENTIAL_HMAC_SECRET = 'task-seven-test-secret-at-least-thirty-two-bytes';

const baseGame = (overrides = {}) => ({
  id: 'game-one', gameVersion: 2, team1: 'Alpha', team1Id: 'alpha', team2: 'Bravo', team2Id: 'bravo',
  date: '2026-09-10', time: '10:00 AM', location: 'Field 1', score1: 0, score2: 0, isCompleted: false,
  ...overrides,
});

const fixture = (overrides = {}) => ({
  'teams/team-a': { ownerUserId: 'owner', planId: 'elite', isPro: true },
  'teams/team-a/members/staff': { userId: 'staff', role: 'coach', position: 'Coach', status: 'active' },
  'teams/team-a/events/cup-a': {
    isTournament: true, teamId: 'team-a', title: 'Fall Cup', lifecycleVersion: 4, scheduleVersion: 6,
    credentialVersion: 3, tournamentType: 'single_elimination', tournamentTeamsData: [
      { id: 'alpha', name: 'Alpha' }, { id: 'bravo', name: 'Bravo' },
    ], tournamentGames: [baseGame()], ...overrides,
  },
  'teams/team-a/events/cup-a/private/scoring': {
    teamId: 'team-a', eventId: 'cup-a', credentialVersion: 3,
    scorekeeperCodeHash: hashTournamentScorekeeperCode('team-a', 'cup-a', 'CUP-2026'),
  },
});

const command = (overrides = {}) => ({
  kind: 'tournament', action: 'score', requestId: 'tournament-score-0001', teamId: 'team-a', eventId: 'cup-a', gameId: 'game-one',
  expectedLifecycleVersion: 4, expectedScheduleVersion: 6, expectedGameVersion: 2, expectedCredentialVersion: 3,
  code: 'CUP-2026', score1: 3, score2: 1, reportedBy: 'Forged Reporter', ...overrides,
});

async function setup(path = '../../src/app/api/public/portals/action/route.ts', auth = { uid: 'owner', role: 'coach' }, options = {}, eventOverrides = {}) {
  const state = communicationDb(fixture(eventOverrides), options);
  return { ...state, app: await loadCommunicationRoute(path, state.db, auth) };
}

async function post(app, body) {
  const response = await app.route.POST(communicationRequest(body));
  return { status: response.status, body: await response.json() };
}

const auditCount = records => [...records.keys()].filter(path => path.startsWith('teams/team-a/events/cup-a/scoreAudit/')).length;

test('Tournament score replay is one mutation and changed payload collides', async () => {
  const { app, records } = await setup();
  try {
    const body = command();
    const first = await post(app, body);
    assert.equal(first.status, 200);
    const after = structuredClone([...records]);
    assert.deepEqual(await post(app, body), first);
    assert.deepEqual([...records], after);
    assert.equal(auditCount(records), 1);
    const game = records.get('teams/team-a/events/cup-a').tournamentGames[0];
    assert.equal(game.gameVersion, 3);
    assert.equal(game.reportedBy, undefined);
    assert.equal(game.score1, 3);
    assert.equal((await post(app, { ...body, score1: 9 })).status, 409);
  } finally { app.dispose(); }
});

test('Tournament scoring rejects wrong or rotated code, stale versions, invalid scores, inactive state, and downgraded plans without writes', async () => {
  const cases = [
    [{ code: 'WRONG' }, 403], [{ expectedLifecycleVersion: 3 }, 409], [{ expectedScheduleVersion: 5 }, 409],
    [{ expectedGameVersion: 1 }, 409], [{ expectedCredentialVersion: 2 }, 409], [{ score1: -1 }, 400],
    [{ gameId: 'missing' }, 404],
  ];
  for (const [change, status] of cases) {
    const { app, records } = await setup();
    try { const before = structuredClone([...records]); assert.equal((await post(app, command(change))).status, status); assert.deepEqual([...records], before); }
    finally { app.dispose(); }
  }
  for (const [eventChange, teamChange] of [[{ isArchived: true }, null], [{ is_active: false }, null], [null, { planId: 'team', isPro: false }]]) {
    const { app, records } = await setup();
    try {
      if (eventChange) Object.assign(records.get('teams/team-a/events/cup-a'), eventChange);
      if (teamChange) Object.assign(records.get('teams/team-a'), teamChange);
      const before = structuredClone([...records]);
      assert.notEqual((await post(app, command())).status, 200);
      assert.deepEqual([...records], before);
    } finally { app.dispose(); }
  }
});

test('commit-time credential, membership, game, schedule, and lock changes fence every write', async () => {
  for (const [path, auth, mutate, status] of [
    ['../../src/app/api/public/portals/action/route.ts', { uid: 'owner' }, records => { records.get('teams/team-a/events/cup-a/private/scoring').credentialVersion = 4; }, 409],
    ['../../src/app/api/tournaments/scoring/route.ts', { uid: 'staff', role: 'coach' }, records => { records.get('teams/team-a/members/staff').status = 'removed'; }, 403],
    ['../../src/app/api/tournaments/scoring/route.ts', { uid: 'owner', role: 'coach' }, records => { records.get('teams/team-a/events/cup-a').tournamentGames[0].gameVersion = 8; }, 409],
    ['../../src/app/api/tournaments/scoring/route.ts', { uid: 'owner', role: 'coach' }, records => { records.get('teams/team-a/events/cup-a').scheduleVersion = 7; }, 409],
    ['../../src/app/api/public/portals/action/route.ts', { uid: 'owner' }, records => { Object.assign(records.get('teams/team-a'), { planId: 'free', isPro: false }); }, 403],
    ['../../src/app/api/tournaments/scoring/route.ts', { uid: 'owner', role: 'coach' }, records => { records.get('scheduleBookingLocks/global').expiresAt = 0; }, 409],
  ]) {
    let count = 0;
    const { app, records } = await setup(path, auth, { beforeTransaction: ({ records }) => { if (++count === 3) mutate(records); } });
    try { assert.equal((await post(app, command())).status, status); assert.equal(auditCount(records), 0); }
    finally { app.dispose(); }
  }
});

test('Tournament score transaction rejects tenant and lifecycle mismatches without writes', async () => {
  for (const eventChange of [{ teamId: 'team-b' }, { isDeleted: true }, { isActive: false }]) {
    const { app, records } = await setup('../../src/app/api/tournaments/scoring/route.ts', { uid: 'owner', role: 'coach' }, {}, eventChange);
    try {
      const before = structuredClone([...records]);
      assert.notEqual((await post(app, command())).status, 200);
      assert.deepEqual([...records], before);
    } finally { app.dispose(); }
  }
  for (const teamChange of [{ isDeleted: true }, { isArchived: true }, { isActive: false }]) {
    const { app, records } = await setup('../../src/app/api/tournaments/scoring/route.ts', { uid: 'owner', role: 'coach' });
    try {
      Object.assign(records.get('teams/team-a'), teamChange);
      const before = structuredClone([...records]);
      assert.notEqual((await post(app, command())).status, 200);
      assert.deepEqual([...records], before);
    } finally { app.dispose(); }
  }
});

test('authenticated Starter owner can score basic round robin while public and advanced scoring remain denied', async () => {
  const authenticated = await setup('../../src/app/api/tournaments/scoring/route.ts', { uid: 'owner', role: 'coach' }, {}, { tournamentType: 'round_robin' });
  try {
    Object.assign(authenticated.records.get('teams/team-a'), { planId: 'starter', isPro: false });
    assert.equal((await post(authenticated.app, command())).status, 200);
  } finally { authenticated.app.dispose(); }

  const credential = await setup('../../src/app/api/public/portals/action/route.ts', null, {}, { tournamentType: 'round_robin' });
  try {
    Object.assign(credential.records.get('teams/team-a'), { planId: 'starter', isPro: false });
    assert.equal((await post(credential.app, command())).status, 403);
    assert.equal(auditCount(credential.records), 0);
  } finally { credential.app.dispose(); }

  const advanced = await setup('../../src/app/api/tournaments/scoring/route.ts', { uid: 'owner', role: 'coach' });
  try {
    Object.assign(advanced.records.get('teams/team-a'), { planId: 'starter', isPro: false });
    assert.equal((await post(advanced.app, command())).status, 403);
    assert.equal(auditCount(advanced.records), 0);
  } finally { advanced.app.dispose(); }
});

test('dispute is completed-only, blocks generic edits and bracket progression, then organizer explicitly resolves with immutable history', async () => {
  const completed = baseGame({ isCompleted: true, score1: 3, score2: 1 });
  const { app, records, db } = await setup('../../src/app/api/tournaments/scoring/route.ts', { uid: 'owner', role: 'coach' }, {}, { tournamentGames: [completed] });
  try {
    const dispute = command({ action: 'dispute', requestId: 'tournament-dispute-001', expectedGameVersion: 2, notes: 'Clock error' });
    assert.equal((await post(app, dispute)).status, 200);
    assert.equal(records.get('teams/team-a/events/cup-a').tournamentGames[0].isDisputed, true);
    assert.equal((await post(app, command({ requestId: 'score-over-dispute', expectedGameVersion: 3 }))).status, 409);
    const staff = await loadCommunicationRoute('../../src/app/api/tournaments/scoring/route.ts', db, { uid: 'staff', role: 'coach' });
    try { assert.equal((await post(staff, command({ action: 'resolve-dispute', resolution: 'correct', reason: 'Reviewed', correctedScore: { home: 2, away: 4 }, requestId: 'resolve-by-staff-1', expectedGameVersion: 3 }))).status, 403); }
    finally { staff.dispose(); }
    const resolve = command({ action: 'resolve-dispute', resolution: 'correct', reason: 'Reviewed video', correctedScore: { home: 2, away: 4 }, requestId: 'resolve-by-owner-1', expectedScheduleVersion: 7, expectedGameVersion: 3 });
    assert.equal((await post(app, resolve)).status, 200);
    const game = records.get('teams/team-a/events/cup-a').tournamentGames[0];
    assert.equal(game.isDisputed, false);
    assert.deepEqual([game.score1, game.score2, game.gameVersion], [2, 4, 4]);
    const audits = [...records].filter(([path]) => path.startsWith('teams/team-a/events/cup-a/scoreAudit/')).map(([, value]) => value);
    assert.equal(audits.length, 2);
    assert.deepEqual(audits.at(-1).priorScore, { home: 3, away: 1 });
    assert.deepEqual(audits.at(-1).resultingScore, { home: 2, away: 4 });
    assert.equal(audits.at(-1).reason, 'Reviewed video');
  } finally { app.dispose(); }

  const uncompleted = await setup('../../src/app/api/tournaments/scoring/route.ts', { uid: 'owner', role: 'coach' });
  try { assert.equal((await post(uncompleted.app, command({ action: 'dispute', notes: 'No result', requestId: 'bad-dispute-0001' }))).status, 409); }
  finally { uncompleted.app.dispose(); }
});

test('disputing a seeded pool result is rejected without changing qualifiers or audit state', async () => {
  const pool = baseGame({ isCompleted: true, score1: 3, score2: 1, stage: 'Pool', round: 'Pool A', pool: 0 });
  const knockout = baseGame({ id: 'knockout-one', gameVersion: 0, team1: 'Alpha', team1Id: 'alpha', team2: 'Bravo', team2Id: 'bravo', stage: 'Knockout', round: 'Semi-Final' });
  const { app, records } = await setup('../../src/app/api/tournaments/scoring/route.ts', { uid: 'owner', role: 'coach' }, {}, { tournamentType: 'pool_play_knockout', tournamentGames: [pool, knockout] });
  try {
    const before = structuredClone([...records]);
    const result = await post(app, command({ action: 'dispute', requestId: 'seeded-pool-dispute-1', notes: 'Review pool result' }));
    assert.equal(result.status, 409);
    assert.match(result.body.error, /qualifiers.*seeded/i);
    assert.deepEqual([...records], before);
  } finally { app.dispose(); }
});

test('legacy code verification is read-only and fails closed for invalid tenant lifecycle', async () => {
  for (const [teamChange, eventChange, expectedStatus] of [
    [{ isActive: false }, {}, 404],
    [{}, { teamId: 'team-b' }, 404],
    [{}, { isDeleted: true }, 404],
    [{}, { isActive: false }, 404],
  ]) {
    const { app, records } = await setup();
    try {
      records.delete('teams/team-a/events/cup-a/private/scoring');
      Object.assign(records.get('teams/team-a'), teamChange);
      Object.assign(records.get('teams/team-a/events/cup-a'), eventChange, { credentialVersion: 0, scoringCode: 'CUP-2026', scorekeeperConfigured: false });
      const result = await post(app, command({ action: 'verify', requestId: undefined, expectedLifecycleVersion: undefined, expectedScheduleVersion: undefined, expectedGameVersion: undefined, expectedCredentialVersion: undefined, gameId: undefined, score1: undefined, score2: undefined }));
      assert.equal(result.status, expectedStatus, JSON.stringify(result.body));
      assert.equal(records.has('teams/team-a/events/cup-a/private/scoring'), false);
      assert.equal(records.get('teams/team-a/events/cup-a').scoringCode, 'CUP-2026');
    } finally { app.dispose(); }
  }

  const { app, records } = await setup();
  try {
    records.delete('teams/team-a/events/cup-a/private/scoring');
    Object.assign(records.get('teams/team-a/events/cup-a'), { credentialVersion: 0, scoringCode: 'CUP-2026', scorekeeperConfigured: false });
    assert.equal((await post(app, command({ action: 'verify', code: 'WRONG', requestId: undefined, expectedLifecycleVersion: undefined, expectedScheduleVersion: undefined, expectedGameVersion: undefined, expectedCredentialVersion: undefined, gameId: undefined, score1: undefined, score2: undefined }))).status, 403);
    assert.equal(records.has('teams/team-a/events/cup-a/private/scoring'), false);
    assert.equal(records.get('teams/team-a/events/cup-a').scoringCode, 'CUP-2026');
    assert.equal((await post(app, command({ action: 'verify', requestId: undefined, expectedLifecycleVersion: undefined, expectedScheduleVersion: undefined, expectedGameVersion: undefined, expectedCredentialVersion: undefined, gameId: undefined, score1: undefined, score2: undefined }))).status, 200);
    assert.equal(records.has('teams/team-a/events/cup-a/private/scoring'), false);
    assert.equal(records.get('teams/team-a/events/cup-a').scoringCode, 'CUP-2026');
  } finally { app.dispose(); }
});

test('simultaneous score and dispute has one winner and downstream completed result locks upstream changes', async () => {
  const completed = baseGame({ isCompleted: true, score1: 1, score2: 0, winnerTo: 'final' });
  const final = baseGame({ id: 'final', gameVersion: 0, team1Id: 'alpha', team2Id: 'bravo', isCompleted: true, score1: 2, score2: 1 });
  const locked = await setup('../../src/app/api/tournaments/scoring/route.ts', { uid: 'owner', role: 'coach' }, {}, { tournamentGames: [completed, final] });
  try { assert.equal((await post(locked.app, command({ expectedGameVersion: 2 }))).status, 409); }
  finally { locked.app.dispose(); }

  const raced = await setup('../../src/app/api/tournaments/scoring/route.ts', { uid: 'owner', role: 'coach' }, { serializeTransactions: true }, { tournamentGames: [baseGame({ isCompleted: true, score1: 1, score2: 0 })] });
  try {
    const results = await Promise.all([
      post(raced.app, command({ requestId: 'race-score-request', score1: 2, expectedGameVersion: 2 })),
      post(raced.app, command({ action: 'dispute', requestId: 'race-dispute-req', notes: 'Review', expectedGameVersion: 2 })),
    ]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    assert.equal(auditCount(raced.records), 1);
  } finally { raced.app.dispose(); }
});

test('uphold rejects a malformed legacy disputed result instead of publishing an invented score', async () => {
  const malformed = baseGame({ isCompleted: false, isDisputed: true, score1: 0, score2: 0 });
  const { app, records } = await setup('../../src/app/api/tournaments/scoring/route.ts', { uid: 'owner', role: 'coach' }, {}, { tournamentType: 'round_robin', tournamentGames: [malformed] });
  try {
    const before = structuredClone([...records]);
    const result = await post(app, command({ action: 'resolve-dispute', resolution: 'uphold', reason: 'Reviewed', requestId: 'malformed-uphold-1' }));
    assert.equal(result.status, 409, JSON.stringify(result.body));
    assert.deepEqual([...records], before);
  } finally { app.dispose(); }
});

test('an explicit tiebreak winner is canonicalized and persisted for bracket progression', async () => {
  const { app, records } = await setup();
  try {
    const result = await post(app, command({ score1: 2, score2: 2, explicitWinner: 'team2', requestId: 'explicit-winner-01' }));
    assert.equal(result.status, 200);
    const scored = records.get('teams/team-a/events/cup-a').tournamentGames[0];
    assert.equal(scored.winnerId, 'bravo');
    assert.equal(scored.explicitWinner, 'team2');
  } finally { app.dispose(); }
});

test('outsiders, foreign-team owners, and referees cannot use the authenticated scoring boundary', async () => {
  for (const auth of [{ uid: 'outsider', role: 'coach' }, { uid: 'team-b-owner', role: 'coach' }, { uid: 'referee', role: 'referee' }]) {
    const { app, records } = await setup('../../src/app/api/tournaments/scoring/route.ts', auth);
    try {
      records.set('teams/team-b', { ownerUserId: 'team-b-owner', planId: 'elite', isPro: true });
      assert.equal((await post(app, command())).status, 403);
      assert.equal(auditCount(records), 0);
    } finally { app.dispose(); }
  }
});

test('organizer can replay explicit uphold and void resolutions exactly once', async () => {
  for (const resolution of ['uphold', 'void']) {
    const disputed = baseGame({ isCompleted: true, isDisputed: true, score1: 3, score2: 1 });
    const { app, records } = await setup('../../src/app/api/tournaments/scoring/route.ts', { uid: 'owner', role: 'coach' }, {}, { tournamentGames: [disputed] });
    try {
      const body = command({ action: 'resolve-dispute', resolution, reason: `Organizer chose ${resolution}`, requestId: `resolve-${resolution}-0001` });
      const first = await post(app, body);
      assert.equal(first.status, 200);
      assert.deepEqual(await post(app, body), first);
      assert.equal(auditCount(records), 1);
      const game = records.get('teams/team-a/events/cup-a').tournamentGames[0];
      assert.equal(game.isDisputed, false);
      assert.equal(game.isCompleted, resolution === 'uphold');
    } finally { app.dispose(); }
  }
});

test('first-use legacy credential migration remains replay safe while new stale requests are rejected', async () => {
  const { app, records } = await setup();
  try {
    records.delete('teams/team-a/events/cup-a/private/scoring');
    Object.assign(records.get('teams/team-a/events/cup-a'), { credentialVersion: 0, scoringCode: 'CUP-2026', scorekeeperConfigured: false });
    const body = command({ expectedCredentialVersion: 0, requestId: 'legacy-code-score-01' });
    const first = await post(app, body);
    assert.equal(first.status, 200);
    assert.deepEqual(await post(app, body), first);
    assert.equal(auditCount(records), 1);
    assert.equal(records.get('teams/team-a/events/cup-a').scoringCode, undefined);
    assert.equal(records.get('teams/team-a/events/cup-a/private/scoring').credentialVersion, 1);
    assert.equal((await post(app, { ...body, requestId: 'legacy-code-score-02', expectedScheduleVersion: 7, expectedGameVersion: 3 })).status, 409);
  } finally { app.dispose(); }
});
