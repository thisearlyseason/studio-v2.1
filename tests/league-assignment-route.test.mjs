import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import { communicationDb, loadCommunicationRoute } from './helpers/communication-route-harness.mjs';
import { teamAssignmentPage } from './helpers/team-assignment-page-harness.mjs';

const routePath = '../../src/app/api/leagues/assignments/route.ts';
const fixture = {
  'users/owner': { role: 'coach', plan_type: 'elite_league' },
  'users/staff': { role: 'coach', plan_type: 'elite_league' },
  'teams/host': { ownerUserId: 'owner', planId: 'elite_league' },
  'teams/squad': { ownerUserId: 'staff', teamName: 'Squad', planId: 'elite_league', leagueIds: {} },
  'leagues/league-a': { creatorId: 'owner', tenantId: 'host', lifecycleVersion: 1, name: 'Metro', teams: {
    recruit_entry: { teamName: 'Applicant', status: 'assigned' }, squad: { teamName: 'Squad', status: 'accepted' },
  }, schedule: [{ id: 'game-a', team1Id: 'recruit_entry', team2Id: 'other', date: '2026-09-01', time: '9:00 AM' }] },
  'leagues/league-a/registrationEntries/entry': { league_id: 'league-a', protocol_id: 'team_config', status: 'assigned', assigned_team_id: 'squad', assignmentVersion: 1,
    answers: { fullName: 'Applicant', email: 'private@example.com', medical: 'private' }, fee_id: 'fee-1', form_version: 3, waiver_id: 'waiver-1', privateAudit: 'private' },
  'scheduleBookings/booking': { sourceId: 'league:league-a', leagueId: 'league-a' },
  'teams/other/events/lg_league-a_game-a': { sourceId: 'league:league-a', leagueId: 'league-a', title: 'Fixture' },
};
const respond = { action: 'respond', leagueId: 'league-a', entryId: 'entry', teamId: 'squad', status: 'accepted', requestId: 'accept-request-0001', expectedVersion: 1, expectedAssignmentVersion: 1 };
const request = body => new Request('http://localhost/api/leagues/assignments', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

for (const uncertainFirst of [false, true]) test(`Team page refreshes remaining same-League assignments only after confirmed success (${uncertainFirst ? 'uncertain retry' : 'ordinary decisions'})`, async () => {
  const { db, records } = communicationDb({ ...fixture,
    'leagues/league-a/registrationEntries/second': { ...fixture['leagues/league-a/registrationEntries/entry'], answers: { fullName: 'Second Applicant' } },
  });
  const app = await loadCommunicationRoute(routePath, db, { uid: 'staff' });
  try {
    const providerSource = await readFile(new URL('../src/components/providers/team-provider.tsx', import.meta.url), 'utf8');
    const helper = providerSource.match(/  const pendingLeagueMutations[\s\S]*?\n  \}, \[db, firebaseAuth\]\);/)[0];
    const respondCallback = providerSource.match(/  const respondToAssignment = useCallback[\s\S]*?\n  \}, \[[^\]]+\]\);/)[0];
    const providerCode = (await transform(`${helper}\n${respondCallback}\nreturn respondToAssignment;`, { loader: 'ts' })).code;
    const bodies = [];
    const statuses = [];
    const activeTeam = { id: 'squad' };
    let gets = 0;
    const transport = async (path, init = {}) => {
      if (init.method === 'PATCH') {
        bodies.push(JSON.parse(init.body));
        const result = await app.route.PATCH(request(bodies.at(-1)));
        statuses.push(result.status);
        if (uncertainFirst && bodies.length === 1) return Response.json({}, { status: 503 });
        return result;
      }
      gets++;
      return app.route.GET({ nextUrl: new URL(path, 'http://localhost') });
    };
    const respondToAssignment = new Function('useRef', 'useCallback', 'db', 'firebaseAuth', 'activeTeam', 'getDoc', 'doc', 'getAuthToken', 'fetch', 'authHeader', 'toast', providerCode)(
      current => ({ current }), fn => fn, {}, {}, activeTeam,
      () => { throw new Error('Displayed versions must not be refreshed before submit'); }, () => {}, async () => 'token', transport, () => ({}), () => {},
    );
    const page = await teamAssignmentPage({ activeTeam, fetch: transport, respondToAssignment });
    const handle = page.render().respond;
    let displayed = [];
    for (let attempts = 0; displayed.length !== 2 && attempts < 100; attempts++) displayed = (await page.settle()).assignments;
    assert.equal(displayed.length, 2);
    const first = displayed.find(entry => entry.id === 'entry');
    await handle(first, 'accepted');
    displayed = page.render().assignments;
    assert.equal(statuses[0], 200);
    if (uncertainFirst) {
      assert.equal(gets, 1);
      assert.equal(displayed.length, 2);
      assert.equal(displayed[0].lifecycleVersion, 1);
      await handle(first, 'accepted');
      displayed = page.render().assignments;
      assert.deepEqual(bodies[1], bodies[0]);
      assert.equal(statuses[1], 200);
    }
    assert.equal(gets, 2, 'confirmed success must reload the authoritative assignment list');
    assert.equal(displayed.length, 1);
    assert.equal(displayed[0].id, 'second');
    assert.equal(displayed[0].lifecycleVersion, 2);
    assert.equal(displayed[0].assignmentVersion, 1);
    await handle(displayed[0], 'accepted');
    displayed = page.render().assignments;
    assert.equal(statuses.at(-1), 200);
    assert.equal(bodies.at(-1).expectedVersion, 2);
    assert.equal(gets, 3);
    assert.deepEqual(displayed, []);
    assert.equal(records.get('leagues/league-a/registrationEntries/second').status, 'accepted');
    page.dispose();
  } finally { app.dispose(); }
});

