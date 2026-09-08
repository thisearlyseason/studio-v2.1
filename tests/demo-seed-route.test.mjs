import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { communicationDb, loadCommunicationRoute } from './helpers/communication-route-harness.mjs';

test('pending demo youth identity is not falsely bound to a nonexistent login', async () => {
  const seeder = await import('../src/lib/db-seeder.ts');
  assert.deepEqual(seeder.pendingDemoYouthIdentity(), {
    hasLogin: false,
  });
  assert.deepEqual(seeder.pendingDemoYouthIdentity('alex@example.test'), {
    hasLogin: false,
    pendingInviteEmail: 'alex@example.test',
  });
  assert.equal('userId' in seeder.pendingDemoYouthIdentity('alex@example.test'), false);
});

const routePath = '../../src/app/api/demo/seed/route.ts';
const request = (body, method = 'POST') => new Request('http://127.0.0.1/api/demo/seed', {
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

test('foreign demo facilities block bootstrap before any victim cleanup or write', async () => {
  for (const kind of ['main', 'secondary']) {
    const uid = 'demo-user-alpha-0001';
    const namespace = 'cf6ee6fe230ff5643bc9104c';
    const { db, records } = communicationDb({
      [`facilities/fac_${kind}_${namespace}`]: { clubId: 'attacker', isDemo: true },
      'scheduleBookings/victim': { leagueId: `demo_league_${namespace}` },
      'scheduleBookings/victim-team': { hostTeamId: `demo_elite_${namespace}_premierdivision` },
    });
    const before = structuredClone([...records]);
    const app = await loadCommunicationRoute(routePath, db, { uid, signInProvider: 'anonymous' });
    try {
      const response = await app.route.POST(request({ planId: 'elite' }));
      assert.equal(response.status, 403, kind);
      assert.deepEqual([...records], before, 'no profile, league, team, facility, or booking mutation');
    } finally {
      app.dispose();
    }
  }
});

test('demo bootstrap creates facility blueprints under the authenticated full UID and rejects client targets', async () => {
  const uid = 'demo-user-alpha-0001';
  const namespace = 'cf6ee6fe230ff5643bc9104c';
  const { db, records } = communicationDb({});
  const app = await loadCommunicationRoute(routePath, db, { uid, signInProvider: 'anonymous' });
  try {
    assert.equal((await app.route.POST(request({ planId: 'elite', demoNamespace: 'victim', facilityId: 'victim' }))).status, 400);
    assert.equal(records.size, 0);
    assert.equal((await app.route.POST(request({ planId: 'elite' }))).status, 200);
    const main = records.get(`facilities/fac_main_${namespace}`);
    assert.equal(main?.clubId, uid);
    assert.equal(main.demoSessionOwnerId, uid);
    assert.equal(main.demoPlanId, 'elite');
    assert.equal(main.name, 'Apex Performance Center');
    assert.equal(records.get(`facilities/fac_main_${namespace}/fields/res_main_arena_${namespace}`)?.name, 'Main Arena');
    assert.equal(records.get(`facilities/fac_secondary_${namespace}`)?.clubId, uid);
    assert.equal(records.get(`facilities/fac_secondary_${namespace}/fields/res2_turf_field_1_${namespace}`)?.facilityId, `fac_secondary_${namespace}`);
    const outsider = await loadCommunicationRoute(routePath, db, { uid: 'demo-user-beta-0001', signInProvider: 'anonymous' });
    try {
      assert.equal((await outsider.route.POST(request({ planId: 'elite' }))).status, 200);
      assert.equal(records.get('facilities/fac_main_c6cd96a0d7b084a5e6c52e76')?.clubId, 'demo-user-beta-0001');
      assert.deepEqual(records.get(`facilities/fac_main_${namespace}`), main);
    } finally {
      outsider.dispose();
    }
  } finally {
    app.dispose();
  }
});

test('elite demo bootstrap server-seeds tournament events for every protected squad', async () => {
  const uid = 'demo-user-elite-tournament-0001';
  const { db, records } = communicationDb({});
  const app = await loadCommunicationRoute(routePath, db, { uid, signInProvider: 'anonymous' });
  try {
    const response = await app.route.POST(request({ planId: 'elite_teams' }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.teamIds.length, 3);
    for (const teamId of body.teamIds) {
      const event = records.get(`teams/${teamId}/events/tourn_${teamId}`);
      assert.equal(event?.isTournament, true);
      assert.equal(event?.eventType, 'tournament');
      assert.ok(event?.tournamentTeamsData?.length >= 2);
      assert.ok(event?.tournamentGames?.length >= 1);
      assert.equal(records.get(`teams/${teamId}/feedPosts/demo_feed_1_${teamId}`)?.isDemo, true);
      assert.equal(records.get(`teams/${teamId}/incidents/demo_incident_${teamId}`)?.isDemo, true);
      assert.equal(records.get(`teams/${teamId}/files/demo_file_${teamId}`)?.isDemo, true);
      assert.equal(records.get(`teams/${teamId}/groupChats/chat1_${teamId}`)?.memberIds?.includes(uid), true);
      assert.equal(records.get(`teams/${teamId}/members/u3_${teamId}/signatures/demo_waiver_${teamId}`)?.isDemo, true);
    }
    const primaryTeamId = body.primaryTeamId;
    const hub = records.get(`teams/${primaryTeamId}/groupChats/hub_broadcast_elite_${body.demoNamespace}`);
    assert.equal(hub?.isHubChannel, true);
    assert.equal(hub?.memberIds?.includes(uid), true);
  } finally {
    app.dispose();
  }
});

test('parent demo bootstrap server-seeds protected tournaments and leaves no client tournament write', async () => {
  const uid = 'demo-user-parent-tournament-0001';
  const { db, records } = communicationDb({});
  const app = await loadCommunicationRoute(routePath, db, { uid, signInProvider: 'anonymous' });
  try {
    const response = await app.route.POST(request({ planId: 'parent_demo' }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.teamIds.length, 2);
    for (const teamId of body.teamIds) {
      const event = records.get(`teams/${teamId}/events/tourn_${teamId}`);
      assert.equal(event?.isTournament, true);
      assert.equal(event?.eventType, 'tournament');
    }
    const clientSeeder = await readFile(new URL('../src/lib/db-seeder.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(clientSeeder, /batch\.set\(doc\(db, 'teams', tid, 'events', tournamentId\)/);
  } finally {
    app.dispose();
  }
});

test('school demo bootstrap server-seeds its protected hub broadcast channel', async () => {
  const uid = 'demo-user-school-hub-0001';
  const { db, records } = communicationDb({});
  const app = await loadCommunicationRoute(routePath, db, { uid, signInProvider: 'anonymous' });
  try {
    const response = await app.route.POST(request({ planId: 'school_demo' }));
    assert.equal(response.status, 200);
    const body = await response.json();
    const institutionId = body.teamIds.find(teamId => teamId.endsWith('_institution'));
    const hub = records.get(`teams/${institutionId}/groupChats/hub_broadcast_${body.demoNamespace}`);
    assert.equal(hub?.isHubChannel, true);
    assert.equal(hub?.memberIds?.includes(uid), true);
  } finally {
    app.dispose();
  }
});

test('demo identity uses the full authenticated UID and rejects a foreign deterministic shell before cleanup', async () => {
  const uid = 'demo-user-alpha-0001';
  const namespace = 'cf6ee6fe230ff5643bc9104c';
  const leagueId = `demo_league_${namespace}`;
  const { db, records } = communicationDb({
    [`leagues/${leagueId}`]: {
      isDemo: true,
      demoSeeded: true,
      demoSessionOwnerId: 'different-user',
      creatorId: 'different-user',
      tenantId: 'profile:different-user',
    },
    'scheduleBookings/protected': { leagueId },
  });
  const app = await loadCommunicationRoute(routePath, db, { uid, signInProvider: 'anonymous' });
  try {
    const response = await app.route.POST(request({ planId: 'league_demo' }));
    assert.equal(response.status, 403);
    assert.equal(records.has('scheduleBookings/protected'), true);
    assert.equal(records.get(`leagues/${leagueId}`).creatorId, 'different-user');
  } finally {
    app.dispose();
  }
});

test('demo bootstrap cannot overwrite a foreign team shell or delete its bookings', async () => {
  const uid = 'demo-user-gamma-0001';
  const namespace = '75868bf50bbfcb006697f8ae';
  const teamId = `demo_squad_pro_${namespace}_main`;
  const { db, records } = communicationDb({
    [`teams/${teamId}`]: { isDemo: true, demoSessionOwnerId: 'different-user', demoPlanId: 'squad_pro' },
    'scheduleBookings/protected-team-booking': { hostTeamId: teamId },
  });
  const app = await loadCommunicationRoute(routePath, db, { uid, signInProvider: 'anonymous' });
  try {
    const response = await app.route.POST(request({ planId: 'squad_pro' }));
    assert.equal(response.status, 403);
    assert.equal(records.has('scheduleBookings/protected-team-booking'), true);
    assert.equal(records.get(`teams/${teamId}`).demoSessionOwnerId, 'different-user');
  } finally {
    app.dispose();
  }
});

test('demo blueprint ignores no client fixture authority and derives teams and schedule server-side', async () => {
  const uid = 'demo-user-beta-0001';
  const namespace = 'c6cd96a0d7b084a5e6c52e76';
  const leagueId = `demo_league_${namespace}`;
  const { db, records } = communicationDb({});
  const app = await loadCommunicationRoute(routePath, db, { uid, signInProvider: 'anonymous' });
  try {
    const bootstrap = await app.route.POST(request({ planId: 'league_demo' }));
    assert.equal(bootstrap.status, 200);
    assert.deepEqual(await bootstrap.json(), {
      ok: true,
      planId: 'league_demo',
      demoNamespace: namespace,
      leagueId,
      teamIds: [],
      primaryTeamId: null,
    });

    const malicious = await app.route.PUT(request({
      planId: 'league_demo',
      league: { creatorId: 'attacker', tenantId: 'profile:attacker', memberUserIds: ['attacker'], teams: { forged: {} }, schedule: [{ id: 'forged' }] },
    }, 'PUT'));
    assert.equal(malicious.status, 400);

    const blueprint = await app.route.PUT(request({ planId: 'league_demo' }, 'PUT'));
    assert.equal(blueprint.status, 200);
    const league = records.get(`leagues/${leagueId}`);
    assert.equal(league.creatorId, uid);
    assert.equal(league.billingOwnerUserId, uid);
    assert.equal(league.tenantId, `profile:${uid}`);
    assert.deepEqual(league.memberUserIds, [uid]);
    assert.equal(Object.keys(league.teams).length, 6);
    assert.equal(league.schedule.length, 6);
    assert.equal(league.schedule.some(game => game.id === 'forged'), false);
  } finally {
    app.dispose();
  }
});
