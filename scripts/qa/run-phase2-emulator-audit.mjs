import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, openSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { buildFixtureCatalog, inspectFixtureMedia } from './certification/fixture-catalog.mjs';
import { parseLoopbackHttpOrigin } from './certification/local/boundary.mjs';
import {
  IDENTITY_EXECUTION_ORDER,
  LOCAL_IDENTITY_CASE_REQUIREMENTS,
} from './certification/local/batches/identity.mjs';
import { CERTIFICATION_SCENARIOS } from './certification/scenario-catalog.mjs';
import { DIMENSION_NAMES } from './certification/local/evidence.mjs';

export function resolveAuditRuntimeConfiguration({ environment = process.env, argv = process.argv.slice(2) } = {}) {
  const baseUrl = parseLoopbackHttpOrigin(
    environment.AUDIT_BASE_URL || 'http://127.0.0.1:9001',
    'Legacy audit loopback base URL',
  );
  const selectedScenarios = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--scenario') continue;
    const scenarioId = argv[index + 1];
    if (!scenarioId || scenarioId.startsWith('--')) throw new Error('--scenario requires a scenario ID.');
    selectedScenarios.push(scenarioId);
    index += 1;
  }
  const allowedScenarios = new Set(IDENTITY_EXECUTION_ORDER);
  for (const scenarioId of selectedScenarios) {
    if (!allowedScenarios.has(scenarioId)) throw new Error(`Unknown Task 3 identity scenario ${scenarioId}.`);
  }
  return {
    projectId: environment.AUDIT_FIREBASE_PROJECT_ID || 'demo-the-squad-audit',
    baseUrl,
    fixtureRunSuffix: environment.AUDIT_FIXTURE_RUN_SUFFIX || 'phase2',
    browserSessionPrefix: environment.AUDIT_BROWSER_SESSION_PREFIX || 'phase2',
    certificationIdentity: argv.includes('--certification-identity'),
    runBrowser: argv.includes('--browser'),
    selectedScenarios: [...new Set(selectedScenarios)],
  };
}

const runtimeConfiguration = resolveAuditRuntimeConfiguration();
const PROJECT_ID = runtimeConfiguration.projectId;
const BASE_URL = runtimeConfiguration.baseUrl;
const FIXTURE_RUN_SUFFIX = runtimeConfiguration.fixtureRunSuffix;
const BROWSER_SESSION_PREFIX = runtimeConfiguration.browserSessionPrefix;
const FIXTURES = buildFixtureCatalog(FIXTURE_RUN_SUFFIX);
const runBrowser = runtimeConfiguration.runBrowser;
const certificationIdentity = runtimeConfiguration.certificationIdentity;
const selectedIdentityScenarios = new Set(
  runtimeConfiguration.selectedScenarios.length > 0
    ? runtimeConfiguration.selectedScenarios
    : IDENTITY_EXECUTION_ORDER,
);
const scheduleAppOnly = process.argv.includes('--schedule-app-only');
const teamSwitchOnly = process.argv.includes('--team-switch-only');
const alertsOnly = process.argv.includes('--alerts-only');
const identityOnly = process.argv.includes('--identity-only');
const identityStateOnly = process.argv.includes('--identity-state-only');
const deletionLoginOnly = process.argv.includes('--deletion-login-only');
const surfaceSmokeOnly = process.argv.includes('--surface-smoke-only');
const surfaceRemainderOnly = process.argv.includes('--surface-remainder-only');
const tournamentDenialOnly = process.argv.includes('--tournament-denial-only');
const parentAdminSurfaceOnly = process.argv.includes('--parent-admin-surface-only');
const workflowCommunicationOnly = process.argv.includes('--workflow-communication-only');
const workflowChatProbeOnly = process.argv.includes('--workflow-chat-probe-only');
const workflowEventsOnly = process.argv.includes('--workflow-events-only');
const workflowFacilitiesOnly = process.argv.includes('--workflow-facilities-only');
const workflowEquipmentOnly = process.argv.includes('--workflow-equipment-only');
const playwrightCli = process.env.PLAYWRIGHT_CLI || '';
const password = randomBytes(24).toString('base64url');
const sensitiveValues = new Set([password]);
const children = [];
const ownedBrowserSessions = new Set();
const logDir = path.join(os.tmpdir(), `the-squad-phase2-${process.pid}`);
const certificationArtifactDir = process.env.AUDIT_ARTIFACT_DIR || path.join(logDir, 'certification-artifacts');
const browserSessionRegistry = process.env.AUDIT_BROWSER_SESSION_REGISTRY || '';
let fixturesSeeded = false;
let cleanupStarted = false;
let activeCertificationScenario = null;
let activeCertificationAssertions = [];
const certificationScenarioById = new Map(CERTIFICATION_SCENARIOS.map(scenario => [scenario.id, scenario]));

export function createAuditShutdownState() {
  let exitCode = null;
  return Object.freeze({
    get exitCode() { return exitCode; },
    request(requestedExitCode) {
      if (exitCode === null) exitCode = requestedExitCode;
    },
    throwIfRequested() {
      if (exitCode === null) return;
      const error = new Error('Local certification was interrupted; exact cleanup will now run.');
      error.exitCode = exitCode;
      throw error;
    },
  });
}

const shutdownState = createAuditShutdownState();

function emitCertificationEvent(event) {
  const sanitized = JSON.parse(redact(JSON.stringify(event)));
  console.log(`CERTIFICATION_EVENT ${JSON.stringify(sanitized)}`);
}

function recordCertificationCase(scenarioId, dimension, caseId, observed, expected = 'locally safe contract completed', caseStartedAt = null) {
  const scenario = certificationScenarioById.get(scenarioId);
  const startedAt = new Date().toISOString();
  const relativeArtifact = `cases/${caseId}.json`;
  mkdirSync(path.join(certificationArtifactDir, 'cases'), { recursive: true });
  const artifact = {
    scenarioId, caseId, dimension, expected: String(expected), observed: String(observed),
    assertions: activeCertificationAssertions,
    capturedAt: startedAt,
  };
  writeFileSync(path.join(certificationArtifactDir, relativeArtifact), `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
  emitCertificationEvent({
    type: 'case', scenarioId, caseId, dimension,
    role: scenario.roles.join('/'),
    tenantAlias: scenario.roles.includes('V') ? 'not-applicable' : 'catalog-scoped',
    expected: String(expected), observed: String(observed), state: 'OBSERVED',
    startedAt: caseStartedAt || startedAt, completedAt: new Date().toISOString(), artifacts: [relativeArtifact],
  });
}

function recordCertificationFailure(scenarioId, dimension, caseId, error) {
  const scenario = certificationScenarioById.get(scenarioId);
  const timestamp = new Date().toISOString();
  const diagnostic = redact(error instanceof Error ? error.message : String(error)).slice(0, 500);
  const relativeArtifact = `cases/${caseId}.json`;
  mkdirSync(path.join(certificationArtifactDir, 'cases'), { recursive: true });
  writeFileSync(path.join(certificationArtifactDir, relativeArtifact), `${JSON.stringify({ scenarioId, caseId, dimension, diagnostic, capturedAt: timestamp }, null, 2)}\n`, { mode: 0o600 });
  emitCertificationEvent({
    type: 'case', scenarioId, caseId, dimension,
    role: scenario.roles.join('/'), tenantAlias: scenario.roles.includes('V') ? 'not-applicable' : 'catalog-scoped',
    expected: 'locally safe contract completed', observed: diagnostic, state: 'FAIL',
    startedAt: timestamp, completedAt: timestamp, artifacts: [relativeArtifact],
  });
}

function recordScenarioDimensions(scenarioId, { browserObserved }) {
  for (const [dimension, caseIds] of Object.entries(LOCAL_IDENTITY_CASE_REQUIREMENTS[scenarioId])) {
    if (!browserObserved && (dimension === 'console' || dimension === 'responsive')) continue;
    for (const caseId of caseIds) {
      recordCertificationCase(
        scenarioId,
        dimension,
        caseId,
        browserObserved || !['console', 'responsive'].includes(dimension)
          ? 'actual local emulator/API/browser checks passed'
          : 'not observed',
      );
    }
  }
}

const firebaseConfig = JSON.stringify({
  projectId: PROJECT_ID,
  apiKey: 'phase2-emulator-api-key',
  appId: '1:123456789:web:phase2audit',
  authDomain: `${PROJECT_ID}.firebaseapp.com`,
  storageBucket: `${PROJECT_ID}.appspot.com`,
  messagingSenderId: '123456789',
});

const OUTBOUND_CREDENTIAL_PATTERN = /^(?:STRIPE_|NEXT_PUBLIC_STRIPE_|RESEND_|WEB_PUSH_|NEXT_PUBLIC_WEB_PUSH_|NEXT_PUBLIC_FCM_|OWNER_FCM_TOKEN$|OWNER_NOTIFICATION_EMAIL$|INTERNAL_API_SECRET$|FIREBASE_SERVICE_ACCOUNT_JSON$|GOOGLE_APPLICATION_CREDENTIALS$)/;
const OUTBOUND_CREDENTIAL_KEYS = Object.freeze([
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_CONNECT_WEBHOOK_SECRET',
  'STRIPE_PRICE_TEAM_MONTHLY',
  'STRIPE_PRICE_TEAM_ANNUAL',
  'STRIPE_PRICE_ELITE_TEAMS_MONTHLY',
  'STRIPE_PRICE_ELITE_TEAMS_ANNUAL',
  'STRIPE_PRICE_ELITE_LEAGUE_MONTHLY',
  'STRIPE_PRICE_ELITE_LEAGUE_ANNUAL',
  'STRIPE_PRICE_SCHOOLS_MONTHLY',
  'STRIPE_PRICE_SCHOOLS_ANNUAL',
  'STRIPE_PRICE_EXTRA_TEAM_MONTHLY',
  'STRIPE_PRICE_EXTRA_TEAM_ANNUAL',
  'NEXT_PUBLIC_STRIPE_PRICE_TEAM_MONTHLY',
  'NEXT_PUBLIC_STRIPE_PRICE_TEAM_ANNUAL',
  'NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_MONTHLY',
  'NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_ANNUAL',
  'NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_MONTHLY',
  'NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_ANNUAL',
  'NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_MONTHLY',
  'NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_ANNUAL',
  'RESEND_API_KEY',
  'RESEND_WEBHOOK_SECRET',
  'RESEND_BASE_URL',
  'WEB_PUSH_VAPID_PRIVATE_KEY',
  'WEB_PUSH_VAPID_SUBJECT',
  'NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY',
  'NEXT_PUBLIC_FCM_VAPID_KEY',
  'OWNER_FCM_TOKEN',
  'OWNER_NOTIFICATION_EMAIL',
  'INTERNAL_API_SECRET',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'GOOGLE_APPLICATION_CREDENTIALS',
]);

export function buildIsolatedAuditEnvironment(baseEnvironment, overrides = {}) {
  const isolated = { ...baseEnvironment, ...overrides };
  for (const key of Object.keys(isolated)) {
    if (OUTBOUND_CREDENTIAL_PATTERN.test(key)) isolated[key] = '';
  }
  for (const key of OUTBOUND_CREDENTIAL_KEYS) isolated[key] = '';
  isolated.AUDIT_OUTBOUND_PROVIDER_MODE = 'block';
  return isolated;
}

const env = buildIsolatedAuditEnvironment(process.env, {
  AUDIT_FIXTURE_PASSWORD: password,
  AUDIT_FIXTURE_RUN_SUFFIX: FIXTURE_RUN_SUFFIX,
  FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099',
  FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
  FIREBASE_STORAGE_EMULATOR_HOST: '127.0.0.1:9199',
  GCLOUD_PROJECT: PROJECT_ID,
  GOOGLE_CLOUD_PROJECT: PROJECT_ID,
  NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG: firebaseConfig,
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: 'true',
});

const identityByAlias = new Map(FIXTURES.identities.map(identity => [identity.alias, identity]));

export function buildBlockedAuditPlan(blockedAliases) {
  const entries = blockedAliases.map(identity => Object.freeze({ ...identity }));
  return Object.freeze({
    api: Object.freeze(entries),
    browser: Object.freeze(entries.filter(identity => identity.browserPath && identity.browserTitle)),
  });
}

export function buildIdentityApiTargets(fixtures) {
  const teamAId = fixtures.teams.find(team => team.alias === 'qa-team-a')?.id;
  const teamBId = fixtures.teams.find(team => team.alias === 'qa-team-b')?.id;
  if (!teamAId || !teamBId) throw new Error('Identity API audit requires Team A and Team B fixture IDs.');
  return Object.freeze({ teamAId, teamBId });
}

export function buildIdentityApiRequestPlan(fixtures) {
  const { teamAId, teamBId } = buildIdentityApiTargets(fixtures);
  return Object.freeze([
    Object.freeze({ alias: 'qa-coach-owner-a', pathname: `/api/teams/chat?teamId=${teamAId}`, expectedStatus: 200 }),
    Object.freeze({ alias: 'qa-coach-owner-a', pathname: `/api/teams/chat?teamId=${teamBId}`, expectedStatus: 403 }),
    Object.freeze({ alias: 'qa-coach-owner-b', pathname: `/api/teams/chat?teamId=${teamAId}`, expectedStatus: 403 }),
    Object.freeze({ alias: 'qa-removed-member', pathname: `/api/teams/chat?teamId=${teamAId}`, expectedStatus: 403 }),
    Object.freeze({ alias: 'qa-pending-delete', pathname: `/api/teams/chat?teamId=${teamBId}`, expectedStatus: 403 }),
  ]);
}

const BLOCKED_AUDIT_PLAN = buildBlockedAuditPlan(FIXTURES.blockedAliases);

function emailForAlias(alias) {
  const email = identityByAlias.get(alias)?.email;
  if (!email) throw new Error(`Fixture alias ${alias} does not have a registered email identity.`);
  return email;
}

function storageObjectUrl(objectPath) {
  return `http://127.0.0.1:9199/v0/b/${PROJECT_ID}.appspot.com/o/${encodeURIComponent(objectPath)}?alt=media`;
}

function redact(value) {
  let output = String(value || '');
  for (const secret of sensitiveValues) output = output.replaceAll(secret, '[redacted]');
  return output.replace(/Bearer\s+\S+/gi, '[redacted]');
}

function registerSensitiveValue(value) {
  if (typeof value === 'string' && value) sensitiveValues.add(value);
  return value;
}

function waitForPort(port, timeoutMs = 30_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - started >= timeoutMs) reject(new Error(`Timed out waiting for port ${port}.`));
        else setTimeout(attempt, 200);
      });
    };
    attempt();
  });
}

async function waitForHttp(url, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status < 500) return;
    } catch {
      // Server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

function startProcess(command, args, logName) {
  const logPath = path.join(logDir, logName);
  const output = openSync(logPath, 'a');
  const child = spawn(command, args, {
    cwd: process.cwd(), env, stdio: ['ignore', output, output], detached: process.platform !== 'win32',
  });
  children.push(child);
  return child;
}

export function terminateChildProcessTree(child, signal = 'SIGTERM', killProcess = process.kill, platform = process.platform) {
  if (!child || child.killed || !Number.isInteger(child.pid)) return;
  try {
    if (platform === 'win32') child.kill(signal);
    else killProcess(-child.pid, signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

async function terminateOwnedChildAndWait(child) {
  if (!child || child.exitCode !== null || child.signalCode) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  terminateChildProcessTree(child);
  const completed = await Promise.race([
    exited.then(() => true),
    new Promise(resolve => setTimeout(() => resolve(false), 5_000)),
  ]);
  if (!completed) {
    terminateChildProcessTree(child, 'SIGKILL');
    await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 2_000))]);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
  if (result.status !== 0) {
    const output = `${result.stderr || ''}\n${result.stdout || ''}`.trim();
    const diagnostic = output.length > 2_000 ? output.slice(-2_000) : output;
    throw new Error(redact(`${path.basename(command)} exited ${result.status}.\n${diagnostic}`));
  }
  return result.stdout.trim();
}

async function signIn(alias, suppliedPassword = password) {
  return signInEmail(emailForAlias(alias), suppliedPassword);
}

async function signInEmail(email, suppliedPassword = password) {
  const response = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=phase2',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
      body: JSON.stringify({ email, password: suppliedPassword, returnSecureToken: true }),
    },
  );
  const body = await response.json();
  return { status: response.status, body };
}

export function localTransportDiagnostic(method, pathname, error) {
  const rawCode = error?.cause?.code || error?.code || error?.name || 'unknown';
  const code = String(rawCode).replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 64) || 'unknown';
  return `Local ${String(method || 'GET').toUpperCase()} ${pathname} transport failed (${code}).`;
}

async function apiStatus(pathname, token, init = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${pathname}`, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
        'Connection': 'close',
      },
      redirect: 'manual',
    });
  } catch (error) {
    throw new Error(localTransportDiagnostic(init.method, pathname, error));
  }
  return response.status;
}

async function apiJsonResult(pathname, token, init = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${pathname}`, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers || {}),
        'Connection': 'close',
      },
      redirect: 'manual',
    });
  } catch (error) {
    throw new Error(localTransportDiagnostic(init.method, pathname, error));
  }
  let body = null;
  try { body = await response.json(); } catch { /* status remains authoritative */ }
  return { status: response.status, body };
}

async function publicJsonStatus(pathname, body, headers = {}) {
  try {
    return (await fetch(`${BASE_URL}${pathname}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers, 'Connection': 'close' },
      body: JSON.stringify(body),
      redirect: 'manual',
    })).status;
  } catch (error) {
    throw new Error(localTransportDiagnostic('POST', pathname, error));
  }
}

async function createDisposableIdentity(label, { anonymous = false } = {}) {
  const endpoint = anonymous ? 'accounts:signUp' : 'accounts:signUp';
  const body = anonymous
    ? { returnSecureToken: true }
    : { email: `${FIXTURES.runId}-${label}@phase2.test`, password, returnSecureToken: true };
  const response = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/${endpoint}?key=phase2`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Connection': 'close' }, body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (response.status !== 200) throw new Error(`Disposable identity ${label} creation returned ${response.status}.`);
  return payload;
}

async function deleteDisposableIdentity(idToken) {
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:delete?key=phase2', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Connection': 'close' }, body: JSON.stringify({ idToken }),
  });
  if (response.status !== 200) throw new Error(`Disposable identity cleanup returned ${response.status}.`);
}

async function createSessionCookie(idToken) {
  const response = await fetch(`${BASE_URL}/api/auth/session`, {
    method: 'POST', headers: { Authorization: `Bearer ${idToken}` }, redirect: 'manual',
  });
  if (response.status !== 200) throw new Error(`Session creation returned ${response.status}.`);
  const cookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie') || ''];
  return cookies.map(value => value.split(';')[0]).filter(Boolean).join('; ');
}

async function deleteFirestoreMatches(collectionId, fieldPath, stringValue, authorizationToken) {
  const headers = {
    'Content-Type': 'application/json',
    ...(authorizationToken ? { Authorization: `Bearer ${authorizationToken}` } : {}),
  };
  const response = await fetch(`http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`, {
    method: 'POST', headers,
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId }],
      where: { fieldFilter: { field: { fieldPath }, op: 'EQUAL', value: { stringValue } } },
    } }),
  });
  if (response.status !== 200) throw new Error(`Firestore cleanup query returned ${response.status}.`);
  const rows = await response.json();
  let deleted = 0;
  for (const row of rows) {
    const name = row.document?.name;
    if (!name) continue;
    const deletion = await fetch(`http://127.0.0.1:8080/v1/${name}`, { method: 'DELETE', headers });
    if (![200, 404].includes(deletion.status)) throw new Error(`Firestore cleanup delete returned ${deletion.status}.`);
    deleted += 1;
  }
  return deleted;
}

export function selectLatestOob(payload, email, requestType, excludedCodes = new Set()) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const match = [...(payload?.oobCodes || [])].reverse().find(item =>
    String(item.email || '').trim().toLowerCase() === normalizedEmail &&
    item.requestType === requestType &&
    typeof item.oobCode === 'string' && !excludedCodes.has(item.oobCode));
  const actionLabel = requestType === 'PASSWORD_RESET' ? 'password-reset' : requestType;
  if (!match) throw new Error(`No ${actionLabel} OOB was found for the selected synthetic recipient.`);
  return match;
}

