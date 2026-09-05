import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import nextEnvironment from '@next/env';

import { buildFixtureCatalog } from '../scripts/qa/certification/fixture-catalog.mjs';
import * as auditRunner from '../scripts/qa/run-phase2-emulator-audit.mjs';

const { processEnv, resetEnv } = nextEnvironment;

const source = await readFile(new URL('../scripts/qa/run-phase2-emulator-audit.mjs', import.meta.url), 'utf8');
const seederSource = await readFile(new URL('../scripts/qa/seed-phase2-emulator-fixtures.mjs', import.meta.url), 'utf8');

test('certification identity mode accepts a unique local scope without changing legacy defaults', () => {
  const configured = auditRunner.resolveAuditRuntimeConfiguration({
    environment: {
      AUDIT_FIREBASE_PROJECT_ID: 'demo-task3-certification',
      AUDIT_FIXTURE_RUN_SUFFIX: 't3-20260904-180000-a1',
      AUDIT_BASE_URL: 'http://127.0.0.1:9001',
      AUDIT_BROWSER_SESSION_PREFIX: 'cert-final-cert-t3-20260904-180000-a1-identity',
    },
    argv: ['--certification-identity', '--browser'],
  });
  assert.deepEqual(configured, {
    projectId: 'demo-task3-certification',
    baseUrl: 'http://127.0.0.1:9001',
    fixtureRunSuffix: 't3-20260904-180000-a1',
    browserSessionPrefix: 'cert-final-cert-t3-20260904-180000-a1-identity',
    certificationIdentity: true,
    runBrowser: true,
    selectedScenarios: [],
  });

  assert.deepEqual(auditRunner.resolveAuditRuntimeConfiguration({ environment: {}, argv: [] }), {
    projectId: 'demo-the-squad-audit',
    baseUrl: 'http://127.0.0.1:9001',
    fixtureRunSuffix: 'phase2',
    browserSessionPrefix: 'phase2',
    certificationIdentity: false,
    runBrowser: false,
    selectedScenarios: [],
  });
});

test('legacy configurable runtime rejects off-loopback and ambiguous app origins', () => {
  for (const baseUrl of [
    'http://127.0.0.1:9001@example.invalid',
    'https://127.0.0.1:9001',
    'http://localhost',
    'http://127.0.0.1:9001/path',
  ]) {
    assert.throws(() => auditRunner.resolveAuditRuntimeConfiguration({
      environment: { AUDIT_BASE_URL: baseUrl },
      argv: ['--certification-identity'],
    }), /loopback/);
  }
});

test('identity API targets follow uniquely scoped fixture team IDs', () => {
  const catalog = buildFixtureCatalog('t3-identity-target-a1');
  assert.deepEqual(auditRunner.buildIdentityApiTargets(catalog), {
    teamAId: 'qa-team-a-t3-identity-target-a1',
    teamBId: 'qa-team-b-t3-identity-target-a1',
  });
});

test('identity API request plan applies scoped team IDs to every tenant target', () => {
  const catalog = buildFixtureCatalog('t3-identity-request-plan-a1');
  const plan = auditRunner.buildIdentityApiRequestPlan(catalog);
  assert.equal(plan.length, 5);
  assert.equal(plan.filter(item => item.pathname.includes(catalog.teams.find(team => team.alias === 'qa-team-a').id)).length, 3);
  assert.equal(plan.filter(item => item.pathname.includes(catalog.teams.find(team => team.alias === 'qa-team-b').id)).length, 2);
  assert.equal(plan.some(item => /qa-team-[ab](?:[/?]|$)/.test(item.pathname)), false);
});

test('owned legacy browser cleanup attempts all sessions and retries failures only', async () => {
  const sessions = new Set(['cert-run-owner', 'cert-run-member', 'sentinel-unrelated']);
  const owned = new Set(['cert-run-owner', 'cert-run-member']);
  const attempts = [];
  const failedOnce = new Set();
  await auditRunner.closeOwnedBrowserSessions(owned, async session => {
    attempts.push(session);
    if (session === 'cert-run-owner' && !failedOnce.has(session)) {
      failedOnce.add(session);
      throw new Error('transient close');
    }
    sessions.delete(session);
  });
  assert.deepEqual(attempts, ['cert-run-member', 'cert-run-owner', 'cert-run-owner']);
  assert.deepEqual([...sessions], ['sentinel-unrelated']);
  assert.equal(owned.size, 0);
});

