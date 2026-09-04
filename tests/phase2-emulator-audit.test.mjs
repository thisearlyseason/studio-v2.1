import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import nextEnvironment from '@next/env';

import { buildFixtureCatalog } from '../scripts/qa/certification/fixture-catalog.mjs';
import * as auditRunner from '../scripts/qa/run-phase2-emulator-audit.mjs';

const { processEnv, resetEnv } = nextEnvironment;

const source = await readFile(new URL('../scripts/qa/run-phase2-emulator-audit.mjs', import.meta.url), 'utf8');

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
  });

  assert.deepEqual(auditRunner.resolveAuditRuntimeConfiguration({ environment: {}, argv: [] }), {
    projectId: 'demo-the-squad-audit',
    baseUrl: 'http://127.0.0.1:9001',
    fixtureRunSuffix: 'phase2',
    browserSessionPrefix: 'phase2',
    certificationIdentity: false,
    runBrowser: false,
  });
});

test('identity API targets follow uniquely scoped fixture team IDs', () => {
  const catalog = buildFixtureCatalog('t3-identity-target-a1');
  assert.deepEqual(auditRunner.buildIdentityApiTargets(catalog), {
    teamAId: 'qa-team-a-t3-identity-target-a1',
    teamBId: 'qa-team-b-t3-identity-target-a1',
  });
});

test('emulator audit creates runtime-only credentials and redacts failures', () => {
  assert.match(source, /randomBytes\(24\)/);
  assert.match(source, /replaceAll\(password, '\[redacted\]'\)/);
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