export function selectLatestPasswordResetOob(payload, email, excludedCodes = new Set()) {
  return selectLatestOob(payload, email, 'PASSWORD_RESET', excludedCodes);
}

async function readEmulatorOobCodes() {
  const response = await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT_ID}/oobCodes`, { headers: { 'Connection': 'close' } });
  if (response.status !== 200) throw new Error(`Auth emulator OOB query returned ${response.status}.`);
  return response.json();
}

async function redeemPasswordReset(oobCode, newPassword) {
  return fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=phase2', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
    body: JSON.stringify({ oobCode, newPassword }),
  });
}

async function redeemEmailVerification(oobCode) {
  return fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=phase2', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Connection': 'close' }, body: JSON.stringify({ oobCode }),
  });
}

export function withRoleClaim(claims, role) {
  return { ...(claims || {}), role };
}

export function fixtureDocumentByAlias(catalog, alias) {
  const document = catalog.firestoreDocuments.find(value => value.data.fixtureAlias === alias);
  if (!document) throw new Error(`Missing fixture document for alias ${alias}.`);
  return document;
}

export async function deleteOwnedAdminApp(app) {
  await app.delete();
}

export async function waitForIdTokenRevocationBoundary(idToken, {
  now = () => Date.now(),
  wait = delay => new Promise(resolve => setTimeout(resolve, delay)),
} = {}) {
  let authTime;
  try {
    authTime = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8')).auth_time;
  } catch {
    authTime = undefined;
  }
  if (!Number.isInteger(authTime)) throw new Error('ID token does not contain a valid auth_time.');
  const boundary = (authTime + 1) * 1000;
  while (now() < boundary) await wait(boundary - now());
}

async function withEmulatorAuthAdmin(callback) {
  const adminModule = await import('firebase-admin');
  const admin = adminModule.default || adminModule;
  const appName = `task3-auth-admin-${process.pid}-${Date.now()}`;
  const app = admin.initializeApp({ projectId: PROJECT_ID }, appName);
  try {
    return await callback(admin.auth(app), admin.firestore(app));
  } finally {
    await deleteOwnedAdminApp(app);
  }
}

async function runCertificationApiScenario(scenarioId) {
  if (scenarioId === 'marketing-legal-contact-beta-coach-referral') {
    expectEqual(await publicJsonStatus('/api/public/submissions', { type: 'contact', values: {} }), 400, 'marketing malformed submission denial');
    expectEqual(await publicJsonStatus('/api/referrals/coach', { website: 'bot-filled' }), 200, 'marketing honeypot neutral response');
    const suffix = FIXTURES.runId.slice(-24);
    const contactEmail = `contact-${suffix}@phase2.test`;
    const betaEmail = `beta-${suffix}@phase2.test`;
    const coachEmail = `coach-${suffix}@phase2.test`;
    const cleanupIdentity = await signIn('qa-superadmin');
    expectEqual(cleanupIdentity.status, 200, 'marketing cleanup authorization');
    try {
      expectEqual(await publicJsonStatus('/api/public/submissions', {
        type: 'contact', name: 'Oversize', email: contactEmail, organization: 'Task 3', inquiry: 'x'.repeat(25_000),
      }, { 'x-forwarded-for': `oversize-${suffix}` }), 413, 'marketing oversized payload denial');
      const rateStatuses = [];
      for (let index = 0; index < 7; index += 1) {
        rateStatuses.push(await publicJsonStatus('/api/public/submissions', { type: 'contact', values: {} }, {
          'x-forwarded-for': `rate-${suffix}`,
        }));
      }
      expectEqual(rateStatuses.slice(0, 6).every(status => status === 400), true, 'marketing rate-limit prethreshold validation');
      expectEqual(rateStatuses[6], 429, 'marketing rate-limit enforcement');
      expectEqual(await publicJsonStatus('/api/public/submissions', {
        type: 'contact', name: 'Certification Visitor', email: contactEmail, organization: 'Task 3', inquiry: 'Local isolated inquiry', status: 'attacker-controlled',
      }, { 'x-forwarded-for': `contact-${suffix}` }), 200, 'marketing local contact persistence');
      expectEqual(await publicJsonStatus('/api/public/submissions', {
        type: 'beta', fullName: 'Certification Coach', email: betaEmail, role: 'coach', organization: 'Task 3',
        sports: 'Soccer', scale: 'One team', currentTools: 'Local test', frustrations: 'Synthetic local-only case',
        mustHave: 'Safe deterministic flow', whyBeta: 'Certification', tested_before: 'no', frequency: 'Weekly',
        address_street: '1 Test Way', address_city: 'Edmonton', address_state: 'AB', address_zip: 'T0T0T0',
      }, { 'x-forwarded-for': `beta-${suffix}` }), 200, 'marketing local beta persistence');
      const referralBody = {
        parentName: 'Certification Parent', coachName: 'Certification Coach', coachEmail,
        submissionId: `task3-${suffix}-referral`, website: '',
      };
      const referral = await apiJsonResult('/api/referrals/coach', null, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `referral-${suffix}` },
        body: JSON.stringify(referralBody),
      });
      expectEqual(referral.status, 200, 'marketing accepted local mail transport');
      expectEqual(referral.body?.localTransport, true, 'marketing no-outbound memory sink');
      const duplicate = await apiJsonResult('/api/referrals/coach', null, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-forwarded-for': `referral-${suffix}` },
        body: JSON.stringify(referralBody),
      });
      expectEqual(duplicate.status, 200, 'marketing duplicate referral idempotency');
      expectEqual(duplicate.body?.duplicate, true, 'marketing duplicate delivered once marker');
      await withEmulatorAuthAdmin(async (_authAdmin, firestoreAdmin) => {
        const contactRows = await firestoreAdmin.collection('contact_inquiries').where('email', '==', contactEmail).get();
        const betaRows = await firestoreAdmin.collection('beta_applications').where('email', '==', betaEmail).get();
        const referralRows = await firestoreAdmin.collection('parent_coach_referrals').where('coachEmail', '==', coachEmail).get();
        expectEqual(contactRows.size, 1, 'marketing contact stored once');
        expectEqual(contactRows.docs[0]?.data().status, 'new', 'marketing contact privileged status ignored');
        expectEqual(betaRows.size, 1, 'marketing beta stored once');
        expectEqual(referralRows.size, 1, 'marketing referral stored once');
        expectEqual(referralRows.docs[0]?.data().deliveryStatus, 'accepted_local_sink', 'marketing local sink persistence');
      });
    } finally {
      const deleted = await deleteFirestoreMatches('contact_inquiries', 'email', contactEmail, cleanupIdentity.body.idToken) +
        await deleteFirestoreMatches('beta_applications', 'email', betaEmail, cleanupIdentity.body.idToken) +
        await deleteFirestoreMatches('parent_coach_referrals', 'coachEmail', coachEmail, 'owner');
      expectEqual(deleted, 3, 'marketing exact dynamic cleanup');
    }
    return;
  }

  if (scenarioId === 'authentication-email-password-login') {
    const tokens = new Map();
    for (const alias of FIXTURES.activeAliases) {
      const result = await signIn(alias);
      expectEqual(result.status, 200, `${alias} certification sign-in`);
      expectEqual(await apiStatus('/api/auth/session', result.body.idToken, { method: 'POST' }), 200, `${alias} certification session`);
      tokens.set(alias, result.body.idToken);
    }
    const unknown = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=phase2', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
      body: JSON.stringify({ email: `unknown-${FIXTURES.runId}@phase2.test`, password, returnSecureToken: true }),
    });
    expectEqual(unknown.status, 400, 'unknown identity generic Auth denial');
    const wrong = await signIn('qa-coach-owner-a', 'definitely-wrong');
    expectEqual(wrong.status, 400, 'wrong password generic Auth denial');
    for (const blockedIdentity of BLOCKED_AUDIT_PLAN.api) {
      const result = await signIn(blockedIdentity.alias);
      expectEqual(result.status, blockedIdentity.signInStatus, `${blockedIdentity.alias} certification blocked state`);
      if (result.status === 200) tokens.set(blockedIdentity.alias, result.body.idToken);
    }
    for (const target of buildIdentityApiRequestPlan(FIXTURES)) {
      expectEqual(await apiStatus(target.pathname, tokens.get(target.alias)), target.expectedStatus, `scoped tenant request ${target.alias} ${target.expectedStatus}`);
    }
    return;
  }

  if (scenarioId === 'authentication-password-reset') {
    expectEqual(await publicJsonStatus('/api/email/reset-password', { email: 'invalid' }), 400, 'reset invalid email denial');
    expectEqual(await publicJsonStatus('/api/email/reset-password', { email: `unknown-${FIXTURES.runId}@phase2.test` }), 200, 'reset unknown email nonenumeration');
    const knownStatus = await publicJsonStatus('/api/email/reset-password', { email: emailForAlias('qa-coach-owner-b') });
    expectEqual(knownStatus, 200, 'reset known local no-outbound neutral response after OOB generation');
    const targetEmail = emailForAlias('qa-coach-owner-b');
    const resetCode = selectLatestPasswordResetOob(await readEmulatorOobCodes(), targetEmail);
    registerSensitiveValue(resetCode.oobCode);
    expectEqual(resetCode.email.toLowerCase(), targetEmail.toLowerCase(), 'reset OOB recipient binding');
    expectEqual((await redeemPasswordReset(`${resetCode.oobCode}modified`, 'replacement-password-a')).status, 400, 'reset modified OOB denial');
    const replacementPassword = `replacement-${FIXTURES.runId}`;
    expectEqual((await redeemPasswordReset(resetCode.oobCode, replacementPassword)).status, 200, 'reset valid OOB redemption');
    expectEqual((await redeemPasswordReset(resetCode.oobCode, 'reused-password')).status, 400, 'reset reused OOB denial');
    expectEqual((await signIn('qa-coach-owner-b')).status, 400, 'reset old password denial');
    expectEqual((await signIn('qa-coach-owner-b', replacementPassword)).status, 200, 'reset new password acceptance');

    const restoreStatus = await publicJsonStatus('/api/email/reset-password', { email: targetEmail });
    expectEqual(restoreStatus, 200, 'reset restoration OOB generation with neutral response');
    const restoreCode = selectLatestPasswordResetOob(await readEmulatorOobCodes(), targetEmail, new Set([resetCode.oobCode]));
    registerSensitiveValue(restoreCode.oobCode);
    expectEqual((await redeemPasswordReset(restoreCode.oobCode, password)).status, 200, 'reset exact password restoration');
    expectEqual((await signIn('qa-coach-owner-b')).status, 200, 'reset restored identity sign-in');
    return;
  }

  if (scenarioId === 'authentication-logout-revocation-multi-tab') {
    const active = await signIn('qa-coach-owner-a');
    expectEqual(active.status, 200, 'logout active identity sign-in');
    const cookie = await createSessionCookie(active.body.idToken);
    expectEqual((await fetch(`${BASE_URL}/api/auth/session`, { headers: { Cookie: cookie } })).status, 200, 'logout active session cookie accepted');
    const cleared = await fetch(`${BASE_URL}/api/auth/session`, {
      method: 'DELETE', headers: { Origin: BASE_URL, Cookie: cookie }, redirect: 'manual',
    });
    expectEqual(cleared.status, 200, 'logout cookie clear response');
    expectEqual((await fetch(`${BASE_URL}/api/auth/session`)).status, 401, 'logout direct API denial without cookie');
    await withEmulatorAuthAdmin(async authAdmin => {
      await waitForIdTokenRevocationBoundary(active.body.idToken);
      await authAdmin.revokeRefreshTokens(identityByAlias.get('qa-coach-owner-a').uid);
    });
    expectEqual((await fetch(`${BASE_URL}/api/auth/session`, { headers: { Cookie: cookie } })).status, 401, 'logout emulator-admin revoked cookie denial');
    const refreshed = await signIn('qa-coach-owner-a');
    expectEqual(refreshed.status, 200, 'logout post-revocation fresh sign-in');
    expectEqual(await apiStatus('/api/auth/session', refreshed.body.idToken, { method: 'POST' }), 200, 'logout post-revocation fresh session');
    return;
  }

  if (scenarioId === 'account-lifecycle-disable-delete-cancel-purge') {
    const trusted = await signIn('qa-superadmin');
    expectEqual(trusted.status, 200, 'lifecycle trusted administrator sign-in');
    const ownerBlocked = identityByAlias.get('qa-owner-delete-blocked');
    expectEqual(await apiStatus(`/api/admin/users/${ownerBlocked.uid}/account-control`, trusted.body.idToken, {
      method: 'POST', body: JSON.stringify({ action: 'schedule_deletion', confirmationEmail: ownerBlocked.email }),
    }), 409, 'lifecycle owner guard');
    expectEqual(await apiStatus(`/api/admin/users/${identityByAlias.get('qa-pro-owner').uid}/account-control`, trusted.body.idToken, {
      method: 'POST', body: JSON.stringify({ action: 'schedule_deletion', confirmationEmail: emailForAlias('qa-pro-owner') }),
    }), 409, 'lifecycle subscription guard');
    expectEqual(await apiStatus('/api/admin/users/not%2Fa-valid-id/account-control', trusted.body.idToken, {
      method: 'POST', body: JSON.stringify({ action: 'suspend' }),
    }), 400, 'lifecycle malformed target denial');
    const target = identityByAlias.get('qa-team-member');
    const targetPath = `/api/admin/users/${target.uid}/account-control`;
    const targetAction = (action, confirmationEmail) => apiStatus(targetPath, trusted.body.idToken, {
      method: 'POST', body: JSON.stringify({ action, ...(confirmationEmail ? { confirmationEmail } : {}) }),
    });
    const nonAdmin = await signIn('qa-parent-a');
    expectEqual(await apiStatus(targetPath, nonAdmin.body.idToken, {
      method: 'POST', body: JSON.stringify({ action: 'suspend' }),
    }), 403, 'lifecycle cross-user nonadmin denial');
    try {
      expectEqual(await targetAction('cancel_deletion'), 409, 'lifecycle invalid cancel transition denial');
      expectEqual(await targetAction('schedule_deletion', target.email), 200, 'lifecycle schedule deletion');
      expectEqual(await targetAction('schedule_deletion', target.email), 200, 'lifecycle idempotent schedule retry');
      expectEqual(await targetAction('suspend'), 409, 'lifecycle suspend while pending denial');
      expectEqual((await signIn('qa-team-member')).status, 400, 'lifecycle pending identity sign-in denial');
      expectEqual(await targetAction('cancel_deletion'), 200, 'lifecycle cancel deletion');
      expectEqual((await signIn('qa-team-member')).status, 200, 'lifecycle canceled identity sign-in restored');
      expectEqual(await targetAction('suspend'), 200, 'lifecycle suspend account');
      expectEqual((await signIn('qa-team-member')).status, 400, 'lifecycle suspended identity sign-in denial');
      expectEqual(await targetAction('restore'), 200, 'lifecycle restore account');
      expectEqual((await signIn('qa-team-member')).status, 200, 'lifecycle restored identity sign-in');
    } finally {
      await targetAction('cancel_deletion').catch(() => undefined);
      await targetAction('restore').catch(() => undefined);
      const deletedLogs = await deleteFirestoreMatches('adminAuditLogs', 'targetUid', target.uid, 'owner');
      expectEqual(deletedLogs >= 4, true, 'lifecycle exact audit-log cleanup');
    }
    return;
  }

  if (scenarioId === 'signup-onboarding-coach-admin-league-parent-adult-player-signup') {
    for (const role of ['coach', 'admin', 'league', 'parent', 'adult-player']) {
      const identity = await createDisposableIdentity(`signup-${role}`);
      try {
        expectEqual(await apiStatus('/api/auth/session', identity.idToken, { method: 'POST' }), 403, `signup ${role} preverification gate`);
      } finally {
        await deleteDisposableIdentity(identity.idToken);
      }
    }
    const duplicate = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=phase2', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
      body: JSON.stringify({ email: emailForAlias('qa-coach-owner-a'), password, returnSecureToken: true }),
    });
    expectEqual(duplicate.status, 400, 'signup duplicate email denial');
    return;
  }

  if (scenarioId === 'signup-onboarding-youth-invitation-signup') {
    expectEqual((await fetch(`${BASE_URL}/api/invites/youth?token=modified`)).status, 404, 'youth modified token denial');
    expectEqual(await publicJsonStatus('/api/invites/youth', { token: 'modified', password: 'long-enough' }), 401, 'youth unauthenticated invite mutation denial');
    const parent = await signIn('qa-parent-a');
    const otherParent = await signIn('qa-parent-b');
    const player = fixtureDocumentByAlias(FIXTURES, 'qa-player-youth-c');
    const youthEmail = emailForAlias('qa-youth-invite');
    expectEqual(await apiStatus('/api/invites/youth', otherParent.body.idToken, {
      method: 'POST', body: JSON.stringify({ action: 'create', childId: player.data.id, email: youthEmail }),
    }), 404, 'youth cross-guardian target nondisclosure');
    await withEmulatorAuthAdmin(async (authAdmin, firestoreAdmin) => {
      const playerRef = firestoreAdmin.collection('players').doc(player.data.id);
      const originalPlayer = (await playerRef.get()).data();
      const createdInviteTokens = new Set();
      let conflictingIdentity = null;
      let createdYouthUid = null;
      try {
        const expired = await apiJsonResult('/api/invites/youth', parent.body.idToken, {
          method: 'POST', body: JSON.stringify({ action: 'create', childId: player.data.id, email: youthEmail }),
        });
        expectEqual(expired.status, 200, 'youth fresh expiring invitation create');
        createdInviteTokens.add(registerSensitiveValue(expired.body.token));
        await firestoreAdmin.collection('invites').doc(expired.body.token).update({ expiresAt: new Date(Date.now() - 1000).toISOString() });
        expectEqual((await fetch(`${BASE_URL}/api/invites/youth?token=${expired.body.token}`)).status, 404, 'youth expired token denial');

        const activeInvite = await apiJsonResult('/api/invites/youth', parent.body.idToken, {
          method: 'POST', body: JSON.stringify({ action: 'create', childId: player.data.id, email: youthEmail }),
        });
        expectEqual(activeInvite.status, 200, 'youth fresh invitation create');
        createdInviteTokens.add(registerSensitiveValue(activeInvite.body.token));
        const lookup = await apiJsonResult(`/api/invites/youth?token=${activeInvite.body.token}`, null);
        expectEqual(lookup.status, 200, 'youth invitation lookup');
        expectEqual(
          Object.keys(lookup.body.invite).sort().join(','),
          'childFirstName,childLastName',
          'youth invite PII allowlist',
        );

        conflictingIdentity = await createDisposableIdentity('youth-wrong-account');
        await authAdmin.updateUser(conflictingIdentity.localId, { email: youthEmail });
        expectEqual((await apiJsonResult('/api/invites/youth', null, {
          method: 'PUT', body: JSON.stringify({ token: activeInvite.body.token, password }),
        })).status, 409, 'youth wrong-existing-account denial');
        await deleteDisposableIdentity(conflictingIdentity.idToken);
        conflictingIdentity = null;

        expectEqual((await apiJsonResult('/api/invites/youth', null, {
          method: 'PUT', body: JSON.stringify({ token: activeInvite.body.token, password }),
        })).status, 200, 'youth invitation redemption');
        expectEqual((await apiJsonResult('/api/invites/youth', null, {
          method: 'PUT', body: JSON.stringify({ token: activeInvite.body.token, password }),
        })).status, 404, 'youth reused invitation denial');
        const youth = await signIn('qa-youth-invite');
        expectEqual(youth.status, 200, 'youth activated identity sign-in');
        createdYouthUid = youth.body.localId;
        expectEqual(await apiStatus('/api/auth/session', youth.body.idToken, { method: 'POST' }), 200, 'youth activated session');
        const linkedPlayer = (await playerRef.get()).data();
        expectEqual(linkedPlayer.userId, createdYouthUid, 'youth player login linkage');
        expectEqual(linkedPlayer.hasLogin, true, 'youth player login state');
        const youthProfile = await firestoreAdmin.collection('users').doc(createdYouthUid).get();
        expectEqual(youthProfile.data()?.linkedPlayerId, player.data.id, 'youth profile player linkage');
      } finally {
        if (conflictingIdentity) await authAdmin.deleteUser(conflictingIdentity.localId).catch(() => undefined);
        if (!createdYouthUid) {
          const user = await authAdmin.getUserByEmail(youthEmail).catch(() => null);
          createdYouthUid = user?.uid || null;
        }
        if (createdYouthUid) {
          await firestoreAdmin.collection('users').doc(createdYouthUid).delete().catch(() => undefined);
          await authAdmin.deleteUser(createdYouthUid).catch(() => undefined);
        }
        for (const token of createdInviteTokens) {
          await firestoreAdmin.collection('invites').doc(token).delete().catch(() => undefined);
        }
        if (originalPlayer) await playerRef.set(originalPlayer);
      }
    });
    return;
  }

  if (scenarioId === 'signup-onboarding-missing-profile-onboarding') {
    await withEmulatorAuthAdmin(async (authAdmin, firestoreAdmin) => {
      const email = `${FIXTURES.runId}-missing-profile@phase2.test`;
      const account = await authAdmin.createUser({ email, password, emailVerified: true, displayName: 'Missing Profile' });
      const userRef = firestoreAdmin.collection('users').doc(account.uid);
      try {
        const missing = await signInEmail(email);
        expectEqual(missing.status, 200, 'missing profile verified identity sign-in');
        expectEqual(await apiStatus('/api/auth/session', missing.body.idToken, { method: 'POST' }), 200, 'missing profile session establishment');
        expectEqual(await apiStatus('/api/admin/newsletter', missing.body.idToken), 403, 'missing profile privileged API denial');
        await userRef.set({ id: account.uid, email, fullName: 'Partial Profile' });
        expectEqual(await apiStatus('/api/admin/newsletter', missing.body.idToken), 403, 'partial profile privileged API denial');
        await userRef.set({ role: 'adult_player', notificationsEnabled: false }, { merge: true });
        const persisted = await userRef.get();
        expectEqual(persisted.data()?.role, 'adult_player', 'missing profile role completion persistence');
        expectEqual(await apiStatus('/api/admin/newsletter', missing.body.idToken), 403, 'completed nonadmin profile API denial');
      } finally {
        await userRef.delete().catch(() => undefined);
        await firestoreAdmin.collection('players').doc(`p_${account.uid}`).delete().catch(() => undefined);
        await authAdmin.deleteUser(account.uid).catch(() => undefined);
      }
    });
    return;
  }

  if (scenarioId === 'demo-seed-use-exit-expiry-cleanup') {
    const contexts = [await createDisposableIdentity('demo-a', { anonymous: true }), await createDisposableIdentity('demo-b', { anonymous: true })];
    const remaining = new Set(contexts.map(identity => identity.idToken));
    try {
      for (const [index, identity] of contexts.entries()) {
        expectEqual(await apiStatus('/api/demo/seed', identity.idToken, { method: 'POST', body: JSON.stringify({ planId: 'team' }) }), 200, `demo context ${index + 1} seed`);
        expectEqual(await apiStatus('/api/demo/seed', identity.idToken, { method: 'POST', body: JSON.stringify({ planId: 'team' }) }), 200, `demo context ${index + 1} duplicate seed idempotency`);
        expectEqual(await apiStatus('/api/stripe/connect/status?userId=other&teamId=other', identity.idToken), 403, `demo context ${index + 1} billing denial`);
      }
      const registered = await signIn('qa-coach-owner-a');
      expectEqual(await apiStatus('/api/demo/seed', registered.body.idToken, { method: 'POST', body: JSON.stringify({ planId: 'team' }) }), 403, 'demo registered-account exclusion');
      expectEqual(await apiStatus('/api/demo/seed', contexts[0].idToken, { method: 'POST', body: JSON.stringify({ planId: 'invalid' }) }), 400, 'demo invalid plan denial');
      for (const [index, identity] of contexts.entries()) {
        const cookie = await createSessionCookie(identity.idToken);
        const response = await fetch(`${BASE_URL}/api/demo/exit`, {
          method: 'POST', headers: { Origin: BASE_URL, Cookie: cookie }, redirect: 'manual',
        });
        expectEqual(response.status, 204, `demo context ${index + 1} exact exit cleanup`);
        expectEqual((await fetch(`${BASE_URL}/api/auth/session`, { headers: { Cookie: cookie } })).status, 401, `demo context ${index + 1} exited session denial`);
        if (index === 0) {
          const peerCookie = await createSessionCookie(contexts[1].idToken);
          expectEqual((await fetch(`${BASE_URL}/api/auth/session`, { headers: { Cookie: peerCookie } })).status, 200, 'demo peer-context exit isolation');
        }
        remaining.delete(identity.idToken);
      }
      expectEqual((await fetch(`${BASE_URL}/api/demo/exit`, {
        method: 'POST', headers: { Origin: 'http://127.0.0.1:65535' }, redirect: 'manual',
      })).status, 403, 'demo cross-origin exit denial');
    } finally {
      for (const idToken of remaining) await deleteDisposableIdentity(idToken).catch(() => undefined);
    }
    return;
  }

  if (scenarioId === 'dashboard-shell-role-landing-and-route-policy') {
    for (const alias of FIXTURES.activeAliases) {
      const result = await signIn(alias);
      expectEqual(result.status, 200, `${alias} dashboard policy sign-in`);
      expectEqual(await apiStatus('/api/auth/session', result.body.idToken, { method: 'POST' }), 200, `${alias} dashboard policy session`);
    }
    return;
  }

  if (scenarioId === 'administration-access-and-user-directory') {
    const trusted = await signIn('qa-superadmin');
    expectEqual(await apiStatus('/api/admin/newsletter', trusted.body.idToken), 200, 'admin trusted directory access');
    for (const alias of FIXTURES.activeAliases.filter(alias => alias !== 'qa-superadmin')) {
      const result = await signIn(alias);
      expectEqual(await apiStatus('/api/admin/newsletter', result.body.idToken), 403, `admin non-SA denial ${alias}`);
    }
    expectEqual(await apiStatus('/api/admin/users/not%2Fvalid/account-control', trusted.body.idToken, {
      method: 'POST', body: JSON.stringify({ action: 'suspend' }),
    }), 400, 'admin malformed target denial');
    await withEmulatorAuthAdmin(async authAdmin => {
      const superadmin = identityByAlias.get('qa-superadmin');
      const user = await authAdmin.getUser(superadmin.uid);
      const originalClaims = { ...(user.customClaims || {}) };
      try {
        await authAdmin.setCustomUserClaims(superadmin.uid, withRoleClaim(originalClaims, 'coach'));
        await waitForIdTokenRevocationBoundary(trusted.body.idToken);
        await authAdmin.revokeRefreshTokens(superadmin.uid);
        expectEqual(await apiStatus('/api/admin/newsletter', trusted.body.idToken), 401, 'admin revoked already-issued token denial');
        const revoked = await signIn('qa-superadmin');
        expectEqual(revoked.status, 200, 'admin revoked-claim identity can refresh');
        expectEqual(await apiStatus('/api/admin/newsletter', revoked.body.idToken), 403, 'admin refreshed token denied after claim revoke');
      } finally {
        await authAdmin.setCustomUserClaims(superadmin.uid, originalClaims);
        await authAdmin.revokeRefreshTokens(superadmin.uid);
      }
      const restored = await signIn('qa-superadmin');
      expectEqual(restored.status, 200, 'admin restored-claim identity refresh');
      expectEqual(await apiStatus('/api/admin/newsletter', restored.body.idToken), 200, 'admin restored claim access');
    });
  }
}

function expectEqual(actual, expected, label) {
  const assertion = { label, expected: String(expected), observed: String(actual), capturedAt: new Date().toISOString() };
  if (activeCertificationScenario) activeCertificationAssertions.push(assertion);
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, received ${actual}.`);
  console.log(`PASS ${label}: ${actual}`);
}

