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
    async remove(path) { if (!path.includes('/seasonResetObligations/')) removed.push(path); documents.delete(path); },
    async hasDescendants(path) { return [...documents.keys()].some(key => key.startsWith(`${path}/`)); },
    async storageExists() { return false; },
    async update(path, patch) { documents.set(path, { ...documents.get(path), ...patch }); },
    async removePlayerTeamAssociation(path, teamId) {
      const player = documents.get(path);
      const joinedTeamIds = player.joinedTeamIds.filter(id => id !== teamId);
      documents.set(path, { ...player, joinedTeamIds, primaryTeamId: player.primaryTeamId === teamId ? (joinedTeamIds[0] || null) : player.primaryTeamId });
    },
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

test('roster reset keeps its recovery source until player projection succeeds and repeat repairs it', async () => {
  const { executeTeamSeasonReset, SeasonResetError } = await import('../src/lib/team-season-reset.ts');
  const documents = new Map([
    ['teams/team-a', { ownerUserId: 'owner-a' }],
    ['teams/team-a/members/member-a', { userId: 'member-a', playerId: 'player-a' }],
    ['users/member-a/teamMemberships/team-a', { teamId: 'team-a' }],
    ['players/player-a', { joinedTeamIds: ['team-a', 'team-b'], primaryTeamId: 'team-a' }],
  ]);
  let failProjection = true;
  const adapter = {
    async get(path) { return structuredClone(documents.get(path) ?? null); },
    async list(collectionPath) {
      const depth = collectionPath.split('/').length + 1;
      return [...documents.entries()].filter(([path]) => path.startsWith(`${collectionPath}/`) && path.split('/').length === depth).map(([path, data]) => ({ path, id: path.split('/').at(-1), data: structuredClone(data) }));
    },
    async remove(path) { documents.delete(path); }, async update() {}, async removeStorage() {},
    async hasDescendants(path) { return [...documents.keys()].some(key => key.startsWith(`${path}/`)); },
    async storageExists() { return false; },
    async removePlayerTeamAssociation(path, teamId) {
      if (failProjection) throw new Error('forced projection failure');
      const player = documents.get(path);
      const joinedTeamIds = player.joinedTeamIds.filter(id => id !== teamId);
      documents.set(path, { ...player, joinedTeamIds, primaryTeamId: joinedTeamIds[0] ?? null });
    },
  };
  await assert.rejects(
    () => executeTeamSeasonReset({ teamId: 'team-a', ownerUid: 'owner-a', categories: ['roster'], adapter, maxAttempts: 1 }),
    error => error instanceof SeasonResetError && error.code === 'PARTIAL_FAILURE'
  );
  assert.equal(documents.has('teams/team-a/members/member-a'), true, 'member is the durable retry obligation');
  assert.equal(documents.has('users/member-a/teamMemberships/team-a'), true);
  failProjection = false;
  await executeTeamSeasonReset({ teamId: 'team-a', ownerUid: 'owner-a', categories: ['roster'], adapter, maxAttempts: 1 });
  assert.deepEqual(documents.get('players/player-a'), { joinedTeamIds: ['team-b'], primaryTeamId: 'team-b' });
  assert.equal(documents.has('teams/team-a/members/member-a'), false);
});

test('roster reset keeps the member discovery source until its user projection is removed', async () => {
  const { executeTeamSeasonReset, SeasonResetError } = await import('../src/lib/team-season-reset.ts');
  const documents = new Map([
    ['teams/team-a', { ownerUserId: 'owner-a' }],
    ['teams/team-a/members/member-a', { userId: 'member-a', playerId: 'player-a' }],
    ['users/member-a/teamMemberships/team-a', { teamId: 'team-a' }],
    ['players/player-a', { joinedTeamIds: ['team-a'], primaryTeamId: 'team-a' }],
  ]);
  let failUserProjection = true;
  const adapter = {
    async get(path) { return structuredClone(documents.get(path) ?? null); },
    async list(collectionPath) {
      const depth = collectionPath.split('/').length + 1;
      return [...documents.entries()].filter(([path]) => path.startsWith(`${collectionPath}/`) && path.split('/').length === depth).map(([path, data]) => ({ path, id: path.split('/').at(-1), data: structuredClone(data) }));
    },
    async update(path, patch) { documents.set(path, { ...(documents.get(path) || {}), ...structuredClone(patch) }); },
    async remove(path) {
      if (path === 'users/member-a/teamMemberships/team-a' && failUserProjection) throw new Error('forced user projection failure');
      for (const key of [...documents.keys()]) if (key === path || key.startsWith(`${path}/`)) documents.delete(key);
    },
    async hasDescendants(path) { return [...documents.keys()].some(key => key.startsWith(`${path}/`)); },
    async storageExists() { return false; },
    async removeStorage() {},
    async removePlayerTeamAssociation(path, teamId) {
      const player = documents.get(path);
      const joinedTeamIds = player.joinedTeamIds.filter(id => id !== teamId);
      documents.set(path, { ...player, joinedTeamIds, primaryTeamId: null });
    },
  };
  await assert.rejects(
    () => executeTeamSeasonReset({ teamId: 'team-a', ownerUid: 'owner-a', categories: ['roster'], adapter, maxAttempts: 1 }),
    error => error instanceof SeasonResetError && error.code === 'PARTIAL_FAILURE',
  );
  assert.equal(documents.has('teams/team-a/members/member-a'), true, 'member remains the durable discovery source');
  failUserProjection = false;
  await executeTeamSeasonReset({ teamId: 'team-a', ownerUid: 'owner-a', categories: ['roster'], adapter, maxAttempts: 1 });
  assert.equal(documents.has('users/member-a/teamMemberships/team-a'), false);
  assert.equal(documents.has('teams/team-a/members/member-a'), false);
});

