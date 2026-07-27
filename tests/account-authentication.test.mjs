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
  const [login, verification, middleware, sessionRoute] = await Promise.all([
    source('../src/app/login/page.tsx'),
    source('../src/app/verify-email/page.tsx'),
    source('../src/middleware.ts'),
    source('../src/app/api/auth/session/route.ts'),
  ]);

  assert.match(login, /!user\.isAnonymous && !user\.emailVerified/);
  assert.match(login, /clearBrowserSession\(\)[\s\S]*router\.replace\('\/verify-email'\)/);
  assert.match(verification, /Account access stays locked until/);
  assert.match(verification, /Resend Verification/);
  assert.match(verification, /RESEND_COOLDOWN_MS = 60_000/);
  assert.match(verification, /sendBrandedVerificationEmail\(auth\.currentUser/);
  assert.match(verification, /Use another account/);
  assert.match(middleware, /decoded\.email_verified !== true/);
  assert.match(sessionRoute, /decoded\.email_verified !== true/);
});

test('email changes require verification before the stored profile email changes', async () => {
  const settings = await source('../src/app/(dashboard)/settings/page.tsx');

  assert.match(settings, /verifyBeforeUpdateEmail/);
  assert.match(settings, /saveProfileFields\(false\)/);
  assert.doesNotMatch(settings, /await updateEmail\(/);
});

test('protected pages require a revocation-checked HTTP-only server session', async () => {
  const [middleware, sessionRoute, clientAuth] = await Promise.all([
    source('../src/middleware.ts'),
    source('../src/app/api/auth/session/route.ts'),
    source('../src/lib/client-auth.ts'),
  ]);

  assert.match(middleware, /request\.cookies\.get\('__session'\)/);
  assert.match(middleware, /verifySessionCookie\(sessionCookie, true\)/);
  assert.match(middleware, /runtime: 'nodejs'/);
  assert.match(middleware, /pathname\.startsWith\('\/events\/register\/'\).*return false/);
  assert.match(middleware, /pathname === '\/leagues'/);
  assert.match(middleware, /pathname === '\/tournaments'/);
  assert.match(sessionRoute, /createSessionCookie/);
  assert.match(sessionRoute, /verifySessionCookie\(sessionCookie, true\)/);
  assert.match(sessionRoute, /httpOnly: true/);
  assert.match(clientAuth, /establishBrowserSession/);
  assert.match(clientAuth, /clearBrowserSession/);
});
