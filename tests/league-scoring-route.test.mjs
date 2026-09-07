import assert from 'node:assert/strict';
import test from 'node:test';
import { communicationDb, loadCommunicationRoute } from './helpers/communication-route-harness.mjs';

process.env.COMPETITION_CREDENTIAL_HMAC_SECRET = 'task-four-test-secret-at-least-thirty-two-bytes';
const fixture = () => ({
  'users/owner': { role: 'league_creator', plan_type: 'league' },
  'teams/host': { ownerUserId: 'owner', planId: 'league' },
  'teams/host/members/staff': { userId: 'staff', role: 'coach', position: 'Coach', status: 'active' },
  'leagues/league-a': { creatorId: 'owner', billingOwnerUserId: 'owner', tenantId: 'host', lifecycleVersion: 4,
    name: 'Metro', is_active: true, scorekeeperPin: '8274',
    contactEmail: 'private@example.test', paymentInstructions: 'Private transfer', registrationCost: '75',
    memberUserIds: ['staff'],
    teams: { alpha: { teamName: 'Alpha', status: 'accepted', coachEmail: 'secret@example.test' }, beta: { teamName: 'Beta', status: 'accepted' } },
    schedule: [{ id: 'game-a', gameVersion: 0, team1Id: 'alpha', team2Id: 'beta', team1: 'Alpha', team2: 'Beta', date: '2026-09-10', time: '10:00', location: 'Field', score1: 0, score2: 0, isCompleted: false }],
  },
});
const command = (overrides = {}) => ({ kind: 'league', action: 'score', leagueId: 'league-a', gameId: 'game-a',
  requestId: 'score-request-0001', expectedGameVersion: 0, code: '8274', score1: 3, score2: 1, reportedBy: 'Forged Organizer', ...overrides });
const post = (app, body) => app.route.POST(new Request('http://localhost/api/public/portals/action', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
}));
async function setup(path = '../../src/app/api/public/portals/action/route.ts', auth = { uid: 'owner', role: 'league_creator' }, options) {
  const state = communicationDb(fixture(), options);
  return { ...state, app: await loadCommunicationRoute(path, state.db, auth) };
}
const audits = records => [...records].filter(([key]) => key.startsWith('leagues/league-a/scoreAudit/'));

test('public scoring replay mutates once, derives actor, migrates PIN, and rejects changed payload', async () => {
  const { app, records } = await setup();
  try {
    const body = command();
    assert.equal((await post(app, body)).status, 200);
    const first = structuredClone([...records]);
    assert.equal((await post(app, body)).status, 200);
    assert.deepEqual([...records], first);
    assert.equal(audits(records).length, 1);
    const league = records.get('leagues/league-a');
    assert.notEqual(league.schedule[0].reportedBy, 'Forged Organizer');
    assert.match(league.schedule[0].reportedBy, /^scorekeeper:/);
    assert.equal(league.schedule[0].gameVersion, 1);
    assert.equal(league.lifecycleVersion, 4);
    assert.equal(league.teams.alpha.points, 3);
    assert.equal(league.scorekeeperPin, undefined);
    assert.match(records.get('leagues/league-a/private/lifecycle').scorekeeperPinHash, /^hmac-sha256:v1:/);
    assert.equal((await post(app, { ...body, score1: 7 })).status, 409);
    assert.equal((await post(app, { ...body, requestId: 'another-request-01' })).status, 409);
    assert.equal(records.get('teams/alpha/games/lg_game-a').myScore, 3);
  } finally { app.dispose(); }
});

test('public score and dispute validate game, credential, version, and lifecycle without writes', async () => {
  for (const [overrides, status] of [[{ code: 'wrong' }, 403], [{ gameId: 'missing' }, 404], [{ expectedGameVersion: 2 }, 409], [{ expectedGameVersion: undefined }, 400], [{ score1: '3' }, 400], [{ action: 'dispute', notes: 'Incorrect result', gameId: 'missing' }, 404]]) {
    const { app, records } = await setup();
    try { const before = structuredClone([...records]); assert.equal((await post(app, command(overrides))).status, status); assert.deepEqual([...records], before); }
    finally { app.dispose(); }
  }
  for (const change of [{ isArchived: true }, { is_active: false }, { creatorId: '', billingOwnerUserId: '' }]) {
    const { app, records } = await setup();
    try { Object.assign(records.get('leagues/league-a'), change); assert.notEqual((await post(app, command())).status, 200); assert.equal(audits(records).length, 0); }
    finally { app.dispose(); }
  }
});

