import assert from 'node:assert/strict';
import test from 'node:test';

const worker = await import('../functions/src/league-public-projection.ts').catch(() => ({}));
const syncPublicLeagueView = worker.syncPublicLeagueView || (async () => ({ action: 'missing' }));

function store(seed = {}) {
  const records = new Map(Object.entries(seed).map(([path, value]) => [path, structuredClone(value)]));
  const writes = [];
  let failNextWrite = false;
  const adapter = {
    records,
    writes,
    failOnce() { failNextWrite = true; },
    async runTransaction(operation) {
      return operation({
        async read(collection, id) {
          const value = records.get(`${collection}/${id}`);
          return value ? { exists: true, data: structuredClone(value.data), version: value.version } : { exists: false, data: {}, version: 0 };
        },
        async write(collection, id, data) {
          if (failNextWrite) { failNextWrite = false; throw new Error('injected write failure'); }
          writes.push(['write', `${collection}/${id}`]);
          records.set(`${collection}/${id}`, { data: structuredClone(data), version: 1_000 + writes.length });
        },
        async delete(collection, id) {
          if (!records.has(`${collection}/${id}`)) return;
          writes.push(['delete', `${collection}/${id}`]);
          records.delete(`${collection}/${id}`);
        },
      });
    },
  };
  return adapter;
}

const source = {
  id: 'league-a', creatorId: 'owner', billingOwnerUserId: 'owner', tenantId: 'team-a',
  lifecycleVersion: 3, name: 'Metro', sport: 'Soccer', divisions: ['Gold'], divisionTitle: 'Gold',
  schedule: [{ id: 'g1', team1: 'Alpha', team2: 'Beta', team1Id: 'a', team2Id: 'b', date: '2026-09-07', time: '10:00', location: 'Field', score1: 2, score2: 1, isCompleted: true, gameVersion: 9, scoringPin: 'private' }],
  teams: {
    a: { teamName: 'Alpha', teamLogoUrl: 'a.png', division: 'Gold', status: 'accepted', contactEmail: 'private@example.test' },
    b: { teamName: 'Beta', division: 'Gold', status: 'assigned' },
    rejected: { teamName: 'Rejected', status: 'rejected' },
  },
  scorekeeperPin: '1234', applicantResponses: { email: 'private@example.test' }, finance: { total: 100 },
};

function activeSeed(overrides = {}) {
  return {
    'leagues/league-a': { data: { ...structuredClone(source), ...(overrides.league || {}) }, version: overrides.leagueVersion ?? 100 },
    'users/owner': { data: { role: 'coach', plan_type: 'league', subscription_status: 'active', ...(overrides.owner || {}) }, version: 90 },
    'teams/team-a': { data: { ownerUserId: 'owner', status: 'active', planId: 'league', ...(overrides.team || {}) }, version: 80 },
  };
}

test('creates the canonical spectator allowlist once and updates only for newer source state', async () => {
  const db = store(activeSeed());
  const first = await syncPublicLeagueView('league-a', 100, db);
  const second = await syncPublicLeagueView('league-a', 100, db);
  assert.deepEqual([first.action, second.action], ['written', 'unchanged']);
  assert.equal(db.writes.filter(([, path]) => path === 'publicLeagueViews/league-a').length, 1);
  assert.deepEqual(db.records.get('leaguePublicProjectionState/league-a').data, { sourceVersion: 100 });
  assert.deepEqual(db.records.get('publicLeagueViews/league-a').data, {
    id: 'league-a', name: 'Metro', sport: 'Soccer', divisions: ['Gold'], divisionTitle: 'Gold',
    schedule: [{ id: 'g1', team1: 'Alpha', team2: 'Beta', team1Id: 'a', team2Id: 'b', date: '2026-09-07', time: '10:00', location: 'Field', score1: 2, score2: 1, isCompleted: true, isDisputed: false, isExhibition: false }],
    teams: {
      a: { teamName: 'Alpha', teamLogoUrl: 'a.png', division: 'Gold', status: 'accepted', wins: 1, losses: 0, ties: 0, points: 3 },
      b: { teamName: 'Beta', teamLogoUrl: '', division: 'Gold', status: 'assigned', wins: 0, losses: 1, ties: 0, points: 0 },
    },
    isActive: true,
  });
  db.records.get('leagues/league-a').data.name = 'Metro Updated';
  db.records.get('leagues/league-a').version = 2_000;
  assert.equal((await syncPublicLeagueView('league-a', 2_000, db)).action, 'written');
  assert.equal(db.records.get('publicLeagueViews/league-a').data.name, 'Metro Updated');
  assert.equal(JSON.stringify(db.records.get('publicLeagueViews/league-a').data).includes('private'), false);
});

