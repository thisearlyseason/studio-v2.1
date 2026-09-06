import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { closeRegisteredBrowserSessions, closeRegisteredProcessGroups, startLocalHarness } from '../scripts/qa/certification/local/harness.mjs';

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
  const observation = await harness.runLegacyIdentityAudit(['authentication-email-password-login']);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, [
    'scripts/qa/run-phase2-emulator-audit.mjs',
    '--certification-identity',
    '--browser',
    '--scenario',
    'authentication-email-password-login',
  ]);
  assert.equal(calls[0].env.AUDIT_FIXTURE_RUN_SUFFIX, 't3-20260904-180000-a1');
  assert.equal(calls[0].env.AUDIT_BROWSER_SESSION_PREFIX, 'cert-final-cert-t3-20260904-180000-a1');
  assert.equal(calls[0].env.AUDIT_OUTBOUND_PROVIDER_MODE, 'block');
  assert.equal(calls[0].env.NEXT_PUBLIC_APP_URL, 'http://127.0.0.1:9001');
  assert.equal(calls[0].env.CALENDAR_FEED_BASE_URL, 'https://calendar.local/feed');
  assert.equal(calls[0].env.STRIPE_SECRET_KEY, '');
  assert.equal(calls[0].env.RESEND_API_KEY, '');
  assert.equal(calls[0].env.INTERNAL_API_SECRET, '');
  assert.equal(observation.stdout.includes('protected deep link'), true);
  assert.equal('password' in harness, false);
  await harness.close();
});

test('fail-fast is an explicit child argument and is omitted by default', async () => {
  const calls = [];
  const dependencies = {
    ...options().dependencies,
    execute: async input => { calls.push(input); return { code: 0, stdout: '', stderr: '' }; },
  };
  const harness = await startLocalHarness(options({ failFast: true, dependencies }));
  await harness.runLegacyCertificationAudit({ batches: ['tenants'] });
  assert.equal(calls[0].args.includes('--fail-fast'), true);
  await harness.close();

  const defaultCalls = [];
  const defaultHarness = await startLocalHarness(options({
    runSuffix: 't3-20260904-180000-a2',
    dependencies: { ...dependencies, execute: async input => { defaultCalls.push(input); return { code: 0, stdout: '', stderr: '' }; } },
  }));
  await defaultHarness.runLegacyCertificationAudit({ batches: ['tenants'] });
  assert.equal(defaultCalls[0].args.includes('--fail-fast'), false);
  await defaultHarness.close();
});

test('outer harness never performs global browser cleanup for no-browser or browser runs', async () => {
  let closeBrowserCalls = 0;
  const dependencies = {
    ...options().dependencies,
    closeBrowserSessions: async () => { closeBrowserCalls += 1; },
  };
  const withoutBrowser = await startLocalHarness(options({ dependencies }));
  await withoutBrowser.close();
  const withBrowser = await startLocalHarness(options({ browser: true, playwrightCli: '/tmp/playwright-cli', dependencies }));
  await withBrowser.close();
  assert.equal(closeBrowserCalls, 0);
});

test('outer cleanup closes every exact registry session, retries failures, and leaves unrelated sessions alone', async () => {
  const registryPath = path.join(await mkdtemp(path.join(os.tmpdir(), 'cert-session-registry-')), 'sessions.txt');
  await writeFile(registryPath, 'cert-final-cert-safe-a\ncert-final-cert-safe-b\n');
  const attempts = [];
  const failedOnce = new Set();
  await closeRegisteredBrowserSessions({
    registryPath,
    sessionPrefix: 'cert-final-cert-safe',
    closeBrowserSession: async session => {
      attempts.push(session);
      if (session.endsWith('-a') && !failedOnce.has(session)) {
        failedOnce.add(session);
        throw new Error('transient');
      }
    },
  });
  assert.deepEqual(attempts, [
    'cert-final-cert-safe-b',
    'cert-final-cert-safe-a',
    'cert-final-cert-safe-a',
  ]);
});

test('outer cleanup terminates every exact registered service process group after child death', async () => {
  const registryPath = path.join(await mkdtemp(path.join(os.tmpdir(), 'cert-process-registry-')), 'groups.txt');
  await writeFile(registryPath, '41001\n41002\n41001\n');
  const alive = new Set([41001, 41002]);
  const signals = [];
  await closeRegisteredProcessGroups({
    registryPath,
    signalProcessGroup(pid, signal) {
      signals.push([pid, signal]);
      alive.delete(pid);
    },
    isProcessGroupAlive(pid) { return alive.has(pid); },
  });
  assert.deepEqual(signals, [[41002, 'SIGTERM'], [41001, 'SIGTERM']]);
});

test('child failure returns redacted structured output and cleanup remains idempotent', async () => {
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
  const observation = await harness.runLegacyIdentityAudit();
  assert.equal(observation.code, 1);
  assert.doesNotMatch(observation.stderr, new RegExp(secret));
  assert.doesNotMatch(observation.stderr, /token=abc/);
  assert.match(observation.stderr, /\[redacted\]/);
  await harness.close();
  await harness.close();
  assert.equal(closeCalls, 0);
});