test('browser retries retain the original identity and displayed staff versions without refreshing them', async () => {
  const source = await readFile(new URL('../src/components/providers/team-provider.tsx', import.meta.url), 'utf8');
  const helper = source.match(/  const pendingLeagueMutations[\s\S]*?\n  \}, \[db, firebaseAuth\]\);/)[0];
  const compiled = (await transform(`${helper}\nreturn requestLeagueMutation;`, { loader: 'ts' })).code;
  for (const displayed of [undefined, { lifecycleVersion: 3, assignmentVersion: 2 }]) {
    let reads = 0;
    const requests = [];
    const callback = new Function('useRef', 'useCallback', 'db', 'firebaseAuth', 'getDoc', 'doc', 'getAuthToken', 'fetch', 'authHeader', compiled)(
      current => ({ current }), fn => fn, {}, {},
      async () => { reads++; return { exists: () => true, data: () => ({ lifecycleVersion: reads === 1 ? 3 : 99 }) }; },
      (...args) => args, async () => 'token', async (path, init) => { requests.push({ path, method: init.method, ...JSON.parse(init.body) }); return Response.json({}, { status: requests.length === 1 ? 503 : 200 }); }, () => ({}),
    );
    const path = displayed ? '/api/leagues/assignments' : '/api/leagues/lifecycle';
    const input = displayed ? { action: 'respond', leagueId: 'league-a', entryId: 'entry', teamId: 'squad', status: 'accepted' } : { action: 'edit', leagueId: 'league-a', updates: { description: 'Metadata' } };
    await callback(path, input, displayed);
    await callback(path, input, displayed);
    assert.deepEqual(requests[1], requests[0]);
    assert.match(requests[0].requestId, /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/);
    assert.equal(requests[0].method, 'PATCH');
    assert.equal(requests[0].expectedVersion, 3);
    assert.equal(reads, displayed ? 0 : 1);
    if (displayed) assert.equal(requests[0].expectedAssignmentVersion, 2);
  }
});

test('acceptance rejected by the schedule recovery lock leaves registration and every projection unchanged', async () => {
  const { db, records } = communicationDb({ ...fixture, 'scheduleBookingLocks/global': { recoveryRequired: true } });
  const before = structuredClone([...records]);
  const app = await loadCommunicationRoute(routePath, db, { uid: 'staff' });
  try {
    const response = await app.route.PATCH(request(respond));
    assert.equal(response.status, 503);
    assert.deepEqual([...records], before);
  } finally { app.dispose(); }
});

test('assigned staff receive only the applicant display identity and assignment concurrency tokens', async () => {
  const { db } = communicationDb(fixture);
  const app = await loadCommunicationRoute(routePath, db, { uid: 'staff' });
  try {
    const response = await app.route.GET({ nextUrl: new URL('http://localhost/api/leagues/assignments?teamId=squad') });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).assignments, [{ id: 'entry', league_id: 'league-a', protocol_id: 'team_config', status: 'assigned', assigned_team_id: 'squad', answers: { fullName: 'Applicant' }, lifecycleVersion: 1, assignmentVersion: 1 }]);
  } finally { app.dispose(); }
});

