import assert from 'node:assert/strict';
import test from 'node:test';

import { createAccountSessionResolver } from '../src/lib/account-session-policy.ts';
import { createServerAccountAccessReader } from '../src/lib/server-account-session.ts';

function firestoreDouble({ profile = null, memberRows = [], ownedTeams = [] } = {}) {
  const operations = [];
  const snapshot = value => ({ exists: value !== null, data: () => value });
  const querySnapshot = rows => ({
    docs: rows.map(value => ({ data: () => value })),
    empty: rows.length === 0,
    size: rows.length,
  });
  return {
    operations,
    db: {
      collection(name) {
        operations.push(['collection', name]);
        if (name === 'users') {
          return {
            doc(uid) {
              operations.push(['user', uid]);
              return { get: async () => snapshot(profile) };
            },
          };
        }
        if (name === 'teams') {
          return {
            where(field, operator, value) {
              operations.push(['owned-team-query', field, operator, value]);
              return {
                limit(limit) {
                  operations.push(['owned-team-limit', limit]);
                  return { get: async () => querySnapshot(ownedTeams) };
                },
              };
            },
          };
        }
        throw new Error(`unexpected collection ${name}`);
      },
      collectionGroup(name) {
        operations.push(['collection-group', name]);
        if (name !== 'members') throw new Error(`unexpected collection group ${name}`);
        return {
          where(field, operator, value) {
            operations.push(['member-query', field, operator, value]);
            return {
              limit(limit) {
                operations.push(['member-limit', limit]);
                return { get: async () => querySnapshot(memberRows) };
              },
            };
          },
        };
      },
    },
  };
}

test('session policy denies inactive accounts before checking squad authority', async () => {
  for (const profile of [
    { role: 'member', accountStatus: 'suspended' },
    { role: 'member', accountStatus: 'pending_deletion' },
    { role: 'member', accountStatus: 'active', deletionStatus: 'pending' },
  ]) {
    let authorityReads = 0;
    const resolve = createAccountSessionResolver({
      getProfile: async () => profile,
      hasActiveSquadAuthority: async () => {
        authorityReads += 1;
        return true;
      },
    });

    assert.deepEqual(await resolve({ uid: 'user-1' }), {
      allowed: false,
      code: 'auth/account-unavailable',
    });
    assert.equal(authorityReads, 0);
  }
});

test('session policy sends a removed sole member to squad join', async () => {
  const profile = { role: 'member', accountStatus: 'active', activeTeamId: 'team-a' };
  const authorityArguments = [];
  const resolve = createAccountSessionResolver({
    getProfile: async () => profile,
    hasActiveSquadAuthority: async (...args) => {
      authorityArguments.push(args);
      return false;
    },
  });

  assert.deepEqual(await resolve({ uid: 'user-1' }), {
    allowed: true,
    redirectTo: '/teams/join',
    profile,
  });
  assert.deepEqual(authorityArguments, [['user-1', 'team-a']]);
});

test('session policy keeps ordinary and alternate-squad access', async () => {
  for (const activeTeamId of ['team-a', null]) {
    const profile = { role: 'member', accountStatus: 'active', activeTeamId };
    const resolve = createAccountSessionResolver({
      getProfile: async () => profile,
      hasActiveSquadAuthority: async () => true,
    });

    assert.deepEqual(await resolve({ uid: 'user-1' }), {
      allowed: true,
      redirectTo: null,
      profile,
    });
  }
});

test('session policy routes an account without a profile to onboarding', async () => {
  let authorityReads = 0;
  const resolve = createAccountSessionResolver({
    getProfile: async () => null,
    hasActiveSquadAuthority: async () => {
      authorityReads += 1;
      return false;
    },
  });

  assert.deepEqual(await resolve({ uid: 'user-1' }), {
    allowed: true,
    redirectTo: '/onboarding',
    profile: null,
  });
  assert.equal(authorityReads, 0);
});