test('revokes archived inactive deleted unentitled blocked and inconsistent league projections', async () => {
  const cases = [
    { league: { isArchived: true } }, { league: { is_active: false } }, { league: { isDeleted: true } }, { league: { status: 'inactive' } },
    { owner: { role: 'coach', plan_type: 'free' } }, { owner: { role: 'coach', plan_type: 'team' } },
    { owner: { role: 'parent', plan_type: 'league' } },
    { owner: { subscription_status: 'canceled' } }, { owner: { status: 'inactive' } }, { owner: { isArchived: true } }, { owner: { isDeleted: true } },
    { owner: { accountStatus: 'suspended' } }, { owner: { deletionStatus: 'pending' } },
    { league: { creatorId: '' } }, { league: { billingOwnerUserId: 'other' } },
    { league: { tenantId: '' } }, { team: { ownerUserId: 'other' } }, { team: { isArchived: true } },
    { team: { status: 'inactive' } }, { team: { isDeleted: true } }, { team: { accountStatus: 'suspended' } },
    { team: { deletionStatus: 'pending' } }, { team: { planId: 'team' } },
    { leagueVersion: 0 },
  ];
  for (const overrides of cases) {
    const db = store({ ...activeSeed(overrides), 'publicLeagueViews/league-a': { data: { id: 'league-a' }, version: 50 } });
    assert.equal((await syncPublicLeagueView('league-a', 100, db)).action, 'revoked');
    assert.equal(db.records.has('publicLeagueViews/league-a'), false);
  }
});

test('a team-owned League preserves a valid delegated creator and uses only the canonical billing owner entitlement', async () => {
  const db = store({
    ...activeSeed({ league: { creatorId: 'delegated-staff' } }),
    'users/delegated-staff': { data: { role: 'coach', plan_type: 'free', subscription_status: 'canceled' }, version: 95 },
  });
  assert.equal((await syncPublicLeagueView('league-a', 100, db)).action, 'written');
});

test('legacy projection without private source metadata is replaced by the canonical DTO even when written later', async () => {
  const db = store({
    ...activeSeed(),
    'publicLeagueViews/league-a': { data: { id: 'league-a', contactEmail: 'legacy-private@example.test' }, version: 5_000 },
  });
  assert.equal((await syncPublicLeagueView('league-a', 100, db)).action, 'written');
  assert.equal(db.records.get('publicLeagueViews/league-a').data.contactEmail, undefined);
  assert.deepEqual(db.records.get('leaguePublicProjectionState/league-a').data, { sourceVersion: 100 });
});

test('malformed private source metadata is not trusted as an authoritative revision', async () => {
  const db = store({
    ...activeSeed(),
    'publicLeagueViews/league-a': { data: { id: 'league-a', contactEmail: 'legacy-private@example.test' }, version: 5_000 },
    'leaguePublicProjectionState/league-a': { data: { sourceVersion: '5000' }, version: 5_001 },
  });
  assert.equal((await syncPublicLeagueView('league-a', 100, db)).action, 'written');
  assert.equal(db.records.get('publicLeagueViews/league-a').data.contactEmail, undefined);
  assert.deepEqual(db.records.get('leaguePublicProjectionState/league-a').data, { sourceVersion: 100 });
});

test('supports a canonical profile tenant and revokes when the owner or source is missing', async () => {
  const profile = store({
    'leagues/league-a': { data: { ...source, tenantId: 'profile:owner' }, version: 100 },
    'users/owner': { data: { role: 'league_creator', plan_type: 'league', subscription_status: 'trialing' }, version: 90 },
  });
  assert.equal((await syncPublicLeagueView('league-a', 100, profile)).action, 'written');
  for (const missing of ['users/owner', 'leagues/league-a']) {
    profile.records.delete(missing);
    assert.equal((await syncPublicLeagueView('league-a', 120, profile)).action, 'revoked');
    profile.records.set('publicLeagueViews/league-a', { data: { id: 'league-a' }, version: 110 });
  }
});