test('managed child output is retained as a redacted, run-owned transcript', async () => {
  const secret = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64url');
  const harness = await startLocalHarness(options({
    runSuffix: 't5-20260905-223700-a1',
    batches: ['operations'],
    dependencies: {
      ...options().dependencies,
      execute: async () => ({
        code: 1,
        signal: null,
        stdout: 'PASS initial browser login',
        stderr: `failure password=${secret} token=not-for-evidence`,
      }),
    },
  }));
  const observation = await harness.runLegacyCertificationAudit({
    batches: ['operations'], selectedScenarioIds: ['chat-channel-message-unread'],
  });
  assert.equal(observation.code, 1);
  assert.equal(observation.transcript, 'execution/legacy-audit.json');
  const transcript = JSON.parse(await readFile(path.join(harness.artifactDir, observation.transcript), 'utf8'));
  assert.equal(transcript.runId, harness.runId);
  assert.equal(transcript.code, 1);
  assert.match(transcript.stdout, /PASS initial browser login/);
  assert.doesNotMatch(JSON.stringify(transcript), new RegExp(secret));
  assert.doesNotMatch(JSON.stringify(transcript), /not-for-evidence/);
  await harness.close();
});

test('combined harness gives the child a batch-aware artifact root', async () => {
  const calls = [];
  const harness = await startLocalHarness(options({
    batches: ['identity', 'tenants'],
    dependencies: {
      ...options().dependencies,
      execute: async input => { calls.push(input); return { code: 0, stdout: '', stderr: '' }; },
    },
  }));
  await harness.runLegacyCertificationAudit({ batches: ['identity', 'tenants'] });
  assert.match(calls[0].env.AUDIT_ARTIFACT_ROOT, /2026-09-04-final-certification$/);
  assert.equal(calls[0].env.AUDIT_ARTIFACT_DIR, '');
  await harness.close();
});

test('operations harness keeps one managed child lifecycle and passes only its explicit certification flag', async () => {
  const calls = [];
  const harness = await startLocalHarness(options({
    batches: ['operations'],
    dependencies: {
      ...options().dependencies,
      execute: async input => { calls.push(input); return { code: 0, stdout: '', stderr: '' }; },
    },
  }));
  await harness.runLegacyCertificationAudit({ batches: ['operations'], selectedScenarioIds: ['events-event-crud-recurrence'] });
  assert.deepEqual(calls[0].args, [
    'scripts/qa/run-phase2-emulator-audit.mjs',
    '--certification-operations',
    '--scenario',
    'events-event-crud-recurrence',
  ]);
  assert.match(harness.artifactDir, /task-5/);
  await harness.close();
});

test('run suffixes reject legacy or unsafe values', async () => {
  await assert.rejects(() => startLocalHarness(options({ runSuffix: 'phase2' })), /unique Task 3 run suffix/);
  await assert.rejects(() => startLocalHarness(options({ runSuffix: 'Task 3 unsafe' })), /lowercase run suffix/);
});

test('outer close escalates and finishes when the audit child ignores SIGTERM', async () => {
  let terminateCalls = 0;
  let resolveExecution;
  const execution = new Promise(resolve => { resolveExecution = resolve; });
  const child = { killed: false, kill(signal) { terminateCalls += 1; this.killed = signal === 'SIGKILL'; if (signal === 'SIGKILL') resolveExecution({ code: 137, stdout: '', stderr: '' }); } };
  const harness = await startLocalHarness(options({
    dependencies: {
      ...options().dependencies,
      execute: async ({ registerChild }) => { registerChild(child); return execution; },
      closeTimeoutMs: 5,
    },
  }));
  const running = harness.runLegacyIdentityAudit();
  await new Promise(resolve => setImmediate(resolve));
  await harness.close();
  assert.equal((await running).code, 137);
  assert.equal(terminateCalls, 2);
});

test('outer close kills a registered detached descendant after force-killing its audit child', async () => {
  let descendantPid = null;
  const dependencies = {
    ...options().dependencies,
    closeTimeoutMs: 30,
    processGroupSettleMs: 500,
    execute: ({ env, registerChild }) => new Promise((resolve, reject) => {
      const program = `
        const { spawn } = require('node:child_process');
        const { mkdirSync, writeFileSync } = require('node:fs');
        const { dirname } = require('node:path');
        const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
        mkdirSync(dirname(process.env.AUDIT_PROCESS_GROUP_REGISTRY), { recursive: true });
        writeFileSync(process.env.AUDIT_PROCESS_GROUP_REGISTRY, String(child.pid) + String.fromCharCode(10));
        process.stdout.write(String(child.pid) + String.fromCharCode(10));
        process.on('SIGTERM', () => {});
        setInterval(() => {}, 1000);
      `;
      const child = spawn(process.execPath, ['-e', program], { env, stdio: ['ignore', 'pipe', 'pipe'] });
      registerChild(child);
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', chunk => {
        stdout += chunk;
        const parsed = Number(stdout.trim());
        if (Number.isInteger(parsed)) descendantPid = parsed;
      });
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code: code ?? 1, signal, stdout, stderr }));
    }),
  };
  const harness = await startLocalHarness(options({ dependencies }));
  const running = harness.runLegacyIdentityAudit();
  try {
    for (let count = 0; count < 100 && descendantPid === null; count += 1) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.ok(Number.isInteger(descendantPid));
    await harness.close();
    assert.notEqual((await running).code, 0);
    assert.throws(() => process.kill(-descendantPid, 0), error => error?.code === 'ESRCH');
  } finally {
    if (Number.isInteger(descendantPid)) {
      try { process.kill(-descendantPid, 'SIGKILL'); } catch {}
    }
  }
});