test('scenario browser cleanup closes only sessions created after its baseline', async () => {
  const sessions = new Set(['cert-earlier', 'sentinel-unrelated', 'cert-current-a', 'cert-current-b']);
  const baseline = new Set(['cert-earlier', 'sentinel-unrelated']);
  const attempts = [];
  await auditRunner.closeBrowserSessionsCreatedAfter(sessions, baseline, async session => {
    attempts.push(session);
  });
  assert.deepEqual(attempts, ['cert-current-b', 'cert-current-a']);
  assert.deepEqual([...sessions], ['cert-earlier', 'sentinel-unrelated']);
});

test('one-session cleanup removes only the exact completed session and retries it', async () => {
  const sessions = new Set(['cert-complete', 'cert-still-running']);
  let attempts = 0;
  await auditRunner.closeOneOwnedBrowserSession(sessions, 'cert-complete', async session => {
    attempts += 1;
    assert.equal(session, 'cert-complete');
    if (attempts === 1) throw new Error('transient close');
  });
  assert.equal(attempts, 2);
  assert.deepEqual([...sessions], ['cert-still-running']);
});

test('local service cleanup terminates the owned process group, not only the wrapper process', () => {
  const calls = [];
  auditRunner.terminateChildProcessTree({ pid: 43210, killed: false }, 'SIGTERM', (pid, signal) => {
    calls.push([pid, signal]);
  }, 'darwin');
  assert.deepEqual(calls, [[-43210, 'SIGTERM']]);
});

test('legacy shutdown defers cleanup until the active command boundary and preserves the first signal', () => {
  const shutdown = auditRunner.createAuditShutdownState();
  assert.equal(shutdown.exitCode, null);
  shutdown.request(130);
  shutdown.request(143);
  assert.equal(shutdown.exitCode, 130);
  assert.throws(
    () => shutdown.throwIfRequested(),
    error => error.exitCode === 130 && /interrupted/i.test(error.message),
  );
});

test('trusted-claim mutation preserves unrelated claims while replacing only role', () => {
  assert.deepEqual(
    auditRunner.withRoleClaim({ role: 'superadmin', tenant: 'fixture-a', feature: true }, 'coach'),
    { role: 'coach', tenant: 'fixture-a', feature: true },
  );
});

test('legacy audit resolves fixture documents through the catalog-owned fixtureAlias field', () => {
  const catalog = buildFixtureCatalog('identity-fixture-alias-a1');
  const player = auditRunner.fixtureDocumentByAlias(catalog, 'qa-player-youth-c');
  assert.equal(player.data.fixtureAlias, 'qa-player-youth-c');
  assert.equal(player.path, `players/${player.data.id}`);
  assert.throws(
    () => auditRunner.fixtureDocumentByAlias(catalog, 'missing-fixture-alias'),
    /Missing fixture document/,
  );
});

test('legacy audit tears down the exact Firebase Admin app instance', async () => {
  const calls = [];
  const app = { async delete() { calls.push('delete'); } };
  await auditRunner.deleteOwnedAdminApp(app);
  assert.deepEqual(calls, ['delete']);
});

test('token revocation waits beyond the ID token auth_time second', async () => {
  const payload = Buffer.from(JSON.stringify({ auth_time: 100 })).toString('base64url');
  const token = `header.${payload}.signature`;
  let now = 100_250;
  const waits = [];
  await auditRunner.waitForIdTokenRevocationBoundary(token, {
    now: () => now,
    wait: async delay => { waits.push(delay); now += delay; },
  });
  assert.deepEqual(waits, [750]);
  await assert.rejects(
    () => auditRunner.waitForIdTokenRevocationBoundary('malformed'),
    /auth_time/,
  );
});

test('password-reset OOB selection is recipient-scoped and chooses the newest unused code', () => {
  const selected = auditRunner.selectLatestPasswordResetOob({ oobCodes: [
    { email: 'other@phase2.test', requestType: 'PASSWORD_RESET', oobCode: 'wrong' },
    { email: 'target@phase2.test', requestType: 'VERIFY_EMAIL', oobCode: 'verify' },
    { email: 'target@phase2.test', requestType: 'PASSWORD_RESET', oobCode: 'older' },
    { email: 'TARGET@phase2.test', requestType: 'PASSWORD_RESET', oobCode: 'newest' },
  ] }, 'target@phase2.test', new Set(['older']));
  assert.equal(selected.oobCode, 'newest');
  assert.throws(() => auditRunner.selectLatestPasswordResetOob({ oobCodes: [] }, 'target@phase2.test'), /No password-reset OOB/);
});

test('verification OOB selection never crosses recipients or action types', () => {
  const selected = auditRunner.selectLatestOob({ oobCodes: [
    { email: 'target@phase2.test', requestType: 'PASSWORD_RESET', oobCode: 'reset' },
    { email: 'other@phase2.test', requestType: 'VERIFY_EMAIL', oobCode: 'other' },
    { email: 'TARGET@phase2.test', requestType: 'VERIFY_EMAIL', oobCode: 'verify' },
  ] }, 'target@phase2.test', 'VERIFY_EMAIL');
  assert.equal(selected.oobCode, 'verify');
});

