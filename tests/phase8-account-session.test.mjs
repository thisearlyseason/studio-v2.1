import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';

import { createAccountSessionResolver } from '../src/lib/account-session-policy.ts';
import { createServerAccountAccessReader } from '../src/lib/server-account-session.ts';
import { createSessionHandlers } from '../src/lib/session-route-handlers.ts';
import { accountSessionRedirect } from '../src/lib/dashboard-account-session.ts';
import {
  establishBrowserSession,
  establishBrowserSessionOrSignOut,
  readBrowserSession,
} from '../src/lib/client-auth.ts';
import {
  canStartGlobalPlanCatalogState,
  canStartProtectedAccountState,
  canStartSquadMembershipState,
} from '../src/lib/client-account-admission.ts';

function firestoreDouble({ profile = null, memberRows = [], ownedTeams = [] } = {}) {
  const operations = [];
  const snapshot = value => ({ exists: value !== null, data: () => value });
  const querySnapshot = rows => ({
    docs: rows.map(value => {
      const { __teamData = {}, ...data } = value;
      return {
        data: () => data,
        ref: {
          parent: {
            parent: { get: async () => snapshot(__teamData) },
          },
        },
      };
    }),
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
    { identity: { uid: 'club' }, profile: { role: 'admin', isPrimaryClubAuthority: true } },
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

test('session policy corroborates only the League Creator selected paid squad without changing hub admission', async () => {
  const profile = { role: 'league_creator', activeTeamId: 'untrusted-profile-team' };
  for (const coachesCornerAuthority of [false, true]) {
    const authorityArguments = [];
    const resolve = createAccountSessionResolver({
      getProfile: async () => profile,
      hasActiveSquadAuthority: async () => true,
      hasSelectedCoachesCornerAuthority: async (...args) => {
        authorityArguments.push(args);
        return coachesCornerAuthority;
      },
    });

    assert.deepEqual(await resolve({ uid: 'league', selectedTeamId: 'selected-team' }), {
      allowed: true,
      redirectTo: null,
      profile,
      ...(coachesCornerAuthority ? { coachesCornerAuthority: true } : {}),
    });
    assert.deepEqual(authorityArguments, [['league', 'selected-team']]);
  }

  let selectedReads = 0;
  const resolveHubMode = createAccountSessionResolver({
    getProfile: async () => profile,
    hasActiveSquadAuthority: async () => true,
    hasSelectedCoachesCornerAuthority: async () => {
      selectedReads += 1;
      return true;
    },
  });
  assert.deepEqual(await resolveHubMode({ uid: 'league' }), {
    allowed: true,
    redirectTo: null,
    profile,
  });
  assert.equal(selectedReads, 0);
});

test('server account reader grants Coaches Corner only for the exact selected paid squad', async () => {
  const { db, operations } = firestoreDouble();
  const authorityReads = [];
  const reader = createServerAccountAccessReader({
    db,
    getTeamAuthority: async (teamId, uid) => {
      authorityReads.push([teamId, uid]);
      return {
        teamData: { isPro: teamId !== 'free-team', status: 'active' },
        isOwner: teamId !== 'foreign-team',
        isSuperAdmin: false,
        member: null,
      };
    },
  });

  assert.equal(await reader.hasSelectedCoachesCornerAuthority?.('league', undefined), false);
  assert.equal(await reader.hasSelectedCoachesCornerAuthority?.('league', '../invalid'), false);
  assert.equal(await reader.hasSelectedCoachesCornerAuthority?.('league', 'selected-team'), true);
  assert.equal(await reader.hasSelectedCoachesCornerAuthority?.('league', 'free-team'), false);
  assert.equal(await reader.hasSelectedCoachesCornerAuthority?.('league', 'foreign-team'), false);
  assert.deepEqual(authorityReads, [
    ['selected-team', 'league'],
    ['free-team', 'league'],
    ['foreign-team', 'league'],
  ]);
  assert.deepEqual(operations, []);
});

test('session policy does not trust a self-authored school-admin profile flag', async () => {
  let authorityReads = 0;
  let institutionReads = 0;
  const profile = { role: 'admin', accountStatus: 'active', isSchoolAdmin: true, plan_type: 'school' };
  const resolve = createAccountSessionResolver({
    getProfile: async () => profile,
    hasTrustedInstitutionAuthority: async () => {
      institutionReads += 1;
      return false;
    },
    hasActiveSquadAuthority: async () => {
      authorityReads += 1;
      return false;
    },
  });

  assert.deepEqual(await resolve({ uid: 'user-1' }), {
    allowed: true,
    redirectTo: '/teams/join',
    profile,
  });
  assert.equal(institutionReads, 1);
  assert.equal(authorityReads, 1);
});

test('session policy preserves a school administrator corroborated by canonical school data', async () => {
  let squadReads = 0;
  const profile = { role: 'admin', accountStatus: 'active', isSchoolAdmin: true, plan_type: 'school' };
  const resolve = createAccountSessionResolver({
    getProfile: async () => profile,
    hasTrustedInstitutionAuthority: async uid => uid === 'school-admin',
    hasActiveSquadAuthority: async () => {
      squadReads += 1;
      return false;
    },
  });

  assert.deepEqual(await resolve({ uid: 'school-admin' }), {
    allowed: true,
    redirectTo: null,
    profile,
    institutionAuthority: true,
  });
  assert.equal(squadReads, 0);
});

test('server account reader corroborates school administrators only against a live institution', async () => {
  const live = firestoreDouble({ ownedTeams: [{
    type: 'school',
    isInstitution: true,
    planId: 'school',
    planType: 'school',
    schoolAdminIds: ['school-admin'],
  }] });
  const liveReader = createServerAccountAccessReader({
    db: live.db,
    getTeamAuthority: async () => null,
  });
  assert.equal(await liveReader.hasTrustedInstitutionAuthority('school-admin'), true);
  assert.deepEqual(live.operations.slice(0, 3), [
    ['collection', 'teams'],
    ['owned-team-query', 'schoolAdminIds', 'array-contains', 'school-admin'],
    ['owned-team-limit', 20],
  ]);

  const deleted = firestoreDouble({
    ownedTeams: [{
      type: 'school',
      isInstitution: true,
      planId: 'school',
      planType: 'school',
      schoolAdminIds: ['school-admin'],
      status: 'deleted',
    }],
  });
  const deletedReader = createServerAccountAccessReader({
    db: deleted.db,
    getTeamAuthority: async () => null,
  });
  assert.equal(await deletedReader.hasTrustedInstitutionAuthority('school-admin'), false);

  for (const [name, school] of [
    ['missing school type', { isInstitution: true, planId: 'school', planType: 'school', schoolAdminIds: ['school-admin'] }],
    ['missing institution marker', { type: 'school', planId: 'school', planType: 'school', schoolAdminIds: ['school-admin'] }],
    ['missing school plan', { type: 'school', isInstitution: true, planId: 'free', planType: 'free', schoolAdminIds: ['school-admin'] }],
    ['missing school admin membership', { type: 'school', isInstitution: true, planId: 'school', planType: 'school', schoolAdminIds: [] }],
  ]) {
    const fixture = firestoreDouble({ ownedTeams: [school] });
    const reader = createServerAccountAccessReader({
      db: fixture.db,
      getTeamAuthority: async () => null,
    });
    assert.equal(await reader.hasTrustedInstitutionAuthority('school-admin'), false, name);
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
      teamData: {},
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
      teamData: {},
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

test('server account reader does not preserve selected-team authority after the team is deleted', async () => {
  const fixture = firestoreDouble();
  const reader = createServerAccountAccessReader({
    db: fixture.db,
    getTeamAuthority: async () => ({
      isOwner: true,
      isSuperAdmin: false,
      member: null,
      teamData: { isDeleted: true },
    }),
  });

  assert.equal(await reader.hasActiveSquadAuthority('user-1', 'deleted-team'), false);
});

test('server account reader ignores an active member row under a deleted alternate team', async () => {
  const fixture = firestoreDouble({
    memberRows: [{
      userId: 'user-1',
      status: 'active',
      __teamData: { isDeleted: true },
    }],
  });
  const reader = createServerAccountAccessReader({
    db: fixture.db,
    getTeamAuthority: async () => null,
  });

  assert.equal(await reader.hasActiveSquadAuthority('user-1', null), false);
});

function sessionRequest(method, { bearer = true, cookie } = {}) {
  const headers = bearer ? { authorization: 'Bearer verified-id-token' } : undefined;
  if (cookie) headers.cookie = `__session=${cookie}`;
  return new NextRequest('https://staging.thesquad.pro/api/auth/session', { method, headers });
}

function sessionDependencies(overrides = {}) {
  const calls = { create: 0, resolve: 0, verify: 0 };
  return {
    calls,
    dependencies: {
      verifyFirebaseToken: async () => ({
        uid: 'user-1',
        emailVerified: true,
        role: 'member',
        signInProvider: 'password',
      }),
      ensureAdminInit: () => {},
      createSessionCookie: async () => {
        calls.create += 1;
        return 'opaque-session-cookie';
      },
      verifySessionCookie: async () => {
        calls.verify += 1;
        return {
          uid: 'user-1',
          email_verified: true,
          role: 'member',
          firebase: { sign_in_provider: 'password' },
        };
      },
      resolveServerAccountSession: async () => {
        calls.resolve += 1;
        return { allowed: true, redirectTo: null, profile: { role: 'member' } };
      },
      ...overrides,
    },
  };
}

test('session POST rejects unavailable accounts without creating or setting a cookie', async () => {
  const fixture = sessionDependencies({
    resolveServerAccountSession: async () => ({
      allowed: false,
      code: 'auth/account-unavailable',
    }),
  });
  const { POST } = createSessionHandlers(fixture.dependencies);

  const response = await POST(sessionRequest('POST'));

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: 'This account is unavailable.',
    code: 'auth/account-unavailable',
  });
  assert.equal(fixture.calls.create, 0);
  assert.equal(response.headers.get('set-cookie'), null);
});

test('session POST returns the trusted destination only after cookie creation succeeds', async () => {
  const fixture = sessionDependencies({
    resolveServerAccountSession: async () => ({
      allowed: true,
      redirectTo: '/teams/join',
      profile: { role: 'member' },
    }),
  });
  const { POST } = createSessionHandlers(fixture.dependencies);

  const response = await POST(sessionRequest('POST'));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, redirectTo: '/teams/join' });
  assert.equal(fixture.calls.create, 1);
  assert.match(response.headers.get('set-cookie') || '', /__session=opaque-session-cookie/);
});

test('session POST fails closed when trusted account resolution is unavailable', async () => {
  const fixture = sessionDependencies({
    resolveServerAccountSession: async () => {
      throw new Error('provider details must not escape');
    },
  });
  const { POST } = createSessionHandlers(fixture.dependencies);

  const response = await POST(sessionRequest('POST'));

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'Authentication service is temporarily unavailable.' });
  assert.equal(fixture.calls.create, 0);
  assert.equal(response.headers.get('set-cookie'), null);
});