test('acceptance replay returns the original result without another mutation and rejects a stale conflicting response', async () => {
  const { db, records } = communicationDb({ ...fixture, 'leagues/league-a': { ...fixture['leagues/league-a'], schedule: [] } }, { serializeTransactions: true });
  const app = await loadCommunicationRoute(routePath, db, { uid: 'staff' });
  try {
    const first = await app.route.PATCH(request(respond));
    assert.equal(first.status, 200);
    const before = structuredClone([...records]);
    const second = await app.route.PATCH(request(respond));
    assert.equal(second.status, 200);
    assert.deepEqual(await second.json(), await first.json());
    assert.deepEqual([...records], before);
    const conflict = await app.route.PATCH(request({ ...respond, requestId: 'accept-request-0002', status: 'declined' }));
    assert.equal(conflict.status, 409);
    assert.equal(records.get('leagues/league-a/registrationEntries/entry').fee_id, 'fee-1');
  } finally { app.dispose(); }
});

test('pending assignment create and revoke replay once while preserving Registration identity', async () => {
  const { db, records } = communicationDb({ ...fixture, 'leagues/league-a/registrationEntries/entry': { ...fixture['leagues/league-a/registrationEntries/entry'], status: 'pending', assigned_team_id: null } });
  const app = await loadCommunicationRoute(routePath, db, { uid: 'owner' });
  try {
    const assign = { action: 'assign', leagueId: 'league-a', entryId: 'entry', teamId: 'squad', requestId: 'assign-request-0001', expectedVersion: 1, expectedAssignmentVersion: 1 };
    const first = await app.route.PATCH(request(assign));
    assert.equal(first.status, 200);
    const assigned = structuredClone([...records]);
    assert.equal((await app.route.PATCH(request(assign))).status, 200);
    assert.deepEqual([...records], assigned);
    assert.equal([...records.keys()].filter(path => path.startsWith('teams/squad/alerts/')).length, 1);
    const revoke = { ...assign, requestId: 'revoke-request-0001', teamId: null, expectedVersion: 2, expectedAssignmentVersion: 2 };
    assert.equal((await app.route.PATCH(request(revoke))).status, 200);
    const revoked = structuredClone([...records]);
    assert.equal((await app.route.PATCH(request(revoke))).status, 200);
    assert.deepEqual([...records], revoked);
    const entry = records.get('leagues/league-a/registrationEntries/entry');
    assert.equal(entry.status, 'pending');
    assert.equal(entry.assigned_team_id, null);
    assert.equal(records.get('leagues/league-a').teams.recruit_entry.status, 'pending');
    assert.deepEqual(records.get('leagues/league-a').schedule, []);
    assert.deepEqual([entry.fee_id, entry.form_version, entry.waiver_id], ['fee-1', 3, 'waiver-1']);
  } finally { app.dispose(); }
});

test('accepted enrollment cannot be revoked or reassigned through the assignment boundary', async () => {
  const { db, records } = communicationDb({ ...fixture, 'leagues/league-a/registrationEntries/entry': { ...fixture['leagues/league-a/registrationEntries/entry'], status: 'accepted' } });
  const app = await loadCommunicationRoute(routePath, db, { uid: 'owner' });
  try {
    const before = structuredClone([...records]);
    for (const teamId of [null, 'squad']) {
      const response = await app.route.PATCH(request({ action: 'assign', leagueId: 'league-a', entryId: 'entry', teamId, requestId: 'revoke-accepted-0001', expectedVersion: 1, expectedAssignmentVersion: 1 }));
      assert.equal(response.status, 409);
      assert.deepEqual([...records], before);
    }
  } finally { app.dispose(); }
});

test('commit failure rolls back acceptance, schedule clear, and both team projections together', async () => {
  const { db, records } = communicationDb(fixture);
  const original = db.runTransaction.bind(db);
  db.runTransaction = work => original(async transaction => {
    let mutation = false;
    const wrapped = { ...transaction, update(ref, ...args) { if (ref.path === 'leagues/league-a/registrationEntries/entry') mutation = true; return transaction.update(ref, ...args); } };
    const result = await work(wrapped);
    if (mutation) throw new Error('Injected Firestore commit failure');
    return result;
  });
  const app = await loadCommunicationRoute(routePath, db, { uid: 'staff' });
  try {
    const before = structuredClone([...records]);
    assert.equal((await app.route.PATCH(request(respond))).status, 503);
    assert.deepEqual([...records], before);
  } finally { app.dispose(); }
});

