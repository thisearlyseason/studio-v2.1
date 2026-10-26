import assert from 'node:assert/strict';
import test from 'node:test';
import { communicationDb, loadCommunicationRoute } from './helpers/communication-route-harness.mjs';

const routePath = '../../src/app/api/teams/create/route.ts';
const body = { name: 'Second Starter squad', type: 'adult', position: 'Coach' };
const request = (input = body) => new Request('https://example.test/api/teams/create', {
  method: 'POST', body: JSON.stringify(input),
});
const owner = { uid: 'owner', email: 'owner@example.test', signInProvider: 'password' };

test('registered free accounts can create multiple Starter teams while a demo team exists', async () => {
  const profile = { role: 'coach', plan_type: 'free', team_limit: 0, subscription_status: 'inactive' };
  const { db, records } = communicationDb({
    'users/owner': profile,
    'teams/demo': { ownerUserId: 'owner', isDemo: true, isPro: true, planId: 'squad_pro_demo' },
  }, { enforceReadBeforeWrite: true });
  const app = await loadCommunicationRoute(routePath, db, owner);
  try {
    for (let i = 0; i < 3; i++) {
      const response = await app.route.POST(request({ ...body, name: `Starter ${i}`, isPro: true, planId: 'league', team_limit: 1000 }));
      assert.equal(response.status, 201, await response.clone().text());
      const { teamId } = await response.json();
      const team = records.get('teams/' + teamId);
      assert.equal(team.ownerUserId, owner.uid);
      assert.equal(team.planId, 'free'); assert.equal(team.isPro, false);
      assert.equal(records.get(`users/owner/teamMemberships/${teamId}`).isPro, false);
      assert.equal(records.get(`teams/${teamId}/members/owner`).role, 'Admin');
    }
    assert.deepEqual(records.get('users/owner'), { ...profile, ownershipRevision: 3 });
    const allocation = await loadCommunicationRoute('../../src/app/api/teams/allocate-pro/route.ts', db, owner);
    try {
      const teamId = [...records.keys()].find(key => key.startsWith('teams/team_') && key.split('/').length === 2).split('/')[1];
      assert.equal((await allocation.route.POST(request({ teamId }))).status, 403, 'Starter creation cannot grant paid access');
    } finally { allocation.dispose(); }
  } finally { app.dispose(); }
});

test('paid capacity and expired subscriptions do not cap Starter creation or grant extra Pro slots', async () => {
  for (const profile of [
    { plan_type: 'team', subscription_status: 'active', team_limit: 1 },
    { plan_type: 'elite', subscription_status: 'canceled', team_limit: 8 },
    { plan_type: 'team', subscription_status: 'active', team_limit: 1, native_subscription: { expiresAt: '2001-01-01T00:00:00Z' } },
  ]) {
    const { db, records } = communicationDb({
      'users/owner': profile,
      'teams/paid': { ownerUserId: 'owner', type: 'adult', isPro: true, planId: 'team' },
      'teams/starter': { ownerUserId: 'owner', type: 'youth', isPro: false, planId: 'free' },
    }, { enforceReadBeforeWrite: true });
    const app = await loadCommunicationRoute(routePath, db, owner);
    try {
      const response = await app.route.POST(request());
      assert.equal(response.status, 201, await response.clone().text());
      const { teamId } = await response.json();
      assert.equal(records.get('teams/' + teamId).isPro, false);
      assert.deepEqual(records.get('users/owner'), { ...profile, ownershipRevision: 1 });
      if (profile.subscription_status === 'active' && !profile.native_subscription) {
        const allocation = await loadCommunicationRoute('../../src/app/api/teams/allocate-pro/route.ts', db, owner);
        try { assert.equal((await allocation.route.POST(request({ teamId }))).status, 409, 'one Pro Team subscription still covers only one paid team'); }
        finally { allocation.dispose(); }
      }
    } finally { app.dispose(); }
  }
});

test('Starter creation retains the account resource ceiling and commits no partial overflow', async () => {
  const { db, records } = communicationDb({
    'users/owner': { plan_type: 'free' },
    ...Object.fromEntries(Array.from({ length: 99 }, (_, i) => [`teams/existing${i}`, { ownerUserId: 'owner', isPro: false, planId: 'free' }])),
  }, { serializeTransactions: true, enforceReadBeforeWrite: true });
  const app = await loadCommunicationRoute(routePath, db, owner);
  try {
    const responses = await Promise.all([app.route.POST(request()), app.route.POST(request())]);
    assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
    assert.equal([...records.keys()].filter(key => /^teams\/[^/]+$/.test(key)).length, 100);
    assert.equal(records.get('users/owner').ownershipRevision, 1);
  } finally { app.dispose(); }
});

test('Starter creation retains anonymous, ownership and deleting-account boundaries', async () => {
  for (const scenario of [
    { auth: { uid: 'owner', isAnonymous: true }, input: body, expected: 401 },
    { auth: owner, input: { ...body, overrideOwnerId: 'foreign' }, expected: 403 },
    { auth: owner, input: body, profile: { deletionStatus: 'pending' }, expected: 409 },
  ]) {
    const { db, records } = communicationDb({ 'users/owner': { plan_type: 'free', ...scenario.profile } });
    const before = structuredClone([...records]);
    const app = await loadCommunicationRoute(routePath, db, scenario.auth);
    try {
      assert.equal((await app.route.POST(request(scenario.input))).status, scenario.expected);
      assert.deepEqual([...records], before);
    } finally { app.dispose(); }
  }
});