test('session GET clears a cookie rejected by trusted account state', async () => {
  const fixture = sessionDependencies({
    resolveServerAccountSession: async () => ({
      allowed: false,
      code: 'auth/account-unavailable',
    }),
  });
  const { GET } = createSessionHandlers(fixture.dependencies);

  const response = await GET(sessionRequest('GET', { cookie: 'existing-session' }));

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    authenticated: false,
    code: 'auth/account-unavailable',
  });
  assert.match(response.headers.get('set-cookie') || '', /__session=/);
  assert.match(response.headers.get('set-cookie') || '', /Max-Age=0/i);
});

test('session GET exposes only the trusted neutral destination for allowed accounts', async () => {
  const fixture = sessionDependencies({
    resolveServerAccountSession: async () => ({
      allowed: true,
      redirectTo: '/onboarding',
      profile: null,
    }),
  });
  const { GET } = createSessionHandlers(fixture.dependencies);

  const response = await GET(sessionRequest('GET', { cookie: 'existing-session' }));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    authenticated: true,
    uid: 'user-1',
    role: 'member',
    redirectTo: '/onboarding',
  });
});

test('session GET keeps invalid or revoked cookies classified as unauthenticated', async () => {
  const fixture = sessionDependencies({
    verifySessionCookie: async () => {
      throw Object.assign(new Error('revoked'), { code: 'auth/session-cookie-revoked' });
    },
  });
  const { GET } = createSessionHandlers(fixture.dependencies);

  const response = await GET(sessionRequest('GET', { cookie: 'revoked-session' }));

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { authenticated: false });
});

