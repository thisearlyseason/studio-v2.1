import { randomBytes as nodeRandomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
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

function defaultCloseBrowserSessions(playwrightCli, rootDir, env) {
  if (!playwrightCli) return;
  spawnSync(playwrightCli, ['close-all'], { cwd: rootDir, env, stdio: 'ignore' });
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
  const closeBrowserSessions = dependencies.closeBrowserSessions || defaultCloseBrowserSessions;
  const runtimeSecret = randomBytes(32).toString('base64url');
  const runId = `final-cert-${runSuffix}`;
  const sessionPrefix = `cert-${runId}-identity`;
  const env = buildIsolatedAuditEnvironment(baseEnvironment, {
    AUDIT_FIXTURE_PASSWORD: runtimeSecret,
    AUDIT_FIXTURE_RUN_SUFFIX: runSuffix,
    AUDIT_FIREBASE_PROJECT_ID: projectId,
    AUDIT_BROWSER_SESSION_PREFIX: sessionPrefix,
    AUDIT_BASE_URL: endpoints.app,
    FIREBASE_AUTH_EMULATOR_HOST: endpoints.auth,
    FIRESTORE_EMULATOR_HOST: endpoints.firestore,
    FIREBASE_STORAGE_EMULATOR_HOST: endpoints.storage,
    GCLOUD_PROJECT: projectId,
    GOOGLE_CLOUD_PROJECT: projectId,
    PLAYWRIGHT_CLI: playwrightCli,
  });
  let activeChild = null;
  let closed = false;
  let executed = false;

  const close = async () => {
    if (closed) return;
    closed = true;
    if (activeChild && !activeChild.killed) activeChild.kill('SIGTERM');
    await closeBrowserSessions(playwrightCli, rootDir, env);
  };

  return Object.freeze({
    runId,
    runSuffix,
    baseUrl: endpoints.app,
    browserEnabled: browser,
    redact(value) {
      return redactText(value, runtimeSecret);
    },
    async runLegacyIdentityAudit() {
      if (executed) throw new Error('The local harness permits one identity execution per invocation.');
      if (closed) throw new Error('The local harness is already closed.');
      executed = true;
      const args = [
        'scripts/qa/run-phase2-emulator-audit.mjs',
        '--certification-identity',
        ...(browser ? ['--browser'] : []),
      ];
      const result = await execute({
        command: process.execPath,
        args,
        cwd: rootDir,
        env,
        registerChild(child) { activeChild = child; },
      });
      activeChild = null;
      if (result.code !== 0) {
        throw new Error(redactText(`Identity audit child exited ${result.code}.\n${result.stdout}\n${result.stderr}`, runtimeSecret));
      }
      return Object.freeze({
        code: result.code,
        stdout: redactText(result.stdout, runtimeSecret),
        stderr: redactText(result.stderr, runtimeSecret),
      });
    },
    close,
  });
}
