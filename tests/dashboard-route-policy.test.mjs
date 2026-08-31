import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import * as routePolicyModule from '../src/lib/dashboard-route-policy.ts';

const {
  authorizeDashboardRoute,
  isProtectedDashboardPath,
  isSensitiveDashboardPath,
  runProtectedRouteAdmission,
  resolveDashboardRouteRedirect,
} = routePolicyModule;

test('dashboard route detection does not capture public league and tournament portals', () => {
  assert.equal(isProtectedDashboardPath('/dashboard'), true);
  assert.equal(isProtectedDashboardPath('/dashboard/billing'), true);
  assert.equal(isProtectedDashboardPath('/leagues/registration/league-1'), true);
  assert.equal(isProtectedDashboardPath('/leagues/spectator/league-1'), false);
  assert.equal(isProtectedDashboardPath('/tournaments'), true);
  assert.equal(isProtectedDashboardPath('/tournaments/public/team/event'), false);
});

test('sensitive account routes require revocation-aware session verification', () => {
  assert.equal(isSensitiveDashboardPath('/dashboard'), false);
  assert.equal(isSensitiveDashboardPath('/dashboard/billing'), true);
  assert.equal(isSensitiveDashboardPath('/family/payments'), true);
  assert.equal(isSensitiveDashboardPath('/family'), false);
  assert.equal(isSensitiveDashboardPath('/admin/plans'), true);
});

test('only superadmins can access global administration', () => {
  assert.equal(authorizeDashboardRoute('/admin/plans', { role: 'admin' }).allowed, false);
  assert.equal(
    authorizeDashboardRoute('/admin/plans', { role: 'superadmin' }, 'superadmin').allowed,
    true,
  );
  assert.equal(authorizeDashboardRoute('/admin', { role: 'adult_player' }, 'superadmin').allowed, true);
});

test('family finance is limited to guardians and superadmins', () => {
  assert.equal(authorizeDashboardRoute('/family/payments', { role: 'parent' }).allowed, true);
  assert.equal(authorizeDashboardRoute('/family/payments', { role: 'adult_player' }).allowed, false);
});

test('staff operations reject member-only personas', () => {
  assert.equal(authorizeDashboardRoute('/equipment', { role: 'coach' }).allowed, true);
  assert.equal(authorizeDashboardRoute('/fundraising', { role: 'parent' }).allowed, false);
  assert.equal(authorizeDashboardRoute('/manage-tournaments', { role: 'adult_player' }).allowed, false);
});

test('institution and competition hubs require matching authority', () => {
  assert.equal(authorizeDashboardRoute('/club', { role: 'admin', plan_type: 'school' }).allowed, false);
  assert.equal(authorizeDashboardRoute('/club', { role: 'admin', plan_type: 'school' }, undefined, true).allowed, true);
  assert.equal(authorizeDashboardRoute('/club', { role: 'coach', plan_type: 'free' }).allowed, false);
  assert.equal(authorizeDashboardRoute('/competition', { role: 'league_creator', plan_type: 'free' }).allowed, true);
  assert.equal(authorizeDashboardRoute('/competition', { role: 'coach', plan_type: 'team' }).allowed, false);
});

test('denied sensitive routes land directly on the persona-authorized home', () => {
  const paths = [
    '/admin', '/club', '/competition', '/dashboard/billing', '/coaches-corner', '/family',
  ];
  const cases = [
    {
      profile: { role: 'parent' }, institutionAuthority: false,
      allowed: new Set(['/family']), deniedLanding: '/family',
    },
    {
      profile: { role: 'league_creator' }, institutionAuthority: false,
      allowed: new Set(['/competition', '/dashboard/billing', '/coaches-corner']),
      deniedLanding: '/competition',
    },
    {
      profile: { role: 'admin', plan_type: 'school' }, institutionAuthority: true,
      allowed: new Set(['/club', '/competition', '/dashboard/billing', '/coaches-corner']),
      deniedLanding: '/club',
    },
    {
      profile: { role: 'adult_player' }, institutionAuthority: false,
      allowed: new Set(), deniedLanding: '/dashboard',
    },
  ];

  for (const routeCase of cases) {
    for (const path of paths) {
      const decision = authorizeDashboardRoute(
        path,
        routeCase.profile,
        undefined,
        routeCase.institutionAuthority,
      );
      assert.deepEqual(
        decision,
        routeCase.allowed.has(path)
          ? { allowed: true }
          : { allowed: false, redirectTo: routeCase.deniedLanding },
      );
    }
  }
});

