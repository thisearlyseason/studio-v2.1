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

function defaultSignalProcessGroup(pid, signal) {
  process.kill(-pid, signal);
}

function defaultIsProcessGroupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    throw error;
  }
}

export async function closeRegisteredProcessGroups({
  registryPath,
  signalProcessGroup = defaultSignalProcessGroup,
  isProcessGroupAlive = defaultIsProcessGroupAlive,
  maxAttempts = 2,
  settleMs = 1_000,
}) {
  let contents = '';
  try {
    contents = await readFile(registryPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  const groups = [...new Set(contents.split('\n').map(value => value.trim()).filter(Boolean))];
  if (groups.some(value => !/^[1-9]\d{0,9}$/.test(value) || Number(value) <= 1 || Number(value) === process.pid)) {
    throw new Error('Service process-group registry contains a non-owned process group.');
  }
  let pending = groups.map(Number).reverse().filter(pid => isProcessGroupAlive(pid));
  for (let attempt = 1; attempt <= maxAttempts && pending.length > 0; attempt += 1) {
    const signal = attempt === maxAttempts ? 'SIGKILL' : 'SIGTERM';
    for (const pid of pending) {
      try {
        signalProcessGroup(pid, signal);
      } catch (error) {
        if (error?.code !== 'ESRCH') throw error;
      }
    }
    const deadline = Date.now() + settleMs;
    do {
      pending = pending.filter(pid => isProcessGroupAlive(pid));
      if (pending.length === 0 || Date.now() >= deadline) break;
      await new Promise(resolve => setTimeout(resolve, Math.min(25, Math.max(1, deadline - Date.now()))));
    } while (pending.length > 0);
  }
  if (pending.length > 0) {
    await writeFile(registryPath, `${pending.join('\n')}\n`, { mode: 0o600 });
    throw new Error(`Failed to terminate ${pending.length} registered service process group(s).`);
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
  commit = 'local-test-candidate',
  projectId = 'demo-the-squad-audit',
  playwrightCli = '',
  browser = false,
  failFast = false,
  endpoints = {
    auth: '127.0.0.1:9099',
    firestore: '127.0.0.1:8080',
    storage: '127.0.0.1:9199',
    app: 'http://127.0.0.1:9001',
  },
  baseEnvironment = process.env,
  batches = ['identity'],
  dependencies = {},
}) {
  validateBoundary({ projectId, endpoints, runSuffix, browser, playwrightCli });
  const randomBytes = dependencies.randomBytes || nodeRandomBytes;
  const execute = dependencies.execute || defaultExecute;
  const closeTimeoutMs = dependencies.closeTimeoutMs || 10_000;
  const runtimeSecret = randomBytes(32).toString('base64url');
  const runId = `final-cert-${runSuffix}`;
  const sessionPrefix = `cert-${runId}`;
  const artifactRoot = path.join(rootDir, 'output/playwright/2026-09-04-final-certification');
  const taskDirectory = batches.length === 1 && batches[0] === 'identity' ? 'task-3'
    : batches.length === 1 && batches[0] === 'tenants' ? 'task-4'
      : batches.length === 1 && batches[0] === 'operations' ? 'task-5' : 'local';
  const artifactDir = path.join(artifactRoot, taskDirectory, runId);
  const browserSessionRegistry = path.join(artifactDir, 'owned-browser-sessions.txt');
  const processGroupRegistry = path.join(artifactDir, 'owned-service-process-groups.txt');
  // A Task 3 run suffix is unique in production use. Clearing a stale registry
  // before execution also makes an interrupted/retried harness fail closed
  // without inheriting process identities from an earlier owner.
  await rm(processGroupRegistry, { force: true });
  const env = buildIsolatedAuditEnvironment(baseEnvironment, {
    AUDIT_FIXTURE_PASSWORD: runtimeSecret,
    AUDIT_FIXTURE_RUN_SUFFIX: runSuffix,
    AUDIT_FIREBASE_PROJECT_ID: projectId,
    AUDIT_BROWSER_SESSION_PREFIX: sessionPrefix,
    AUDIT_BASE_URL: endpoints.app,
    AUDIT_ARTIFACT_DIR: batches.length === 1 ? artifactDir : '',
    AUDIT_ARTIFACT_ROOT: batches.length > 1 ? artifactRoot : '',
    AUDIT_BROWSER_SESSION_REGISTRY: browserSessionRegistry,
    AUDIT_PROCESS_GROUP_REGISTRY: processGroupRegistry,
    AUDIT_CERTIFICATION_RUN_ID: runId,
    AUDIT_CERTIFICATION_COMMIT: commit,
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
          if (!await waitForExecution()) throw new Error('Certification audit child did not terminate after forced shutdown.');
        }
      }
      await closeRegisteredProcessGroups({
        registryPath: processGroupRegistry,
        signalProcessGroup: dependencies.signalProcessGroup,
        isProcessGroupAlive: dependencies.isProcessGroupAlive,
        settleMs: dependencies.processGroupSettleMs,
      });
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
    fixtures: (await import('../fixture-catalog.mjs')).buildFixtureCatalog(runSuffix),
    artifactDir,
    redact(value) {
      return redactText(value, runtimeSecret);
    },
    async runLegacyCertificationAudit({ batches: selectedBatches = batches, selectedScenarioIds = [] } = {}) {
      if (executed) throw new Error('The local harness permits one certification execution per invocation.');
      if (closed || closeRequested) throw new Error('The local harness is already closed.');
      executed = true;
      const args = [
        'scripts/qa/run-phase2-emulator-audit.mjs',
        ...(selectedBatches.includes('identity') ? ['--certification-identity'] : []),
        ...(selectedBatches.includes('tenants') ? ['--certification-tenants'] : []),
        ...(selectedBatches.includes('operations') ? ['--certification-operations'] : []),
        ...(browser ? ['--browser'] : []),
        ...(failFast ? ['--fail-fast'] : []),
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
      return Object.freeze({
        code: result.code,
        stdout: redactText(result.stdout, runtimeSecret),
        stderr: redactText(result.stderr, runtimeSecret),
        startedAt,
        completedAt,
      });
    },
    async runLegacyIdentityAudit(selectedScenarioIds = []) {
      return this.runLegacyCertificationAudit({ batches: ['identity'], selectedScenarioIds });
    },
    close,
  });
}