test('dashboard account admission redirects unavailable and incomplete accounts', () => {
  assert.equal(accountSessionRedirect('/dashboard', {
    allowed: false,
    code: 'auth/account-unavailable',
  }), '/login?reason=unavailable');
  assert.equal(accountSessionRedirect('/dashboard', {
    allowed: true,
    redirectTo: '/onboarding',
    profile: null,
  }), '/onboarding');
  assert.equal(accountSessionRedirect('/dashboard', {
    allowed: true,
    redirectTo: '/teams/join',
    profile: { role: 'member' },
  }), '/teams/join');
});

test('dashboard account admission avoids a neutral-destination redirect loop', () => {
  assert.equal(accountSessionRedirect('/teams/join', {
    allowed: true,
    redirectTo: '/teams/join',
    profile: { role: 'member' },
  }), null);
  assert.equal(accountSessionRedirect('/dashboard', {
    allowed: true,
    redirectTo: null,
    profile: { role: 'member' },
  }), null);
});

test('browser session returns only a validated trusted destination', async () => {
  const originalFetch = globalThis.fetch;
  const user = { getIdToken: async () => 'id-token' };
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({
      ok: true,
      redirectTo: '/teams/join',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    assert.deepEqual(await establishBrowserSession(user), { redirectTo: '/teams/join' });

    globalThis.fetch = async () => new Response(JSON.stringify({
      ok: true,
      redirectTo: 'https://outside.example',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    await assert.rejects(() => establishBrowserSession(user), /secure browser session/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('browser session read exposes only a trusted setup destination', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_input, init) => {
      assert.equal(init?.method, 'GET');
      assert.equal(init?.credentials, 'same-origin');
      assert.equal(init?.cache, 'no-store');
      return new Response(JSON.stringify({ authenticated: true, redirectTo: '/onboarding' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    assert.deepEqual(await readBrowserSession(), { redirectTo: '/onboarding' });

    globalThis.fetch = async () => new Response(JSON.stringify({
      authenticated: true,
      redirectTo: 'https://outside.example',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
    await assert.rejects(() => readBrowserSession(), /secure browser session/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('browser admission clears both HTTP and Firebase client state after denial', async () => {
  const calls = [];
  const error = new Error('denied');
  Object.defineProperty(error, 'code', { value: 'auth/account-unavailable' });

  await assert.rejects(() => establishBrowserSessionOrSignOut(
    { getIdToken: async () => 'id-token' },
    { currentUser: {} },
    {
      establishBrowserSession: async () => { throw error; },
      clearBrowserSession: async () => { calls.push('clear'); },
      signOut: async () => { calls.push('sign-out'); },
    },
  ), /denied/);
  assert.deepEqual(calls, ['clear', 'sign-out']);
  assert.deepEqual(Object.keys(error), []);
});

test('protected provider state waits until navigation leaves authentication and setup routes', () => {
  for (const pathname of ['/login', '/signup', '/verify-email', '/onboarding']) {
    assert.equal(canStartProtectedAccountState(pathname), false, pathname);
  }
  for (const pathname of ['/', '/dashboard', '/teams/join', '/club']) {
    assert.equal(canStartProtectedAccountState(pathname), true, pathname);
  }
});

test('global plan catalog waits until navigation leaves squad admission', () => {
  for (const pathname of ['/login', '/signup', '/verify-email', '/onboarding', '/teams/join']) {
    assert.equal(canStartGlobalPlanCatalogState(pathname), false, pathname);
  }
  for (const pathname of ['/dashboard', '/family', '/competition']) {
    assert.equal(canStartGlobalPlanCatalogState(pathname), true, pathname);
  }
});

test('squad membership listeners wait until navigation leaves squad admission', () => {
  for (const pathname of ['/login', '/signup', '/verify-email', '/onboarding', '/teams/join']) {
    assert.equal(canStartSquadMembershipState(pathname), false, pathname);
  }
  for (const pathname of ['/dashboard', '/family', '/competition']) {
    assert.equal(canStartSquadMembershipState(pathname), true, pathname);
  }
});
