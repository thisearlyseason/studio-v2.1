import assert from 'node:assert/strict';
import test from 'node:test';
import { communicationDb, loadCommunicationRoute } from './helpers/communication-route-harness.mjs';

const seed = {
  'users/owner': { role: 'coach', plan_type: 'league', subscription_status: 'active', team_limit: 10 },
  'users/staff': { role: 'coach' },
  'teams/school': { ownerUserId: 'owner', schoolAdminIds: ['staff'], planId: 'elite_league' },
  'teams/school/members/staff': { userId: 'staff', position: 'Coach', status: 'active' },
  'leagues/source': { creatorId: 'owner', tenantId: 'school', name: 'Source', sport: 'Soccer', lifecycleVersion: 1, teams: {}, schedule: [] },
};
const scenarios = [
  ['team', '../../src/app/api/teams/create/route.ts', { name: 'New squad', type: 'school_squad', position: 'Coach', schoolId: 'school', overrideOwnerId: 'owner' }],
  ['league', '../../src/app/api/leagues/lifecycle/route.ts', { action: 'create', requestId: 'lifecycle-create-001', teamId: 'school', name: 'New League', sport: 'Soccer' }],
  ['clone', '../../src/app/api/leagues/lifecycle/route.ts', { action: 'clone', requestId: 'lifecycle-clone-001', leagueId: 'source', destination: 'league', name: 'Copied League' }],
];

for (const [label, path, body] of scenarios) {
  test(`${label}: transactional ownership rejects a deleting owner or actor after authentication`, async () => {
    for (const uid of ['owner', 'staff']) {
      const { db, records } = communicationDb({ ...seed, ['users/' + uid]: { ...seed['users/' + uid], deletionStatus: 'pending' } }, { enforceReadBeforeWrite: true });
      const before = structuredClone([...records]);
      const app = await loadCommunicationRoute(path, db, { uid: 'staff' });
      try {
        const response = await app.route.POST(new Request('https://example.test/api', { method: 'POST', body: JSON.stringify(body) }));
        assert.equal(response.status, 409, `${label}: ${uid}: ${await response.text()}`);
        assert.deepEqual([...records], before, 'Denied ownership must leave no partial writes');
      } finally { app.dispose(); }
    }
  });
  test(`${label}: active owner and staff retain creation and the shared transaction fence`, async () => {
    const { db, records } = communicationDb(seed, { enforceReadBeforeWrite: true });
    const app = await loadCommunicationRoute(path, db, { uid: 'staff' });
    try {
      const response = await app.route.POST(new Request('https://example.test/api', { method: 'POST', body: JSON.stringify(body) }));
      assert.equal(response.status, 201, await response.text());
      for (const uid of ['owner', 'staff']) assert.equal(records.get('users/' + uid).ownershipRevision, 1);
    } finally { app.dispose(); }
  });
}
