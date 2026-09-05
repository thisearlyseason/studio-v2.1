import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('season reset UI uses the owner-authorized server route', () => {
  const provider = fs.readFileSync(new URL('../src/components/providers/team-provider.tsx', import.meta.url), 'utf8');
  const route = fs.readFileSync(new URL('../src/app/api/teams/season-reset/route.ts', import.meta.url), 'utf8');
  assert.match(provider, /fetch\('\/api\/teams\/season-reset'/);
  assert.doesNotMatch(provider, /resetSquadData[\s\S]*paths\.map\(path => getDocs/);
  assert.match(route, /executeTeamSeasonReset/);
  assert.match(route, /verifyFirebaseToken/);
  assert.match(route, /bucket\(getAdminStorageBucketName\(\)\)/);
  assert.doesNotMatch(route, /storage\(\)\.bucket\(\)/);
});

test('season reset deletes only selected active-team categories and exact roster projections', async () => {
  const { executeTeamSeasonReset } = await import('../src/lib/team-season-reset.ts');
  const documents = new Map([
    ['teams/team-a', { ownerUserId: 'owner-a' }],
    ['teams/team-a/games/game-1', { id: 'game-1' }],
    ['teams/team-a/events/event-1', { id: 'event-1' }],
    ['teams/team-a/members/owner-a', { userId: 'owner-a', role: 'Admin' }],
    ['teams/team-a/members/member-a', { userId: 'member-a', playerId: 'player-a', role: 'Member' }],
    ['users/member-a/teamMemberships/team-a', { teamId: 'team-a' }],
    ['users/member-a/teamMemberships/team-b', { teamId: 'team-b' }],
    ['players/player-a', { joinedTeamIds: ['team-a', 'team-b'] }],
  ]);
  const removed = [];
  const adapter = {
    async get(path) { return structuredClone(documents.get(path) || null); },
    async list(collectionPath) {
      const depth = collectionPath.split('/').length + 1;
      return [...documents.entries()].filter(([path]) => path.startsWith(`${collectionPath}/`) && path.split('/').length === depth).map(([path, data]) => ({ path, id: path.split('/').at(-1), data: structuredClone(data) }));
    },
    async remove(path) { removed.push(path); documents.delete(path); },
    async update(path, patch) { documents.set(path, { ...documents.get(path), ...patch }); },
    async removeStorage() { throw new Error('games-only reset must not touch Storage'); },
  };

  const games = await executeTeamSeasonReset({ teamId: 'team-a', ownerUid: 'owner-a', categories: ['games'], adapter });
  assert.deepEqual(games.categories, ['games']);
  assert.deepEqual(removed, ['teams/team-a/games/game-1']);
  assert.equal(documents.has('teams/team-a/events/event-1'), true);
  assert.equal(documents.has('teams/team-a/members/member-a'), true);

  removed.length = 0;
  const roster = await executeTeamSeasonReset({ teamId: 'team-a', ownerUid: 'owner-a', categories: ['roster'], adapter });
  assert.deepEqual(new Set(removed), new Set(['teams/team-a/members/member-a', 'users/member-a/teamMemberships/team-a']));
  assert.equal(documents.has('teams/team-a/members/owner-a'), true);
  assert.equal(documents.has('users/member-a/teamMemberships/team-b'), true);
  assert.deepEqual(documents.get('players/player-a').joinedTeamIds, ['team-b']);
});

test('complete reset retries exact team Storage objects and reports exhausted failures', async () => {
  const { executeTeamSeasonReset, SeasonResetError } = await import('../src/lib/team-season-reset.ts');
  const file = { path: 'teams/team-a/files/file-1', id: 'file-1', data: { storagePath: 'teams/team-a/files/file-1.pdf' } };
  let attempts = 0;
  const adapter = {
    async get(path) { return path === 'teams/team-a' ? { ownerUserId: 'owner-a' } : null; },
    async list(path) { return path === 'teams/team-a/files' ? [file] : []; },
    async remove() {}, async update() {},
    async removeStorage(path) { attempts += 1; assert.equal(path, 'teams/team-a/files/file-1.pdf'); if (attempts === 1) throw new Error('transient'); },
  };
  const result = await executeTeamSeasonReset({ teamId: 'team-a', ownerUid: 'owner-a', categories: ['complete'], adapter, maxAttempts: 2 });
  assert.equal(result.storageDeleted, 1);
  assert.equal(attempts, 2);

  const unsafe = { ...file, data: { storagePath: 'users/another/private.pdf' } };
  await assert.rejects(
    () => executeTeamSeasonReset({ ...result, teamId: 'team-a', ownerUid: 'owner-a', categories: ['complete'], adapter: { ...adapter, async list(path) { return path === 'teams/team-a/files' ? [unsafe] : []; } } }),
    error => error instanceof SeasonResetError && error.code === 'UNSAFE_STORAGE_PATH'
  );
});

test('season reset rejects non-owners and unknown categories before mutation', async () => {
  const { executeTeamSeasonReset, SeasonResetError } = await import('../src/lib/team-season-reset.ts');
  let mutated = false;
  const adapter = { async get() { return { ownerUserId: 'owner-a' }; }, async list() { mutated = true; return []; }, async remove() {}, async update() {}, async removeStorage() {} };
  await assert.rejects(() => executeTeamSeasonReset({ teamId: 'team-a', ownerUid: 'staff-a', categories: ['games'], adapter }), error => error instanceof SeasonResetError && error.code === 'FORBIDDEN');
  await assert.rejects(() => executeTeamSeasonReset({ teamId: 'team-a', ownerUid: 'owner-a', categories: ['unknown'], adapter }), error => error instanceof SeasonResetError && error.code === 'INVALID_CATEGORIES');
  assert.equal(mutated, false);
});