test('emulator audit creates runtime-only credentials and redacts failures', () => {
  assert.match(source, /randomBytes\(24\)/);
  assert.match(source, /for \(const secret of sensitiveValues\) output = output\.replaceAll\(secret, '\[redacted\]'\)/);
  assert.doesNotMatch(source, /args\.join\(' '\)\} failed/);
  assert.doesNotMatch(source, /AUDIT_FIXTURE_PASSWORD:\s*['"][^'"]+['"]/);
});

test('emulator audit covers tenant, lifecycle, and trusted-claim boundaries', () => {
  assert.match(source, /Team A owner denied Team B chat context/);
  assert.match(source, /Team B owner denied Team A chat context/);
  assert.match(source, /removed member denied former team context/);
  assert.match(source, /deletion-pending account denied server API/);
  assert.match(source, /profile-only fake superadmin denied admin API/);
  assert.match(source, /fake superadmin browser route denial/);
});

test('demo browser certification exits through the visible account control', () => {
  const demoBlock = source
    .split("if (scenarioId === 'demo-seed-use-exit-expiry-cleanup')")
    .find(block => block.includes("openAnonymousBrowser('cert-demo')"))
    ?.split("if (scenarioId === 'dashboard-shell-role-landing-and-route-policy')")[0] || '';
  assert.match(demoBlock, /getByRole\('button', \{ name: 'Open account menu' \}\)\.click\(\)/);
  assert.match(demoBlock, /getByRole\('menuitem', \{ name: 'Sign Out' \}\)\.click\(\)/);
  assert.doesNotMatch(demoBlock, /page\.request\.post/);
});