function cli(session, args, { sensitive = false } = {}) {
  shutdownState.throwIfRequested();
  const output = run(playwrightCli, [`-s=${session}`, '--raw', ...args], sensitive ? { stdio: 'pipe' } : {});
  shutdownState.throwIfRequested();
  return output;
}

function browserSessionName(label) {
  const session = `${BROWSER_SESSION_PREFIX}-${label}`;
  ownedBrowserSessions.add(session);
  syncBrowserSessionRegistry();
  return session;
}

function syncBrowserSessionRegistry() {
  if (!browserSessionRegistry) return;
  mkdirSync(path.dirname(browserSessionRegistry), { recursive: true });
  writeFileSync(
    browserSessionRegistry,
    ownedBrowserSessions.size > 0 ? `${[...ownedBrowserSessions].join('\n')}\n` : '',
    { mode: 0o600 },
  );
}

export async function closeOwnedBrowserSessions(sessions, closeSession, maxAttempts = 2) {
  let pending = [...sessions].reverse();
  const failures = new Map();
  for (let attempt = 1; attempt <= maxAttempts && pending.length > 0; attempt += 1) {
    const retry = [];
    for (const session of pending) {
      try {
        await closeSession(session);
        sessions.delete(session);
        failures.delete(session);
      } catch (error) {
        failures.set(session, error);
        retry.push(session);
      }
    }
    pending = retry;
  }
  if (sessions.size > 0) {
    throw new Error(`Failed to close ${sessions.size} owned browser session(s) after ${maxAttempts} attempts.`);
  }
}

export async function closeBrowserSessionsCreatedAfter(sessions, baseline, closeSession, maxAttempts = 2) {
  const created = new Set([...sessions].filter(session => !baseline.has(session)));
  const createdNames = [...created];
  try {
    await closeOwnedBrowserSessions(created, closeSession, maxAttempts);
  } finally {
    for (const session of createdNames) {
      if (!created.has(session)) sessions.delete(session);
    }
  }
}

export async function closeOneOwnedBrowserSession(sessions, session, closeSession, maxAttempts = 2) {
  if (!sessions.has(session)) throw new Error('Cannot close a browser session that is not owned by this audit.');
  const exact = new Set([session]);
  await closeOwnedBrowserSessions(exact, closeSession, maxAttempts);
  sessions.delete(session);
}

async function closeBrowserSessionNow(session) {
  await closeOneOwnedBrowserSession(ownedBrowserSessions, session, async exactSession => {
    run(playwrightCli, [`-s=${exactSession}`, '--raw', 'close'], { stdio: 'pipe' });
  });
  syncBrowserSessionRegistry();
}

async function browserLogin(alias, expectedPath, sessionLabel = alias) {
  return browserLoginCredentials(emailForAlias(alias), password, expectedPath, sessionLabel, alias);
}

async function browserLoginCredentials(email, suppliedPassword, expectedPath, sessionLabel, diagnosticLabel = 'disposable identity') {
  const session = browserSessionName(sessionLabel);
  cli(session, ['open', `${BASE_URL}/login`, '--browser', 'chrome']);
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = error => consoleErrors.push(error.stack || error.message);
    const onResponse = response => { if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() }); };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    try {
      await page.getByLabel('Email Address').fill(${JSON.stringify(email)});
      await page.locator('#password').fill(${JSON.stringify(suppliedPassword)});
      await page.getByRole('button', { name: 'Sign In' }).click();
      await page.waitForFunction(expected => window.location.pathname === expected, ${JSON.stringify(expectedPath)}, { timeout: 20000 });
      return {
        url: page.url(),
        loginFailed: await page.getByText('Login Failed', { exact: true }).count(),
        sessionFailed: await page.getByText('Session Setup Failed', { exact: true }).count(),
      };
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
    }
  }`;
  const result = JSON.parse(cli(session, ['run-code', code], { sensitive: true }));
  result.pathname = new URL(result.url).pathname;
  if (result.pathname !== expectedPath) {
    const consoleErrors = cli(session, ['console', 'error']);
    const requests = cli(session, ['requests']);
    throw new Error(
      `${diagnosticLabel} remained at ${result.pathname}; loginFailed=${result.loginFailed}, ` +
      `sessionFailed=${result.sessionFailed}.\n${consoleErrors}\n${requests}`,
    );
  }
  expectEqual(result.pathname, expectedPath, `${diagnosticLabel} login destination`);
  return session;
}

function browserPath(session, pathname) {
  const code = `async page => {
    await page.goto(${JSON.stringify(`${BASE_URL}${pathname}`)});
    return { url: page.url() };
  }`;
  return new URL(JSON.parse(cli(session, ['run-code', code])).url).pathname;
}

function browserRouteAudit(session, pathname, { mobile = false } = {}) {
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = error => consoleErrors.push(error.message);
    const onResponse = response => { if (response.status() >= 500) failedResponses.push(response.url()); };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    try {
      await page.setViewportSize(${mobile ? '{ width: 390, height: 844 }' : '{ width: 1440, height: 900 }'});
      await page.goto(${JSON.stringify(`${BASE_URL}${pathname}`)});
      await page.waitForFunction(() => document.readyState === 'complete', null, { timeout: 15000 });
      return {
        pathname: await page.evaluate(() => window.location.pathname),
        fits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        consoleErrors,
        failedResponses,
      };
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
    }
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function browserLoginFailureAudit(alias, suppliedPassword, expectedPath, expectedTitle, sessionLabel) {
  const session = browserSessionName(`${sessionLabel}-${process.pid}`);
  cli(session, ['open', `${BASE_URL}/login`, '--browser', 'chrome']);
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = error => consoleErrors.push(error.stack || error.message);
    const onResponse = response => { if (response.status() >= 400) failedResponses.push({ status: response.status(), url: response.url() }); };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    try {
      await page.getByLabel('Email Address').fill(${JSON.stringify(emailForAlias(alias))});
      await page.locator('#password').fill(${JSON.stringify(suppliedPassword)});
      await page.getByRole('button', { name: 'Sign In' }).click();
      await page.getByText(${JSON.stringify(expectedTitle)}, { exact: true })
        .waitFor({ state: 'visible', timeout: 15000 });
      return {
        pathname: await page.evaluate(() => window.location.pathname),
        expectedTitle: await page.getByText(${JSON.stringify(expectedTitle)}, { exact: true }).count(),
        body: (await page.locator('body').innerText()).slice(0, 500),
        consoleErrors,
        failedResponses,
      };
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
    }
  }`;
  const result = JSON.parse(cli(session, ['run-code', code], { sensitive: true }));
  expectEqual(result.pathname, expectedPath, `${sessionLabel} path`);
  if (result.expectedTitle !== 1) {
    console.log(`${sessionLabel} body diagnostic: ${JSON.stringify(result.body)}`);
    console.log(`${sessionLabel} console diagnostic: ${JSON.stringify(result.consoleErrors)}`);
    console.log(`${sessionLabel} request diagnostic: ${JSON.stringify(result.failedResponses)}`);
  }
  expectEqual(result.expectedTitle, 1, `${sessionLabel} message`);
}

function browserProtectedReturnAudit() {
  const session = browserSessionName(`protected-return-${process.pid}`);
  cli(session, ['open', `${BASE_URL}/facilities`, '--browser', 'chrome']);
  const code = `async page => {
    await page.waitForFunction(() => window.location.pathname === '/login', null, { timeout: 10000 });
    await page.getByLabel('Email Address').fill(${JSON.stringify(emailForAlias('qa-coach-owner-a'))});
    await page.locator('#password').fill(${JSON.stringify(password)});
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForFunction(() => window.location.pathname === '/facilities', null, { timeout: 15000 });
    return await page.evaluate(() => window.location.pathname);
  }`;
  return JSON.parse(cli(session, ['run-code', code], { sensitive: true }));
}