test('session policy preserves independently authorized accounts without squad lookup', async () => {
  const cases = [
    { identity: { uid: 'super', role: 'superadmin' }, profile: { role: 'member' } },
    { identity: { uid: 'school' }, profile: { role: 'admin', isSchoolAdmin: true } },
    { identity: { uid: 'club' }, profile: { role: 'admin', isPrimaryClubAuthority: true } },
    { identity: { uid: 'league' }, profile: { role: 'league_creator' } },
  ];

  for (const { identity, profile } of cases) {
    let authorityReads = 0;
    const resolve = createAccountSessionResolver({
      getProfile: async () => profile,
      hasActiveSquadAuthority: async () => {
        authorityReads += 1;
        return false;
      },
    });

    assert.deepEqual(await resolve(identity), {
      allowed: true,
      redirectTo: null,
      profile,
    });
    assert.equal(authorityReads, 0);
  }
});

test('anonymous demo sessions do not read account state', async () => {
  let profileReads = 0;
  let authorityReads = 0;
  const resolve = createAccountSessionResolver({
    getProfile: async () => {
      profileReads += 1;
      return null;
    },
    hasActiveSquadAuthority: async () => {
      authorityReads += 1;
      return false;
    },
  });

  assert.deepEqual(await resolve({ uid: 'demo', signInProvider: 'anonymous' }), {
    allowed: true,
    redirectTo: null,
    profile: null,
  });
  assert.equal(profileReads, 0);
  assert.equal(authorityReads, 0);
});

test('server account reader accepts direct selected-team membership without fallback reads', async () => {
  const fixture = firestoreDouble();
  const reader = createServerAccountAccessReader({
    db: fixture.db,
    getTeamAuthority: async (teamId, uid) => ({
      teamId,
      uid,
      isOwner: false,
      isSuperAdmin: false,
      member: { data: { status: 'active' } },
    }),
  });

  assert.equal(await reader.hasActiveSquadAuthority('user-1', 'team-a'), true);
  assert.deepEqual(fixture.operations, []);
});

test('server account reader finds alternate canonical membership and ignores removed rows', async () => {
  const fixture = firestoreDouble({
    memberRows: [
      { userId: 'user-1', status: 'removed' },
      { userId: 'user-1', status: 'active' },
    ],
  });
  const reader = createServerAccountAccessReader({
    db: fixture.db,
    getTeamAuthority: async () => ({
      isOwner: false,
      isSuperAdmin: false,
      member: null,
    }),
  });

  assert.equal(await reader.hasActiveSquadAuthority('user-1', 'stale-team'), true);
  assert.ok(fixture.operations.some(operation => operation[0] === 'member-query'));
  assert.ok(fixture.operations.every(operation => !operation.includes('teamMemberships')));
});

test('server account reader rejects removed/deleted rows but accepts canonical ownership', async () => {
  const removedOnly = firestoreDouble({
    memberRows: [
      { userId: 'user-1', status: 'removed' },
      { userId: 'user-1', status: 'active', isDeleted: true },
    ],
  });
  const removedReader = createServerAccountAccessReader({
    db: removedOnly.db,
    getTeamAuthority: async () => null,
  });
  assert.equal(await removedReader.hasActiveSquadAuthority('user-1', null), false);

  const owner = firestoreDouble({ ownedTeams: [{ ownerUserId: 'user-1' }] });
  const ownerReader = createServerAccountAccessReader({
    db: owner.db,
    getTeamAuthority: async () => null,
  });
  assert.equal(await ownerReader.hasActiveSquadAuthority('user-1', null), true);
  assert.ok(owner.operations.every(operation => !operation.includes('teamMemberships')));
});

test('server account reader does not preserve authority through a deleted owned squad', async () => {
  const fixture = firestoreDouble({ ownedTeams: [{ ownerUserId: 'user-1', isDeleted: true }] });
  const reader = createServerAccountAccessReader({
    db: fixture.db,
    getTeamAuthority: async () => null,
  });

  assert.equal(await reader.hasActiveSquadAuthority('user-1', null), false);
});
