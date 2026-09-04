import assert from 'node:assert/strict';
import test from 'node:test';

import { startLocalHarness } from '../scripts/qa/certification/local/harness.mjs';

const ROOT = new URL('..', import.meta.url).pathname;

function options(overrides = {}) {
  return {
    rootDir: ROOT,
    runSuffix: 't3-20260904-180000-a1',
    projectId: 'demo-task3-certification',
    browser: false,
    endpoints: {
      auth: '127.0.0.1:9099',
      firestore: '127.0.0.1:8080',
      storage: '127.0.0.1:9199',
      app: 'http://127.0.0.1:9001',
    },
    baseEnvironment: {
      STRIPE_SECRET_KEY: 'sk_live_must-not-survive',
      RESEND_API_KEY: 're_must-not-survive',
      INTERNAL_API_SECRET: 'must-not-survive',
    },
    dependencies: {
      randomBytes: () => Buffer.from('0123456789abcdef0123456789abcdef'),
      execute: async () => ({ code: 0, stdout: 'PASS safe assertion', stderr: '' }),
      closeBrowserSessions: async () => undefined,
    },
    ...overrides,
  };
}

test('harness refuses non-demo projects and non-loopback authorities before execution', async () => {
  let calls = 0;
  const dependencies = {
    ...options().dependencies,
    execute: async () => { calls += 1; return { code: 0, stdout: '', stderr: '' }; },
  };
  await assert.rejects(() => startLocalHarness(options({ projectId: 'the-squad-v2-staging', dependencies })), /must use a demo-/);
  await assert.rejects(() => startLocalHarness(options({ endpoints: { ...options().endpoints, auth: '127.0.0.1.example.test:9099' }, dependencies })), /Auth emulator must be loopback/);
  await assert.rejects(() => startLocalHarness(options({ endpoints: { ...options().endpoints, app: 'https://staging.example.test' }, dependencies })), /app URL must be loopback/);
  assert.equal(calls, 0);
});

test('browser mode requires the configured Playwright wrapper', async () => {
  await assert.rejects(() => startLocalHarness(options({ browser: true, playwrightCli: '' })), /PLAYWRIGHT_CLI is required/);
});

test('one legacy identity execution receives a unique scope and stripped outbound environment', async () => {
  const calls = [];
  const dependencies = {
    ...options().dependencies,
    execute: async input => {
      calls.push(input);
      return { code: 0, stdout: 'PASS protected deep link resumes after login: /facilities', stderr: '' };
    },
  };
  const harness = await startLocalHarness(options({
    browser: true,
    playwrightCli: '/Users/tylerans/.codex/skills/playwright/scripts/playwright_cli.sh',
    dependencies,
  }));
  const observation = await harness.runLegacyIdentityAudit();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['scripts/qa/run-phase2-emulator-audit.mjs', '--certification-identity', '--browser']);
  assert.equal(calls[0].env.AUDIT_FIXTURE_RUN_SUFFIX, 't3-20260904-180000-a1');
  assert.equal(calls[0].env.AUDIT_BROWSER_SESSION_PREFIX, 'cert-final-cert-t3-20260904-180000-a1-identity');
  assert.equal(calls[0].env.AUDIT_OUTBOUND_PROVIDER_MODE, 'block');
  assert.equal(calls[0].env.STRIPE_SECRET_KEY, '');
  assert.equal(calls[0].env.RESEND_API_KEY, '');
  assert.equal(calls[0].env.INTERNAL_API_SECRET, '');
  assert.equal(observation.stdout.includes('protected deep link'), true);
  assert.equal('password' in harness, false);
  await harness.close();
});

test('runtime credentials are redacted and cleanup remains idempotent after a child failure', async () => {
  let closeCalls = 0;
  const secret = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64url');
  const dependencies = {
    ...options().dependencies,
    execute: async () => ({ code: 1, stdout: '', stderr: `failure password=${secret} token=abc` }),
    closeBrowserSessions: async () => { closeCalls += 1; },
  };
  const harness = await startLocalHarness(options({
    browser: true,
    playwrightCli: '/tmp/playwright-cli',
    dependencies,
  }));
  await assert.rejects(
    () => harness.runLegacyIdentityAudit(),
    error => {
      assert.doesNotMatch(error.message, new RegExp(secret));
      assert.doesNotMatch(error.message, /token=abc/);
      assert.match(error.message, /\[redacted\]/);
      return true;
    },
  );
  await harness.close();
  await harness.close();
  assert.equal(closeCalls, 1);
});

test('run suffixes reject legacy or unsafe values', async () => {
  await assert.rejects(() => startLocalHarness(options({ runSuffix: 'phase2' })), /unique Task 3 run suffix/);
  await assert.rejects(() => startLocalHarness(options({ runSuffix: 'Task 3 unsafe' })), /lowercase run suffix/);
});