test('browser evidence waits for the filtered admin row and preserves console diagnostics', () => {
  assert.match(source, /target\.waitFor\(\{ state: 'visible', timeout: 15000 \}\)/);
  assert.match(source, /console\.log\(`\$\{label\} persistence console diagnostic:/);
  assert.match(source, /console\.log\(`\$\{label\} persistence failed response diagnostic:/);
});

test('default API and browser audits consume every blocked session expectation', () => {
  const catalog = buildFixtureCatalog('blocked-audit-a1');
  const plan = auditRunner.buildBlockedAuditPlan(catalog.blockedAliases);

  assert.deepEqual(plan.api.map(identity => identity.alias), [
    'qa-unverified',
    'qa-suspended',
    'qa-pending-delete',
  ]);
  assert.deepEqual(plan.browser.map(identity => identity.alias), plan.api.map(identity => identity.alias));
  assert.deepEqual(plan.api.map(identity => identity.sessionStatus), [403, undefined, 403]);
  assert.deepEqual(plan.browser.map(identity => [identity.browserPath, identity.browserTitle]), [
    ['/verify-email', 'Verify Your Email'],
    ['/login', 'Login Failed'],
    ['/login', 'Session Setup Failed'],
  ]);
  assert.throws(() => { plan.api.push(catalog.blockedAliases[0]); }, TypeError);
  assert.throws(() => { plan.api[0].alias = 'mutated'; }, TypeError);
});

test('emulator audit strips inherited outbound provider credentials and activates the server boundary', () => {
  assert.equal(typeof auditRunner.buildIsolatedAuditEnvironment, 'function');
  const inherited = {
    PATH: '/synthetic/bin',
    STRIPE_SECRET_KEY: 'sk_live_inherited_value',
    STRIPE_WEBHOOK_SECRET: 'whsec_inherited_value',
    STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_connect_inherited_value',
    RESEND_API_KEY: 're_inherited_value',
    RESEND_WEBHOOK_SECRET: 'whsec_resend_inherited_value',
    WEB_PUSH_VAPID_PRIVATE_KEY: 'inherited_private_key',
    WEB_PUSH_VAPID_SUBJECT: 'mailto:real@example.test',
    OWNER_FCM_TOKEN: 'inherited_fcm_token',
    OWNER_NOTIFICATION_EMAIL: 'real@example.test',
    INTERNAL_API_SECRET: 'inherited_internal_secret',
    FIREBASE_SERVICE_ACCOUNT_JSON: '{"private_key":"inherited"}',
    GOOGLE_APPLICATION_CREDENTIALS: '/synthetic/real-service-account.json',
  };

  const isolated = auditRunner.buildIsolatedAuditEnvironment(inherited, {
    AUDIT_FIXTURE_PASSWORD: 'runtime-only-test-value',
  });

  assert.equal(isolated.PATH, inherited.PATH);
  assert.equal(isolated.AUDIT_FIXTURE_PASSWORD, 'runtime-only-test-value');
  assert.equal(isolated.AUDIT_OUTBOUND_PROVIDER_MODE, 'block');
  for (const key of Object.keys(inherited).filter(key => key !== 'PATH')) {
    assert.equal(isolated[key], '', `${key} must not survive into the audit process`);
  }
});

test('emulator audit shadows absent credentials before Next environment files load', () => {
  const credentialKeys = [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_CONNECT_WEBHOOK_SECRET',
    'RESEND_API_KEY',
    'RESEND_WEBHOOK_SECRET',
    'WEB_PUSH_VAPID_PRIVATE_KEY',
    'WEB_PUSH_VAPID_SUBJECT',
    'NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY',
    'NEXT_PUBLIC_FCM_VAPID_KEY',
    'OWNER_FCM_TOKEN',
    'OWNER_NOTIFICATION_EMAIL',
    'INTERNAL_API_SECRET',
    'FIREBASE_SERVICE_ACCOUNT_JSON',
    'GOOGLE_APPLICATION_CREDENTIALS',
  ];
  const isolated = auditRunner.buildIsolatedAuditEnvironment({ PATH: '/synthetic/bin' });
  for (const key of credentialKeys) {
    assert.equal(Object.hasOwn(isolated, key), true, `${key} must be explicitly shadowed`);
    assert.equal(isolated[key], '');
  }

  const environmentKeys = [...credentialKeys, '__NEXT_PROCESSED_ENV'];
  const previous = Object.fromEntries(environmentKeys.map(key => [key, process.env[key]]));
  try {
    for (const key of environmentKeys) delete process.env[key];
    Object.assign(process.env, isolated);
    processEnv([{
      path: '.env.local',
      contents: [
        'RESEND_API_KEY=re_dotenv_must_not_load',
        'STRIPE_SECRET_KEY=sk_test_dotenv_must_not_load',
        'WEB_PUSH_VAPID_PRIVATE_KEY=dotenv_must_not_load',
      ].join('\n'),
    }], process.cwd(), { error() {} }, true);

    assert.equal(process.env.RESEND_API_KEY, '');
    assert.equal(process.env.STRIPE_SECRET_KEY, '');
    assert.equal(process.env.WEB_PUSH_VAPID_PRIVATE_KEY, '');
  } finally {
    resetEnv();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('emulator audit exercises real fixture readers, public visibility, entitlements, delegation, and Storage lifecycle', () => {
  assert.match(source, /seeded tournament reader returns published bracket/);
  assert.match(source, /published volunteer public GET/);
  assert.match(source, /unpublished volunteer public GET denial/);
  assert.match(source, /published fundraiser public GET/);
  assert.match(source, /unpublished fundraiser public GET denial/);
  assert.match(source, /active local entitlement reaches Connect status without provider call/);
  assert.match(source, /school delegate reaches hub-backed entitlement/);
  assert.match(source, /school outsider denied hub-backed entitlement/);
  assert.match(source, /public Storage object is anonymously readable/);
  assert.match(source, /private Storage object rejects cross-tenant reader/);
  assert.match(source, /pending-delete Storage object is denied/);
  assert.match(source, /deleted Storage lifecycle object is absent/);
  assert.match(source, /post-cleanup Storage object is absent/);
});

test('emulator audit drives every seeded active persona and session boundary in a browser', () => {
  assert.match(source, /browserLogin\('qa-team-assistant'/);
  assert.match(source, /browserLogin\('qa-team-member'/);
  assert.match(source, /browserLogin\('qa-youth-active'/);
  assert.match(source, /owner billing browser route/);
  assert.match(source, /assistant staff route/);
  assert.match(source, /member staff route denial/);
  assert.match(source, /parent finance browser route/);
  assert.match(source, /player finance browser route denial/);
  assert.match(source, /protected deep link resumes after login/);
  assert.match(source, /logout revokes the browser session/);
  assert.match(source, /second tab observes logout/);
  assert.match(source, /wrong-password login uses generic failure copy/);
  assert.match(source, /disabled login uses generic failure copy/);
  assert.match(source, /unverified login reaches verification gate/);
  assert.match(source, /deletion-pending login is denied/);
});

test('Task 3 login browser waits on state and sends a real rapid double click', () => {
  const login = source.match(/async function browserLoginCredentials[\s\S]*?\n}\n\nfunction browserPath/)?.[0] || '';
  const doubleSubmit = source.match(/function browserLoginDoubleSubmitAudit[\s\S]*?\n}\n\nfunction browserResetRequestAudit/)?.[0] || '';
  assert.match(login, /waitForFunction/);
  assert.doesNotMatch(login, /waitForTimeout/);
  assert.match(doubleSubmit, /page\.mouse\.click/);
  assert.match(doubleSubmit, /page\.waitForTimeout\(750\)/);
  assert.doesNotMatch(doubleSubmit, /new Promise\(resolve => setTimeout/);
  assert.doesNotMatch(doubleSubmit, /submit\.dblclick/);
  assert.match(source, /delayPastClientTimeout[\s\S]*?page\.waitForTimeout\(16000\)/);
});

test('Task 3 login timeout records the expected client-aborted route without swallowing errors', () => {
  assert.match(source, /lateClientAbortCount \+= 1/);
  assert.match(source, /routeHandlerComplete = new Promise/);
  assert.match(source, /login timeout route lifecycle reconciled/);
  assert.match(source, /login timeout route handler errors/);
});

test('Task 3 reset action correlates generic resource console noise with exact response statuses', () => {
  assert.match(source, /reset action console errors/);
  assert.match(source, /reset action unexpected responses/);
  assert.match(source, /value\.includes\('Failed to load resource:'\)/);
  assert.match(source, /JSON\.stringify\(\[400, 200, 400\]\)/);
});

test('Task 3 revoked admin sessions deny both open and fresh tabs at login', () => {
  assert.match(source, /result\.openPaths\.every\(pathname => pathname === '\/login'\)/);
  assert.match(source, /expectEqual\(result\.freshPath, '\/login'/);
  assert.match(source, /revocation expected session denial responses/);
});

test('Task 3 visible admin navigation uses the desktop account menu and mobile More sheet', () => {
  const visibleAudit = source.match(/function browserVisibleAdminNavigationAudit[\s\S]*?\n}\n\nfunction browserSurfaceSweep/)?.[0] || '';
  assert.match(visibleAudit, /name: 'Open account menu'/);
  assert.match(visibleAudit, /name: 'More', exact: true/);
  assert.match(visibleAudit, /getByRole\('link', \{ name: 'Go to Admin Page' \}\)/);
});

test('Task 3 visible admin navigation rehydrates the canonical landing before each viewport assertion', () => {
  const visibleAudit = source.match(/function browserVisibleAdminNavigationAudit[\s\S]*?\n}\n\nfunction browserSurfaceSweep/)?.[0] || '';
  assert.match(visibleAudit, /await page\.goto\(baseUrl \+ canonicalPath\)/);
  assert.match(visibleAudit, /await navigationTrigger\.waitFor\(\{ state: 'visible', timeout: 15000 \}\)/);
  assert.match(source, /browserVisibleAdminNavigationAudit\(session, alias === 'qa-superadmin', '\/settings'\)/);
});

test('Task 3 admin non-SA browser denials wait through client navigation', () => {
  assert.match(source, /admin browser non-SA policy/);
  assert.match(source, /path: '\/admin', expected: '\/dashboard', waitForPathChange: true/);
});

test('Task 3 route sweeps reconcile client redirects before starting the next navigation', () => {
  const sweep = source.match(/function browserSurfaceSweep[\s\S]*?\n}\n\nfunction assertSurfaceSweep/)?.[0] || '';
  assert.match(sweep, /if \(!String\(error\?\.message \|\| error\)\.includes\('net::ERR_ABORTED'\)\) throw error/);
  assert.match(sweep, /await page\.waitForFunction\(expectedPaths => expectedPaths\.includes\(window\.location\.pathname\)/);
});

test('Task 3 emitted browser programs use serialization-safe selectors and real signup clicks', () => {
  const reset = source.match(/function browserResetRequestAudit[\s\S]*?\n}\n\nasync function runCertificationBrowserScenario/)?.[0] || '';
  const scenarios = source.match(/async function runCertificationBrowserScenario[\s\S]*?\n}\n\nasync function runCertificationIdentityScenarios/)?.[0] || '';
  assert.match(reset, /getByLabel\('Account Email'\)/);
  assert.doesNotMatch(reset, /getByLabel\('Email Address'\)/);
  assert.match(reset, /getByText\([^\n]+\{ exact: false \}\)\.first\(\)\.waitFor/);
  assert.match(scenarios, /known-provider-block/);
  assert.match(scenarios, /page\.locator\('#application-form form:visible'\)\.last\(\)/);
  assert.match(scenarios, /betaForm\.locator\('#' \+ id\)\.fill/);
  assert.match(reset, /failedResponses/);
  assert.match(reset, /function browserResetActionAudit/);
  assert.match(reset, /missing newPassword/);
  assert.match(reset, /password has been successfully updated/);
  assert.match(reset, /page\.off\('response'/);
  assert.match(source, /function browserResetRequestAudit\(email, expectedText, label/);
  assert.match(scenarios, /new RegExp\('Name \/ Email'\)/);
  assert.doesNotMatch(scenarios, /name: \/Name \\\/ Email\//);
  assert.match(scenarios, /signup.*page\.mouse\.click/is);
  assert.doesNotMatch(scenarios, /submit\.evaluate\(element => \{ element\.click\(\); element\.click\(\); \}\)/);
  assert.match(scenarios, /assertTwoViewportRoutes\(session, \[\{ path: '\/', expected: '\/' \}\], 'demo public surfaces'\)/);
  assert.doesNotMatch(scenarios, /\{ path: '\/pricing', expected: '\/pricing' \}\], 'demo public surfaces'/);
  assert.match(scenarios, /locator\('#youth-password'\)/);
  assert.match(scenarios, /locator\('#youth-password-confirmation'\)/);
  assert.match(scenarios, /Activate My Account/);
  assert.match(scenarios, /Account Created!/);
  assert.match(scenarios, /youth browser consumed invitation reload denial/);
  assert.doesNotMatch(source, /new URL\((?:response|request)\.url\(\)\)/);
  assert.match(scenarios, /\{ path: '\/admin', expected: '\/dashboard', waitForPathChange: true \}/);
  assert.match(source, /function browserVisibleAdminNavigationAudit/);
  assert.match(scenarios, /dashboard visible navigation agreement/);
});

test('Task 3 anonymous onboarding denial waits for the client redirect in both viewports', () => {
  assert.match(source, /missing-profile anonymous onboarding redirect two viewports/);
  assert.match(source, /window\.location\.pathname === '\/login'/);
  assert.match(source, /missing-profile anonymous onboarding console errors/);
  assert.match(source, /missing-profile anonymous onboarding unexpected responses/);
});

test('Task 3 onboarding double-submit counts the actual Firestore write channel after reset', () => {
  assert.match(source, /google\.firestore\.v1\.Firestore\/Write\/channel/);
  assert.match(source, /decodeURIComponent\(request\.postData\(\) \|\| ''\)/);
  assert.match(source, /profileWrites = 0;[\s\S]*clickCount: 2/);
});

test('Task 3 missing-profile read fault targets the actual Firestore batch-get request', () => {
  assert.match(source, /127\.0\.0\.1:8080\/\*\*/);
  assert.match(source, /waitForRequest\(request => request\.url\(\)\.startsWith\('http:\/\/127\.0\.0\.1:8080\/'\)/);
  assert.match(source, /injectedRead = new Promise/);
  assert.match(source, /await injectedRead/);
  assert.match(source, /onboarding injected read failure console signal/);
  assert.match(source, /onboarding transient read failure recovery/);
});

test('Task 3 legacy route observations remove listeners and avoid fixed settle sleeps', () => {
  const browserPath = source.match(/function browserPath[\s\S]*?\n}\n\nfunction browserRouteAudit/)?.[0] || '';
  const routeAudit = source.match(/function browserRouteAudit[\s\S]*?\n}\n\nfunction browserLoginFailureAudit/)?.[0] || '';
  const loginFailure = source.match(/function browserLoginFailureAudit[\s\S]*?\n}\n\nfunction browserProtectedReturnAudit/)?.[0] || '';
  const surfaceSweep = source.match(/function browserSurfaceSweep[\s\S]*?\n}\n\nfunction assertSurfaceSweep/)?.[0] || '';
  assert.doesNotMatch(browserPath, /waitForTimeout/);
  assert.doesNotMatch(routeAudit, /waitForTimeout/);
  assert.match(routeAudit, /page\.off\('console'/);
  assert.match(routeAudit, /page\.off\('pageerror'/);
  assert.match(routeAudit, /page\.off\('response'/);
  assert.match(loginFailure, /page\.off\('console'/);
  assert.match(loginFailure, /page\.off\('pageerror'/);
  assert.match(loginFailure, /page\.off\('response'/);
  assert.doesNotMatch(surfaceSweep, /waitForTimeout/);
  assert.doesNotMatch(surfaceSweep, /waitForFunction[\s\S]*?\.catch\(\(\) => undefined\)/);
  assert.match(surfaceSweep, /goto\([^\n]+\{ waitUntil: 'domcontentloaded' \}\)/);
  assert.match(surfaceSweep, /page\.off\('console'/);
  assert.match(surfaceSweep, /page\.off\('pageerror'/);
  assert.match(surfaceSweep, /page\.off\('response'/);
});

test('Task 3 scenario execution stops normal mutations after the first failure', async () => {
  assert.equal(typeof auditRunner.executeCertificationScenarioStages, 'function');
  const calls = [];
  const result = await auditRunner.executeCertificationScenarioStages({
    scenarioIds: ['authentication-email-password-login', 'authentication-password-reset'],
    runBrowser: true,
    async runApiScenario(id) { calls.push(`${id}:api`); throw new Error('sanitized first failure'); },
    async runBrowserScenario(id) { calls.push(`${id}:browser`); },
    async closeScenarioBrowsers(id) { calls.push(`${id}:cleanup`); },
    recordFailure(failure) { calls.push(`${failure.scenarioId}:failure:${failure.stage}`); },
    recordSkipped(id) { calls.push(`${id}:skipped`); },
  });
  assert.deepEqual(calls, [
    'authentication-email-password-login:api',
    'authentication-email-password-login:failure:api',
    'authentication-email-password-login:cleanup',
    'authentication-password-reset:skipped',
  ]);
  assert.equal(result.failures.length, 1);
});

test('Task 3 scenario handlers never swallow owned cleanup failures', () => {
  const handlers = source.match(/async function runCertificationApiScenario[\s\S]*?async function runCertificationIdentityScenarios/)?.[0] || '';
  assert.doesNotMatch(handlers, /catch\(\(\) => undefined\)/);
});

test('Task 3 case artifacts sanitize actor values before writing', () => {
  assert.equal(typeof auditRunner.sanitizeCertificationArtifact, 'function');
  const sanitized = auditRunner.sanitizeCertificationArtifact({
    tenantAlias: 'qa-parent-a',
    email: 'synthetic-user@phase2.test',
    detail: 'Authorization: Bearer token-value',
    nested: { actionUrl: 'http://127.0.0.1:9001/reset?oobCode=secret' },
  });
  assert.equal(sanitized.tenantAlias, 'qa-parent-a');
  assert.equal(sanitized.email, '[synthetic-email]');
  assert.doesNotMatch(JSON.stringify(sanitized), /token-value|oobCode=secret/);
});

test('Task 3 case selection requires every exact assertion and excludes unrelated scenario assertions', () => {
  assert.equal(typeof auditRunner.selectCertificationCaseAssertions, 'function');
  const assertions = [
    { label: 'contact stored once', observed: '1' },
    { label: 'beta stored once', observed: '1' },
    { label: 'unrelated login', observed: '/dashboard' },
  ];
  assert.deepEqual(
    auditRunner.selectCertificationCaseAssertions(assertions, [/^contact stored once$/, /^beta stored once$/]),
    assertions.slice(0, 2),
  );
  assert.throws(
    () => auditRunner.selectCertificationCaseAssertions(assertions, [/^missing required assertion$/]),
    /missing required assertion/i,
  );
});

test('Task 3 signup negative case matches the executed provider-failure label', () => {
  assert.match(source, /signup provider-failure delivery UI recovery/);
  assert.doesNotMatch(source, /signup provider failure UI recovery/);
});

test('Task 3 case completion cannot promote a successful no-op or partial scenario', () => {
  assert.equal(typeof auditRunner.buildCompletedCertificationCases, 'function');
  assert.deepEqual(auditRunner.buildCompletedCertificationCases('authentication-email-password-login', []), []);
  assert.deepEqual(auditRunner.buildCompletedCertificationCases('authentication-email-password-login', [
    { label: 'qa-coach-owner-a certification sign-in', observed: '200' },
  ]), []);
});

test('Task 3 login permission case matches the three frozen blocked identities', () => {
  const assertions = [
    ...['qa-unverified', 'qa-suspended', 'qa-pending-delete'].map(alias => ({ label: `${alias} certification blocked state` })),
    ...Array.from({ length: 5 }, (_, index) => ({ label: `scoped tenant request actor-${index}` })),
  ];
  const completed = auditRunner.buildCompletedCertificationCases('authentication-email-password-login', assertions);
  assert.equal(completed.some(item => item.caseId === 'login-blocked-state-and-tenant-denials'), true);
});

test('Task 3 fixture cleanup consumes measured operation counts instead of catalog arithmetic', () => {
  assert.match(seederSource, /FIXTURE_CLEANUP_RESULT/);
  assert.match(seederSource, /countDocumentTree/);
  assert.doesNotMatch(source, /deleted:\s*FIXTURES\.identities\.length/);
});

test('Task 3 youth browser mutations use an immediate measured cleanup registry', () => {
  assert.match(source, /const youthBrowserCleanupRegistry = createResourceRegistry/);
  assert.match(source, /registerFirestoreDocumentRestoration\(playerRef\.path, originalPlayer, 'youth-browser-player', youthBrowserCleanupRegistry\)/);
  assert.match(source, /const browserCleanup = await youthBrowserCleanupRegistry\.cleanup\(\)/);
  assert.doesNotMatch(source, /if \(originalPlayer\) await playerRef\.set\(originalPlayer\)/);
});

test('Task 3 demo expiry boundary is strict and deterministic', () => {
  const lifetime = 15 * 60 * 1000;
  assert.equal(auditRunner.isExpiredDemoCreation(1_000, 1_000 + lifetime, lifetime), false);
  assert.equal(auditRunner.isExpiredDemoCreation(1_000, 1_001 + lifetime, lifetime), true);
});

test('Task 3 peer demo context waits for hydrated demo state before exit', () => {
  const peerJourney = source.match(/const peerJourney = JSON\.parse[\s\S]*?expectEqual\(peerJourney\.status/)?.[0] || '';
  assert.match(peerJourney, /getByText\('Demo Mode', \{ exact: true \}\)\.waitFor/);
  assert.match(source, /const response = await page\.request\.post\([^\n]+\/api\/demo\/exit/);
});

test('Task 3 deletion purge boundary includes the exact due instant', () => {
  assert.equal(auditRunner.isDeletionPurgeDue(10_001, 10_000), false);
  assert.equal(auditRunner.isDeletionPurgeDue(10_000, 10_000), true);
});

test('Task 3 local HTTP helpers avoid stale pooled sockets across dev-server compilation', () => {
  for (const name of ['signInEmail', 'apiStatus', 'apiJsonResult', 'publicJsonStatus']) {
    const helper = source.match(new RegExp(`async function ${name}[\\s\\S]*?\\n}`))?.[0] || '';
    assert.match(helper, /['"]Connection['"]:\s*['"]close['"]/);
  }
});

test('Task 3 transport diagnostics retain only local method, path, and error code', () => {
  const nested = new TypeError('fetch failed', { cause: Object.assign(new Error('socket closed'), { code: 'UND_ERR_SOCKET' }) });
  assert.equal(
    auditRunner.localTransportDiagnostic('POST', '/api/invites/youth', nested),
    'Local POST /api/invites/youth transport failed (UND_ERR_SOCKET).',
  );
  assert.equal(
    auditRunner.localTransportDiagnostic('GET', '/api/test', new Error('boom token=secret')),
    'Local GET /api/test transport failed (Error).',
  );
});

test('emulator audit sweeps remaining role surfaces for rendering and route-policy failures', () => {
  assert.match(source, /surface-smoke-only/);
  assert.match(source, /owner remaining surface sweep/);
  assert.match(source, /assistant remaining surface sweep/);
  assert.match(source, /member remaining surface sweep/);
  assert.match(source, /parent remaining surface sweep/);
  assert.match(source, /trusted admin remaining surface sweep/);
  assert.match(source, /applicationError/);
  assert.match(source, /failedResponses/);
  assert.match(source, /mobileFits/);
});

test('emulator audit exercises remaining communication CRUD and cross-role persistence', () => {
  assert.match(source, /workflow-communication-only/);
  assert.match(source, /feed rejects incomplete poll/);
  assert.match(source, /owner feed post persists after reload/);
  assert.match(source, /member sees owner feed post/);
  assert.match(source, /member comment persists for owner/);
  assert.match(source, /owner poll persists after reload/);
  assert.match(source, /member poll vote persists after reload/);
  assert.match(source, /member chat message persists for owner/);
  assert.match(source, /Team B chat content is absent from Team A UI/);
});

test('emulator audit exercises event CRUD, RSVP persistence, and staff-only controls', () => {
  assert.match(source, /workflow-events-only/);
  assert.match(source, /event rejects incomplete activity/);
  assert.match(source, /owner event create persists after reload/);
  assert.match(source, /member sees owner event/);
  assert.match(source, /member cannot edit team event/);
  assert.match(source, /member RSVP persists after reload/);
  assert.match(source, /owner event edit persists after reload/);
  assert.match(source, /owner event delete persists after reload/);
});

test('emulator audit exercises facility and resource CRUD with destructive confirmation', () => {
  assert.match(source, /workflow-facilities-only/);
  assert.match(source, /facility requires name and address/);
  assert.match(source, /facility create persists after reload/);
  assert.match(source, /facility edit persists after reload/);
  assert.match(source, /resource rename persists after reload/);
  assert.match(source, /resource delete cancel preserves record/);
  assert.match(source, /resource delete persists after reload/);
  assert.match(source, /facility delete persists after reload/);
});

test('emulator audit exercises equipment stock, assignment, return, search, and guarded deletion', () => {
  assert.match(source, /workflow-equipment-only/);
  assert.match(source, /equipment create persists after reload/);
  assert.match(source, /equipment search filters inventory/);
  assert.match(source, /equipment edit persists after reload/);
  assert.match(source, /equipment rejects over-assignment/);
  assert.match(source, /equipment assignment persists after reload/);
  assert.match(source, /assigned equipment deletion is blocked/);
  assert.match(source, /equipment return restores availability/);
  assert.match(source, /equipment delete persists after reload/);
});
