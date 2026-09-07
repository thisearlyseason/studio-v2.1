import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { communicationDb, loadCommunicationRoute } from './helpers/communication-route-harness.mjs';
import { hashLeagueScorekeeperPin, verifyLeagueScorekeeperPin } from '../src/lib/server-competition-credential.ts';

const routePath = '../../src/app/api/leagues/lifecycle/route.ts';
const credentialSecret = 'round-one-test-secret-that-is-at-least-32-bytes';
process.env.COMPETITION_CREDENTIAL_HMAC_SECRET = credentialSecret;
const teamSeed = {
  'users/owner-a': { role: 'coach', plan_type: 'elite_league' },
  'users/member-a': { role: 'parent', plan_type: 'elite_league' },
  'users/owner-b': { role: 'coach', plan_type: 'elite_league' },
  'teams/team-a': { ownerUserId: 'owner-a', planId: 'elite_league', leagueIds: {} },
  'teams/team-a/members/member-a': { userId: 'member-a', position: 'Player', status: 'active' },
  'teams/team-b': { ownerUserId: 'owner-b', planId: 'elite_league', leagueIds: {} },
};

function request(body, method = 'POST') {
  return new Request('http://127.0.0.1/api/leagues/lifecycle', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function call(db, auth, body, method = 'POST') {
  const app = await loadCommunicationRoute(routePath, db, auth);
  try {
    const response = await app.route[method](request(body, method));
    return { response, body: await response.json() };
  } finally {
    app.dispose();
  }
}

test('creation requires current competition management authority and rejects anonymous callers', async () => {
  for (const [auth, expected] of [
    [{ uid: 'member-a' }, 403],
    [{ uid: 'owner-a', signInProvider: 'anonymous' }, 403],
    [Response.json({ error: 'unauthorized' }, { status: 401 }), 401],
  ]) {
    const { db } = communicationDb(teamSeed);
    const result = await call(db, auth, {
      action: 'create', requestId: `create-authority-${expected}`, teamId: 'team-a', name: 'Metro', sport: 'Soccer',
    });
    assert.equal(result.response.status, expected);
  }
});

test('create is replay-safe and serializes duplicate names and the final profile quota slot', async () => {
  const replayRun = communicationDb(teamSeed, { serializeTransactions: true });
  const create = {
    action: 'create', requestId: 'create-replay-0001', teamId: 'team-a', name: ' Metro League ', sport: 'Soccer', divisionTitle: 'Gold',
  };
  const app = await loadCommunicationRoute(routePath, replayRun.db, { uid: 'owner-a' });
  try {
    const [first, second] = await Promise.all([app.route.POST(request(create)), app.route.POST(request(create))]);
    assert.deepEqual(await second.clone().json(), await first.clone().json());
    assert.equal([first.status, second.status].every(status => status === 201), true);
    assert.equal([...replayRun.records.keys()].filter(path => path.startsWith('leagues/')).length, 1);
    const created = await first.json();
    assert.equal(created.action, 'create');
    assert.equal(created.lifecycleVersion, 1);
    const audit = [...replayRun.records].find(([path]) => path.startsWith('leagueLifecycleAudits/'))?.[1];
    assert.equal(audit.leagueId, created.leagueId);
  } finally {
    app.dispose();
  }

  const duplicateRun = communicationDb(teamSeed, { serializeTransactions: true });
  const duplicateApp = await loadCommunicationRoute(routePath, duplicateRun.db, { uid: 'owner-a' });
  try {
    const results = await Promise.all([
      duplicateApp.route.POST(request({ ...create, requestId: 'create-name-race-0001' })),
      duplicateApp.route.POST(request({ ...create, requestId: 'create-name-race-0002', name: 'metro league' })),
    ]);
    assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  } finally {
    duplicateApp.dispose();
  }

  const quotaRun = communicationDb({
    'users/creator': { role: 'league_creator', plan_type: 'free' },
  }, { serializeTransactions: true });
  const quotaApp = await loadCommunicationRoute(routePath, quotaRun.db, { uid: 'creator' });
  try {
    const results = await Promise.all([
      quotaApp.route.POST(request({ action: 'create', requestId: 'profile-quota-0001', name: 'One', sport: 'Soccer' })),
      quotaApp.route.POST(request({ action: 'create', requestId: 'profile-quota-0002', name: 'Two', sport: 'Soccer' })),
    ]);
    assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
    const league = [...quotaRun.records].find(([path]) => path.startsWith('leagues/'))[1];
    assert.equal(league.tenantId, 'profile:creator');
  } finally {
    quotaApp.dispose();
  }
});

test('the same request identity with changed payload returns 409 without a second mutation or audit', async () => {
  const { db, records } = communicationDb(teamSeed, { serializeTransactions: true });
  const app = await loadCommunicationRoute(routePath, db, { uid: 'owner-a' });
  try {
    const first = await app.route.POST(request({
      action: 'create', requestId: 'create-collision-0001', teamId: 'team-a', name: 'Metro', sport: 'Soccer',
    }));
    const collision = await app.route.POST(request({
      action: 'create', requestId: 'create-collision-0001', teamId: 'team-a', name: 'Changed', sport: 'Soccer',
    }));
    assert.equal(first.status, 201);
    assert.equal(collision.status, 409);
    assert.equal([...records].filter(([path]) => /^leagues\/[^/]+$/.test(path)).length, 1);
    assert.equal([...records].filter(([path]) => path.startsWith('leagueLifecycleAudits/')).length, 1);
  } finally {
    app.dispose();
  }
});

test('delegated staff use tenant-owner quota and owner-created legacy identity records', async () => {
  const seed = {
    ...teamSeed,
    'users/owner-a': { role: 'coach', plan_type: 'league', subscription_status: 'active', team_limit: 2 },
    'users/staff-a': { role: 'coach', plan_type: 'free' },
    'teams/team-a/members/staff-a': { userId: 'staff-a', position: 'Assistant Coach', status: 'active' },
    'leagues/owner-legacy': {
      id: 'owner-legacy', creatorId: 'owner-a', memberTeamIds: ['team-a'], teams: { 'team-a': {} },
      lifecycleVersion: 0, name: 'Owner Legacy', sport: 'Soccer', schedule: [],
    },
  };
  const { db, records } = communicationDb(seed, { serializeTransactions: true });
  const app = await loadCommunicationRoute(routePath, db, { uid: 'staff-a' });
  try {
    const duplicate = await app.route.POST(request({
      action: 'create', requestId: 'staff-duplicate-0001', teamId: 'team-a', name: 'Owner Legacy', sport: 'Soccer',
    }));
    assert.equal(duplicate.status, 409);
    const second = await app.route.POST(request({
      action: 'create', requestId: 'staff-create-0001', teamId: 'team-a', name: 'Second', sport: 'Soccer',
    }));
    const overQuota = await app.route.POST(request({
      action: 'create', requestId: 'staff-create-0002', teamId: 'team-a', name: 'Third', sport: 'Soccer',
    }));
    assert.equal(second.status, 201);
    assert.equal(overQuota.status, 409);
    assert.equal([...records].filter(([path, data]) => /^leagues\/[^/]+$/.test(path) && data.tenantId === 'team-a').length, 1);
  } finally {
    app.dispose();
  }
});

test('edits revalidate authority and tenant inside the commit and migrate deterministic legacy ownership', async () => {
  let transaction = 0;
  const demotionRun = communicationDb({
    ...teamSeed,
    'teams/team-a/members/staff-a': { userId: 'staff-a', position: 'Coach', status: 'active' },
    'users/staff-a': { role: 'coach', plan_type: 'elite_league' },
    'leagues/legacy-a': { id: 'legacy-a', creatorId: 'owner-a', memberTeamIds: ['team-a'], teams: { 'team-a': {} }, lifecycleVersion: 0, name: 'Legacy', sport: 'Soccer', schedule: [{ id: 'game-1' }] },
  }, {
    beforeTransaction: ({ records }) => {
      transaction += 1;
      if (transaction === 2) records.set('teams/team-a/members/staff-a', { userId: 'staff-a', position: 'Player', status: 'active' });
    },
  });
  const denied = await call(demotionRun.db, { uid: 'staff-a' }, {
    action: 'edit', requestId: 'edit-demotion-0001', leagueId: 'legacy-a', expectedVersion: 0, updates: { description: 'Denied' },
  }, 'PATCH');
  assert.equal(denied.response.status, 403);
  assert.equal(demotionRun.records.get('leagues/legacy-a').description, undefined);

  const legacyRun = communicationDb({
    ...teamSeed,
    'leagues/legacy-a': { id: 'legacy-a', creatorId: 'owner-a', memberTeamIds: ['team-a'], teams: { 'team-a': {} }, lifecycleVersion: 0, name: 'Legacy', sport: 'Soccer', schedule: [{ id: 'game-1' }] },
  });
  const edited = await call(legacyRun.db, { uid: 'owner-a' }, {
    action: 'edit', requestId: 'edit-legacy-0001', leagueId: 'legacy-a', expectedVersion: 0, updates: { description: 'Updated' },
  }, 'PATCH');
  assert.equal(edited.response.status, 200);
  assert.equal(legacyRun.records.get('leagues/legacy-a').tenantId, 'team-a');
  assert.deepEqual(legacyRun.records.get('leagues/legacy-a').schedule, [{ id: 'game-1' }]);

  const teamB = await call(legacyRun.db, { uid: 'owner-b' }, {
    action: 'edit', requestId: 'edit-team-b-0001', leagueId: 'legacy-a', expectedVersion: 1, updates: { description: 'Cross tenant' },
  }, 'PATCH');
  assert.equal(teamB.response.status, 403);
});

test('a tenant change between preflight and commit cannot be overwritten by stale authority', async () => {
  let transaction = 0;
  const { db, records } = communicationDb({
    ...teamSeed,
    'teams/team-b': { ownerUserId: 'owner-a', planId: 'elite_league', leagueIds: {} },
    'leagues/league-a': { id: 'league-a', creatorId: 'owner-a', tenantId: 'team-a', lifecycleVersion: 1, name: 'Metro', sport: 'Soccer' },
  }, {
    beforeTransaction: ({ records: mutableRecords }) => {
      transaction += 1;
      if (transaction === 2) mutableRecords.set('leagues/league-a', {
        ...mutableRecords.get('leagues/league-a'),
        tenantId: 'team-b',
      });
    },
  });
  const result = await call(db, { uid: 'owner-a' }, {
    action: 'edit', requestId: 'edit-tenant-race-0001', leagueId: 'league-a', expectedVersion: 1, updates: { description: 'Stale tenant write' },
  }, 'PATCH');
  assert.equal(result.response.status, 409);
  assert.equal(records.get('leagues/league-a').tenantId, 'team-b');
  assert.equal(records.get('leagues/league-a').description, undefined);
});

test('name and quota checks ignore deterministic legacy leagues owned in another tenant', async () => {
  const { db, records } = communicationDb({
    ...teamSeed,
    'teams/team-c': { ownerUserId: 'owner-a', planId: 'elite_league', leagueIds: {} },
    'leagues/team-c-legacy': {
      id: 'team-c-legacy', creatorId: 'owner-a', memberTeamIds: ['team-c'], teams: { 'team-c': {} },
      lifecycleVersion: 0, name: 'Metro', sport: 'Soccer', schedule: [],
    },
  });
  const result = await call(db, { uid: 'owner-a' }, {
    action: 'create', requestId: 'create-other-tenant-0001', teamId: 'team-a', name: 'Metro', sport: 'Soccer',
  });
  assert.equal(result.response.status, 201);
  const created = [...records.entries()].find(([path, data]) => path.startsWith('leagues/') && data.tenantId === 'team-a');
  assert.ok(created);
});

test('edit validates topology and dates, preserves schedules, and fails safe at the future schedule boundary', async () => {
  const seed = {
    ...teamSeed,
    'leagues/league-a': { id: 'league-a', creatorId: 'owner-a', tenantId: 'team-a', lifecycleVersion: 2, name: 'Metro', sport: 'Soccer', startDate: '2026-09-01', endDate: '2026-10-01', schedule: [{ id: 'game-1' }] },
  };
  for (const updates of [
    { creatorId: 'member-a' },
    { startDate: '2026-02-30' },
    { startDate: '2026-11-01', endDate: '2026-10-01' },
  ]) {
    const { db } = communicationDb(seed);
    const result = await call(db, { uid: 'owner-a' }, {
      action: 'edit', requestId: `invalid-edit-${JSON.stringify(updates).length}`, leagueId: 'league-a', expectedVersion: 2, updates,
    }, 'PATCH');
    assert.equal(result.response.status, 400);
  }
  const { db, records } = communicationDb(seed);
  const blocked = await call(db, { uid: 'owner-a' }, {
    action: 'edit', requestId: 'schedule-boundary-0001', leagueId: 'league-a', expectedVersion: 2, updates: { startDate: '2026-09-02' },
  }, 'PATCH');
  assert.equal(blocked.response.status, 409);
  assert.deepEqual(records.get('leagues/league-a').schedule, [{ id: 'game-1' }]);

  const configuredRun = communicationDb({
    ...teamSeed,
    'leagues/configured': {
      id: 'configured', creatorId: 'owner-a', tenantId: 'team-a', lifecycleVersion: 2,
      name: 'Configured', sport: 'Soccer', startDate: '2026-09-01', endDate: '2026-10-01',
      schedule: [], schedulerConfig: { gamesPerTeam: 8, startDate: '2026-09-01', endDate: '2026-10-01' },
    },
  });
  const configuredBlocked = await call(configuredRun.db, { uid: 'owner-a' }, {
    action: 'edit', requestId: 'configured-boundary-0001', leagueId: 'configured', expectedVersion: 2, updates: { endDate: '2026-10-15' },
  }, 'PATCH');
  assert.equal(configuredBlocked.response.status, 409);
  assert.equal(configuredRun.records.get('leagues/configured').endDate, '2026-10-01');

  const invalidRequest = await call(db, { uid: 'owner-a' }, {
    action: 'edit', requestId: 'short', leagueId: 'league-a', expectedVersion: 2, updates: { description: 'Invalid request identity' },
  }, 'PATCH');
  assert.equal(invalidRequest.response.status, 400);
});

test('sensitive edits move credentials, applicant contacts, and team contacts off the member-readable root', async () => {
  const { db, records } = communicationDb({
    ...teamSeed,
    'leagues/league-a': {
      id: 'league-a', creatorId: 'owner-a', tenantId: 'team-a', lifecycleVersion: 1, name: 'Metro', sport: 'Soccer',
      memberUserIds: ['owner-a', 'member-a'], scorekeeperPin: 'legacy', contactEmail: 'old@example.test',
      teams: { 'team-a': { teamName: 'Falcons', coachName: 'Coach Private', coachEmail: 'coach@example.test', coachPhone: '555-0110', organizerNotes: 'private', inviteCode: 'SECRET', wins: 2 } },
      individualRecruits: { 'recruit-a': { name: 'Applicant', email: 'applicant@example.test', phone: '555-0120', guardian_email: 'guardian@example.test', status: 'pending', teamId: null } },
    },
  });
  const result = await call(db, { uid: 'owner-a' }, {
    action: 'edit', requestId: 'sensitive-edit-0001', leagueId: 'league-a', expectedVersion: 1,
    updates: { scorekeeperPin: '8274', contactEmail: 'ops@example.test', contactPhone: '555-0100', description: 'Public description' },
  }, 'PATCH');
  assert.equal(result.response.status, 200);
  const root = records.get('leagues/league-a');
  for (const field of ['scorekeeperPin', 'scorekeeperPinHash', 'contactEmail', 'contactPhone', 'individualRecruits']) assert.equal(field in root, false, field);
  for (const field of ['coachName', 'coachEmail', 'coachPhone', 'organizerNotes', 'inviteCode']) assert.equal(field in root.teams['team-a'], false, field);
  assert.equal(root.teams['team-a'].teamName, 'Falcons');
  assert.equal(root.teams['team-a'].wins, 2);
  assert.equal(root.description, 'Public description');
  const privateData = records.get('leagues/league-a/private/lifecycle');
  assert.equal(privateData.contactEmail, 'ops@example.test');
  assert.equal(privateData.teamContacts['team-a'].coachEmail, 'coach@example.test');
  assert.equal(privateData.individualRecruits['recruit-a'].guardian_email, 'guardian@example.test');
  const expected = createHmac('sha256', credentialSecret).update('league-scorekeeper:league-a\0' + '8274').digest('hex');
  assert.equal(privateData.scorekeeperPinHash, `hmac-sha256:v1:${expected}`);
});

test('scorekeeper HMAC verification accepts active and rotated secrets without plaintext or public hashing', async () => {
  const { db } = communicationDb(teamSeed);
  void db;
  const oldSecret = 'previous-round-secret-that-is-at-least-32-bytes';
  const stored = hashLeagueScorekeeperPin('league-a', '8274', [oldSecret]);
  assert.equal(verifyLeagueScorekeeperPin('league-a', '8274', stored, [credentialSecret, oldSecret]), true);
  assert.equal(verifyLeagueScorekeeperPin('league-a', 'wrong', stored, [credentialSecret, oldSecret]), false);
  assert.equal(verifyLeagueScorekeeperPin('other-league', '8274', stored, [credentialSecret, oldSecret]), false);
  assert.equal(stored.includes('8274'), false);
  assert.throws(() => hashLeagueScorekeeperPin('league-a', '8274', []), /SECRET_MISSING/);
});

test('anonymous seeded demos edit only through the server lifecycle boundary', async () => {
  const { db, records } = communicationDb({
    'users/demo-user': { role: 'coach', plan_type: 'league', subscription_status: 'active', isDemo: true },
    'leagues/demo-league': {
      id: 'demo-league', creatorId: 'demo-user', tenantId: 'profile:demo-user', lifecycleVersion: 0,
      memberUserIds: ['demo-user'], memberTeamIds: [], teams: {}, isDemo: true, demoSeeded: true,
      demoSessionOwnerId: 'demo-user', name: 'Demo League', sport: 'Soccer', schedule: [],
    },
  });
  const result = await call(db, { uid: 'demo-user', signInProvider: 'anonymous' }, {
    action: 'edit', requestId: 'demo-edit-0001', leagueId: 'demo-league', expectedVersion: 0,
    updates: { description: 'Server-owned demo metadata' },
  }, 'PATCH');
  assert.equal(result.response.status, 200);
  assert.equal(records.get('leagues/demo-league').description, 'Server-owned demo metadata');
  assert.equal(records.get('leagues/demo-league').lifecycleVersion, 1);
  const denied = await call(db, { uid: 'demo-user', signInProvider: 'anonymous' }, {
    action: 'archive', requestId: 'demo-archive-0001', leagueId: 'demo-league', expectedVersion: 1,
  }, 'PATCH');
  assert.equal(denied.response.status, 403);
});

test('archive retains the league and immutable audit, while dependent delete is rejected', async () => {
  const { db, records } = communicationDb({
    ...teamSeed,
    'leagues/league-a': { id: 'league-a', creatorId: 'owner-a', tenantId: 'team-a', lifecycleVersion: 1, name: 'Metro', sport: 'Soccer', schedule: [] },
  });
  const archived = await call(db, { uid: 'owner-a' }, {
    action: 'archive', requestId: 'archive-league-0001', leagueId: 'league-a', expectedVersion: 1,
  }, 'PATCH');
  assert.equal(archived.response.status, 200);
  assert.equal(records.get('leagues/league-a').isArchived, true);
  assert.equal([...records.keys()].some(path => path.startsWith('leagueLifecycleAudits/')), true);

  records.set('leagues/league-a/registrationEntries/entry-a', { answers: { email: 'private@example.test' } });
  const denied = await call(db, { uid: 'owner-a' }, {
    action: 'delete', requestId: 'delete-dependent-0001', leagueId: 'league-a', expectedVersion: 2,
  }, 'DELETE');
  assert.equal(denied.response.status, 409);
  assert.equal(records.has('leagues/league-a'), true);
  assert.equal(records.has('leagues/league-a/registrationEntries/entry-a'), true);

  records.delete('leagues/league-a/registrationEntries/entry-a');
  records.set('leagues/league-a/payments/payment-a', { amount: 25 });
  const paymentDenied = await call(db, { uid: 'owner-a' }, {
    action: 'delete', requestId: 'delete-payment-0001', leagueId: 'league-a', expectedVersion: 2,
  }, 'DELETE');
  assert.equal(paymentDenied.response.status, 409);
  records.delete('leagues/league-a/payments/payment-a');
  records.set('leagues/league-a/invites/invite-a', { invitedEmail: 'private@example.test' });
  const inviteDenied = await call(db, { uid: 'owner-a' }, {
    action: 'delete', requestId: 'delete-invite-0001', leagueId: 'league-a', expectedVersion: 2,
  }, 'DELETE');
  assert.equal(inviteDenied.response.status, 409);
});

test('archived leagues reject edit and clone until an explicit versioned restore', async () => {
  const { db, records } = communicationDb({
    ...teamSeed,
    'leagues/archived': { id: 'archived', creatorId: 'owner-a', tenantId: 'team-a', lifecycleVersion: 4, name: 'Archived', sport: 'Soccer', isArchived: true, schedule: [] },
  });
  const edit = await call(db, { uid: 'owner-a' }, {
    action: 'edit', requestId: 'edit-archived-0001', leagueId: 'archived', expectedVersion: 4, updates: { description: 'Bypass' },
  }, 'PATCH');
  assert.equal(edit.response.status, 409);
  const clone = await call(db, { uid: 'owner-a' }, {
    action: 'clone', requestId: 'clone-archived-0001', leagueId: 'archived', destination: 'league', name: 'Copy',
  });
  assert.equal(clone.response.status, 409);
  const restore = await call(db, { uid: 'owner-a' }, {
    action: 'edit', requestId: 'restore-archived-0001', leagueId: 'archived', expectedVersion: 4, updates: { isArchived: false },
  }, 'PATCH');
  assert.equal(restore.response.status, 200);
  assert.equal(records.get('leagues/archived').isArchived, false);
});

test('free hard delete cleans setup records and team linkage but retains an immutable audit receipt', async () => {
  const { db, records } = communicationDb({
    ...teamSeed,
    'teams/team-a': { ...teamSeed['teams/team-a'], leagueIds: { 'league-a': true } },
    'leagues/league-a': { id: 'league-a', creatorId: 'owner-a', tenantId: 'team-a', lifecycleVersion: 1, name: 'Metro', sport: 'Soccer', memberTeamIds: [], teams: {}, schedule: [] },
    'leagues/league-a/private/lifecycle': { contactEmail: 'ops@example.test' },
    'leagues/league-a/registration/team_config': { id: 'team_config', is_active: false, form_schema: [] },
  });
  const result = await call(db, { uid: 'owner-a' }, {
    action: 'delete', requestId: 'delete-free-0001', leagueId: 'league-a', expectedVersion: 1,
  }, 'DELETE');
  assert.equal(result.response.status, 200);
  assert.equal(records.has('leagues/league-a'), false);
  assert.equal(records.has('leagues/league-a/private/lifecycle'), false);
  assert.equal(records.has('leagues/league-a/registration/team_config'), false);
  assert.equal(records.get('teams/team-a').leagueIds['league-a'], undefined);
  const audit = [...records].find(([path]) => path.startsWith('leagueLifecycleAudits/'))?.[1];
  assert.equal(audit.action, 'delete');
  assert.equal(audit.leagueId, 'league-a');
});

test('group delete is all-or-nothing when any division has retained dependencies', async () => {
  const seed = {
    ...teamSeed,
    'leagues/gold': { id: 'gold', creatorId: 'owner-a', tenantId: 'team-a', lifecycleVersion: 1, name: 'Metro', divisionTitle: 'Gold', sport: 'Soccer', memberTeamIds: [], teams: {}, schedule: [] },
    'leagues/silver': { id: 'silver', creatorId: 'owner-a', tenantId: 'team-a', lifecycleVersion: 3, name: 'Metro', divisionTitle: 'Silver', sport: 'Soccer', memberTeamIds: [], teams: {}, schedule: [] },
    'leagues/silver/archived_waivers/receipt': { signedAt: '2026-09-01T00:00:00.000Z' },
  };
  const { db, records } = communicationDb(seed);
  const denied = await call(db, { uid: 'owner-a' }, {
    action: 'delete', requestId: 'delete-group-0001',
    leagues: [{ leagueId: 'gold', expectedVersion: 1 }, { leagueId: 'silver', expectedVersion: 3 }],
  }, 'DELETE');
  assert.equal(denied.response.status, 409);
  assert.equal(records.has('leagues/gold'), true);
  assert.equal(records.has('leagues/silver'), true);

  records.delete('leagues/silver/archived_waivers/receipt');
  const deleted = await call(db, { uid: 'owner-a' }, {
    action: 'delete', requestId: 'delete-group-0002',
    leagues: [{ leagueId: 'gold', expectedVersion: 1 }, { leagueId: 'silver', expectedVersion: 3 }],
  }, 'DELETE');
  assert.equal(deleted.response.status, 200);
  assert.equal(records.has('leagues/gold'), false);
  assert.equal(records.has('leagues/silver'), false);
  assert.equal([...records.keys()].filter(path => path.startsWith('leagueLifecycleAudits/')).length, 2);
});

test('single and group delete retain division trees and access redemptions as explicit dependencies', async () => {
  const seed = {
    ...teamSeed,
    'leagues/gold': { id: 'gold', creatorId: 'owner-a', tenantId: 'team-a', lifecycleVersion: 1, name: 'Metro', divisionTitle: 'Gold', sport: 'Soccer', teams: {}, memberTeamIds: [], schedule: [] },
    'leagues/silver': { id: 'silver', creatorId: 'owner-a', tenantId: 'team-a', lifecycleVersion: 1, name: 'Metro', divisionTitle: 'Silver', sport: 'Soccer', teams: {}, memberTeamIds: [], schedule: [] },
    'leagues/gold/divisions/division-a': { name: 'U12' },
    'leagues/gold/divisions/division-a/standings/team-a': { wins: 1 },
    'leagues/silver/accessRedemptions/redemption-a': { userId: 'member-a' },
  };
  const { db, records } = communicationDb(seed);
  const single = await call(db, { uid: 'owner-a' }, {
    action: 'delete', requestId: 'delete-division-tree-0001', leagueId: 'gold', expectedVersion: 1,
  }, 'DELETE');
  assert.equal(single.response.status, 409);
  assert.equal(records.has('leagues/gold/divisions/division-a/standings/team-a'), true);

  const group = await call(db, { uid: 'owner-a' }, {
    action: 'delete', requestId: 'delete-retained-group-0001',
    leagues: [{ leagueId: 'gold', expectedVersion: 1 }, { leagueId: 'silver', expectedVersion: 1 }],
  }, 'DELETE');
  assert.equal(group.response.status, 409);
  assert.equal(records.has('leagues/gold'), true);
  assert.equal(records.has('leagues/silver/accessRedemptions/redemption-a'), true);
});

test('organizer callers use private lifecycle data and never write applicant or team contact PII to roots', () => {
  const provider = readFileSync(new URL('../src/components/providers/team-provider.tsx', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../src/app/(dashboard)/leagues/leagues-page-content.tsx', import.meta.url), 'utf8');
  const demoSeeder = readFileSync(new URL('../src/lib/db-seeder.ts', import.meta.url), 'utf8');
  assert.match(provider, /private.*lifecycle/s);
  assert.doesNotMatch(provider, /\[`teams\.\$\{teamId\}\.coach(?:Name|Email|Phone)`\]/);
  assert.doesNotMatch(page, /\[`individualRecruits\.\$\{playerId\}`\]/);
  assert.match(page, /teamContacts/);
  assert.match(page, /individualRecruits/);
  assert.doesNotMatch(demoSeeder, /batch\.set\(doc\(db, 'leagues'/);
  assert.match(demoSeeder, /method: 'PUT'/);
});

test('clone is replay-safe, checks collision inside the transaction, and preserves registration config identity', async () => {
  const seed = {
    ...teamSeed,
    'leagues/source': { id: 'source', creatorId: 'owner-a', memberTeamIds: ['team-a'], teams: { 'team-a': {} }, lifecycleVersion: 1, name: 'Metro', divisionTitle: 'Gold', sport: 'Soccer', schedule: [] },
    'leagues/source/private/lifecycle': { contactEmail: 'ops@example.test', scorekeeperPinHash: 'source-only-hash' },
    'leagues/source/registration/team_config': { id: 'team_config', form_version: 7, form_schema: [{ id: 'email' }], registration_cost: '40', waiver_mode: 'default', is_active: true },
  };
  const { db, records } = communicationDb(seed, { serializeTransactions: true });
  const app = await loadCommunicationRoute(routePath, db, { uid: 'owner-a' });
  const body = { action: 'clone', requestId: 'clone-replay-0001', leagueId: 'source', destination: 'division', name: 'Silver' };
  try {
    const [first, second] = await Promise.all([app.route.POST(request(body)), app.route.POST(request(body))]);
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.deepEqual(await second.clone().json(), await first.clone().json());
    const cloneResult = await first.json();
    const cloneId = cloneResult.leagueId;
    assert.equal(cloneResult.action, 'clone');
    assert.equal(cloneResult.lifecycleVersion, 1);
    assert.equal(records.get('leagues/source').tenantId, 'team-a');
    assert.deepEqual(records.get(`leagues/${cloneId}/registration/team_config`), {
      id: 'team_config', form_version: 7, form_schema: [{ id: 'email' }], registration_cost: '40', waiver_mode: 'default', is_active: false,
    });
    assert.deepEqual(records.get(`leagues/${cloneId}/private/lifecycle`), { contactEmail: 'ops@example.test' });
    const audit = [...records].find(([path, data]) => path.startsWith('leagueLifecycleAudits/') && data.action === 'clone')?.[1];
    assert.equal(audit.leagueId, cloneId);
    assert.equal([...records.keys()].filter(path => path.startsWith('leagues/') && path.split('/').length === 2).length, 2);

    const collision = await app.route.POST(request({ ...body, requestId: 'clone-collision-0001' }));
    assert.equal(collision.status, 409);
  } finally {
    app.dispose();
  }
});