test('roster reset retries an orphaned member descendant from a durable obligation', async () => {
  const { executeTeamSeasonReset, SeasonResetError } = await import('../src/lib/team-season-reset.ts');
  const memberPath = 'teams/team-a/members/member-a';
  const orphanPath = `${memberPath}/signatures/waiver-a`;
  const documents = new Map([
    ['teams/team-a', { ownerUserId: 'owner-a' }],
    [memberPath, { userId: 'member-a' }],
    [orphanPath, { signed: true }],
    ['users/member-a/teamMemberships/team-a', { teamId: 'team-a' }],
  ]);
  let failMemberRemoval = true;
  const adapter = {
    async get(path) { return structuredClone(documents.get(path) ?? null); },
    async list(collectionPath) {
      const depth = collectionPath.split('/').length + 1;
      return [...documents.entries()].filter(([path]) => path.startsWith(`${collectionPath}/`) && path.split('/').length === depth).map(([path, data]) => ({ path, id: path.split('/').at(-1), data: structuredClone(data) }));
    },
    async update(path, patch) { documents.set(path, { ...(documents.get(path) || {}), ...structuredClone(patch) }); },
    async remove(path) {
      if (path === memberPath && failMemberRemoval) {
        documents.delete(memberPath);
        throw new Error('forced partial recursive delete');
      }
      for (const key of [...documents.keys()]) if (key === path || key.startsWith(`${path}/`)) documents.delete(key);
    },
    async hasDescendants(path) { return [...documents.keys()].some(key => key.startsWith(`${path}/`)); },
    async storageExists() { return false; },
    async removeStorage() {}, async removePlayerTeamAssociation() {},
  };
  await assert.rejects(
    () => executeTeamSeasonReset({ teamId: 'team-a', ownerUid: 'owner-a', categories: ['roster'], adapter, maxAttempts: 1 }),
    error => error instanceof SeasonResetError && error.code === 'PARTIAL_FAILURE',
  );
  assert.equal(documents.has(memberPath), false);
  assert.equal(documents.has(orphanPath), true);
  failMemberRemoval = false;
  await executeTeamSeasonReset({ teamId: 'team-a', ownerUid: 'owner-a', categories: ['roster'], adapter, maxAttempts: 1 });
  assert.equal(documents.has(orphanPath), false);
});

test('roster reset atomically removes only the active team and preserves a concurrent companion join', async () => {
  const { executeTeamSeasonReset } = await import('../src/lib/team-season-reset.ts');
  const documents = new Map([
    ['teams/team-a', { ownerUserId: 'owner-a' }],
    ['teams/team-a/members/member-a', { userId: 'member-a', playerId: 'player-a' }],
    ['players/player-a', { joinedTeamIds: ['team-a', 'team-b'], primaryTeamId: 'team-a' }],
  ]);
  const adapter = {
    async get(path) { return structuredClone(documents.get(path) ?? null); },
    async list(path) { return path === 'teams/team-a/members' ? [{ path: 'teams/team-a/members/member-a', id: 'member-a', data: { userId: 'member-a', playerId: 'player-a' } }] : []; },
    async remove(path) { documents.delete(path); }, async update() {}, async removeStorage() {},
    async hasDescendants(path) { return [...documents.keys()].some(key => key.startsWith(`${path}/`)); },
    async storageExists() { return false; },
    async removePlayerTeamAssociation(path, teamId) {
      const player = documents.get(path);
      player.joinedTeamIds.push('team-c'); // concurrent join visible inside the atomic operation
      const joinedTeamIds = [...new Set(player.joinedTeamIds)].filter(id => id !== teamId);
      documents.set(path, { ...player, joinedTeamIds, primaryTeamId: joinedTeamIds[0] ?? null });
    },
  };
  await executeTeamSeasonReset({ teamId: 'team-a', ownerUid: 'owner-a', categories: ['roster'], adapter });
  assert.deepEqual(documents.get('players/player-a'), { joinedTeamIds: ['team-b', 'team-c'], primaryTeamId: 'team-b' });
});

test('complete reset retries exact team Storage objects and reports exhausted failures', async () => {
  const { executeTeamSeasonReset, SeasonResetError } = await import('../src/lib/team-season-reset.ts');
  const file = { path: 'teams/team-a/files/file-1', id: 'file-1', data: { storagePath: 'teams/team-a/files/file-1.pdf' } };
  let attempts = 0;
  const adapter = {
    async get(path) { return path === 'teams/team-a' ? { ownerUserId: 'owner-a' } : null; },
    async list(path) { return path === 'teams/team-a/files' ? [file] : []; },
    async remove() {}, async update() {},
    async hasDescendants() { return false; },
    async storageExists() { return false; },
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
  const adapter = { async get() { return { ownerUserId: 'owner-a' }; }, async list() { mutated = true; return []; }, async remove() {}, async update() {}, async removeStorage() {}, async hasDescendants() { return false; }, async storageExists() { return false; } };
  await assert.rejects(() => executeTeamSeasonReset({ teamId: 'team-a', ownerUid: 'staff-a', categories: ['games'], adapter }), error => error instanceof SeasonResetError && error.code === 'FORBIDDEN');
  await assert.rejects(() => executeTeamSeasonReset({ teamId: 'team-a', ownerUid: 'owner-a', categories: ['unknown'], adapter }), error => error instanceof SeasonResetError && error.code === 'INVALID_CATEGORIES');
  assert.equal(mutated, false);
});