test('shared navigation hides routes rejected by the dashboard policy', () => {
  const shell = fs.readFileSync(new URL('../src/components/layout/Shell.tsx', import.meta.url), 'utf8');

  assert.match(shell, /authorizeDashboardRoute\(tab\.href,/);
});

test('ordinary authenticated routes remain available during profile setup', () => {
  assert.equal(authorizeDashboardRoute('/dashboard', null).allowed, true);
  assert.equal(authorizeDashboardRoute('/teams/join', { role: 'adult_player' }).allowed, true);
});

test('pre-render admission redirects denied sensitive routes before client providers mount', async () => {
  const parentIdentity = { uid: 'parent-1', role: 'parent', signInProvider: 'password' };
  const resolveParent = async identity => {
    assert.deepEqual(identity, parentIdentity);
    return { allowed: true, redirectTo: null, profile: { role: 'parent' } };
  };

  assert.equal(
    await resolveDashboardRouteRedirect('/admin', parentIdentity, resolveParent),
    '/family',
  );
  assert.equal(
    await resolveDashboardRouteRedirect('/family/payments', parentIdentity, resolveParent),
    null,
  );

  const superAdminIdentity = { uid: 'root-1', role: 'superadmin', signInProvider: 'password' };
  assert.equal(
    await resolveDashboardRouteRedirect('/admin', superAdminIdentity, async () => ({
      allowed: true,
      redirectTo: null,
      profile: { role: 'adult_player' },
    })),
    null,
  );

  assert.equal(
    await resolveDashboardRouteRedirect('/admin', parentIdentity, async () => ({
      allowed: false,
      code: 'auth/account-unavailable',
    })),
    '/login?reason=unavailable',
  );
});

test('protected request admission redirects before rendering and preserves closed failure behavior', async () => {
  const execute = async options => {
    const {
    pathname,
    search = '',
    sessionCookie,
    verifiedIdentity = {
      uid: 'parent-1',
      role: 'parent',
      signInProvider: 'password',
      emailVerified: true,
    },
    accountDecision = { allowed: true, redirectTo: null, profile: { role: 'parent' } },
    verifyError,
    resolveError,
    } = options;
    const effectiveSessionCookie = Object.hasOwn(options, 'sessionCookie')
      ? sessionCookie
      : 'opaque-session';
    const events = [];
    const result = await runProtectedRouteAdmission(
      { pathname, search, sessionCookie: effectiveSessionCookie },
      {
        verifySession: async cookie => {
          events.push(`verify:${cookie}`);
          if (verifyError) throw verifyError;
          return verifiedIdentity;
        },
        resolveAccountSession: async identity => {
          events.push(`resolve:${identity.uid}`);
          if (resolveError) throw resolveError;
          return accountDecision;
        },
        redirect: decision => {
          events.push(`redirect:${decision.location}`);
          return { kind: 'redirect', ...decision };
        },
        continueRequest: () => {
          events.push('continue');
          return { kind: 'continue' };
        },
      },
    );
    return { result, events };
  };

  const denied = await execute({ pathname: '/admin' });
  assert.deepEqual(denied.result, {
    kind: 'redirect',
    location: '/family',
    clearSession: false,
  });
  assert.deepEqual(denied.events, [
    'verify:opaque-session',
    'resolve:parent-1',
    'redirect:/family',
  ]);

  assert.deepEqual((await execute({ pathname: '/family/payments' })).result, { kind: 'continue' });
  assert.deepEqual((await execute({
    pathname: '/admin',
    verifiedIdentity: {
      uid: 'root-1', role: 'superadmin', signInProvider: 'password', emailVerified: true,
    },
    accountDecision: { allowed: true, redirectTo: null, profile: { role: 'adult_player' } },
  })).result, { kind: 'continue' });
  assert.deepEqual((await execute({
    pathname: '/admin',
    accountDecision: { allowed: false, code: 'auth/account-unavailable' },
  })).result, {
    kind: 'redirect',
    location: '/login?reason=unavailable',
    clearSession: false,
  });
  assert.deepEqual((await execute({
    pathname: '/admin',
    resolveError: new Error('provider details must not escape'),
  })).result, {
    kind: 'redirect',
    location: '/login?reason=session-unavailable',
    clearSession: false,
  });
  assert.deepEqual((await execute({
    pathname: '/admin',
    verifyError: new Error('revoked'),
  })).result, {
    kind: 'redirect',
    location: '/login',
    reason: 'expired',
    returnTo: '/admin',
    clearSession: true,
  });

  const missing = await execute({
    pathname: '/admin',
    search: '?section=plans',
    sessionCookie: undefined,
  });
  assert.deepEqual(missing.result, {
    kind: 'redirect',
    location: '/login',
    reason: 'expired',
    returnTo: '/admin?section=plans',
    clearSession: false,
  });
  assert.deepEqual(missing.events, ['redirect:/login']);
});

test('protected request admission does not reclassify a redirect adapter failure', async () => {
  let redirectAttempts = 0;
  await assert.rejects(
    runProtectedRouteAdmission(
      { pathname: '/admin', search: '', sessionCookie: 'opaque-session' },
      {
        verifySession: async () => ({
          uid: 'parent-1', role: 'parent', signInProvider: 'password', emailVerified: true,
        }),
        resolveAccountSession: async () => ({
          allowed: true, redirectTo: null, profile: { role: 'parent' },
        }),
        redirect: () => {
          redirectAttempts += 1;
          throw new Error('redirect adapter failed');
        },
        continueRequest: () => ({ kind: 'continue' }),
      },
    ),
    /redirect adapter failed/,
  );
  assert.equal(redirectAttempts, 1);
});

test('middleware wires the protected admission result before its sole render continuation', () => {
  const middleware = fs.readFileSync(new URL('../src/middleware.ts', import.meta.url), 'utf8');
  const admissionAt = middleware.indexOf('const admission = await runProtectedRouteAdmission(');
  const returnAt = middleware.indexOf('if (admission) {\n      return admission;');
  const renderAt = middleware.indexOf('NextResponse.next({ request: { headers: requestHeaders } })');

  assert.ok(admissionAt >= 0);
  assert.ok(returnAt > admissionAt);
  assert.ok(renderAt > returnAt);
  assert.match(middleware, /verifySession: async cookie =>[\s\S]*verifySessionCookie\(cookie, true\)/);
  assert.match(middleware, /resolveAccountSession: resolveServerAccountSession/);
  assert.match(middleware, /continueRequest: \(\) => null/);
});
