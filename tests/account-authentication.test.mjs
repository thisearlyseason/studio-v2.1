import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('email-password signup requires verification before plan or tenant access', async () => {
  const [signup, clientAuth, verificationRoute, templates] = await Promise.all([
    source('../src/app/signup/page.tsx'),
    source('../src/lib/client-auth.ts'),
    source('../src/app/api/email/verify-email/route.ts'),
    source('../src/lib/email-templates.ts'),
  ]);
  const auth = await source('../src/lib/api-auth.ts');
  const rules = await source('../firestore.rules');

  assert.match(signup, /sendBrandedVerificationEmail/);
  assert.match(signup, /router\.push\('\/verify-email'\)/);
  assert.match(signup, /password !== passwordConfirmation/);
  assert.match(signup, /Confirm Password/);
  assert.match(signup, /sendBrandedVerificationEmail[\s\S]*writeBatch/);
  assert.match(signup, /await deleteUser\(createdUser\)/);
  assert.doesNotMatch(signup, /description: error\.message/);
  assert.match(clientAuth, /\/api\/email\/verify-email/);
  assert.match(verificationRoute, /allowUnverifiedEmail: true/);
  assert.match(verificationRoute, /generateEmailVerificationLink/);
  assert.match(verificationRoute, /noreply@thesquad\.pro/);
  assert.match(verificationRoute, /verification-email/);
  assert.match(templates, /export function verificationEmail/);
  assert.match(templates, /Verify My Email/);
  assert.match(auth, /auth\/email-not-verified/);
  assert.match(auth, /!options\.allowUnverifiedEmail/);
  assert.match(rules, /email_verified/);
  assert.match(rules, /hasActiveAccount/);
});

test('login preserves password whitespace and returns a non-enumerating error', async () => {
  const login = await source('../src/app/login/page.tsx');

  assert.match(login, /signInWithEmailAndPassword\(auth, email\.trim\(\)\.toLowerCase\(\), password\)/);
  assert.doesNotMatch(login, /signInWithEmailAndPassword\([^)]*password\.trim\(\)/);
  assert.match(login, /The email or password is incorrect, or this account is unavailable/);
});

test('existing unverified accounts are preserved but locked until verification', async () => {
  const [login, verification, middleware, routePolicy, sessionRouteEntry, sessionHandlers] = await Promise.all([
    source('../src/app/login/page.tsx'),
    source('../src/app/verify-email/page.tsx'),
    source('../src/middleware.ts'),
    source('../src/lib/dashboard-route-policy.ts'),
    source('../src/app/api/auth/session/route.ts'),
    source('../src/lib/session-route-handlers.ts'),
  ]);
  const sessionRoute = `${sessionRouteEntry}\n${sessionHandlers}`;

  assert.match(login, /!user\.isAnonymous && !user\.emailVerified/);
  assert.match(login, /clearBrowserSession\(\)[\s\S]*router\.replace\('\/verify-email'\)/);
  assert.match(verification, /Account access stays locked until/);
  assert.match(verification, /Resend Verification/);
  assert.match(verification, /RESEND_COOLDOWN_MS = 60_000/);
  assert.match(verification, /sendBrandedVerificationEmail\(auth\.currentUser/);
  assert.match(verification, /Use another account/);
  assert.match(middleware, /emailVerified: decoded\.email_verified === true/);
  assert.match(routePolicy, /identity\.emailVerified !== true/);
  assert.match(sessionRoute, /decoded\.email_verified !== true/);
});

test('unverified accounts do not start protected Firestore profile listeners', async () => {
  const provider = await source('../src/components/providers/team-provider.tsx');

  assert.match(provider, /firebaseUser\.emailVerified/);
  assert.match(provider, /firebaseUser\.emailVerified !== true/);
  assert.match(provider, /teamsQuery[\s\S]*firebaseUser\.emailVerified === true/);
  assert.match(provider, /claimPendingSchoolInvites[\s\S]*firebaseUser\.emailVerified !== true/);
});

test('admission-only pages and passive admin navigation do not mutate protected account state', async () => {
  const [onboarding, admin] = await Promise.all([
    source('../src/app/onboarding/page.tsx'),
    source('../src/app/admin/page.tsx'),
  ]);

  assert.doesNotMatch(onboarding, /\bgetDoc\s*\(/, 'missing-profile onboarding must not probe the protected user document');
  assert.match(onboarding, /readBrowserSession\(\)/, 'onboarding must retain server-authoritative admission');
  assert.doesNotMatch(
    admin,
    /await updateDoc\(userRef,\s*\{\s*lastAdminLoginAt:/,
    'rendering the admin route must not add fixture fields to the signed-in user document',
  );
});

test('authenticated users without an avatar use the same-origin fallback asset', async () => {
  const provider = await import('../src/components/providers/team-provider.tsx');

  assert.equal(typeof provider.resolveUserAvatar, 'function');
  assert.equal(provider.resolveUserAvatar(), '/icon.png');
  assert.equal(provider.resolveUserAvatar(undefined, ''), '/icon.png');
  assert.equal(provider.resolveUserAvatar('/member-avatar.png'), '/member-avatar.png');
  assert.equal(
    provider.resolveUserAvatar(undefined, 'https://cdn.example.test/member.png'),
    'https://cdn.example.test/member.png',
  );
});

test('verification-email route reports provider configuration failures without a generic 500', async () => {
  const route = await source('../src/app/api/email/verify-email/route.ts');

  assert.match(route, /auth\/invalid-continue-uri/);
  assert.match(route, /Email verification configuration is invalid/);
  assert.match(route, /status: 503/);
});

test('email changes require verification before the stored profile email changes', async () => {
  const settings = await source('../src/app/(dashboard)/settings/page.tsx');

  assert.match(settings, /verifyBeforeUpdateEmail/);
  assert.match(settings, /saveProfileFields\(false\)/);
  assert.doesNotMatch(settings, /await updateEmail\(/);
});

test('protected pages require a revocation-checked HTTP-only server session', async () => {
  const [middleware, sessionRouteEntry, sessionHandlers, clientAuth] = await Promise.all([
    source('../src/middleware.ts'),
    source('../src/app/api/auth/session/route.ts'),
    source('../src/lib/session-route-handlers.ts'),
    source('../src/lib/client-auth.ts'),
  ]);
  const sessionRoute = `${sessionRouteEntry}\n${sessionHandlers}`;

  assert.match(middleware, /request\.cookies\.get\('__session'\)/);
  assert.match(middleware, /verifySessionCookie\(cookie, true\)/);
  assert.match(middleware, /runtime: 'nodejs'/);
  assert.match(middleware, /pathname\.startsWith\('\/events\/register\/'\).*return false/);
  assert.match(middleware, /pathname === '\/leagues'/);
  assert.match(middleware, /pathname === '\/tournaments'/);
  const protectedRoots = middleware.match(/const PROTECTED_ROOTS = new Set\(\[([\s\S]*?)\]\);/)?.[1] ?? '';
  assert.doesNotMatch(protectedRoots, /['"]safety['"]/, 'the public Safety Center must not require a session');
  assert.match(sessionRoute, /createSessionCookie/);
  assert.match(sessionRoute, /verifySessionCookie\(sessionCookie, true\)/);
  assert.match(sessionRoute, /httpOnly: true/);
  assert.match(clientAuth, /establishBrowserSession/);
  assert.match(clientAuth, /clearBrowserSession/);
});