test('current billing owner, lifecycle, and credential are revalidated in committing transaction', async () => {
  for (const mutate of [
    records => records.delete('users/owner'),
    records => Object.assign(records.get('users/owner'), { role: 'coach', plan_type: 'free' }),
    records => Object.assign(records.get('leagues/league-a'), { isArchived: true }),
    records => Object.assign(records.get('leagues/league-a'), { scorekeeperPin: 'rotated' }),
  ]) {
    const { app, records } = await setup(undefined, undefined, { beforeTransaction: ({ records }) => mutate(records) });
    try { assert.notEqual((await post(app, command())).status, 200); assert.equal(audits(records).length, 0); assert.equal(records.get('leagues/league-a').schedule[0].isCompleted, false); }
    finally { app.dispose(); }
  }
});

test('score/dispute reject downstream started results atomically', async () => {
  for (const action of ['score', 'dispute']) {
    const { app, records } = await setup();
    try {
      const league = records.get('leagues/league-a'); league.schedule[0].winnerTo = 'final';
      league.schedule.push({ id: 'final', team1Id: 'alpha', team2Id: 'beta', isStarted: true });
      const before = structuredClone([...records]);
      assert.equal((await post(app, command({ action, notes: 'Wrong score' }))).status, 409);
      assert.deepEqual([...records], before);
    } finally { app.dispose(); }
  }
});

test('public spectator GET excludes nested private data and fails closed on absent owner', async () => {
  const { app, records } = await setup('../../src/app/api/public/portals/route.ts');
  const get = () => app.route.GET({ headers: new Headers(), nextUrl: new URL('http://localhost/api/public/portals?kind=league&purpose=spectator&leagueId=league-a') });
  try {
    const response = await get(); assert.equal(response.status, 200);
    const { data } = await response.json();
    assert.deepEqual(Object.keys(data).sort(), ['id', 'name', 'sport', 'divisions', 'divisionTitle', 'schedule', 'teams', 'isActive'].sort());
    assert.equal(data.teams.alpha.coachEmail, undefined);
    assert.equal(data.schedule[0].reportedBy, undefined);
    records.get('leagues/league-a').creatorId = ''; records.get('leagues/league-a').billingOwnerUserId = '';
    assert.equal((await get()).status, 403);
  } finally { app.dispose(); }
});

test('legacy authenticated score/dispute share receipts and explicit organizer resolution', async () => {
  const { app, records, db } = await setup('../../src/app/api/leagues/schedule/route.ts');
  try {
    const scored = command();
    assert.equal((await post(app, scored)).status, 200);
    assert.equal((await post(app, scored)).status, 200);
    assert.equal(audits(records).length, 1);
    assert.equal(records.get('leagues/league-a').schedule[0].reportedBy, 'user:owner');
    const dispute = command({ action: 'dispute', notes: 'Clock error', requestId: 'dispute-request-01', expectedGameVersion: 1 });
    assert.equal((await post(app, dispute)).status, 200);
    assert.equal((await post(app, dispute)).status, 200);
    assert.equal(audits(records).length, 2);
    assert.equal(records.get('leagues/league-a').teams.alpha.points, 0);
    assert.equal(records.has('teams/alpha/games/lg_game-a'), false);
    assert.equal((await post(app, command({ requestId: 'score-over-dispute', expectedGameVersion: 2 }))).status, 409);
    const resolve = command({ action: 'resolve-dispute', outcome: 'correct', reason: '', expectedGameVersion: 2, requestId: 'resolve-request-01', score1: 0, score2: 2 });
    assert.equal((await post(app, resolve)).status, 400);
    const other = await loadCommunicationRoute('../../src/app/api/leagues/schedule/route.ts', db, { uid: 'staff', role: 'coach' });
    try { assert.equal((await post(other, { ...resolve, reason: 'Verified clock' })).status, 403); } finally { other.dispose(); }
    assert.equal((await post(app, { ...resolve, reason: 'Verified clock' })).status, 200);
    assert.equal(records.get('leagues/league-a').teams.beta.points, 3);
    assert.equal(records.get('leagues/league-a').schedule[0].gameVersion, 3);
    assert.equal(records.get('teams/beta/games/lg_game-a').result, 'Win');
    assert.equal(audits(records).length, 3);
  } finally { app.dispose(); }
});

