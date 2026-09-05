import { randomBytes as nodeRandomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { buildIsolatedAuditEnvironment } from '../../run-phase2-emulator-audit.mjs';

const RUN_SUFFIX_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

function isLoopbackAuthority(value) {
  const match = String(value || '').match(/^(?:127\.0\.0\.1|localhost):(\d{1,5})$/) ||
    String(value || '').match(/^\[::1\]:(\d{1,5})$/);
  if (!match) return false;
  const port = Number(match[1]);
  return Number.isInteger(port) && port >= 1 && port <= 65_535;
}

function isLoopbackUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) &&
      Number(url.port) >= 1 && Number(url.port) <= 65_535 &&
      url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

function defaultExecute({ command, args, cwd, env, registerChild }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    registerChild(child);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; process.stdout.write(chunk); });
    child.stderr.on('data', chunk => { stderr += chunk; process.stderr.write(chunk); });
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code: code ?? 1, signal, stdout, stderr }));
  });
}

function defaultCloseBrowserSession({ playwrightCli, session, cwd }) {
  return new Promise((resolve, reject) => {
    const child = spawn(playwrightCli, [`-s=${session}`, '--raw', 'close'], { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Exact browser session cleanup exited ${code}: ${stderr.slice(0, 200)}`));
    });
  });
}

export async function closeRegisteredBrowserSessions({
  registryPath,
  sessionPrefix,
  closeBrowserSession,
  maxAttempts = 2,
}) {
  let contents = '';
  try {
    contents = await readFile(registryPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  const sessions = [...new Set(contents.split('\n').map(value => value.trim()).filter(Boolean))];
  for (const session of sessions) {
    if (!session.startsWith(`${sessionPrefix}-`) || session.length > 255) {
      throw new Error('Browser session registry contains a non-owned session.');
    }
  }
  let pending = sessions.reverse();
  for (let attempt = 1; attempt <= maxAttempts && pending.length > 0; attempt += 1) {
    const retry = [];
    for (const session of pending) {
      try {
        await closeBrowserSession(session);
      } catch {
        retry.push(session);
      }
    }
    pending = retry;
  }
  if (pending.length > 0) {
    await writeFile(registryPath, `${pending.join('\n')}\n`, { mode: 0o600 });
    throw new Error(`Failed to close ${pending.length} registered browser session(s) after ${maxAttempts} attempts.`);
  }
  await rm(registryPath, { force: true });
}

function validateBoundary({ projectId, endpoints, runSuffix, browser, playwrightCli }) {
  if (!String(projectId).startsWith('demo-')) throw new Error('Local certification project must use a demo-* Firebase project ID.');
  if (!isLoopbackAuthority(endpoints.auth)) throw new Error('Auth emulator must be loopback.');
  if (!isLoopbackAuthority(endpoints.firestore)) throw new Error('Firestore emulator must be loopback.');
  if (!isLoopbackAuthority(endpoints.storage)) throw new Error('Storage emulator must be loopback.');
  if (!isLoopbackUrl(endpoints.app)) throw new Error('Local certification app URL must be loopback HTTP.');
  if (!RUN_SUFFIX_PATTERN.test(String(runSuffix))) throw new Error('Local certification requires a lowercase run suffix.');
  if (runSuffix === 'phase2') throw new Error('Local certification requires a unique Task 3 run suffix, not phase2.');
  if (browser && !playwrightCli) throw new Error('PLAYWRIGHT_CLI is required for browser mode.');
}

function redactText(value, runtimeSecret) {
  return String(value || '')
    .replaceAll(runtimeSecret, '[redacted]')
    .replace(/\b(?:password|token|cookie|authorization)=\S+/gi, '[redacted]')
    .replace(/Bearer\s+\S+/gi, '[redacted]');
}

export async function startLocalHarness({
  rootDir,
  runSuffix,
  projectId = 'demo-the-squad-audit',
  playwrightCli = '',
  browser = false,
  endpoints = {
    auth: '127.0.0.1:9099',
    firestore: '127.0.0.1:8080',
    storage: '127.0.0.1:9199',
    app: 'http://127.0.0.1:9001',
  },
  baseEnvironment = process.env,
  dependencies = {},
}) {
  validateBoundary({ projectId, endpoints, runSuffix, browser, playwrightCli });
  const randomBytes = dependencies.randomBytes || nodeRandomBytes;
  const execute = dependencies.execute || defaultExecute;
  const closeTimeoutMs = dependencies.closeTimeoutMs || 10_000;
  const runtimeSecret = randomBytes(32).toString('base64url');
  const runId = `final-cert-${runSuffix}`;
  const sessionPrefix = `cert-${runId}-identity`;
  const artifactDir = path.join(rootDir, 'output/playwright/2026-09-04-final-certification/task-3', runId);
  const browserSessionRegistry = path.join(artifactDir, 'owned-browser-sessions.txt');
  const env = buildIsolatedAuditEnvironment(baseEnvironment, {
    AUDIT_FIXTURE_PASSWORD: runtimeSecret,
    AUDIT_FIXTURE_RUN_SUFFIX: runSuffix,
    AUDIT_FIREBASE_PROJECT_ID: projectId,
    AUDIT_BROWSER_SESSION_PREFIX: sessionPrefix,
    AUDIT_BASE_URL: endpoints.app,
    AUDIT_ARTIFACT_DIR: artifactDir,
    AUDIT_BROWSER_SESSION_REGISTRY: browserSessionRegistry,
    AUDIT_LOCAL_MAIL_TRANSPORT: 'memory-sink',
    NEXT_PUBLIC_APP_URL: endpoints.app,
    FIREBASE_AUTH_EMULATOR_HOST: endpoints.auth,
    FIRESTORE_EMULATOR_HOST: endpoints.firestore,
    FIREBASE_STORAGE_EMULATOR_HOST: endpoints.storage,
    GCLOUD_PROJECT: projectId,
    GOOGLE_CLOUD_PROJECT: projectId,
    PLAYWRIGHT_CLI: playwrightCli,
  });
  let activeChild = null;
  let activeExecution = null;
  let closed = false;
  let closeRequested = false;
  let closingPromise = null;
  let executed = false;

  const close = async () => {
    if (closed) return;
    closeRequested = true;
    if (closingPromise) return closingPromise;
    closingPromise = (async () => {
      if (activeChild && activeChild.exitCode == null) activeChild.kill('SIGTERM');
      if (activeExecution) {
        const waitForExecution = async () => {
          let timer;
          try {
            return await Promise.race([
              activeExecution.then(() => true, () => true),
              new Promise(resolve => { timer = setTimeout(() => resolve(false), closeTimeoutMs); }),
            ]);
          } finally {
            if (timer) clearTimeout(timer);
          }
        };
        if (!await waitForExecution()) {
          if (activeChild && activeChild.exitCode == null) activeChild.kill('SIGKILL');
          if (!await waitForExecution()) throw new Error('Identity audit child did not terminate after forced shutdown.');
        }
      }
      if (browser) {
        await closeRegisteredBrowserSessions({
          registryPath: browserSessionRegistry,
          sessionPrefix,
          closeBrowserSession: session => (dependencies.closeBrowserSession || defaultCloseBrowserSession)({
            playwrightCli, session, cwd: rootDir,
          }),
        });
      }
      closed = true;
    })();
    try {
      await closingPromise;
    } finally {
      if (!closed) closingPromise = null;
    }
  };

  return Object.freeze({
    runId,
    runSuffix,
    baseUrl: endpoints.app,
    browserEnabled: browser,
    redact(value) {
      return redactText(value, runtimeSecret);
    },
    async runLegacyIdentityAudit(selectedScenarioIds = []) {
      if (executed) throw new Error('The local harness permits one identity execution per invocation.');
      if (closed || closeRequested) throw new Error('The local harness is already closed.');
      executed = true;
      const args = [
        'scripts/qa/run-phase2-emulator-audit.mjs',
        '--certification-identity',
        ...(browser ? ['--browser'] : []),
        ...selectedScenarioIds.flatMap(scenarioId => ['--scenario', scenarioId]),
      ];
      const startedAt = new Date().toISOString();
      activeExecution = execute({
        command: process.execPath,
        args,
        cwd: rootDir,
        env,
        registerChild(child) { activeChild = child; },
      });
      const result = await activeExecution;
      activeChild = null;
      activeExecution = null;
      const completedAt = new Date().toISOString();
      if (result.code !== 0) {
        throw new Error(redactText(`Identity audit child exited ${result.code}.\n${result.stdout}\n${result.stderr}`, runtimeSecret));
      }
      return Object.freeze({
        code: result.code,
        stdout: redactText(result.stdout, runtimeSecret),
        stderr: redactText(result.stderr, runtimeSecret),
        startedAt,
        completedAt,
      });
    },
    close,
  });
}