function browserLogoutAudit(session) {
  const code = `async page => {
    const peer = await page.context().newPage();
    await peer.goto(${JSON.stringify(`${BASE_URL}/dashboard`)});
    await peer.waitForFunction(() => window.location.pathname === '/dashboard', null, { timeout: 15000 });
    await page.goto(${JSON.stringify(`${BASE_URL}/settings`)});
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await page.waitForFunction(() => window.location.pathname === '/login', null, { timeout: 10000 });
    await peer.waitForFunction(() => window.location.pathname === '/login', null, { timeout: 10000 });
    const sessionResponse = await page.request.get(${JSON.stringify(`${BASE_URL}/api/auth/session`)});
    await page.goBack();
    await page.waitForFunction(() => window.location.pathname === '/login', null, { timeout: 10000 });
    await page.reload();
    await page.waitForFunction(() => window.location.pathname === '/login', null, { timeout: 10000 });
    const direct = await page.context().newPage();
    await direct.goto(${JSON.stringify(`${BASE_URL}/dashboard`)});
    await direct.waitForFunction(() => window.location.pathname === '/login', null, { timeout: 10000 });
    await page.setViewportSize({ width: 390, height: 844 });
    return {
      primaryPath: await page.evaluate(() => window.location.pathname),
      peerPath: await peer.evaluate(() => window.location.pathname),
      directPath: await direct.evaluate(() => window.location.pathname),
      sessionStatus: sessionResponse.status(),
      fits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

async function runIdentityBrowserAudit() {
  const owner = await browserLogin('qa-coach-owner-a', '/dashboard', `identity-owner-${process.pid}`);
  const assistant = await browserLogin('qa-team-assistant', '/dashboard', `identity-assistant-${process.pid}`);
  const member = await browserLogin('qa-team-member', '/dashboard', `identity-member-${process.pid}`);
  const parent = await browserLogin('qa-parent-a', '/family', `identity-parent-${process.pid}`);
  const player = await browserLogin('qa-adult-player-a', '/dashboard', `identity-player-${process.pid}`);
  await browserLogin('qa-youth-active', '/dashboard', `identity-youth-${process.pid}`);
  await browserLogin('qa-multi-org', '/dashboard', `identity-multi-${process.pid}`);

  const ownerBilling = browserRouteAudit(owner, '/dashboard/billing');
  expectEqual(ownerBilling.pathname, '/dashboard/billing', 'owner billing browser route');
  expectEqual(ownerBilling.fits, true, 'owner billing desktop viewport');
  expectEqual(ownerBilling.consoleErrors.length, 0, 'owner billing console errors');
  expectEqual(ownerBilling.failedResponses.length, 0, 'owner billing failed responses');

  const assistantStaff = browserRouteAudit(assistant, '/facilities');
  expectEqual(assistantStaff.pathname, '/facilities', 'assistant staff route');
  expectEqual(assistantStaff.consoleErrors.length, 0, 'assistant staff route console errors');
  expectEqual(assistantStaff.failedResponses.length, 0, 'assistant staff route failed responses');

  const memberStaff = browserRouteAudit(member, '/facilities');
  expectEqual(memberStaff.pathname, '/dashboard', 'member staff route denial');

  const parentFinance = browserRouteAudit(parent, '/family/payments', { mobile: true });
  expectEqual(parentFinance.pathname, '/family/payments', 'parent finance browser route');
  expectEqual(parentFinance.fits, true, 'parent finance mobile viewport');
  expectEqual(parentFinance.consoleErrors.length, 0, 'parent finance console errors');
  expectEqual(parentFinance.failedResponses.length, 0, 'parent finance failed responses');

  const playerFinance = browserRouteAudit(player, '/family/payments');
  expectEqual(playerFinance.pathname, '/dashboard', 'player finance browser route denial');

  expectEqual(browserProtectedReturnAudit(), '/facilities', 'protected deep link resumes after login');

  const logout = browserLogoutAudit(owner);
  expectEqual(logout.primaryPath, '/login', 'logout revokes the browser session');
  expectEqual(logout.peerPath, '/login', 'second tab observes logout');
  expectEqual(logout.sessionStatus, 401, 'logged-out session endpoint denial');

  runIdentityStateBrowserAudit();
}

function runIdentityStateBrowserAudit() {
  browserLoginFailureAudit('qa-coach-owner-a', 'definitely-wrong-password', '/login', 'Login Failed', 'wrong-password login uses generic failure copy');
  browserLoginFailureAudit('qa-suspended', password, '/login', 'Login Failed', 'disabled login uses generic failure copy');
  browserLoginFailureAudit('qa-unverified', password, '/verify-email', 'Verify Your Email', 'unverified login reaches verification gate');
  browserLoginFailureAudit('qa-pending-delete', password, '/login', 'Session Setup Failed', 'deletion-pending login is denied');
}

function openAnonymousBrowser(label) {
  const session = browserSessionName(`${label}-${process.pid}`);
  cli(session, ['open', `${BASE_URL}/`, '--browser', 'chrome']);
  return session;
}

function assertTwoViewportRoutes(session, cases, label) {
  assertSurfaceSweep(browserSurfaceSweep(session, cases), `${label} desktop`);
  assertSurfaceSweep(browserSurfaceSweep(session, cases, { mobile: true }), `${label} mobile`);
}

async function runAllActiveBrowserLandings(labelPrefix, { retainAliases = [] } = {}) {
  const sessions = new Map();
  const retained = new Set(retainAliases);
  for (const alias of FIXTURES.activeAliases) {
    const fixture = identityByAlias.get(alias);
    const session = await browserLogin(alias, fixture.expectedLanding, `${labelPrefix}-${alias}-${process.pid}`);
    if (retained.has(alias)) sessions.set(alias, session);
    else await closeBrowserSessionNow(session);
  }
  return sessions;
}

function browserLandingPersistenceAudit(session, expectedPath, label) {
  const result = JSON.parse(cli(session, ['run-code', `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = error => consoleErrors.push(error.message);
    const onResponse = response => {
      if (response.status() < 400) return;
      const responseUrl = response.url();
      const localPath = responseUrl.startsWith(${JSON.stringify(BASE_URL)})
        ? responseUrl.slice(${JSON.stringify(BASE_URL)}.length).split('?')[0]
        : 'external-origin';
      failedResponses.push({ status: response.status(), path: localPath });
    };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await page.waitForFunction(expected => window.location.pathname === expected, ${JSON.stringify(expectedPath)}, { timeout: 15000 });
      const peer = await page.context().newPage();
      await peer.goto(${JSON.stringify(`${BASE_URL}${expectedPath}`)});
      await peer.waitForFunction(expected => window.location.pathname === expected, ${JSON.stringify(expectedPath)}, { timeout: 15000 });
      await page.goto(${JSON.stringify(`${BASE_URL}/login`)});
      await page.goBack();
      await page.waitForFunction(expected => window.location.pathname === expected, ${JSON.stringify(expectedPath)}, { timeout: 15000 });
      const output = {
        pathname: await page.evaluate(() => window.location.pathname),
        peerPathname: await peer.evaluate(() => window.location.pathname),
        fits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        consoleErrors,
        failedResponses,
      };
      await peer.close();
      return output;
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
    }
  }`]));
  expectEqual(result.pathname, expectedPath, `${label} refresh and Back destination`);
  expectEqual(result.peerPathname, expectedPath, `${label} new-tab destination`);
  expectEqual(result.fits, true, `${label} mobile containment`);
  if (result.consoleErrors.length > 0) console.log(`${label} persistence console diagnostic: ${JSON.stringify(result.consoleErrors)}`);
  if (result.failedResponses.length > 0) console.log(`${label} persistence failed response diagnostic: ${JSON.stringify(result.failedResponses)}`);
  expectEqual(result.consoleErrors.length, 0, `${label} persistence console errors`);
  expectEqual(result.failedResponses.length, 0, `${label} persistence failed responses`);
}

function browserLoginDoubleSubmitAudit() {
  const session = openAnonymousBrowser('cert-login-delayed-double-submit');
  const result = JSON.parse(cli(session, ['run-code', `async page => {
    let sessionRequests = 0;
    const routePattern = '**/api/auth/session';
    const delayed = async route => {
      sessionRequests += 1;
      await page.waitForTimeout(750);
      await route.continue();
    };
    await page.route(routePattern, delayed);
    try {
      await page.goto(${JSON.stringify(`${BASE_URL}/login`)});
      await page.getByLabel('Email Address').fill(${JSON.stringify(emailForAlias('qa-coach-owner-a'))});
      await page.locator('#password').fill(${JSON.stringify(password)});
      const submit = page.getByRole('button', { name: 'Sign In' });
      const bounds = await submit.boundingBox();
      if (!bounds) throw new Error('Sign-in button has no clickable bounds.');
      await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { clickCount: 2, delay: 20 });
      await page.waitForFunction(() => window.location.pathname === '/dashboard', null, { timeout: 20000 });
      return { pathname: await page.evaluate(() => window.location.pathname), sessionRequests };
    } finally {
      await page.unroute(routePattern, delayed);
    }
  }`], { sensitive: true }));
  expectEqual(result.pathname, '/dashboard', 'login delayed response eventual destination');
  expectEqual(result.sessionRequests, 1, 'login double-submit single session request');
}

function browserResetRequestAudit(email, expectedText, label, { mobile = false, expectedFailureStatus = null } = {}) {
  const session = openAnonymousBrowser(`cert-reset-${label}`);
  const result = JSON.parse(cli(session, ['run-code', `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
    const onPageError = error => consoleErrors.push(error.message);
    const onResponse = response => { if (response.status() >= 400) failedResponses.push({ status: response.status(), pathname: new URL(response.url()).pathname }); };
    page.on('console', onConsole);
    page.on('pageerror', onPageError);
    page.on('response', onResponse);
    try {
      await page.setViewportSize(${mobile ? '{ width: 390, height: 844 }' : '{ width: 1440, height: 900 }'});
      await page.goto(${JSON.stringify(`${BASE_URL}/login`)});
      await page.getByRole('button', { name: 'Forgot?' }).click();
      await page.getByLabel('Account Email').fill(${JSON.stringify(email)});
      await page.getByRole('button', { name: 'Send Reset Link' }).click();
      await page.getByText(${JSON.stringify(expectedText)}, { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
      return {
        pathname: await page.evaluate(() => window.location.pathname),
        fits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        consoleErrors,
        failedResponses,
      };
    } finally {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('response', onResponse);
    }
  }`], { sensitive: true }));
  expectEqual(result.pathname, '/login', `${label} reset request path`);
  expectEqual(result.fits, true, `${label} reset request viewport`);
  const expectedFailures = expectedFailureStatus === null ? [] : [{ status: expectedFailureStatus, pathname: '/api/email/reset-password' }];
  expectEqual(JSON.stringify(result.failedResponses), JSON.stringify(expectedFailures), `${label} reset request expected failure response`);
  const expectedResourceConsoleErrors = expectedFailureStatus === null ? 0 : 1;
  expectEqual(result.consoleErrors.length, expectedResourceConsoleErrors, `${label} reset request allowlisted console errors`);
}

async function runCertificationBrowserScenario(scenarioId) {
  if (scenarioId === 'marketing-legal-contact-beta-coach-referral') {
    const session = openAnonymousBrowser('cert-marketing');
    assertTwoViewportRoutes(session, ['/', '/privacy', '/terms', '/safety', '/beta', '/refer-a-coach'].map(pathname => ({ path: pathname, expected: pathname })), 'marketing public surfaces');
    const coachEmail = `browser-coach-${FIXTURES.runId.slice(-20)}@phase2.test`;
    const form = JSON.parse(cli(session, ['run-code', `async page => {
      const consoleErrors = [];
      const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
      const onPageError = error => consoleErrors.push(error.message);
      page.on('console', onConsole);
      page.on('pageerror', onPageError);
      try {
        await page.goto(${JSON.stringify(`${BASE_URL}/refer-a-coach`)});
        await page.setViewportSize({ width: 390, height: 844 });
        const submit = page.getByRole('button', { name: 'Send to coach' });
        const initiallyDisabled = await submit.isDisabled();
        await page.getByLabel('Your name').fill('Browser Parent');
        await page.getByLabel("Coach’s name").fill('Browser Coach');
        await page.getByLabel("Coach’s email").fill(${JSON.stringify(coachEmail)});
        await submit.click();
        await page.getByText('Referral sent', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
        return {
          initiallyDisabled,
          fits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          consoleErrors,
        };
      } finally {
        page.off('console', onConsole);
        page.off('pageerror', onPageError);
      }
    }`], { sensitive: true }));
    expectEqual(form.initiallyDisabled, true, 'marketing visible empty-form validation');
    expectEqual(form.fits, true, 'marketing submitted form mobile containment');
    expectEqual(form.consoleErrors.length, 0, 'marketing submitted form console errors');
    expectEqual(
      await deleteFirestoreMatches('parent_coach_referrals', 'coachEmail', coachEmail, 'owner'),
      1,
      'marketing browser referral exact cleanup',
    );
    return;
  }
  if (scenarioId === 'authentication-email-password-login') {
    const sessions = await runAllActiveBrowserLandings('cert-login', { retainAliases: ['qa-coach-owner-a'] });
    browserLandingPersistenceAudit(sessions.get('qa-coach-owner-a'), '/dashboard', 'login owner session');
    expectEqual(browserProtectedReturnAudit(), '/facilities', 'login protected deep-link return');
    browserLoginDoubleSubmitAudit();
    runIdentityStateBrowserAudit();
    const session = openAnonymousBrowser('cert-login-responsive');
    assertTwoViewportRoutes(session, [{ path: '/login', expected: '/login' }], 'login surface');
    return;
  }
  if (scenarioId === 'authentication-logout-revocation-multi-tab') {
    const owner = await browserLogin('qa-coach-owner-a', '/dashboard', `cert-logout-${process.pid}`);
    const logout = browserLogoutAudit(owner);
    expectEqual(logout.primaryPath, '/login', 'cert logout primary denial');
    expectEqual(logout.peerPath, '/login', 'cert logout peer denial');
    expectEqual(logout.directPath, '/login', 'cert logout Back reload direct denial');
    expectEqual(logout.sessionStatus, 401, 'cert logout session denial');
    expectEqual(logout.fits, true, 'cert logout mobile containment');
    expectEqual(browserPath(owner, '/dashboard'), '/login', 'cert logout direct route denial');
    return;
  }
  if (scenarioId === 'authentication-password-reset') {
    browserResetRequestAudit(`unknown-${FIXTURES.runId}@phase2.test`, 'A reset link was sent', 'unknown', { mobile: true });
    browserResetRequestAudit(emailForAlias('qa-coach-owner-b'), 'A reset link was sent', 'known-provider-block');
    return;
  }
  if (scenarioId === 'account-lifecycle-disable-delete-cancel-purge') {
    const trusted = await browserLogin('qa-superadmin', '/admin', `cert-lifecycle-admin-${process.pid}`);
    const owner = await browserLogin('qa-owner-delete-blocked', '/dashboard', `cert-lifecycle-owner-${process.pid}`);
    assertTwoViewportRoutes(trusted, [{ path: '/admin', expected: '/admin' }], 'lifecycle admin surface');
    assertTwoViewportRoutes(owner, [{ path: '/settings', expected: '/settings' }], 'lifecycle settings surface');
    return;
  }
  if (scenarioId === 'signup-onboarding-coach-admin-league-parent-adult-player-signup') {
    const surface = openAnonymousBrowser('cert-signup-surface');
    assertTwoViewportRoutes(surface, [{ path: '/signup', expected: '/signup' }], 'five-role signup surface');
    const roles = [
      { id: 'self', name: 'Adult Athlete', expectedRole: 'adult_player', destination: '/teams/join' },
      { id: 'child', name: 'Parent / Guardian', expectedRole: 'parent', destination: '/family' },
      { id: 'coach', name: 'Coach / Team Manager', expectedRole: 'coach', destination: '/teams/new', plan: 'Starter' },
      { id: 'school_ad', name: 'School / Athletic Director', expectedRole: 'admin', destination: '/pricing' },
      { id: 'league_creator', name: 'League / Tournament Organizer', expectedRole: 'league_creator', destination: '/competition', plan: 'Starter' },
    ];
    await withEmulatorAuthAdmin(async (authAdmin, firestoreAdmin) => {
      for (const [index, role] of roles.entries()) {
        const email = `${FIXTURES.runId}-ui-${role.id}@phase2.test`;
        let createdUser = null;
        const session = openAnonymousBrowser(`cert-signup-${role.id}`);
        try {
          const signup = JSON.parse(cli(session, ['run-code', `async page => {
            await page.goto(${JSON.stringify(`${BASE_URL}/signup`)});
            await page.setViewportSize(${index % 2 === 0 ? '{ width: 390, height: 844 }' : '{ width: 1440, height: 900 }'});
            await page.getByRole('radio', { name: new RegExp(${JSON.stringify(`^${role.name}`)}) }).click();
            await page.getByRole('button', { name: 'Continue' }).click();
            ${role.id === 'self' || role.id === 'child'
              ? "await page.getByRole('button', { name: 'Continue' }).click();"
              : role.plan
                ? `await page.getByText(${JSON.stringify(role.plan)}, { exact: true }).click(); await page.getByRole('button', { name: 'Continue' }).click();`
                : "await page.getByRole('button', { name: 'Continue' }).click();"}
            await page.getByLabel('Full Name').fill(${JSON.stringify(`Certification ${role.name}`)});
            await page.getByLabel('Email Address').fill(${JSON.stringify(email)});
            await page.locator('#signup-password').fill(${JSON.stringify(password)});
            await page.getByLabel('Confirm Password').fill(${JSON.stringify(password)});
            const submit = page.getByRole('button', { name: /Create Account/ });
            ${index === 0 ? `const bounds = await submit.boundingBox();
            if (!bounds) throw new Error('Create-account button has no clickable bounds.');
            await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { clickCount: 2, delay: 20 });` : 'await submit.click();'}
            await page.waitForFunction(() => window.location.pathname === '/verify-email', null, { timeout: 20000 });
            return {
              pathname: await page.evaluate(() => window.location.pathname),
              fits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
            };
          }`], { sensitive: true }));
          expectEqual(signup.pathname, '/verify-email', `signup ${role.id} UI verification gate`);
          expectEqual(signup.fits, true, `signup ${role.id} viewport containment`);
          createdUser = await authAdmin.getUserByEmail(email);
          expectEqual(createdUser.emailVerified, false, `signup ${role.id} preverification state`);
          const preverification = await signInEmail(email);
          expectEqual(await apiStatus('/api/auth/session', preverification.body.idToken, { method: 'POST' }), 403, `signup ${role.id} preverification session denial`);
          const action = selectLatestOob(await readEmulatorOobCodes(), email, 'VERIFY_EMAIL');
          registerSensitiveValue(action.oobCode);
          expectEqual((await redeemEmailVerification(action.oobCode)).status, 200, `signup ${role.id} in-memory verification action`);
          const landing = JSON.parse(cli(session, ['run-code', `async page => {
            await page.getByRole('button', { name: "I've Verified My Email" }).click();
            await page.waitForFunction(expected => window.location.pathname === expected, ${JSON.stringify(role.destination)}, { timeout: 20000 });
            await page.reload();
            await page.waitForFunction(expected => window.location.pathname === expected, ${JSON.stringify(role.destination)}, { timeout: 20000 });
            return {
              pathname: await page.evaluate(() => window.location.pathname),
              fits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
            };
          }`], { sensitive: true }));
          expectEqual(landing.pathname, role.destination, `signup ${role.id} verified destination and reload`);
          expectEqual(landing.fits, true, `signup ${role.id} verified viewport containment`);
          const profile = await firestoreAdmin.collection('users').doc(createdUser.uid).get();
          expectEqual(profile.data()?.role, role.expectedRole, `signup ${role.id} persisted role`);
          const refreshed = await authAdmin.getUser(createdUser.uid);
          expectEqual(refreshed.customClaims?.role === 'superadmin', false, `signup ${role.id} privileged claim denial`);
        } finally {
          if (!createdUser) createdUser = await authAdmin.getUserByEmail(email).catch(() => null);
          if (createdUser) {
            await firestoreAdmin.collection('users').doc(createdUser.uid).delete().catch(() => undefined);
            await firestoreAdmin.collection('players').doc(`p_${createdUser.uid}`).delete().catch(() => undefined);
            await authAdmin.deleteUser(createdUser.uid).catch(() => undefined);
          }
          await closeBrowserSessionNow(session);
        }
      }
    });
    return;
  }
  if (scenarioId === 'signup-onboarding-youth-invitation-signup') {
    const invalid = openAnonymousBrowser('cert-youth-invalid');
    assertTwoViewportRoutes(invalid, [{ path: '/signup/youth', expected: '/signup/youth' }], 'youth invalid invitation surface');
    await closeBrowserSessionNow(invalid);
    const parent = await signIn('qa-parent-a');
    const player = fixtureDocumentByAlias(FIXTURES, 'qa-player-youth-c');
    const youthEmail = emailForAlias('qa-youth-invite');
    await withEmulatorAuthAdmin(async (authAdmin, firestoreAdmin) => {
      const playerRef = firestoreAdmin.collection('players').doc(player.data.id);
      const originalPlayer = (await playerRef.get()).data();
      let inviteToken = null;
      let createdUid = null;
      try {
        const invite = await apiJsonResult('/api/invites/youth', parent.body.idToken, {
          method: 'POST', body: JSON.stringify({
            action: 'create', childId: player.data.id,
            email: youthEmail,
          }),
        });
        expectEqual(invite.status, 200, 'youth browser invitation setup');
        inviteToken = registerSensitiveValue(invite.body.token);
        const session = browserSessionName(`cert-youth-active-${process.pid}`);
        cli(session, ['open', `${BASE_URL}/signup/youth?token=${inviteToken}`, '--browser', 'chrome'], { sensitive: true });
        const active = JSON.parse(cli(session, ['run-code', `async page => {
          await page.getByText('Create Your Password', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
          const observations = [];
          for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
            await page.setViewportSize(viewport);
            observations.push(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
          }
          const passwordField = page.locator('#youth-password');
          const confirmation = page.locator('#youth-password-confirmation');
          await passwordField.fill('short');
          await confirmation.fill('different');
          const shortPasswordInvalid = await passwordField.evaluate(element => !element.checkValidity());
          await passwordField.fill(${JSON.stringify(password)});
          await confirmation.fill('different-password');
          await page.getByRole('button', { name: 'Activate My Account' }).click();
          await page.getByText('Passwords do not match', { exact: true }).first().waitFor({ state: 'visible', timeout: 10000 });
          await confirmation.fill(${JSON.stringify(password)});
          const submit = page.getByRole('button', { name: 'Activate My Account' });
          const bounds = await submit.boundingBox();
          if (!bounds) throw new Error('Youth activation button has no clickable bounds.');
          await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, { clickCount: 2, delay: 20 });
          await page.getByText('Account Created!', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
          await page.reload();
          await page.getByText('Invitation Error', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
          return {
            observations,
            pathname: await page.evaluate(() => window.location.pathname),
            shortPasswordInvalid,
            consumedReloadDenied: await page.getByText('Invitation Error', { exact: true }).count(),
          };
        }`], { sensitive: true }));
        expectEqual(active.pathname, '/signup/youth', 'youth active invitation browser path');
        expectEqual(active.observations.every(Boolean), true, 'youth active invitation two viewports');
        expectEqual(active.shortPasswordInvalid, true, 'youth browser short password validation');
        expectEqual(active.consumedReloadDenied, 1, 'youth browser consumed invitation reload denial');
        const youth = await authAdmin.getUserByEmail(youthEmail);
        createdUid = youth.uid;
        const linkedPlayer = (await playerRef.get()).data();
        expectEqual(linkedPlayer.userId, createdUid, 'youth browser exact player linkage');
      } finally {
        if (!createdUid) createdUid = (await authAdmin.getUserByEmail(youthEmail).catch(() => null))?.uid || null;
        if (createdUid) {
          await firestoreAdmin.collection('users').doc(createdUid).delete().catch(() => undefined);
          await authAdmin.deleteUser(createdUid).catch(() => undefined);
        }
        if (inviteToken) await firestoreAdmin.collection('invites').doc(inviteToken).delete().catch(() => undefined);
        if (originalPlayer) await playerRef.set(originalPlayer);
        expectEqual((await playerRef.get()).data()?.userId, originalPlayer?.userId, 'youth browser exact cleanup');
      }
    });
    return;
  }
  if (scenarioId === 'signup-onboarding-missing-profile-onboarding') {
    const anonymous = openAnonymousBrowser('cert-onboarding-anonymous');
    assertTwoViewportRoutes(anonymous, [{ path: '/onboarding', expected: '/login' }], 'missing-profile unauthenticated denial');
    await withEmulatorAuthAdmin(async (authAdmin, firestoreAdmin) => {
      const email = `${FIXTURES.runId}-missing-profile-browser@phase2.test`;
      const account = await authAdmin.createUser({ email, password, emailVerified: true, displayName: 'Browser Missing Profile' });
      try {
        const session = await browserLoginCredentials(email, password, '/onboarding', `cert-onboarding-missing-${process.pid}`, 'missing-profile browser identity');
        const completion = JSON.parse(cli(session, ['run-code', `async page => {
          const clientErrors = [];
          const onConsole = message => { if (message.type() === 'error') clientErrors.push(message.text()); };
          const onPageError = error => clientErrors.push(error.stack || error.message);
          page.on('console', onConsole);
          page.on('pageerror', onPageError);
          try {
          await page.setViewportSize({ width: 390, height: 844 });
          const profileFormReady = await page.locator('#onboarding-name')
            .waitFor({ state: 'visible', timeout: 20000 }).then(() => true, () => false);
          if (!profileFormReady) {
            return {
              profileFormReady,
              pathname: await page.evaluate(() => window.location.pathname),
              body: (await page.locator('body').innerText()).slice(0, 500),
              clientErrors,
            };
          }
          await page.locator('#onboarding-name').fill('Browser Completed Profile');
          await page.locator('#role-coach').click();
          const button = page.getByRole('button', { name: 'Continue' });
          await button.click();
          await page.waitForFunction(() => window.location.pathname === '/teams/new', null, { timeout: 15000 });
          await page.reload();
          await page.waitForFunction(() => window.location.pathname === '/teams/new', null, { timeout: 15000 });
          return {
            pathname: await page.evaluate(() => window.location.pathname),
            fits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          };
          } finally {
            page.off('console', onConsole);
            page.off('pageerror', onPageError);
          }
        }`], { sensitive: true }));
        if (completion.profileFormReady === false) {
          const bufferedConsole = cli(session, ['console', 'error']);
          throw new Error(`Missing-profile onboarding form did not become ready at ${completion.pathname}: ${completion.body}; clientErrors=${JSON.stringify(completion.clientErrors)}; console=${bufferedConsole}`);
        }
        expectEqual(completion.pathname, '/teams/new', 'missing profile completed-role landing and reload');
        expectEqual(completion.fits, true, 'missing profile mobile completion containment');
        const profile = await firestoreAdmin.collection('users').doc(account.uid).get();
        expectEqual(profile.data()?.role, 'coach', 'missing profile browser completion persistence');
      } finally {
        await firestoreAdmin.collection('users').doc(account.uid).delete().catch(() => undefined);
        await firestoreAdmin.collection('players').doc(`p_${account.uid}`).delete().catch(() => undefined);
        await authAdmin.deleteUser(account.uid).catch(() => undefined);
      }
    });
    return;
  }
  if (scenarioId === 'demo-seed-use-exit-expiry-cleanup') {
    const session = openAnonymousBrowser('cert-demo');
    assertTwoViewportRoutes(session, [{ path: '/', expected: '/' }], 'demo public surfaces');
    const journey = JSON.parse(cli(session, ['run-code', `async page => {
      const consoleErrors = [];
      const onConsole = message => { if (message.type() === 'error') consoleErrors.push(message.text()); };
      const onPageError = error => consoleErrors.push(error.message);
      page.on('console', onConsole);
      page.on('pageerror', onPageError);
      try {
        await page.goto(${JSON.stringify(`${BASE_URL}/`)});
        await page.getByRole('button', { name: 'Experience Demo' }).click();
        await page.getByRole('button', { name: /Open Starter Plan Demo/ }).click();
        await page.waitForFunction(() => window.location.pathname === '/dashboard', null, { timeout: 30000 });
        await page.getByText('Demo Mode', { exact: true }).waitFor({ state: 'visible', timeout: 30000 });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.reload();
        await page.waitForFunction(() => window.location.pathname === '/dashboard', null, { timeout: 30000 });
        const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
        await page.setViewportSize({ width: 1280, height: 800 });
        const exitResponse = page.waitForResponse(response =>
          response.url().endsWith('/api/demo/exit') && response.request().method() === 'POST',
          { timeout: 15000 },
        );
        await page.getByRole('button', { name: 'Open account menu' }).click();
        await page.getByRole('menuitem', { name: 'Sign Out' }).click();
        const exit = await exitResponse;
        await page.waitForFunction(() => window.location.pathname === '/login', null, { timeout: 15000 });
        return {
          exitStatus: exit.status(),
          pathname: await page.evaluate(() => window.location.pathname),
          fits,
          consoleErrors,
        };
      } finally {
        page.off('console', onConsole);
        page.off('pageerror', onPageError);
      }
    }`]));
    expectEqual(journey.exitStatus, 204, 'demo browser exact exit cleanup');
    expectEqual(journey.pathname, '/login', 'demo browser exited direct-route denial');
    expectEqual(journey.fits, true, 'demo browser mobile containment');
    if (journey.consoleErrors.length > 0) console.log(`demo browser console diagnostic: ${JSON.stringify(journey.consoleErrors)}`);
    expectEqual(journey.consoleErrors.length, 0, 'demo browser console errors');
    return;
  }
  if (scenarioId === 'dashboard-shell-role-landing-and-route-policy') {
    for (const alias of FIXTURES.activeAliases) {
      const fixture = identityByAlias.get(alias);
      let session;
      try {
        session = await browserLogin(alias, fixture.expectedLanding, `cert-dashboard-${alias}-${process.pid}`);
        browserLandingPersistenceAudit(session, fixture.expectedLanding, `dashboard ${alias}`);
      } finally {
        if (session) await closeBrowserSessionNow(session);
      }
    }
    await runSurfaceSmokeAudit({ remainderOnly: true });
    return;
  }
  if (scenarioId === 'administration-access-and-user-directory') {
    const trusted = await browserLogin('qa-superadmin', '/admin', `cert-admin-trusted-${process.pid}`);
    const fake = await browserLogin('qa-fake-superadmin', '/dashboard', `cert-admin-fake-${process.pid}`);
    assertTwoViewportRoutes(trusted, [{ path: '/admin', expected: '/admin' }], 'trusted administration surface');
    assertTwoViewportRoutes(fake, [{ path: '/admin', expected: '/dashboard' }], 'fake administration denial');
    const directory = JSON.parse(cli(trusted, ['run-code', `async page => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.getByRole('button', { name: /Users Directory/ }).click();
      const search = page.getByPlaceholder('Search by name, email, phone, or org...');
      await search.waitFor({ state: 'visible', timeout: 15000 });
      await search.fill(${JSON.stringify(emailForAlias('qa-team-member'))});
      const target = page.getByText(${JSON.stringify(emailForAlias('qa-team-member'))}, { exact: true });
      await target.waitFor({ state: 'visible', timeout: 15000 });
      const targetCount = await target.count();
      const otherCount = await page.getByText(${JSON.stringify(emailForAlias('qa-parent-a'))}, { exact: true }).count();
      await page.getByRole('button', { name: new RegExp('Name / Email') }).click();
      await page.getByRole('button', { name: new RegExp('Name / Email') }).click();
      return { targetCount, otherCount, fits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth) };
    }`]));
    expectEqual(directory.targetCount >= 1, true, 'admin directory target search visibility');
    expectEqual(directory.otherCount, 0, 'admin directory search isolation');
    expectEqual(directory.fits, true, 'admin directory desktop containment');
  }
}

async function runCertificationIdentityScenarios() {
  const failures = [];
  for (const scenarioId of IDENTITY_EXECUTION_ORDER.filter(id => selectedIdentityScenarios.has(id))) {
    shutdownState.throwIfRequested();
    const scenarioStartedAt = new Date().toISOString();
    activeCertificationScenario = scenarioId;
    activeCertificationAssertions = [];
    let apiPassed = false;
    let browserPassed = !runBrowser;
    try {
      await runCertificationApiScenario(scenarioId);
      apiPassed = true;
    } catch (error) {
      const caseId = LOCAL_IDENTITY_CASE_REQUIREMENTS[scenarioId].network[0];
      recordCertificationFailure(scenarioId, 'network', caseId, error);
      failures.push({ scenarioId, stage: 'api' });
    }
    if (runBrowser) {
      const sessionBaseline = new Set(ownedBrowserSessions);
      try {
        await runCertificationBrowserScenario(scenarioId);
        browserPassed = true;
      } catch (error) {
        const caseId = LOCAL_IDENTITY_CASE_REQUIREMENTS[scenarioId].console[0];
        recordCertificationFailure(scenarioId, 'console', caseId, error);
        failures.push({ scenarioId, stage: 'browser' });
      } finally {
        try {
          await closeBrowserSessionsCreatedAfter(ownedBrowserSessions, sessionBaseline, async session => {
            run(playwrightCli, [`-s=${session}`, '--raw', 'close'], { stdio: 'pipe' });
          });
        } catch (error) {
          const caseId = LOCAL_IDENTITY_CASE_REQUIREMENTS[scenarioId].console[0];
          recordCertificationFailure(scenarioId, 'console', caseId, error);
          failures.push({ scenarioId, stage: 'browser-cleanup' });
          browserPassed = false;
        } finally {
          syncBrowserSessionRegistry();
        }
      }
    }
    if (apiPassed) {
      for (const dimension of DIMENSION_NAMES.filter(value => !['console', 'responsive'].includes(value))) {
        for (const caseId of LOCAL_IDENTITY_CASE_REQUIREMENTS[scenarioId][dimension]) {
          recordCertificationCase(scenarioId, dimension, caseId, `${activeCertificationAssertions.length} actual local assertions passed`, 'locally safe contract completed', scenarioStartedAt);
        }
      }
    }
    if (browserPassed && runBrowser) {
      for (const dimension of ['console', 'responsive']) {
        for (const caseId of LOCAL_IDENTITY_CASE_REQUIREMENTS[scenarioId][dimension]) {
          recordCertificationCase(scenarioId, dimension, caseId, `${activeCertificationAssertions.length} actual local assertions including real-browser checks passed`, 'locally safe browser contract completed', scenarioStartedAt);
        }
      }
    }
    activeCertificationScenario = null;
    activeCertificationAssertions = [];
  }
  if (failures.length > 0) throw new Error(`${failures.length} selected certification scenario stage(s) failed with structured case evidence.`);
}

function browserSurfaceSweep(session, cases, { mobile = false } = {}) {
  const code = `async page => {
    const cases = ${JSON.stringify(cases)};
    const results = [];
    let activePath = '';
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push({ path: activePath, message: message.text() });
    });
    page.on('pageerror', error => consoleErrors.push({ path: activePath, message: error.message }));
    page.on('response', response => {
      if (response.status() >= 500) failedResponses.push({ path: activePath, status: response.status(), url: response.url() });
    });
    await page.setViewportSize(${mobile ? '{ width: 390, height: 844 }' : '{ width: 1440, height: 900 }'});
    for (const item of cases) {
      activePath = item.path;
      await page.goto(${JSON.stringify(BASE_URL)} + item.path);
      await page.waitForTimeout(1400);
      if (item.waitForPathChange && await page.evaluate(requested => window.location.pathname === requested, item.path)) {
        await page.waitForFunction(requested => window.location.pathname !== requested, item.path, { timeout: 10000 }).catch(() => undefined);
        await page.waitForTimeout(800);
      }
      results.push({
        requested: item.path,
        expected: item.expected,
        expectRestricted: item.expectRestricted === true,
        expectRestrictedOn: item.expectRestrictedOn || '',
        actual: await page.evaluate(() => window.location.pathname),
        applicationError: await page.getByText(/Application error: a client-side exception/).count(),
        restricted: await page.getByText(/Access Restricted|Access Denied|Institutional Hub Locked|Elite Upgrade Required/i).count(),
        mobileFits: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      });
    }
    return { results, consoleErrors, failedResponses };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function assertSurfaceSweep(result, label) {
  const routeFailures = result.results.filter(item => {
    const expectedPaths = Array.isArray(item.expected) ? item.expected : [item.expected];
    const missingRestriction = item.expectRestricted === true && item.restricted < 1;
    const missingConditionalRestriction = item.expectRestrictedOn === item.actual && item.restricted < 1;
    return !expectedPaths.includes(item.actual) || item.applicationError !== 0 || item.mobileFits !== true || missingRestriction || missingConditionalRestriction;
  });
  if (routeFailures.length > 0) console.log(`${label} route diagnostics: ${JSON.stringify(routeFailures)}`);
  if (result.consoleErrors.length > 0) console.log(`${label} console diagnostics: ${JSON.stringify(result.consoleErrors)}`);
  if (result.failedResponses.length > 0) console.log(`${label} response diagnostics: ${JSON.stringify(result.failedResponses)}`);
  expectEqual(routeFailures.length, 0, `${label} routes, application errors, and mobileFits`);
  expectEqual(result.consoleErrors.length, 0, `${label} console errors`);
  expectEqual(result.failedResponses.length, 0, `${label} failed responses`);
}

async function runSurfaceSmokeAudit({ remainderOnly = false, includeMember = true } = {}) {
  if (!remainderOnly) {
    const owner = await browserLogin('qa-coach-owner-a', '/dashboard', `surface-owner-${process.pid}`);
    const assistant = await browserLogin('qa-team-assistant', '/dashboard', `surface-assistant-${process.pid}`);

    assertSurfaceSweep(browserSurfaceSweep(owner, [
      '/team', '/events', '/calendar', '/roster', '/feed', '/chats', '/practice', '/drills',
      '/files', '/volunteers', '/fundraising', '/facilities', '/equipment', '/games', '/settings',
      '/dashboard/billing', '/leagues', '/tournaments', '/manage-tournaments', '/coaches-corner',
      '/teams/join', '/teams/new',
    ].map(pathname => ({ path: pathname, expected: pathname })).concat([
      { path: '/club', expected: '/dashboard' },
      { path: '/competition', expected: '/dashboard' },
      { path: '/admin', expected: '/dashboard' },
    ])), 'owner remaining surface sweep');

    assertSurfaceSweep(browserSurfaceSweep(assistant, [
      '/facilities', '/equipment', '/fundraising', '/volunteers', '/manage-tournaments', '/teams/new',
    ].map(pathname => ({ path: pathname, expected: pathname })), { mobile: true }), 'assistant remaining surface sweep');
  }

  const member = includeMember
    ? await browserLogin('qa-team-member', '/dashboard', `surface-member-${process.pid}`)
    : null;
  const parent = await browserLogin('qa-parent-a', '/family', `surface-parent-${process.pid}`);
  const admin = await browserLogin('qa-superadmin', '/admin', `surface-admin-${process.pid}`);

  if (member) assertSurfaceSweep(browserSurfaceSweep(member, [
    '/team', '/events', '/calendar', '/roster', '/feed', '/chats', '/practice', '/drills', '/files',
    '/games', '/settings', '/leagues', '/volunteers',
  ].map(pathname => ({ path: pathname, expected: pathname })).concat([
    { path: '/tournaments', expected: ['/manage-tournaments', '/dashboard'], expectRestrictedOn: '/manage-tournaments', waitForPathChange: true },
  ]).concat([
    '/facilities', '/equipment', '/fundraising', '/manage-tournaments', '/teams/new',
    '/dashboard/billing', '/family', '/admin', '/club', '/competition', '/coaches-corner',
  ].map(pathname => ({ path: pathname, expected: '/dashboard' }))), { mobile: true }), 'member remaining surface sweep');

  assertSurfaceSweep(browserSurfaceSweep(parent, [
    { path: '/family', expected: '/family' },
    { path: '/family/payments', expected: '/family/payments' },
    { path: '/facilities', expected: '/family' },
    { path: '/admin', expected: '/family' },
  ], { mobile: true }), 'parent remaining surface sweep');

  assertSurfaceSweep(browserSurfaceSweep(admin, [
    { path: '/admin', expected: '/admin' },
    { path: '/admin/plans', expected: '/admin/plans' },
    { path: '/family', expected: '/family' },
    { path: '/club', expected: '/club' },
    { path: '/competition', expected: '/competition' },
  ], { mobile: true }), 'trusted admin remaining surface sweep');
}

function browserOwnerCommunicationSetup(session, marker) {
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url()); });
    const dismissPriorityAlerts = async () => {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const alert = page.getByRole('dialog', { name: 'High Priority Team Alert' });
        const visible = await alert.waitFor({ state: 'visible', timeout: 1800 }).then(() => true).catch(() => false);
        if (!visible) break;
        await alert.getByRole('button', { name: 'Got It' }).click();
        await alert.waitFor({ state: 'hidden' });
      }
    };
    await page.goto(${JSON.stringify(`${BASE_URL}/feed`)});
    await page.getByPlaceholder(/What's the play/).waitFor({ timeout: 10000 });
    await dismissPriorityAlerts();

    await page.getByRole('button', { name: 'Create poll' }).click();
    await page.getByRole('button', { name: 'Launch Poll' }).click();
    await page.getByText('Poll Incomplete', { exact: true }).waitFor();
    const incompletePoll = await page.getByText('Poll Incomplete', { exact: true }).count();
    await dismissPriorityAlerts();
    await page.locator('[toast-close]').click({ force: true });
    await page.getByPlaceholder('e.g. Best time for training?').fill(${JSON.stringify(`QA Poll ${marker}`)});
    await page.getByPlaceholder('Option 1').fill('Morning');
    await page.getByPlaceholder('Option 2').fill('Evening');
    await page.getByRole('button', { name: 'Launch Poll' }).click();
    await page.getByText(${JSON.stringify(`QA Poll ${marker}`)}, { exact: true }).waitFor({ timeout: 10000 });
    await dismissPriorityAlerts();

    let postButtonCount = 0;
    let postButtonEnabled = false;
    let composerValue = '';
    for (let attempt = 0; attempt < 5 && !postButtonEnabled; attempt += 1) {
      const composer = page.getByPlaceholder(/What's the play/);
      await composer.waitFor({ state: 'visible', timeout: 10000 });
      await composer.fill(${JSON.stringify(`QA Feed ${marker}`)});
      await page.waitForTimeout(350);
      const postButton = page.getByRole('button', { name: 'Post to Squad' });
      postButtonCount = await postButton.count();
      postButtonEnabled = postButtonCount === 1 ? await postButton.isEnabled() : false;
      composerValue = await page.getByPlaceholder(/What's the play/).inputValue().catch(() => '');
      if (postButtonEnabled) await postButton.click();
    }
    if (!postButtonEnabled) {
      throw new Error('feed composer diagnostic: ' + JSON.stringify({
        postButtonCount,
        postButtonEnabled,
        composerValue,
        pathname: await page.evaluate(() => window.location.pathname),
        body: (await page.locator('body').innerText()).slice(0, 1200),
        buttons: await page.getByRole('button').allTextContents(),
        activeTeamId: await page.evaluate(() => localStorage.getItem('sf_session_team_id')),
      }));
    }
    await page.getByText(${JSON.stringify(`QA Feed ${marker}`)}, { exact: true }).waitFor({ timeout: 10000 });
    await page.reload();
    await page.getByText(${JSON.stringify(`QA Feed ${marker}`)}, { exact: true }).waitFor({ timeout: 10000 });
    return {
      incompletePoll,
      postAfterReload: await page.getByText(${JSON.stringify(`QA Feed ${marker}`)}, { exact: true }).count(),
      pollAfterReload: await page.getByText(${JSON.stringify(`QA Poll ${marker}`)}, { exact: true }).count(),
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function browserMemberCommunication(session, marker) {
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url()); });
    await page.goto(${JSON.stringify(`${BASE_URL}/feed`)});
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const alert = page.getByRole('dialog', { name: 'High Priority Team Alert' });
      const visible = await alert.waitFor({ state: 'visible', timeout: 1200 }).then(() => true).catch(() => false);
      if (!visible) break;
      await alert.getByRole('button', { name: 'Got It' }).click();
      await alert.waitFor({ state: 'hidden' });
    }
    const postText = page.getByText(${JSON.stringify(`QA Feed ${marker}`)}, { exact: true });
    await postText.waitFor({ timeout: 10000 });
    const ownerPostVisible = await postText.count();
    const postCard = postText.locator('xpath=ancestor::div[.//button[@aria-label="Post comment"]][1]');
    await postCard.getByPlaceholder('Write to squad...').fill(${JSON.stringify(`QA Comment ${marker}`)});
    await postCard.getByRole('button', { name: 'Post comment' }).click();
    await page.getByText(${JSON.stringify(`QA Comment ${marker}`)}, { exact: true }).waitFor({ timeout: 10000 });

    const pollQuestion = page.getByText(${JSON.stringify(`QA Poll ${marker}`)}, { exact: true });
    await pollQuestion.waitFor();
    const pollCard = pollQuestion.locator('xpath=ancestor::div[.//button[.//span[normalize-space()="Morning"]]][1]');
    await pollCard.getByText('Morning', { exact: true }).click();
    await page.waitForTimeout(800);
    await page.reload();
    await page.getByText(${JSON.stringify(`QA Comment ${marker}`)}, { exact: true }).waitFor({ timeout: 10000 });
    const commentAfterReload = await page.getByText(${JSON.stringify(`QA Comment ${marker}`)}, { exact: true }).count();
    const reloadedPoll = page.getByText(${JSON.stringify(`QA Poll ${marker}`)}, { exact: true });
    await reloadedPoll.waitFor();
    const reloadedPollCard = reloadedPoll.locator('xpath=ancestor::div[.//button[.//span[normalize-space()="Morning"]]][1]');
    const voteAfterReload = await reloadedPollCard.getByText('1 v', { exact: true }).count();

    await page.goto(${JSON.stringify(`${BASE_URL}/chats/qa-team-chat?teamId=qa-team-a`)});
    const chatInput = page.getByPlaceholder('Tactical update...');
    const chatReady = await chatInput.waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
    if (!chatReady) {
      throw new Error('chat detail diagnostic: ' + JSON.stringify({
        pathname: await page.evaluate(() => window.location.pathname),
        body: (await page.locator('body').innerText()).slice(0, 1200),
        consoleErrors,
        failedResponses,
      }));
    }
    await chatInput.fill(${JSON.stringify(`QA Chat ${marker}`)});
    await page.getByRole('button', { name: 'Send message' }).click();
    await page.getByText(${JSON.stringify(`QA Chat ${marker}`)}, { exact: true }).waitFor({ timeout: 10000 });
    await page.reload();
    await page.getByText(${JSON.stringify(`QA Chat ${marker}`)}, { exact: true }).waitFor({ timeout: 10000 });
    return {
      ownerPostVisible,
      commentAfterReload,
      voteAfterReload,
      chatAfterReload: await page.getByText(${JSON.stringify(`QA Chat ${marker}`)}, { exact: true }).count(),
      teamBLeak: await page.getByText(/BLUEBIRD-B/).count(),
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function browserOwnerCommunicationVerify(session, marker) {
  const code = `async page => {
    await page.goto(${JSON.stringify(`${BASE_URL}/feed`)});
    await page.getByText(${JSON.stringify(`QA Comment ${marker}`)}, { exact: true }).waitFor({ timeout: 10000 });
    const memberComment = await page.getByText(${JSON.stringify(`QA Comment ${marker}`)}, { exact: true }).count();
    const postText = page.getByText(${JSON.stringify(`QA Feed ${marker}`)}, { exact: true });
    const postCard = postText.locator('xpath=ancestor::div[.//button[starts-with(@aria-label,"Delete post by")]][1]');
    await postCard.getByRole('button', { name: /Delete post by/ }).click();
    await postText.waitFor({ state: 'detached', timeout: 10000 });
    await page.reload();
    const deletedAfterReload = await page.getByText(${JSON.stringify(`QA Feed ${marker}`)}, { exact: true }).count();

    await page.goto(${JSON.stringify(`${BASE_URL}/chats/qa-team-chat?teamId=qa-team-a`)});
    await page.getByText(${JSON.stringify(`QA Chat ${marker}`)}, { exact: true }).waitFor({ timeout: 10000 });
    return {
      memberComment,
      deletedAfterReload,
      chatVisible: await page.getByText(${JSON.stringify(`QA Chat ${marker}`)}, { exact: true }).count(),
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

async function runCommunicationWorkflowAudit() {
  const marker = `phase2-${process.pid}`;
  const owner = await browserLogin('qa-coach-owner-a', '/dashboard', `communication-owner-${process.pid}`);
  const member = await browserLogin('qa-team-member', '/dashboard', `communication-member-${process.pid}`);
  const setup = browserOwnerCommunicationSetup(owner, marker);
  expectEqual(setup.incompletePoll, 1, 'feed rejects incomplete poll');
  expectEqual(setup.postAfterReload, 1, 'owner feed post persists after reload');
  expectEqual(setup.pollAfterReload, 1, 'owner poll persists after reload');
  expectEqual(setup.consoleErrors.length, 0, 'owner feed workflow console errors');
  expectEqual(setup.failedResponses.length, 0, 'owner feed workflow failed responses');

  const memberResult = browserMemberCommunication(member, marker);
  expectEqual(memberResult.ownerPostVisible, 1, 'member sees owner feed post');
  expectEqual(memberResult.commentAfterReload, 1, 'member comment persists for owner');
  expectEqual(memberResult.voteAfterReload, 1, 'member poll vote persists after reload');
  expectEqual(memberResult.chatAfterReload, 1, 'member chat message persists after reload');
  expectEqual(memberResult.teamBLeak, 0, 'Team B chat content is absent from Team A UI');
  expectEqual(memberResult.consoleErrors.length, 0, 'member communication workflow console errors');
  expectEqual(memberResult.failedResponses.length, 0, 'member communication workflow failed responses');

  const ownerResult = browserOwnerCommunicationVerify(owner, marker);
  expectEqual(ownerResult.memberComment, 1, 'member comment persists for owner');
  expectEqual(ownerResult.deletedAfterReload, 0, 'owner feed post delete persists after reload');
  expectEqual(ownerResult.chatVisible, 1, 'member chat message persists for owner');
}

function browserOwnerEventCreate(session, marker) {
  const title = `QA Event ${marker}`;
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url()); });
    await page.goto(${JSON.stringify(`${BASE_URL}/events`)});
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const alert = page.getByRole('dialog', { name: 'High Priority Team Alert' });
      const visible = await alert.waitFor({ state: 'visible', timeout: 1200 }).then(() => true).catch(() => false);
      if (!visible) break;
      await alert.getByRole('button', { name: 'Got It' }).click();
      await alert.waitFor({ state: 'hidden' });
    }
    await page.getByRole('button', { name: '+ New Activity' }).click();
    const form = page.getByRole('dialog', { name: 'Schedule New Team Activity' });
    await form.getByRole('button', { name: 'Deploy Activity' }).click();
    await page.getByText('Activity Incomplete', { exact: true }).waitFor();
    const incomplete = await page.getByText('Activity Incomplete', { exact: true }).count();
    await page.locator('[toast-close]').click({ force: true });
    await form.getByPlaceholder('e.g. Squad Match vs Tigers').fill(${JSON.stringify(title)});
    await form.getByRole('button', { name: 'Pick Date' }).first().click();
    const dateButton = page.getByRole('button', { name: /September 20/ }).first();
    await dateButton.waitFor({ timeout: 5000 });
    await dateButton.click();
    await form.locator('input[type="time"]').fill('18:30');
    await form.locator('textarea').fill('Synthetic browser-audit event');
    await form.getByRole('button', { name: 'Deploy Activity' }).click();
    await page.getByText(${JSON.stringify(title)}, { exact: true }).first().waitFor({ timeout: 10000 });
    await page.reload();
    await page.getByText(${JSON.stringify(title)}, { exact: true }).first().waitFor({ timeout: 10000 });
    return {
      incomplete,
      createdAfterReload: await page.getByText(${JSON.stringify(title)}, { exact: true }).count(),
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function browserMemberEventRsvp(session, marker) {
  const title = `QA Event ${marker}`;
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url()); });
    await page.goto(${JSON.stringify(`${BASE_URL}/events`)});
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const alert = page.getByRole('dialog', { name: 'High Priority Team Alert' });
      const visible = await alert.waitFor({ state: 'visible', timeout: 1200 }).then(() => true).catch(() => false);
      if (!visible) break;
      await alert.getByRole('button', { name: 'Got It' }).click();
      await alert.waitFor({ state: 'hidden' });
    }
    const eventTitle = page.getByText(${JSON.stringify(title)}, { exact: true }).last();
    await eventTitle.waitFor({ timeout: 10000 });
    await eventTitle.click();
    const details = page.getByRole('dialog', { name: ${JSON.stringify(`Event Intelligence: ${title}`)} });
    const editControls = await details.getByRole('button', { name: 'Edit Activity' }).count();
    const goingControls = await details.getByRole('button', { name: 'Going' }).count();
    if (goingControls === 0) {
      throw new Error('member event RSVP diagnostic: ' + JSON.stringify({
        body: (await details.innerText()).slice(0, 1800),
        buttons: await details.getByRole('button').allTextContents(),
        pathname: await page.evaluate(() => window.location.pathname),
      }));
    }
    await details.getByRole('button', { name: 'Going' }).click();
    await details.getByText('GOING', { exact: true }).first().waitFor({ timeout: 10000 });
    await details.getByRole('button', { name: 'Close event details' }).click();
    await page.reload();
    await page.getByText(${JSON.stringify(title)}, { exact: true }).last().click();
    const reloaded = page.getByRole('dialog', { name: ${JSON.stringify(`Event Intelligence: ${title}`)} });
    await reloaded.getByText('GOING', { exact: true }).first().waitFor({ timeout: 10000 });
    return {
      eventVisible: await page.getByText(${JSON.stringify(title)}, { exact: true }).count(),
      editControls,
      rsvpAfterReload: await reloaded.getByText('GOING', { exact: true }).count(),
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function browserOwnerEventEditDelete(session, marker) {
  const original = `QA Event ${marker}`;
  const updated = `QA Event Updated ${marker}`;
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url()); });
    await page.goto(${JSON.stringify(`${BASE_URL}/events`)});
    await page.getByText(${JSON.stringify(original)}, { exact: true }).last().click();
    const details = page.getByRole('dialog', { name: ${JSON.stringify(`Event Intelligence: ${original}`)} });
    await details.getByRole('button', { name: 'Edit Activity' }).click();
    const form = page.getByRole('dialog', { name: 'Schedule New Team Activity' });
    await form.getByPlaceholder('e.g. Squad Match vs Tigers').fill(${JSON.stringify(updated)});
    await form.getByRole('button', { name: 'Deploy Activity' }).click();
    await page.getByText(${JSON.stringify(updated)}, { exact: true }).first().waitFor({ timeout: 10000 });
    const close = page.getByRole('button', { name: 'Close event details' });
    if (await close.count()) await close.click();
    await page.reload();
    await page.getByText(${JSON.stringify(updated)}, { exact: true }).first().waitFor({ timeout: 10000 });
    const editedAfterReload = await page.getByText(${JSON.stringify(updated)}, { exact: true }).count();
    await page.getByText(${JSON.stringify(updated)}, { exact: true }).last().click();
    const updatedDetails = page.getByRole('dialog', { name: ${JSON.stringify(`Event Intelligence: ${updated}`)} });
    await updatedDetails.getByRole('button', { name: ${JSON.stringify(`Delete ${updated}`)} }).click();
    const confirmation = page.getByRole('alertdialog');
    await confirmation.getByRole('button', { name: 'Delete Activity' }).click();
    await page.getByText(${JSON.stringify(updated)}, { exact: true }).first().waitFor({ state: 'detached', timeout: 10000 });
    await page.reload();
    return {
      editedAfterReload,
      deletedAfterReload: await page.getByText(${JSON.stringify(updated)}, { exact: true }).count(),
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

async function runEventWorkflowAudit() {
  const marker = `phase2-${process.pid}`;
  const owner = await browserLogin('qa-coach-owner-a', '/dashboard', `events-owner-${process.pid}`);
  const member = await browserLogin('qa-team-member', '/dashboard', `events-member-${process.pid}`);
  const created = browserOwnerEventCreate(owner, marker);
  expectEqual(created.incomplete, 1, 'event rejects incomplete activity');
  expectEqual(created.createdAfterReload > 0, true, 'owner event create persists after reload');
  expectEqual(created.consoleErrors.length, 0, 'owner event create console errors');
  expectEqual(created.failedResponses.length, 0, 'owner event create failed responses');
  const memberResult = browserMemberEventRsvp(member, marker);
  expectEqual(memberResult.eventVisible > 0, true, 'member sees owner event');
  expectEqual(memberResult.editControls, 0, 'member cannot edit team event');
  expectEqual(memberResult.rsvpAfterReload > 0, true, 'member RSVP persists after reload');
  expectEqual(memberResult.consoleErrors.length, 0, 'member event workflow console errors');
  expectEqual(memberResult.failedResponses.length, 0, 'member event workflow failed responses');
  const ownerResult = browserOwnerEventEditDelete(owner, marker);
  expectEqual(ownerResult.editedAfterReload > 0, true, 'owner event edit persists after reload');
  expectEqual(ownerResult.deletedAfterReload, 0, 'owner event delete persists after reload');
  expectEqual(ownerResult.consoleErrors.length, 0, 'owner event edit/delete console errors');
  expectEqual(ownerResult.failedResponses.length, 0, 'owner event edit/delete failed responses');
}

function browserFacilityWorkflow(session, marker) {
  const facility = `QA Facility ${marker}`;
  const updatedFacility = `QA Facility Updated ${marker}`;
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url()); });
    await page.goto(${JSON.stringify(`${BASE_URL}/facilities`)});
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const alert = page.getByRole('dialog', { name: 'High Priority Team Alert' });
      const visible = await alert.waitFor({ state: 'visible', timeout: 1200 }).then(() => true).catch(() => false);
      if (!visible) break;
      await alert.getByRole('button', { name: 'Got It' }).click();
      await alert.waitFor({ state: 'hidden' });
    }
    await page.getByRole('button', { name: 'Enroll Facility' }).click();
    const enrollment = page.getByRole('dialog', { name: 'Facility Registration' });
    const commit = enrollment.getByRole('button', { name: 'Commit Facility Enrollment' });
    const initiallyDisabled = await commit.isDisabled();
    await enrollment.getByPlaceholder('e.g. Metro Sports Complex').fill(${JSON.stringify(facility)});
    const nameOnlyDisabled = await commit.isDisabled();
    await enrollment.getByPlaceholder('123 Stadium Way, City, State…').fill('100 QA Avenue');
    const completeEnabled = await commit.isEnabled();
    await commit.click();
    await page.getByText(${JSON.stringify(facility)}, { exact: true }).waitFor({ timeout: 10000 });
    await page.reload();
    await page.getByText(${JSON.stringify(facility)}, { exact: true }).waitFor({ timeout: 10000 });
    const createdAfterReload = await page.getByText(${JSON.stringify(facility)}, { exact: true }).count();

    await page.getByRole('button', { name: ${JSON.stringify(`Edit ${facility}`)} }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Facility' });
    await edit.getByPlaceholder('e.g. Metro Sports Complex').fill(${JSON.stringify(updatedFacility)});
    await edit.getByRole('button', { name: 'Save Changes' }).click();
    await page.getByText(${JSON.stringify(updatedFacility)}, { exact: true }).waitFor({ timeout: 10000 });
    await page.reload();
    await page.getByText(${JSON.stringify(updatedFacility)}, { exact: true }).waitFor({ timeout: 10000 });
    const editedAfterReload = await page.getByText(${JSON.stringify(updatedFacility)}, { exact: true }).count();
    return {
      initiallyDisabled,
      nameOnlyDisabled,
      completeEnabled,
      createdAfterReload,
      editedAfterReload,
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function browserFacilityResourceWorkflow(session, marker) {
  const updatedFacility = `QA Facility Updated ${marker}`;
  const resource = `QA Court ${marker}`;
  const updatedResource = `QA Court Updated ${marker}`;
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url()); });
    await page.getByPlaceholder('e.g. Field A, Court 1...').fill(${JSON.stringify(resource)});
    await page.getByRole('button', { name: 'Add Resource' }).click();
    await page.getByText(${JSON.stringify(resource)}, { exact: true }).waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: ${JSON.stringify(`Rename ${resource}`)} }).click();
    const rename = page.getByRole('textbox', { name: ${JSON.stringify(`Rename ${resource}`)} });
    await rename.fill(${JSON.stringify(updatedResource)});
    await page.getByRole('button', { name: ${JSON.stringify(`Save ${resource} name`)} }).click();
    await page.getByText(${JSON.stringify(updatedResource)}, { exact: true }).waitFor({ timeout: 10000 });
    await page.reload();
    await page.getByText(${JSON.stringify(updatedResource)}, { exact: true }).waitFor({ timeout: 10000 });
    const resourceRenamedAfterReload = await page.getByText(${JSON.stringify(updatedResource)}, { exact: true }).count();
    await page.evaluate(() => { window.confirm = () => false; });
    await page.getByRole('button', { name: ${JSON.stringify(`Delete ${updatedResource}`)} }).click();
    const resourceAfterCancel = await page.getByText(${JSON.stringify(updatedResource)}, { exact: true }).count();
    await page.evaluate(() => { window.confirm = () => true; });
    await page.getByRole('button', { name: ${JSON.stringify(`Delete ${updatedResource}`)} }).click();
    await page.getByText(${JSON.stringify(updatedResource)}, { exact: true }).waitFor({ state: 'detached', timeout: 10000 });
    const resourceAfterDelete = await page.getByText(${JSON.stringify(updatedResource)}, { exact: true }).count();
    await page.getByRole('button', { name: ${JSON.stringify(`Decommission ${updatedFacility}`)} }).click();
    await page.getByText(${JSON.stringify(updatedFacility)}, { exact: true }).waitFor({ state: 'detached', timeout: 10000 });
    return {
      resourceRenamedAfterReload,
      resourceAfterCancel,
      resourceAfterDelete,
      facilityAfterDelete: await page.getByText(${JSON.stringify(updatedFacility)}, { exact: true }).count(),
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

async function runFacilityWorkflowAudit() {
  const marker = `phase2-${process.pid}`;
  const owner = await browserLogin('qa-coach-owner-a', '/dashboard', `facilities-owner-${process.pid}`);
  const result = browserFacilityWorkflow(owner, marker);
  expectEqual(result.initiallyDisabled && result.nameOnlyDisabled && result.completeEnabled, true, 'facility requires name and address');
  expectEqual(result.createdAfterReload, 1, 'facility create persists after reload');
  expectEqual(result.editedAfterReload, 1, 'facility edit persists after reload');
  expectEqual(result.consoleErrors.length, 0, 'facility workflow console errors');
  expectEqual(result.failedResponses.length, 0, 'facility workflow failed responses');
  const resources = browserFacilityResourceWorkflow(owner, marker);
  expectEqual(resources.resourceRenamedAfterReload, 1, 'resource rename persists after reload');
  expectEqual(resources.resourceAfterCancel, 1, 'resource delete cancel preserves record');
  expectEqual(resources.resourceAfterDelete, 0, 'resource delete persists after reload');
  expectEqual(resources.facilityAfterDelete, 0, 'facility delete persists after reload');
  expectEqual(resources.consoleErrors.length, 0, 'facility resource workflow console errors');
  expectEqual(resources.failedResponses.length, 0, 'facility resource workflow failed responses');
}

function browserEquipmentCreateEdit(session, marker) {
  const asset = `QA Cones ${marker}`;
  const updated = `QA Training Cones ${marker}`;
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url()); });
    await page.goto(${JSON.stringify(`${BASE_URL}/equipment`)});
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const alert = page.getByRole('dialog', { name: 'High Priority Team Alert' });
      const visible = await alert.waitFor({ state: 'visible', timeout: 1200 }).then(() => true).catch(() => false);
      if (!visible) break;
      await alert.getByRole('button', { name: 'Got It' }).click();
      await alert.waitFor({ state: 'hidden' });
    }
    await page.getByRole('button', { name: 'Add Asset' }).click();
    const enrollment = page.getByRole('dialog', { name: 'Enroll Equipment Asset' });
    await enrollment.getByPlaceholder('e.g. Away Jerseys').fill(${JSON.stringify(asset)});
    await enrollment.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Training Gear' }).click();
    await enrollment.locator('input[type="number"]').first().fill('3');
    await enrollment.getByRole('button', { name: 'Commit Asset to Vault' }).click();
    await page.getByText(${JSON.stringify(asset)}, { exact: true }).waitFor({ timeout: 10000 });
    await page.reload();
    await page.getByText(${JSON.stringify(asset)}, { exact: true }).waitFor({ timeout: 10000 });
    const createdAfterReload = await page.getByText(${JSON.stringify(asset)}, { exact: true }).count();
    const search = page.getByPlaceholder('Search inventory ledger...');
    await search.fill('not-present-' + ${JSON.stringify(marker)});
    const hiddenBySearch = await page.getByText(${JSON.stringify(asset)}, { exact: true }).count();
    await search.fill('QA Cones');
    await page.getByText(${JSON.stringify(asset)}, { exact: true }).waitFor();
    const foundBySearch = await page.getByText(${JSON.stringify(asset)}, { exact: true }).count();
    await page.getByRole('button', { name: ${JSON.stringify(`Edit ${asset}`)} }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Equipment Asset' });
    await edit.locator('input').first().fill(${JSON.stringify(updated)});
    await edit.getByRole('button', { name: 'Commit Synchronization' }).click();
    await search.fill('');
    await page.getByText(${JSON.stringify(updated)}, { exact: true }).waitFor({ timeout: 10000 });
    await page.reload();
    await page.getByText(${JSON.stringify(updated)}, { exact: true }).waitFor({ timeout: 10000 });
    return {
      createdAfterReload,
      hiddenBySearch,
      foundBySearch,
      editedAfterReload: await page.getByText(${JSON.stringify(updated)}, { exact: true }).count(),
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function browserEquipmentAssignReturnDelete(session, marker) {
  const asset = `QA Training Cones ${marker}`;
  const memberName = 'qa team member';
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push(response.url()); });
    await page.getByRole('button', { name: 'Assign to Player' }).click();
    const assignment = page.getByRole('dialog', { name: 'Deploy Asset' });
    await assignment.getByRole('combobox').click();
    await page.getByRole('option', { name: /qa team member/i }).click();
    await assignment.locator('input[type="number"]').fill('4');
    await assignment.getByRole('button', { name: 'Dispatch Asset' }).click();
    await page.getByText('Quota Exceeded', { exact: true }).waitFor();
    const rejectedOverAssignment = await page.getByText('Quota Exceeded', { exact: true }).count();
    await page.locator('[toast-close]').click({ force: true });
    await assignment.locator('input[type="number"]').fill('1');
    await assignment.getByRole('button', { name: 'Dispatch Asset' }).click();
    await page.getByText(${JSON.stringify(memberName)}, { exact: true }).waitFor({ timeout: 10000 });
    await page.reload();
    await page.getByText(${JSON.stringify(memberName)}, { exact: true }).waitFor({ timeout: 10000 });
    const assignmentAfterReload = await page.getByText(${JSON.stringify(memberName)}, { exact: true }).count();
    await page.getByRole('button', { name: ${JSON.stringify(`Delete ${asset}`)} }).click();
    await page.getByText('Asset Still Assigned', { exact: true }).waitFor({ timeout: 10000 });
    const blockedDelete = await page.getByText(${JSON.stringify(asset)}, { exact: true }).count();
    await page.locator('[toast-close]').click({ force: true });
    await page.getByRole('button', { name: new RegExp('Return ' + ${JSON.stringify(asset)} + ' from', 'i') }).click();
    await page.getByText(${JSON.stringify(memberName)}, { exact: true }).waitFor({ state: 'detached', timeout: 10000 });
    const availableAfterReturn = await page.locator('div').filter({ hasText: /^Available3$/ }).count();
    await page.getByRole('button', { name: ${JSON.stringify(`Delete ${asset}`)} }).click();
    await page.getByText(${JSON.stringify(asset)}, { exact: true }).waitFor({ state: 'detached', timeout: 10000 });
    await page.reload();
    return {
      rejectedOverAssignment,
      assignmentAfterReload,
      blockedDelete,
      availableAfterReturn,
      deletedAfterReload: await page.getByText(${JSON.stringify(asset)}, { exact: true }).count(),
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

async function runEquipmentWorkflowAudit() {
  const marker = `phase2-${process.pid}`;
  const owner = await browserLogin('qa-coach-owner-a', '/dashboard', `equipment-owner-${process.pid}`);
  const first = browserEquipmentCreateEdit(owner, marker);
  expectEqual(first.createdAfterReload, 1, 'equipment create persists after reload');
  expectEqual(first.hiddenBySearch === 0 && first.foundBySearch === 1, true, 'equipment search filters inventory');
  expectEqual(first.editedAfterReload, 1, 'equipment edit persists after reload');
  expectEqual(first.consoleErrors.length, 0, 'equipment create/edit console errors');
  expectEqual(first.failedResponses.length, 0, 'equipment create/edit failed responses');
  const second = browserEquipmentAssignReturnDelete(owner, marker);
  expectEqual(second.rejectedOverAssignment, 1, 'equipment rejects over-assignment');
  expectEqual(second.assignmentAfterReload, 1, 'equipment assignment persists after reload');
  expectEqual(second.blockedDelete, 1, 'assigned equipment deletion is blocked');
  expectEqual(second.availableAfterReturn > 0, true, 'equipment return restores availability');
  expectEqual(second.deletedAfterReload, 0, 'equipment delete persists after reload');
  expectEqual(second.consoleErrors.length, 0, 'equipment assignment workflow console errors');
  expectEqual(second.failedResponses.length, 0, 'equipment assignment workflow failed responses');
}

async function runChatProbeAudit() {
  const member = await browserLogin('qa-team-member', '/dashboard', `chat-probe-${process.pid}`);
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 400 && response.url().startsWith(${JSON.stringify(BASE_URL)})) failedResponses.push({ status: response.status(), url: response.url() }); });
    await page.goto(${JSON.stringify(`${BASE_URL}/chats/qa-team-chat?teamId=qa-team-a`)});
    const input = page.getByPlaceholder('Tactical update...');
    const ready = await input.waitFor({ timeout: 10000 }).then(() => true).catch(() => false);
    return {
      ready,
      pathname: await page.evaluate(() => window.location.pathname),
      body: (await page.locator('body').innerText()).slice(0, 1500),
      consoleErrors,
      failedResponses,
    };
  }`;
  const result = JSON.parse(cli(member, ['run-code', code]));
  if (!result.ready) console.log(`chat probe diagnostic: ${JSON.stringify(result)}`);
  expectEqual(result.ready, true, 'seeded member chat detail loads');
}

function browserScheduleAppAudit(session) {
  const code = `async page => {
    const onlineConsoleErrors = [];
    const offlineConsoleErrors = [];
    let offlinePhase = false;
    const recordConsoleError = text => (offlinePhase ? offlineConsoleErrors : onlineConsoleErrors).push(text);
    page.on('console', message => { if (message.type() === 'error') recordConsoleError(message.text()); });
    page.on('pageerror', error => recordConsoleError(error.message));

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(${JSON.stringify(`${BASE_URL}/schedule-app`)});
    await page.getByRole('heading', { name: 'My Schedule' }).waitFor();
    await page.getByText(/Live ·/).waitFor({ timeout: 10000 });
    const teamAEvent = await page.getByText(/FALCON-A Future Practice/).count();
    const leakedTeamBEvent = await page.getByText(/BLUEBIRD-B Future Practice/).count();

    await page.evaluate(() => {
      localStorage.setItem('squad_schedule_todos', JSON.stringify([{ id: 'legacy-secret', text: 'LEGACY PROFILE SECRET', dueDate: '2026-09-04', completed: false, createdAt: 'x' }]));
      localStorage.setItem('squad_schedule_v2:user:qa-adult-player-a:todos', '{broken');
      localStorage.setItem('squad_schedule_v2:user:qa-adult-player-b:todos', JSON.stringify([{ id: 'other-secret', text: 'OTHER PROFILE SECRET', dueDate: '2026-09-04', completed: false, createdAt: 'x' }]));
    });
    await page.reload();
    await page.getByRole('button', { name: /To-Do List/ }).click();
    const corruptionRecovered = await page.getByText('All Clear', { exact: true }).count();
    const legacyLeak = await page.getByText('LEGACY PROFILE SECRET', { exact: true }).count();
    const otherProfileLeak = await page.getByText('OTHER PROFILE SECRET', { exact: true }).count();

    await page.getByRole('button', { name: 'Add Task' }).click();
    await page.getByPlaceholder('What needs to get done?').fill('Bring audit cones');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByText('Bring audit cones', { exact: true }).waitFor();
    await page.waitForFunction(() => {
      const raw = localStorage.getItem('squad_schedule_v2:user:qa-adult-player-a:todos');
      return typeof raw === 'string' && raw.includes('Bring audit cones');
    });
    await page.reload();
    await page.getByRole('button', { name: /To-Do List/ }).click();
    await page.getByText('Bring audit cones', { exact: true }).waitFor();
    const persistedTodo = await page.getByText('Bring audit cones', { exact: true }).count();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const mobileFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    const serviceWorkerState = await page.evaluate(async () => ({
      scheduleShellCached: Boolean(await caches.match('/schedule-app')),
      controller: navigator.serviceWorker.controller?.scriptURL || '',
      registrations: (await navigator.serviceWorker.getRegistrations()).map(registration => ({
        active: registration.active?.scriptURL || '',
        installing: registration.installing?.scriptURL || '',
        waiting: registration.waiting?.scriptURL || '',
      })),
      cacheNames: await caches.keys(),
    }));
    if (!serviceWorkerState.scheduleShellCached) {
      throw new Error('schedule shell cache diagnostic: ' + JSON.stringify(serviceWorkerState));
    }
    const scheduleShellCached = serviceWorkerState.scheduleShellCached;
    offlinePhase = true;
    await page.context().setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'My Schedule' }).waitFor({ timeout: 10000 })
      .catch(() => { throw new Error('offline schedule shell did not render'); });
    await page.getByRole('button', { name: /To-Do List/ }).click();
    await page.getByText('Bring audit cones', { exact: true }).waitFor();
    const offlineTodo = await page.getByText('Bring audit cones', { exact: true }).count();
    await page.context().setOffline(false);
    await page.waitForTimeout(250);
    offlinePhase = false;

    await page.goto(${JSON.stringify(`${BASE_URL}/settings`)});
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await page.waitForFunction(() => window.location.pathname === '/login', null, { timeout: 10000 })
      .catch(() => { throw new Error('profile switch did not reach login: ' + page.url()); });
    await page.getByLabel('Email Address').fill(${JSON.stringify(emailForAlias('qa-adult-player-b'))});
    await page.locator('#password').fill(${JSON.stringify(password)});
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForTimeout(5000);
    if (await page.evaluate(() => window.location.pathname) === '/login') {
      throw new Error('Team B login remained unauthenticated: ' + JSON.stringify({
        url: page.url(),
        loginFailed: await page.getByText('Login Failed', { exact: true }).count(),
        sessionFailed: await page.getByText('Session Setup Failed', { exact: true }).count(),
      }));
    }
    await page.goto(${JSON.stringify(`${BASE_URL}/schedule-app`)});
    await page.getByText(/Live ·/).waitFor({ timeout: 10000 });
    const teamBEvent = await page.getByText(/BLUEBIRD-B Future Practice/).count();
    const switchedTeamALeak = await page.getByText(/FALCON-A Future Practice/).count();
    await page.getByRole('button', { name: /To-Do List/ }).click();
    const switchedTodoLeak = await page.getByText('Bring audit cones', { exact: true }).count();

    return {
      teamAEvent,
      leakedTeamBEvent,
      corruptionRecovered,
      legacyLeak,
      otherProfileLeak,
      persistedTodo,
      mobileFits,
      scheduleShellCached,
      offlineTodo,
      teamBEvent,
      switchedTeamALeak,
      switchedTodoLeak,
      onlineConsoleErrors,
      offlineConsoleErrors,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code], { sensitive: true }));
}

function assertScheduleAppAudit(result) {
  // Chromium can deliver this native registration error after connectivity is
  // restored even though the update request began during the offline interval.
  const unexpectedOnlineErrors = result.onlineConsoleErrors.filter(message =>
    message !== 'A bad HTTP response code (404) was received when fetching the script.'
  );
  if (unexpectedOnlineErrors.length > 0) {
    console.log(`Schedule companion unexpected online console errors: ${JSON.stringify(unexpectedOnlineErrors)}`);
  }
  const unexpectedOfflineErrors = result.offlineConsoleErrors.filter(message =>
    !/ERR_INTERNET_DISCONNECTED|webpack-hmr|Failed to fetch|bad HTTP response code \(404\)/.test(message)
  );
  if (unexpectedOfflineErrors.length > 0) {
    console.log(`Schedule companion unexpected offline console errors: ${JSON.stringify(unexpectedOfflineErrors)}`);
  }
  expectEqual(result.teamAEvent, 1, 'schedule companion loads current Team A event');
  expectEqual(result.leakedTeamBEvent, 0, 'schedule companion hides Team B event from Team A user');
  expectEqual(result.corruptionRecovered, 1, 'schedule companion recovers from corrupt todo storage');
  expectEqual(result.legacyLeak, 0, 'schedule companion ignores unscoped legacy todo data');
  expectEqual(result.otherProfileLeak, 0, 'schedule companion ignores another profile todo data');
  expectEqual(result.persistedTodo, 1, 'schedule companion todo CRUD persists after reload');
  expectEqual(result.mobileFits, true, 'schedule companion fits mobile viewport');
  expectEqual(result.scheduleShellCached, true, 'schedule companion shell is present in service-worker cache');
  expectEqual(result.offlineTodo, 1, 'schedule companion shell and todos reload offline');
  expectEqual(result.teamBEvent, 1, 'schedule companion switches to current Team B event');
  expectEqual(result.switchedTeamALeak, 0, 'schedule companion removes Team A events after profile switch');
  expectEqual(result.switchedTodoLeak, 0, 'schedule companion removes Team A todos after profile switch');
  expectEqual(unexpectedOnlineErrors.length, 0, 'schedule companion unexpected online console errors');
  expectEqual(unexpectedOfflineErrors.length, 0, 'schedule companion unexpected offline console errors');
}

function browserTeamSwitchAudit(session) {
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500) failedResponses.push(response.url()); });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByText(/Phase 2 Falcons • coach/i).waitFor();
    const priorityAlert = page.getByRole('dialog', { name: 'High Priority Team Alert' });
    if (await priorityAlert.count()) {
      await priorityAlert.getByRole('button', { name: 'Got It' }).click();
      await priorityAlert.waitFor({ state: 'hidden' });
    }
    await page.getByText('FALCON-A Future Practice', { exact: true }).waitFor();
    const initialTeamBLeak = await page.getByText('BLUEBIRD-B Future Practice', { exact: true }).count();

    const switchDesktop = async teamId => {
      const clickVisibleTeam = id => page.evaluate(teamId => {
        const row = Array.from(document.querySelectorAll('button[data-team-switch-id="' + teamId + '"]'))
          .find(element => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; });
        if (!row) return false;
        row.click();
        return true;
      }, id);
      if (await clickVisibleTeam(teamId)) return;
      const trigger = page.locator('button[data-testid="squad-switcher-trigger"]:visible').first();
      await trigger.click();
      await page.waitForFunction(id => Array.from(document.querySelectorAll('button[data-team-switch-id="' + id + '"]'))
        .some(element => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; }), teamId);
      if (!await clickVisibleTeam(teamId)) throw new Error('visible team row disappeared before selection: ' + teamId);
    };
    await switchDesktop('qa-team-b');
    await page.getByText(/Phase 2 Bluebirds • coach/i).waitFor();
    await page.getByText('BLUEBIRD-B Future Practice', { exact: true }).waitFor();
    await page.waitForFunction(() => !document.body.innerText.includes('FALCON-A Future Practice'));
    const teamAAfterSwitch = await page.getByText('FALCON-A Future Practice', { exact: true }).count();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await switchDesktop('qa-team-a');
      await page.getByText(/Phase 2 Falcons • coach/i).waitFor();
      await switchDesktop('qa-team-b');
      await page.getByText(/Phase 2 Bluebirds • coach/i).waitFor();
    }
    await page.getByText('BLUEBIRD-B Future Practice', { exact: true }).waitFor();
    const selectedAfterRapidSwitch = await page.evaluate(() => localStorage.getItem('sf_session_team_id'));

    await page.reload();
    await page.getByText(/Phase 2 Bluebirds • coach/i).waitFor();
    await page.getByText('BLUEBIRD-B Future Practice', { exact: true }).waitFor();
    const teamAAfterReload = await page.getByText('FALCON-A Future Practice', { exact: true }).count();

    await page.goto(${JSON.stringify(`${BASE_URL}/calendar`)});
    await page.getByRole('heading', { name: 'Master Calendar' }).waitFor();
    await page.goBack();
    await page.getByText(/Phase 2 Bluebirds • coach/i).waitFor();
    const selectedAfterBack = await page.evaluate(() => localStorage.getItem('sf_session_team_id'));

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('button[data-testid="squad-switcher-trigger"]:visible').first().click();
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      const row = Array.from(document.querySelectorAll('button[data-team-switch-id="qa-team-a"]'))
        .find(element => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0; });
      if (!row) throw new Error('mobile Team A switch row is not visible');
      row.click();
    });
    await page.getByText(/Phase 2 Falcons • coach/i).waitFor();
    await page.getByText('FALCON-A Future Practice', { exact: true }).waitFor();
    await page.waitForFunction(() => !document.body.innerText.includes('BLUEBIRD-B Future Practice'));
    const mobileFits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

    return {
      initialTeamBLeak,
      teamAAfterSwitch,
      selectedAfterRapidSwitch,
      teamAAfterReload,
      selectedAfterBack,
      mobileFits,
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function assertTeamSwitchAudit(result) {
  if (result.consoleErrors.length > 0) console.log(`Team switch console errors: ${JSON.stringify(result.consoleErrors)}`);
  if (result.failedResponses.length > 0) console.log(`Team switch failed responses: ${JSON.stringify(result.failedResponses)}`);
  expectEqual(result.initialTeamBLeak, 0, 'active Team A view excludes Team B event');
  expectEqual(result.teamAAfterSwitch, 0, 'active Team B view removes Team A event');
  expectEqual(result.selectedAfterRapidSwitch, 'qa-team-b', 'rapid switching settles on requested team');
  expectEqual(result.teamAAfterReload, 0, 'Team B selection persists without Team A event after reload');
  expectEqual(result.selectedAfterBack, 'qa-team-b', 'Team B selection survives navigation back');
  expectEqual(result.mobileFits, true, 'active-team switcher fits mobile viewport');
  expectEqual(result.consoleErrors.length, 0, 'active-team switching browser console errors');
  expectEqual(result.failedResponses.length, 0, 'active-team switching failed responses');
}

function browserAlertsAudit(session) {
  const code = `async page => {
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    page.on('pageerror', error => consoleErrors.push(error.message));
    page.on('response', response => { if (response.status() >= 500) failedResponses.push(response.url()); });

    await page.setViewportSize({ width: 1440, height: 900 });
    const receivedTitles = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const alert = page.getByRole('dialog', { name: 'High Priority Team Alert' });
      const appeared = await alert.waitFor({ state: 'visible', timeout: 2500 }).then(() => true).catch(() => false);
      if (!appeared) break;
      receivedTitles.push((await alert.locator('h2:not(.sr-only)').textContent()) || '');
      await alert.getByRole('button', { name: 'Got It' }).click();
      await alert.waitFor({ state: 'hidden' });
    }

    const alertButton = page.getByRole('button', { name: /^Open alerts/ });
    const alertButtonName = await alertButton.getAttribute('aria-label');
    await alertButton.click();
    const inbox = page.getByRole('dialog', { name: 'Squad Alert Inbox' });
    await inbox.waitFor();
    await inbox.getByRole('button', { name: 'Show History' }).click();
    const historyEveryone = await inbox.getByText('FALCON-A Everyone Alert', { exact: true }).count();
    const historyPlayer = await inbox.getByText('FALCON-A Player Alert', { exact: true }).count();
    const wrongCoach = await inbox.getByText('FALCON-A Coach Alert', { exact: true }).count();
    const wrongParent = await inbox.getByText('FALCON-A Parent Alert', { exact: true }).count();
    const otherTenant = await inbox.getByText('BLUEBIRD-B Everyone Alert', { exact: true }).count();
    await inbox.getByRole('button', { name: 'Close' }).click();

    await page.reload();
    const reopened = await page.getByRole('dialog', { name: 'High Priority Team Alert' })
      .waitFor({ state: 'visible', timeout: 1500 }).then(() => true).catch(() => false);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: /^Open alerts/ }).click();
    const mobileInbox = page.getByRole('dialog', { name: 'Squad Alert Inbox' });
    await mobileInbox.waitFor();
    const mobileBox = await mobileInbox.boundingBox();
    const mobileFits = Boolean(mobileBox && mobileBox.x >= -0.5 && mobileBox.y >= -0.5 && mobileBox.x + mobileBox.width <= 390.5 && mobileBox.y + mobileBox.height <= 844.5);

    return {
      receivedTitles,
      alertButtonName,
      historyEveryone,
      historyPlayer,
      wrongCoach,
      wrongParent,
      otherTenant,
      reopened,
      mobileFits,
      consoleErrors,
      failedResponses,
    };
  }`;
  return JSON.parse(cli(session, ['run-code', code]));
}

function assertAlertsAudit(result) {
  expectEqual(result.receivedTitles.length, 2, 'adult player receives exactly two eligible alerts');
  expectEqual(result.receivedTitles.includes('FALCON-A Everyone Alert'), true, 'everyone alert reaches adult player');
  expectEqual(result.receivedTitles.includes('FALCON-A Player Alert'), true, 'player alert reaches adult player');
  expectEqual(result.alertButtonName, 'Open alerts', 'unread alert count clears after acknowledgement');
  expectEqual(result.historyEveryone, 1, 'acknowledged everyone alert appears once in history');
  expectEqual(result.historyPlayer, 1, 'acknowledged player alert appears once in history');
  expectEqual(result.wrongCoach, 0, 'coach-only alert is hidden from player');
  expectEqual(result.wrongParent, 0, 'parent-only alert is hidden from player');
  expectEqual(result.otherTenant, 0, 'other-tenant alert is hidden from player');
  expectEqual(result.reopened, false, 'acknowledged alerts stay cleared after reload');
  expectEqual(result.mobileFits, true, 'alert history fits mobile viewport');
  expectEqual(result.consoleErrors.length, 0, 'alert lifecycle browser console errors');
  expectEqual(result.failedResponses.length, 0, 'alert lifecycle failed responses');
}

async function runApiAudit() {
  const tokens = new Map();
  const { teamAId, teamBId } = buildIdentityApiTargets(FIXTURES);
  for (const alias of FIXTURES.activeAliases) {
    const result = await signIn(alias);
    expectEqual(result.status, 200, `${alias} emulator sign-in`);
    tokens.set(alias, result.body.idToken);
  }

  for (const blockedIdentity of BLOCKED_AUDIT_PLAN.api) {
    const result = await signIn(blockedIdentity.alias);
    expectEqual(result.status, blockedIdentity.signInStatus, `${blockedIdentity.alias} blocked sign-in expectation`);
    if (blockedIdentity.authError) {
      expectEqual(result.body?.error?.message, blockedIdentity.authError, `${blockedIdentity.alias} blocked Auth error`);
    }
    if (blockedIdentity.signInStatus === 200) tokens.set(blockedIdentity.alias, result.body.idToken);
    if (blockedIdentity.sessionStatus) {
      expectEqual(
        await apiStatus('/api/auth/session', result.body.idToken, { method: 'POST' }),
        blockedIdentity.sessionStatus,
        blockedIdentity.alias === 'qa-pending-delete'
          ? 'pending-delete blocked session creation'
          : `${blockedIdentity.alias} blocked session creation`,
      );
    }
  }

  for (const alias of FIXTURES.activeAliases) {
    const fixture = identityByAlias.get(alias);
    expectEqual(
      await apiStatus('/api/auth/session', tokens.get(alias), { method: 'POST' }),
      200,
      `${alias} active session for ${fixture.expectedLanding}`,
    );
  }

  expectEqual(
    await apiStatus(`/api/teams/chat?teamId=${teamAId}`, tokens.get('qa-coach-owner-a')),
    200,
    'Team A owner reads Team A chat context',
  );
  expectEqual(
    await apiStatus(`/api/teams/chat?teamId=${teamBId}`, tokens.get('qa-coach-owner-a')),
    403,
    'Team A owner denied Team B chat context',
  );
  expectEqual(
    await apiStatus(`/api/teams/chat?teamId=${teamAId}`, tokens.get('qa-coach-owner-b')),
    403,
    'Team B owner denied Team A chat context',
  );
  expectEqual(
    await apiStatus(`/api/teams/chat?teamId=${teamAId}`, tokens.get('qa-removed-member')),
    403,
    'removed member denied former team context',
  );
  expectEqual(
    await apiStatus(`/api/teams/chat?teamId=${teamAId}`, tokens.get('qa-pending-delete')),
    403,
    'deletion-pending account denied server API',
  );
  expectEqual(
    await apiStatus('/api/admin/newsletter', tokens.get('qa-fake-superadmin')),
    403,
    'profile-only fake superadmin denied admin API',
  );
  expectEqual(
    await apiStatus('/api/admin/newsletter', tokens.get('qa-superadmin')),
    200,
    'claim-controlled superadmin reaches admin API',
  );

  const teamA = FIXTURES.teams.find(team => team.alias === 'qa-team-a');
  const teamB = FIXTURES.teams.find(team => team.alias === 'qa-team-b');
  const proTeam = FIXTURES.teams.find(team => team.alias === 'qa-pro-team');
  const schoolSquad = FIXTURES.teams.find(team => team.alias === 'qa-school-squad-1');
  const tournament = FIXTURES.tournaments.find(value => value.alias === 'qa-tournament-a');
  const volunteerA = FIXTURES.firestoreDocuments.find(document => document.data.fixtureAlias === 'qa-volunteer-opportunity-a');
  const volunteerB = FIXTURES.firestoreDocuments.find(document => document.data.fixtureAlias === 'qa-volunteer-opportunity-b');
  const fundraiserA = FIXTURES.firestoreDocuments.find(document => document.data.fixtureAlias === 'qa-fundraiser-a');
  const fundraiserB = FIXTURES.firestoreDocuments.find(document => document.data.fixtureAlias === 'qa-fundraiser-b');

  expectEqual(
    (await fetch(`${BASE_URL}/api/public/tournaments/${teamA.id}/${tournament.id}`)).status,
    200,
    'seeded tournament reader returns published bracket',
  );
  expectEqual(
    (await fetch(`${BASE_URL}/api/public/volunteer?teamId=${teamA.id}&oppId=${volunteerA.path.split('/').at(-1)}`)).status,
    200,
    'published volunteer public GET',
  );
  expectEqual(
    (await fetch(`${BASE_URL}/api/public/volunteer?teamId=${teamB.id}&oppId=${volunteerB.path.split('/').at(-1)}`)).status,
    404,
    'unpublished volunteer public GET denial',
  );
  expectEqual(
    (await fetch(`${BASE_URL}/api/public/fundraising?teamId=${teamA.id}&fundId=${fundraiserA.path.split('/').at(-1)}`)).status,
    200,
    'published fundraiser public GET',
  );
  expectEqual(
    (await fetch(`${BASE_URL}/api/public/fundraising?teamId=${teamB.id}&fundId=${fundraiserB.path.split('/').at(-1)}`)).status,
    404,
    'unpublished fundraiser public GET denial',
  );
  expectEqual(
    await apiStatus(`/api/stripe/connect/status?userId=${identityByAlias.get('qa-pro-owner').uid}&teamId=${proTeam.id}`, tokens.get('qa-pro-owner')),
    200,
    'active local entitlement reaches Connect status without provider call',
  );
  expectEqual(
    await apiStatus(`/api/stripe/connect/status?userId=${identityByAlias.get('qa-school-delegate').uid}&teamId=${schoolSquad.id}`, tokens.get('qa-school-delegate')),
    200,
    'school delegate reaches hub-backed entitlement',
  );
  expectEqual(
    await apiStatus(`/api/stripe/connect/status?userId=${identityByAlias.get('qa-coach-owner-b').uid}&teamId=${schoolSquad.id}`, tokens.get('qa-coach-owner-b')),
    403,
    'school outsider denied hub-backed entitlement',
  );

  const publicObject = FIXTURES.storageObjects.find(object => object.access === 'public' && object.lifecycle === 'present');
  const allowedObject = FIXTURES.storageObjects.find(object => object.case === 'allowed');
  const privateObject = FIXTURES.storageObjects.find(object => object.case === 'private');
  const pendingObject = FIXTURES.storageObjects.find(object => object.case === 'pending-delete');
  const deletedObject = FIXTURES.storageObjects.find(object => object.lifecycle === 'delete-after-write');
  const publicResponse = await fetch(storageObjectUrl(publicObject.path));
  expectEqual(publicResponse.status, 200, 'public Storage object is anonymously readable');
  expectEqual(
    (await inspectFixtureMedia(Buffer.from(await publicResponse.arrayBuffer()))).detectedMime,
    'image/jpeg',
    'persisted public Storage object decodes as JPEG',
  );
  const allowedResponse = await fetch(storageObjectUrl(allowedObject.path), {
    headers: { Authorization: `Bearer ${tokens.get('qa-adult-player-a')}` },
  });
  expectEqual(allowedResponse.status, 200, 'allowed Storage object is readable by its owner');
  expectEqual(
    (await inspectFixtureMedia(Buffer.from(await allowedResponse.arrayBuffer()))).detectedMime,
    'image/png',
    'persisted allowed Storage object decodes as PNG',
  );
  const privateResponse = await fetch(storageObjectUrl(privateObject.path), {
    headers: { Authorization: `Bearer ${tokens.get('qa-adult-player-a')}` },
  });
  expectEqual(
    privateResponse.status,
    200,
    'private Storage object is readable by its owner',
  );
  expectEqual(
    (await inspectFixtureMedia(Buffer.from(await privateResponse.arrayBuffer()))).detectedMime,
    'video/mp4',
    'persisted private Storage object has playable MP4 metadata',
  );
  expectEqual(
    (await fetch(storageObjectUrl(privateObject.path), { headers: { Authorization: `Bearer ${tokens.get('qa-coach-owner-b')}` } })).status,
    403,
    'private Storage object rejects cross-tenant reader',
  );
  expectEqual(
    (await fetch(storageObjectUrl(pendingObject.path), { headers: { Authorization: `Bearer ${tokens.get('qa-pending-delete')}` } })).status,
    403,
    'pending-delete Storage object is denied',
  );
  expectEqual((await fetch(storageObjectUrl(deletedObject.path))).status, 404, 'deleted Storage lifecycle object is absent');
}

async function runBrowserAudit() {
  if (!playwrightCli) throw new Error('PLAYWRIGHT_CLI is required with --browser.');
  if (certificationIdentity) {
    await runIdentityBrowserAudit();
    await runSurfaceSmokeAudit({ remainderOnly: true });
    return;
  }
  if (workflowChatProbeOnly) {
    await runChatProbeAudit();
    return;
  }
  if (workflowEventsOnly) {
    await runEventWorkflowAudit();
    return;
  }
  if (workflowFacilitiesOnly) {
    await runFacilityWorkflowAudit();
    return;
  }
  if (workflowEquipmentOnly) {
    await runEquipmentWorkflowAudit();
    return;
  }
  if (workflowCommunicationOnly) {
    await runCommunicationWorkflowAudit();
    return;
  }
  if (tournamentDenialOnly) {
    const member = await browserLogin('qa-team-member', '/dashboard', `tournament-denial-${process.pid}`);
    assertSurfaceSweep(browserSurfaceSweep(member, [
      { path: '/tournaments', expected: ['/manage-tournaments', '/dashboard'], expectRestrictedOn: '/manage-tournaments', waitForPathChange: true },
    ], { mobile: true }), 'member tournament route denial');
    return;
  }
  if (parentAdminSurfaceOnly) {
    await runSurfaceSmokeAudit({ remainderOnly: true, includeMember: false });
    return;
  }
  if (surfaceRemainderOnly) {
    await runSurfaceSmokeAudit({ remainderOnly: true });
    return;
  }
  if (surfaceSmokeOnly) {
    await runSurfaceSmokeAudit();
    return;
  }
  if (deletionLoginOnly) {
    browserLoginFailureAudit('qa-pending-delete', password, '/login', 'Session Setup Failed', 'deletion-pending login is denied');
    return;
  }
  if (identityStateOnly) {
    runIdentityStateBrowserAudit();
    return;
  }
  if (identityOnly) {
    await runIdentityBrowserAudit();
    return;
  }
  if (scheduleAppOnly) {
    const player = await browserLogin('qa-adult-player-a', '/dashboard', `schedule-app-player-${process.pid}`);
    assertScheduleAppAudit(browserScheduleAppAudit(player));
    return;
  }
  if (teamSwitchOnly) {
    const multiTeam = await browserLogin('qa-multi-org', '/dashboard', `team-switch-${process.pid}`);
    assertTeamSwitchAudit(browserTeamSwitchAudit(multiTeam));
    return;
  }
  if (alertsOnly) {
    const player = await browserLogin('qa-adult-player-a', '/dashboard', `alerts-${process.pid}`);
    assertAlertsAudit(browserAlertsAudit(player));
    return;
  }
  const trusted = await browserLogin('qa-superadmin', '/admin');
  const fake = await browserLogin('qa-fake-superadmin', '/dashboard');
  const parent = await browserLogin('qa-parent-a', '/family');
  const player = await browserLogin('qa-adult-player-a', '/dashboard');

  expectEqual(browserPath(trusted, '/admin'), '/admin', 'trusted superadmin browser route');
  expectEqual(browserPath(fake, '/admin'), '/dashboard', 'fake superadmin browser route denial');
  expectEqual(browserPath(parent, '/family'), '/family', 'parent family browser route');
  expectEqual(browserPath(player, '/family'), '/dashboard', 'adult player family browser route denial');

  const alreadyCovered = new Set([
    'qa-superadmin', 'qa-fake-superadmin', 'qa-parent-a', 'qa-adult-player-a',
  ]);
  for (const alias of FIXTURES.activeAliases.filter(value => !alreadyCovered.has(value))) {
    const fixture = identityByAlias.get(alias);
    await browserLogin(alias, fixture.expectedLanding, `catalog-${alias}-${process.pid}`);
  }

  for (const blockedIdentity of BLOCKED_AUDIT_PLAN.browser) {
    browserLoginFailureAudit(blockedIdentity.alias,
      password,
      blockedIdentity.browserPath,
      blockedIdentity.browserTitle,
      `catalog-blocked-${blockedIdentity.alias}`,
    );
  }
}

async function cleanup() {
  if (cleanupStarted) return;
  cleanupStarted = true;
  if (runBrowser && playwrightCli) {
    try {
      await closeOwnedBrowserSessions(ownedBrowserSessions, async session => {
        run(playwrightCli, [`-s=${session}`, '--raw', 'close'], { stdio: 'pipe' });
      });
    } catch (error) {
      console.error(redact(error instanceof Error ? error.message : error));
      process.exitCode = 1;
    } finally {
      syncBrowserSessionRegistry();
    }
  }
  if (fixturesSeeded) {
    try {
      const cleanupOutput = run(process.execPath, ['scripts/qa/seed-phase2-emulator-fixtures.mjs', '--cleanup-only']);
      expectEqual(
        cleanupOutput.includes(`Cleaned exact Auth, Firestore, and Storage selectors for ${FIXTURES.runId}.`),
        true,
        'post-cleanup Storage object is absent',
      );
      const cleanupCounts = {
        deleted: FIXTURES.identities.length + FIXTURES.firestoreDocuments.length +
          FIXTURES.storageObjects.filter(object => object.lifecycle !== 'delete-after-write' && object.payloadGenerator !== 'exact-size-v1').length,
        restored: 0,
        retainedAuditRecords: 0,
      };
      mkdirSync(path.join(certificationArtifactDir, 'cleanup'), { recursive: true });
      writeFileSync(path.join(certificationArtifactDir, 'cleanup/fixture-cleanup-marker.json'), `${JSON.stringify({
        runId: FIXTURES.runId,
        state: 'OBSERVED',
        counts: cleanupCounts,
        capturedAt: new Date().toISOString(),
      }, null, 2)}\n`, { mode: 0o600 });
      emitCertificationEvent({
        type: 'cleanup',
        cleanupId: `fixture-cleanup-${FIXTURES.runId}`,
        selectors: [
          `auth:${FIXTURES.cleanupSelectors.auth.uids.length}-exact-uids`,
          `firestore:${FIXTURES.cleanupSelectors.firestore.recursiveRoots.length}-exact-roots`,
          `storage:${FIXTURES.cleanupSelectors.storage.objectPaths.length}-exact-paths`,
        ],
        counts: cleanupCounts,
        state: 'OBSERVED',
        proof: ['cleanup/fixture-cleanup-marker.json'],
      });
    } catch (error) {
      console.error(redact(error instanceof Error ? error.message : error));
      process.exitCode = 1;
    }
  }
  await Promise.all(children.reverse().map(child => terminateOwnedChildAndWait(child)));
}

async function main() {
  await import('node:fs/promises').then(fs => fs.mkdir(logDir, { recursive: true }));
  process.once('SIGINT', () => shutdownState.request(130));
  process.once('SIGTERM', () => shutdownState.request(143));

  startProcess('npx', ['firebase', '--project', PROJECT_ID, 'emulators:start', '--only', 'auth,firestore,storage'], 'firebase.log');
  await Promise.all([waitForPort(9099), waitForPort(8080), waitForPort(9199)]);
  run(process.execPath, ['scripts/qa/seed-phase2-emulator-fixtures.mjs']);
  fixturesSeeded = true;

  startProcess('npm', ['run', 'dev'], 'next.log');
  await waitForHttp(`${BASE_URL}/login`);

  if (certificationIdentity) {
    await runCertificationIdentityScenarios();
  } else {
    if (!scheduleAppOnly && !teamSwitchOnly && !alertsOnly && !identityOnly && !identityStateOnly && !deletionLoginOnly && !surfaceSmokeOnly && !surfaceRemainderOnly && !tournamentDenialOnly && !parentAdminSurfaceOnly && !workflowCommunicationOnly && !workflowChatProbeOnly && !workflowEventsOnly && !workflowFacilitiesOnly && !workflowEquipmentOnly) await runApiAudit();
    if (runBrowser) await runBrowserAudit();
  }
  console.log(`Phase 2 emulator audit completed${runBrowser ? ' with browser routes' : ''}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch(error => {
      if (shutdownState.exitCode === null) console.error(redact(error instanceof Error ? error.message : error));
      process.exitCode = shutdownState.exitCode || 1;
    })
    .finally(cleanup);
}
