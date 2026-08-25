import assert from 'node:assert/strict';
import test from 'node:test';

import { createAccountSessionResolver } from '../src/lib/account-session-policy.ts';
import { authorizeDashboardRoute } from '../src/lib/dashboard-route-policy.ts';

function sessionDecisionSummary(decision) {
  if (!decision.allowed) return decision;
  return { allowed: decision.allowed, redirectTo: decision.redirectTo };
}

test('account session resolver enforces the local identity and authority matrix', async t => {
  const cases = [
    {
      name: 'missing profile',
      profile: null,
      expected: { allowed: true, redirectTo: '/onboarding' },
    },
    {
      name: 'no team',
      profile: { role: 'Member', accountStatus: 'active' },
      squad: false,
      expected: { allowed: true, redirectTo: '/teams/join' },
    },
    {
      name: 'pending deletion',
      profile: { role: 'Member', accountStatus: 'pending_deletion' },
      expected: { allowed: false, code: 'auth/account-unavailable' },
    },
    {
      name: 'school flag alone',
      profile: { role: 'admin', isSchoolAdmin: true, plan_type: 'school' },
      institution: false,
      squad: false,
      expected: { allowed: true, redirectTo: '/teams/join' },
    },
    {
      name: 'corroborated school',
      profile: { role: 'admin', isSchoolAdmin: true, plan_type: 'school' },
      institution: true,
      expected: { allowed: true, redirectTo: null },
    },
    {
      name: 'league creator',
      profile: { role: 'league_creator' },
      expected: { allowed: true, redirectTo: null },
    },
    {
      name: 'trusted superadmin',
      identity: { role: 'superadmin' },
      profile: { role: 'Member' },
      expected: { allowed: true, redirectTo: null },
    },
    {
      name: 'profile-only superadmin',
      profile: { role: 'superadmin' },
      squad: false,
      expected: { allowed: true, redirectTo: '/teams/join' },
    },
  ];

  for (const fixture of cases) {
    await t.test(fixture.name, async () => {
      const resolve = createAccountSessionResolver({
        getProfile: async () => fixture.profile,
        hasTrustedInstitutionAuthority: async () => fixture.institution === true,
        hasActiveSquadAuthority: async () => fixture.squad === true,
      });

      const decision = await resolve({ uid: 'user-1', ...fixture.identity });
      assert.deepEqual(sessionDecisionSummary(decision), fixture.expected);
    });
  }
});

test('pending deletion short-circuits before institution and squad authority readers', async () => {
  let institutionReads = 0;
  let squadReads = 0;
  const resolve = createAccountSessionResolver({
    getProfile: async () => ({
      role: 'admin',
      accountStatus: 'pending_deletion',
      isSchoolAdmin: true,
      plan_type: 'school',
    }),
    hasTrustedInstitutionAuthority: async () => {
      institutionReads += 1;
      return true;
    },
    hasActiveSquadAuthority: async () => {
      squadReads += 1;
      return true;
    },
  });

  assert.deepEqual(await resolve({ uid: 'user-1' }), {
    allowed: false,
    code: 'auth/account-unavailable',
  });
  assert.equal(institutionReads, 0);
  assert.equal(squadReads, 0);
});

test('dashboard route authority requires a trusted claim for platform access', () => {
  assert.deepEqual(authorizeDashboardRoute('/admin', { role: 'superadmin' }, undefined), {
    allowed: false,
    redirectTo: '/dashboard',
  });
  assert.deepEqual(authorizeDashboardRoute('/admin', { role: 'Member' }, 'superadmin'), {
    allowed: true,
  });
});

test('dashboard route authority preserves family, staff, league, and school behavior', () => {
  assert.deepEqual(authorizeDashboardRoute('/family', { role: 'parent' }), { allowed: true });
  assert.equal(authorizeDashboardRoute('/coaches-corner', { role: 'adult_player' }).allowed, false);
  assert.equal(authorizeDashboardRoute('/coaches-corner', { role: 'youth_player' }).allowed, false);
  assert.equal(authorizeDashboardRoute('/competition', { role: 'league_creator' }).allowed, true);
  assert.equal(
    authorizeDashboardRoute('/club', { role: 'admin', plan_type: 'school' }).allowed,
    true,
  );
});