test('independent games retain independent versions and concurrent score/dispute has one winner', async () => {
  const { app, records } = await setup(undefined, undefined, { serializeTransactions: true });
  try {
    records.get('leagues/league-a').schedule.push({ ...records.get('leagues/league-a').schedule[0], id: 'game-b' });
    assert.equal((await post(app, command())).status, 200);
    assert.equal((await post(app, command({ gameId: 'game-b', requestId: 'second-game-score' }))).status, 200);
    const responses = await Promise.all([
      post(app, command({ requestId: 'racing-score-0001', expectedGameVersion: 1, score1: 5 })),
      post(app, command({ action: 'dispute', notes: 'Timing issue', requestId: 'racing-dispute-01', expectedGameVersion: 1 })),
    ]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    assert.equal(audits(records).length, 3);
  } finally { app.dispose(); }
});

test('scorekeeper DTO excludes private fields and fails closed after archive', async () => {
  const { app, records } = await setup('../../src/app/api/public/portals/route.ts');
  try {
    const response = await app.route.GET({ headers: new Headers(), nextUrl: new URL('http://localhost/api/public/portals?kind=league&leagueId=league-a') });
    const { data } = await response.json();
    assert.equal(data.contactEmail, undefined);
    assert.equal(data.registrationCost, undefined);
    assert.equal(data.paymentInstructions, undefined);
    assert.equal(data.memberUserIds, undefined);
    assert.equal(data.scorekeeperPin, undefined);
    assert.equal(data.schedule[0].gameVersion, 0);
    records.get('leagues/league-a').isArchived = true;
    assert.equal((await app.route.GET({ headers: new Headers(), nextUrl: new URL('http://localhost/api/public/portals?kind=league&leagueId=league-a') })).status, 404);
  } finally { app.dispose(); }
});

test('authenticated member discovery returns exact safe DTO and rejects stale or cross-tenant membership', async () => {
  const { app, records } = await setup('../../src/app/api/leagues/scoring/route.ts', { uid: 'staff', role: 'coach' });
  const get = (teamId = 'host') => app.route.GET({ headers: new Headers(), nextUrl: new URL(`http://localhost/api/leagues/scoring?purpose=member&teamId=${teamId}`) });
  try {
    const league = records.get('leagues/league-a'); league.memberTeamIds = ['host']; league.teams.host = { teamName: 'Host', status: 'accepted' };
    const response = await get(); assert.equal(response.status, 200);
    const { data } = await response.json(); assert.equal(data.length, 1);
    assert.deepEqual(Object.keys(data[0]).sort(), ['id', 'name', 'sport', 'divisions', 'divisionTitle', 'schedule', 'teams', 'isActive', 'requiresPin', 'scorekeeperConfigured', 'description', 'startDate', 'endDate', 'ages'].sort());
    assert.deepEqual(Object.keys(data[0].teams.alpha).sort(), ['teamName', 'teamLogoUrl', 'division', 'status', 'wins', 'losses', 'ties', 'points'].sort());
    assert.equal(data[0].schedule[0].reportedBy, undefined);
    assert.equal((await get('foreign')).status, 403);
    records.get('teams/host/members/staff').status = 'removed';
    assert.equal((await get()).status, 403);
    assert.equal(league.memberUserIds.includes('staff'), true);
  } finally { app.dispose(); }
});

test('schedule initializes versions and preserves scored-game generation across clear and replacement', async () => {
  const { app, records, db } = await setup('../../src/app/api/leagues/schedule/route.ts');
  const service = await loadCommunicationRoute('../../src/lib/server-schedule-deployment.ts', db, { uid: 'owner' });
  try {
    const league = records.get('leagues/league-a');
    league.schedulerConfig = { selectedFields: ['Field'], gameLength: 60 };
    league.schedule[0].gameVersion = 8;
    const raw = { ...league.schedule[0], gameVersion: 999999 };
    const prepared = service.route.prepareLeagueScheduleForDeployment('league-a', league, 'replace', [raw]);
    assert.equal(prepared.games[0].gameVersion, 9);
    const appended = service.route.prepareLeagueScheduleForDeployment('league-a', league, 'append', undefined, { ...raw, date: '2026-09-11' });
    assert.equal(appended.games[0].gameVersion, 8);
    assert.equal(appended.appendedGame.gameVersion, 9);
    assert.equal((await post(app, { action: 'clear', leagueId: 'league-a', requestId: 'clear-generation-01', expectedVersion: 4, mode: 'clear' })).status, 200);
    assert.equal(records.get('leagues/league-a').gameVersionFloor, 8);
    const replacement = service.route.prepareLeagueScheduleForDeployment('league-a', records.get('leagues/league-a'), 'replace', [raw]);
    assert.equal(replacement.games[0].gameVersion, 9);
    records.get('leagues/league-a').schedule = replacement.games;
    assert.equal((await post(app, command({ expectedGameVersion: 8 }))).status, 409);
  } finally { app.dispose(); service.dispose(); }
});

test('commit-time changes to membership, billing, credential, game, tenant, and lock fence every write', async () => {
  for (const [auth, change, want] of [
    [{ uid: 'staff' }, records => { records.get('teams/host/members/staff').status = 'removed'; }, 403],
    [null, records => { Object.assign(records.get('users/owner'), { role: 'coach', plan_type: 'free' }); }, 403],
    [null, records => { records.get('leagues/league-a').scorekeeperPin = 'rotated'; }, 403],
    [null, records => { records.get('leagues/league-a').schedule[0].gameVersion = 1; }, 409],
    [null, records => { records.get('leagues/league-a').schedule = []; }, 404],
    [null, records => { records.get('leagues/league-a').isArchived = true; }, 404],
    [null, records => { records.get('leagues/league-a').tenantId = 'missing'; }, 403],
    [null, records => { records.get('scheduleBookingLocks/global').expiresAt = 0; }, 409],
  ]) {
    let count = 0;
    const { app, records } = await setup(auth ? '../../src/app/api/leagues/scoring/route.ts' : undefined, auth || undefined, { beforeTransaction: ({ records }) => { if (++count === 3) change(records); } });
    try {
      assert.equal((await post(app, command())).status, want);
      assert.equal(audits(records).length, 0);
      assert.equal([...records.keys()].some(key => key.startsWith('competitionOperations/')), false);
      assert.equal([...records.keys()].some(key => key.startsWith('competitionOperationOutbox/')), false);
      assert.equal(records.has('teams/alpha/games/lg_game-a'), false);
    } finally { app.dispose(); }
  }
});

test('authenticated and legacy adapters collide across one shared receipt namespace and revoked replay is denied', async () => {
  const { app, db, records } = await setup('../../src/app/api/leagues/scoring/route.ts', { uid: 'staff', role: 'coach' });
  const legacy = await loadCommunicationRoute('../../src/app/api/leagues/schedule/route.ts', db, { uid: 'staff', role: 'coach' });
  try {
    assert.equal((await post(app, command())).status, 200);
    assert.equal((await post(legacy, command())).status, 200);
    assert.equal((await post(legacy, command({ action: 'dispute', notes: 'Changed action', expectedGameVersion: 1 }))).status, 409);
    assert.equal(audits(records).length, 1);
    records.get('teams/host/members/staff').status = 'removed';
    assert.equal((await post(app, command())).status, 403);
    assert.equal(audits(records).length, 1);
  } finally { app.dispose(); legacy.dispose(); }
});

test('uphold resolution restores original official result and one durable spectator handoff per command', async () => {
  const { app, records } = await setup('../../src/app/api/leagues/scoring/route.ts');
  try {
    assert.equal((await post(app, command())).status, 200);
    assert.equal((await post(app, command({ action: 'dispute', expectedGameVersion: 1, requestId: 'open-dispute-test', notes: 'Check result' }))).status, 200);
    const resolve = command({ action: 'resolve-dispute', outcome: 'uphold', reason: 'Reviewed official record', expectedGameVersion: 2, requestId: 'uphold-dispute-01' });
    assert.equal((await post(app, resolve)).status, 200);
    assert.equal((await post(app, resolve)).status, 200);
    assert.equal(records.get('leagues/league-a').schedule[0].score1, 3);
    assert.equal(records.get('leagues/league-a').teams.alpha.points, 3);
    assert.equal(records.get('teams/alpha/games/lg_game-a').myScore, 3);
    const outbox = [...records].filter(([key]) => key.startsWith('competitionOperationOutbox/'));
    assert.equal(outbox.length, 3);
    assert.deepEqual(outbox.at(-1)[1].payload, { leagueId: 'league-a', gameId: 'game-a', gameVersion: 3 });
    assert.equal(outbox.at(-1)[1].status, 'pending');
  } finally { app.dispose(); }
});

test('scoring never overwrites another League official game projection with a colliding game ID', async () => {
  const { app, records } = await setup();
  try {
    records.set('teams/alpha/games/lg_game-a', { leagueId: 'another-league', leagueGameId: 'game-a', myScore: 7 });
    const before = structuredClone([...records]);
    assert.equal((await post(app, command())).status, 409);
    assert.deepEqual([...records], before);
  } finally { app.dispose(); }
});

test('canonical competition entitlement allows a free league creator and rejects ordinary free billing owner', async () => {
  for (const route of ['../../src/app/api/leagues/scoring/route.ts', '../../src/app/api/public/portals/action/route.ts']) {
    const { app, records } = await setup(route);
    try {
      records.get('users/owner').plan_type = 'free'; records.get('leagues/league-a').tenantId = 'profile:owner';
      assert.equal((await post(app, command())).status, 200);
      records.get('users/owner').role = 'coach';
      assert.equal((await post(app, command({ requestId: 'free-role-denied', expectedGameVersion: 1 }))).status, 403);
    } finally { app.dispose(); }
  }
});

test('server-owned demo owner must match and a demo ID never grants public credential bypass', async () => {
  const { app, records } = await setup();
  try {
    const league = records.get('leagues/league-a');
    Object.assign(league, { isDemo: true, demoSeeded: true, demoSessionOwnerId: 'someone-else', tenantId: 'profile:owner' });
    Object.assign(records.get('users/owner'), { isDemo: true, plan_type: 'free' });
    assert.equal((await post(app, command())).status, 403);
    league.demoSessionOwnerId = 'owner';
    assert.equal((await post(app, command())).status, 200);
    records.set('leagues/demo_forged', { ...league, isDemo: false, demoSeeded: false, demoSessionOwnerId: null, scorekeeperPin: undefined });
    delete records.get('leagues/demo_forged').scorekeeperPin;
    assert.notEqual((await post(app, command({ leagueId: 'demo_forged', code: '' }))).status, 200);
  } finally { app.dispose(); }
});

test('uphold rejects malformed legacy disputed result instead of publishing an invented score', async () => {
  const { app, records } = await setup('../../src/app/api/leagues/scoring/route.ts');
  try {
    const game = records.get('leagues/league-a').schedule[0]; game.isDisputed = true; delete game.score1;
    assert.equal((await post(app, command({ action: 'resolve-dispute', outcome: 'uphold', reason: 'Review' }))).status, 409);
    assert.equal(audits(records).length, 0);
  } finally { app.dispose(); }
});

test('resolution rejects a started downstream match with no score or standings changes', async () => {
  const { app, records } = await setup('../../src/app/api/leagues/scoring/route.ts');
  try {
    assert.equal((await post(app, command())).status, 200);
    assert.equal((await post(app, command({ action: 'dispute', notes: 'Check', requestId: 'downstream-dispute', expectedGameVersion: 1 }))).status, 200);
    const league = records.get('leagues/league-a'); league.schedule[0].winnerTo = 'final';
    league.schedule.push({ id: 'final', isCompleted: true, score1: 0, score2: 0 });
    const before = structuredClone([...records]);
    assert.equal((await post(app, command({ action: 'resolve-dispute', outcome: 'correct', reason: 'Check record', expectedGameVersion: 2, requestId: 'downstream-resolve' }))).status, 409);
    assert.deepEqual([...records], before);
  } finally { app.dispose(); }
});

test('spectator DTO excludes legacy disputed results even when stored standings predate dispute migration', async () => {
  const { app, records } = await setup('../../src/app/api/public/portals/route.ts');
  try {
    const league = records.get('leagues/league-a');
    Object.assign(league.schedule[0], { isCompleted: true, isDisputed: true, score1: 3, score2: 1 });
    Object.assign(league.teams.alpha, { wins: 1, points: 3 });
    const response = await app.route.GET({ headers: new Headers(), nextUrl: new URL('http://localhost/api/public/portals?kind=league&purpose=spectator&leagueId=league-a') });
    const { data } = await response.json();
    assert.equal(data.teams.alpha.points, 0);
    assert.equal(data.teams.alpha.wins, 0);
    assert.equal(data.schedule[0].isDisputed, true);
  } finally { app.dispose(); }
});

test('public League reads fail closed on missing, ambiguous, mismatched, and inactive tenant ownership', async () => {
  for (const mutate of [
    records => records.delete('teams/host'),
    records => { delete records.get('leagues/league-a').tenantId; },
    records => { records.get('leagues/league-a').hostTeamId = 'other-team'; },
    records => { records.get('leagues/league-a').tenantId = 'profile:someone-else'; },
    records => { Object.assign(records.get('leagues/league-a'), { tenantId: 'profile:owner', creatorId: 'delegated' }); },
    records => { records.get('teams/host').ownerUserId = 'new-owner'; },
    records => { records.get('teams/host').isDeleted = true; },
    records => { records.get('teams/host').isArchived = true; },
    records => { records.get('teams/host').is_active = false; },
    records => { records.get('teams/host').status = 'inactive'; },
  ]) {
    const { app, records } = await setup('../../src/app/api/public/portals/route.ts');
    try {
      mutate(records);
      for (const purpose of ['spectator', 'scorekeeper']) {
        const response = await app.route.GET({ headers: new Headers(), nextUrl: new URL(`http://localhost/api/public/portals?kind=league&purpose=${purpose}&leagueId=league-a`) });
        assert.equal(response.status, 403);
        assert.equal((await response.json()).data, undefined);
      }
    } finally { app.dispose(); }
  }
});

test('shared read validates current tenant transactionally while allowing legitimate delegated creators', async () => {
  for (const delegated of [false, true]) {
    let transactionCount = 0;
    const { app, records } = await setup('../../src/app/api/public/portals/route.ts', undefined, {
      beforeTransaction: ({ records }) => { if (++transactionCount === 2) records.get('teams/host').ownerUserId = 'new-owner'; },
    });
    try {
      if (delegated) records.get('leagues/league-a').creatorId = 'staff';
      const get = () => app.route.GET({ headers: new Headers(), nextUrl: new URL('http://localhost/api/public/portals?kind=league&leagueId=league-a') });
      assert.equal((await get()).status, 200);
      assert.equal((await get()).status, 403);
    } finally { app.dispose(); }
  }
});

test('member discovery rejects inactive requesting teams for owners and members despite stale active linkage', async () => {
  for (const uid of ['owner', 'staff']) for (const lifecycle of [{ isDeleted: true }, { isArchived: true }, { is_active: false }, { isActive: false }, { status: 'deleted' }, { status: 'archived' }, { status: 'inactive' }]) {
    const { app, records } = await setup('../../src/app/api/leagues/scoring/route.ts', { uid });
    try {
      const league = records.get('leagues/league-a'); league.memberTeamIds = ['host']; league.teams.host = { status: 'accepted', teamName: 'Host' };
      Object.assign(records.get('teams/host'), lifecycle);
      const response = await app.route.GET({ headers: new Headers(), nextUrl: new URL('http://localhost/api/leagues/scoring?purpose=member&teamId=host') });
      assert.equal(response.status, 403);
      assert.equal(records.get('teams/host/members/staff').status, 'active');
    } finally { app.dispose(); }
  }
});

test('member discovery excludes foreign stale League ownership while preserving valid participating teams', async () => {
  const { app, records } = await setup('../../src/app/api/leagues/scoring/route.ts', { uid: 'staff' });
  try {
    records.set('teams/participant', { ownerUserId: 'participant-owner', status: 'active' });
    records.set('teams/participant/members/staff', { userId: 'staff', status: 'active' });
    const league = records.get('leagues/league-a'); league.memberTeamIds = ['participant']; league.teams.participant = { status: 'accepted', teamName: 'Participant' };
    const get = () => app.route.GET({ headers: new Headers(), nextUrl: new URL('http://localhost/api/leagues/scoring?purpose=member&teamId=participant') });
    assert.equal((await (await get()).json()).data.length, 1);
    records.get('teams/host').ownerUserId = 'foreign-owner';
    assert.deepEqual((await (await get()).json()).data, []);
    assert.equal(league.memberUserIds.includes('staff'), true);
  } finally { app.dispose(); }
});