test('acceptance clears affected fixture projections in the same commit and keeps ordinary events', async () => {
  const { db, records } = communicationDb({ ...fixture,
    'leagues/league-a': { ...fixture['leagues/league-a'], teams: { ...fixture['leagues/league-a'].teams, squad: { ...fixture['leagues/league-a'].teams.squad, division: 'Senior', origin: 'Existing', coachEmail: 'private@example.com' } } },
    'teams/squad/events/practice': { eventType: 'practice', title: 'Keep' },
  });
  const app = await loadCommunicationRoute(routePath, db, { uid: 'staff' });
  try {
    assert.equal((await app.route.PATCH(request(respond))).status, 200);
    assert.deepEqual(records.get('leagues/league-a').schedule, []);
    assert.equal(records.has('scheduleBookings/booking'), false);
    assert.equal(records.has('teams/other/events/lg_league-a_game-a'), false);
    assert.equal(records.get('teams/squad').leagueIds['league-a'], true);
    assert.equal(records.get('leagues/league-a').teams.squad.division, 'Senior');
    assert.equal(records.get('leagues/league-a').teams.squad.origin, 'Existing');
    assert.equal(records.get('leagues/league-a').teams.squad.coachEmail, undefined);
    assert.equal(records.get('teams/squad/events/practice').title, 'Keep');
    assert.equal(records.get('leagues/league-a/registrationEntries/entry').status, 'accepted');
  } finally { app.dispose(); }
});

test('displayed assignment versions reject reassignment and conflicting concurrent decisions', async () => {
  for (const change of [{ assignmentVersion: 2 }, { assigned_team_id: 'other' }, { status: 'declined' }]) {
    const { db, records } = communicationDb({ ...fixture, 'leagues/league-a/registrationEntries/entry': { ...fixture['leagues/league-a/registrationEntries/entry'], ...change } });
    const before = structuredClone([...records]);
    const app = await loadCommunicationRoute(routePath, db, { uid: 'staff' });
    try {
      assert.equal((await app.route.PATCH(request(respond))).status, 409);
      assert.deepEqual([...records], before);
    } finally { app.dispose(); }
  }
  const { db, records } = communicationDb(fixture, { serializeTransactions: true });
  const app = await loadCommunicationRoute(routePath, db, { uid: 'staff' });
  try {
    const responses = await Promise.all([app.route.PATCH(request(respond)), app.route.PATCH(request({ ...respond, requestId: 'decision-race-0002', status: 'declined' }))]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
    assert.equal([...records.keys()].filter(path => path.startsWith('competitionOperations/')).length, 1);
  } finally { app.dispose(); }
});

test('assignment commits revalidate staff demotion, entitlement, tenant and lifecycle', async () => {
  for (const changed of ['demotion', 'plan', 'tenant', 'archive']) {
    let count = 0;
    const { db, records } = communicationDb({ ...fixture,
      'teams/squad': { ...fixture['teams/squad'], ownerUserId: 'other-owner' },
      'teams/squad/members/staff': { userId: 'staff', position: 'Coach', status: 'active' },
    }, { beforeTransaction({ records: mutable }) {
      if (++count !== 3) return;
      if (changed === 'demotion') mutable.set('teams/squad/members/staff', { userId: 'staff', position: 'Player', status: 'active' });
      if (changed === 'plan') mutable.set('teams/squad', { ...mutable.get('teams/squad'), planId: 'free' });
      if (changed === 'tenant') mutable.set('leagues/league-a', { ...mutable.get('leagues/league-a'), tenantId: 'other' });
      if (changed === 'archive') mutable.set('leagues/league-a', { ...mutable.get('leagues/league-a'), isArchived: true });
    } });
    const entryBefore = structuredClone(records.get('leagues/league-a/registrationEntries/entry'));
    const app = await loadCommunicationRoute(routePath, db, { uid: 'staff' });
    try {
      const response = await app.route.PATCH(request(respond));
      assert.equal(response.status, ['demotion', 'plan'].includes(changed) ? 403 : 409, changed);
      assert.deepEqual(records.get('leagues/league-a/registrationEntries/entry'), entryBefore);
      assert.equal(records.has('scheduleBookings/booking'), true);
    } finally { app.dispose(); }
  }
});
