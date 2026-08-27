import assert from 'node:assert/strict';
import { createHook } from 'node:async_hooks';
import childProcess, { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs, {
  chmodSync, copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, truncateSync, writeFileSync,
} from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { accountSessionRedirect } from '../src/lib/dashboard-account-session.ts';
import { buildFixtureDefinition } from '../scripts/qa-fixtures/definition.mjs';

import {
  ISOLATION_SCENARIOS,
  REQUIRED_LOGOUT_STAGES,
  ROUTE_SCENARIOS,
  VIEWPORTS,
  assertNoFixtureIdentifierLeak,
  buildIsolationExpectation,
  validateResourceSignal,
  validateActionWindow,
  validateIsolationResult,
  validateLedger,
  validateLifecycleResult,
  validateLogoutStages,
  validateRouteResult,
} from '../scripts/qa-evidence/phase9/scenario-contracts.mjs';
import {
  closeAndVerifyBrowsers,
  createPlaywrightCliClient,
  executeCapturedPlaywrightTransportCommand,
  installSignalRecorder,
  isProtectedResource,
  setAndVerifyViewport,
} from '../scripts/qa-evidence/phase9/playwright-cli-client.mjs';
import { observeAction } from '../scripts/qa-evidence/phase9/signal-window.mjs';
import {
  buildCanonicalScenarioPlan,
  runAdmissionScenario,
  runFreshUnauthenticatedScenario,
  runIsolationScenario,
  runLogoutScenario,
  runPendingDeletionScenario,
  runRouteScenario,
} from '../scripts/qa-evidence/phase9/scenarios.mjs';
import {
  buildPhase9ProductionSessionLifecyclePlan,
} from '../scripts/qa-evidence/phase9/session-lifecycle.mjs';
import {
  createLifecycleGuardian,
  runGuardedLifecycle,
} from '../scripts/qa-evidence/phase9/lifecycle-guardian.mjs';

const phase9EvidenceDirectorySuffix = join(
  'docs', 'qa', 'production-audit', 'runs', '2026-08-25-phase9-core-identities',
);

const testDirectory = dirname(fileURLToPath(import.meta.url));
const guardianChildEntrypoint = join(testDirectory, 'fixtures', 'phase9-lifecycle-child.mjs');
const LOCAL_REAL_CHROME_TEST_TIMEOUT_MS = 1_200_000;
const LOCAL_REAL_CHROME_EXTENDED_TEST_TIMEOUT_MS = 1_800_000;
const LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS = 90_000;
const sha256File = path => createHash('sha256').update(readFileSync(path)).digest('hex');
const guardianChildCommand = mode => {
  const configPath = join(testDirectory, 'fixtures', `phase9-lifecycle-child-${mode}.json`);
  return Object.freeze({
    entrypoint: guardianChildEntrypoint,
    entrypointSha256: sha256File(guardianChildEntrypoint),
    configFiles: Object.freeze([Object.freeze({ path: configPath, sha256: sha256File(configPath) })]),
  });
};

const safeWindow = (overrides = {}) => {
  const finalPath = overrides.finalPath ?? '/family';
  return {
    pageId: 'phase9-page-1',
    terminalReached: true,
    loadingVisible: false,
    finalUrl: overrides.finalUrl ?? `${STAGING_ORIGIN}${finalPath}`,
    finalPath,
    visibleSentinels: ['Family Overview'],
    renderSignals: [],
    redirectReason: 'none',
    sessionPresent: true,
    protectedRender: false,
    protectedRequests: 0,
    protectedRequestSignals: [],
    protectedListenerStarts: 0,
    listenerSignals: [],
    teamSelectionSignals: [],
    relevantHttpResults: [],
    pageErrors: 0,
    appConsoleErrors: 0,
    unexpectedRequestFailures: 0,
    overflow: 0,
    ...overrides,
  };
};

const STAGING_ORIGIN = 'https://studio--the-squad-v2-staging.us-east4.hosted.app';
const FIRESTORE_DATABASE = 'projects/the-squad-v2-staging/databases/(default)';
const FIRESTORE_LISTEN_BASE_URL = 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel';
const FIRESTORE_INITIAL_LISTEN_URL = `${FIRESTORE_LISTEN_BASE_URL}?${new URLSearchParams({
  database: FIRESTORE_DATABASE,
  VER: '8',
  RID: '0',
  CVER: '22',
  zx: 'phase9test',
}).toString()}`;
const FIRESTORE_BACKCHANNEL_LISTEN_URL = `${FIRESTORE_LISTEN_BASE_URL}?${new URLSearchParams({
  database: FIRESTORE_DATABASE,
  VER: '8',
  RID: 'rpc',
  SID: 'phase9session',
  AID: '0',
  CI: '0',
  TYPE: 'xmlhttp',
  zx: 'phase9test',
}).toString()}`;
const FIRESTORE_TERMINATE_LISTEN_URL = `${FIRESTORE_LISTEN_BASE_URL}?${new URLSearchParams({
  database: FIRESTORE_DATABASE,
  VER: '8',
  RID: '1',
  SID: 'phase9session',
  TYPE: 'terminate',
  zx: 'phase9test',
}).toString()}`;
const BROWSER_PRODUCER_HEADERS = Object.freeze({
  accept: '*/*',
  origin: STAGING_ORIGIN,
  referer: `${STAGING_ORIGIN}/`,
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/151.0.0.0 Safari/537.36',
  'sec-ch-ua': '"Not=A?Brand";v="99", "Google Chrome";v="151", "Chromium";v="151"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
});
const FIRESTORE_PRODUCER_HEADERS = Object.freeze({
  ...BROWSER_PRODUCER_HEADERS,
  authorization: 'Bearer phase9-test',
  'content-type': 'text/plain',
  'google-cloud-resource-prefix': FIRESTORE_DATABASE,
  'x-firebase-gmpid': '1:61782012212:web:8913d2b40fd9843148f561',
  'x-goog-api-client': 'gl-js/ fire/10.14.1',
  'x-goog-request-params': 'project_id=the-squad-v2-staging',
});
const FIRESTORE_LISTEN_TRANSPORT_HEADERS = Object.freeze({
  ...BROWSER_PRODUCER_HEADERS,
  'content-type': 'application/x-www-form-urlencoded',
});
const FIRESTORE_LISTEN_HEADER_BLOCK = [
  'authorization:Bearer phase9-test',
  'content-type:text/plain',
  `google-cloud-resource-prefix:${FIRESTORE_DATABASE}`,
  'x-firebase-gmpid:1:61782012212:web:8913d2b40fd9843148f561',
  'x-goog-api-client:gl-js/ fire/10.14.1',
  'x-goog-request-params:project_id=the-squad-v2-staging',
  '',
].join('\r\n');
const JOIN_ADMIN_PRODUCER_HEADERS = Object.freeze({
  ...BROWSER_PRODUCER_HEADERS,
  referer: `${STAGING_ORIGIN}/teams/join`,
  authorization: 'Bearer phase9-test',
});
const RAW_STAGING_FRAME = `${STAGING_ORIGIN}/teams/join`;

const closedResourceSignal = (initiatingFrameUrl, overrides = {}) => ({
  targetKind: 'staging-protected-api',
  method: 'GET',
  resourceType: 'fetch',
  initiatingFrameUrl,
  scopeEvidence: ['unscoped-resource'],
  resourceScopes: ['unscoped'],
  ...overrides,
});

const firestoreRaw = overrides => ({
  url: FIRESTORE_INITIAL_LISTEN_URL,
  method: 'POST',
  resourceType: 'fetch',
  headers: FIRESTORE_LISTEN_TRANSPORT_HEADERS,
  body: '',
  frameUrl: RAW_STAGING_FRAME,
  navigationGeneration: 0,
  ...overrides,
});

const joinAdminRaw = overrides => ({
  url: `${STAGING_ORIGIN}/api/schools/admins`,
  method: 'PATCH',
  resourceType: 'fetch',
  headers: JOIN_ADMIN_PRODUCER_HEADERS,
  body: '',
  frameUrl: RAW_STAGING_FRAME,
  navigationGeneration: 0,
  ...overrides,
});

const initialListenForm = (...messages) => new URLSearchParams({
  headers: FIRESTORE_LISTEN_HEADER_BLOCK,
  count: String(messages.length),
  ofs: '0',
  ...Object.fromEntries(messages.map((message, index) => [`req${index}___data__`, JSON.stringify(message)])),
}).toString();

const producerRaw = signal => {
  if (signal?.url?.startsWith(`${STAGING_ORIGIN}/api/schools/admins`)) return joinAdminRaw(signal);
  if (signal?.url?.startsWith(FIRESTORE_LISTEN_BASE_URL)) {
    return firestoreRaw({
      headers: signal.method === 'GET' ? BROWSER_PRODUCER_HEADERS : FIRESTORE_LISTEN_TRANSPORT_HEADERS,
      ...signal,
    });
  }
  return firestoreRaw({
    method: 'GET',
    headers: FIRESTORE_PRODUCER_HEADERS,
    ...signal,
  });
};

const ledgerRow = (contextId, group, viewport = '390x844') => ({
  contextId,
  group,
  alias: 'qa-parent-a',
  viewport,
  startState: 'active',
  startUrl: 'about:blank',
  action: 'navigate',
  expectedResult: 'allowed',
  finalUrl: `${STAGING_ORIGIN}/family`,
  visibleState: 'Family Overview',
  sessionPresent: true,
  protectedRequests: 0,
  protectedListenerStarts: 0,
  relevantHttpDataResult: 'none',
  pageErrors: 0,
  appConsoleErrors: 0,
  unexpectedRequestFailures: 0,
  overflow: 0,
  result: 'PASS',
});

const cliResult = result => ({
  stdout: JSON.stringify({ isError: false, result }),
  stderr: '',
  exitCode: 0,
  timedOut: false,
});

const createCliTransport = handler => {
  const calls = [];
  const execute = async argv => {
    calls.push([...argv]);
    return handler(argv, calls.length - 1);
  };
  return { calls, execute };
};

const blankAwareCliResult = (argv, fallback = { ok: true }) => {
  const code = argv[argv.indexOf('run-code') + 1] ?? '';
  return cliResult(code.includes('phase9:verify-about-blank') ? { url: 'about:blank' } : fallback);
};

test('phase 9 playwright client arms about:blank before navigation and compiles run-code without evaluation', async () => {
  const transport = createCliTransport(argv => {
    const code = argv[argv.indexOf('run-code') + 1] ?? '';
    return blankAwareCliResult(argv, code.includes('setViewportSize') ? { width: 390, height: 844 } : { ok: true });
  });
  const client = createPlaywrightCliClient({
    execute: transport.execute,
    wrapperPath: '/safe/playwright_cli.sh',
    cwd: '/safe/cwd',
    env: { SAFE_FLAG: '1' },
  });
  assert.equal('sampleSignalWindow' in client, false, 'callers must not be able to supply their own mark');
  assert.equal('installRecorder' in client, false, 'raw recorder installation must remain private');
  assert.equal('openBlank' in client, false, 'raw browser opening must remain private');

  await installSignalRecorder(client, 'page-a');
  await setAndVerifyViewport(client, 'page-a', { width: 390, height: 844 });
  await client.goto('page-a', 'about:blank');

  assert.deepEqual(transport.calls[0].slice(0, 6), [
    '/safe/playwright_cli.sh', '-s=page-a', 'open', 'about:blank', '--browser', 'chrome',
  ]);
  assert.equal((transport.calls[1][transport.calls[1].indexOf('run-code') + 1] ?? '').includes('phase9:verify-about-blank'), true);
  assert.equal((transport.calls[2][transport.calls[2].indexOf('run-code') + 1] ?? '').includes('phase9:install'), true);
  assert.equal(transport.calls[4].includes('goto'), true);
  await assert.rejects(
    client.runCode('page-a', 'async (page) => {'),
    /compile/i,
  );
  const callsAfterInvalidCode = transport.calls.length;

  globalThis.__phase9CompileSideEffect = false;
  await assert.rejects(
    client.runCode('page-a', '(globalThis.__phase9CompileSideEffect = true, async (page) => page.url())'),
    /async.*page function/i,
  );
  assert.equal(globalThis.__phase9CompileSideEffect, false);
  delete globalThis.__phase9CompileSideEffect;
  assert.equal(transport.calls.length, callsAfterInvalidCode, 'invalid code must fail before transport or evaluation');

  const unarmed = createPlaywrightCliClient({ execute: transport.execute, wrapperPath: '/safe/playwright_cli.sh' });
  await assert.rejects(unarmed.goto('page-b', 'about:blank'), /recorder.*armed/i);
  await assert.rejects(unarmed.runCode('page-b', 'async (page) => page.goto("https://example.invalid")'), /recorder.*armed/i);

  await client.tabNew('page-a', 'about:blank');
  await assert.rejects(client.goto('page-a', 'about:blank'), /recorder.*armed/i);
  await installSignalRecorder(client, 'page-a');
  await client.goto('page-a', 'about:blank');
  await assert.rejects(client.tabNew('page-a', 'https://example.invalid'), /about:blank/i);
});

test('phase 9 playwright client refuses to arm an existing nonblank tab', async () => {
  const transport = createCliTransport(argv => {
    const code = argv[argv.indexOf('run-code') + 1] ?? '';
    return cliResult(code.includes('phase9:verify-about-blank') ? { url: 'https://example.invalid/login' } : { ok: true });
  });
  const client = createPlaywrightCliClient({ execute: transport.execute, wrapperPath: '/safe/playwright_cli.sh' });
  await assert.rejects(installSignalRecorder(client, 'nonblank'), /exact current tab.*about:blank/i);
  assert.equal(transport.calls.filter(argv => (argv[argv.indexOf('run-code') + 1] ?? '').includes('phase9:install')).length, 0);
});

test('phase 9 playwright client closes only an exact session it opened', async () => {
  const calls = [];
  const client = createPlaywrightCliClient({
    wrapperPath: '/private/playwright-cli',
    execute: async argv => {
      calls.push(argv);
      if (argv.includes('run-code')) return { exitCode: 0, stdout: JSON.stringify({ result: JSON.stringify({ url: 'about:blank', pageId: 'raw-page', navigationGeneration: 0 }) }) };
      if (argv.includes('list')) return { exitCode: 0, stdout: JSON.stringify({ browsers: [] }) };
      return { exitCode: 0, stdout: JSON.stringify({ ok: true }) };
    },
  });
  await installSignalRecorder(client, 'guardian-owned-session');
  await client.closeBrowser('guardian-owned-session');
  assert.equal(calls.some(argv => argv.includes('-s=guardian-owned-session') && argv.includes('close')), true);
  await assert.rejects(() => client.closeBrowser('never-opened-session'), /opened|owned/i);
  assert.equal(calls.some(argv => argv.includes('-s=never-opened-session')), false);
});

test('phase 9 playwright client classifies only protected data resources', () => {
  const origin = 'https://studio--the-squad-v2-staging.us-east4.hosted.app';
  const signal = (url, resourceType = 'fetch', method = 'GET') => ({
    url,
    method,
    resourceType,
    initiatingFrameUrl: `${origin}/dashboard`,
  });
  for (const value of [
    signal(`${origin}/family`, 'document'),
    signal(`${origin}/_next/static/chunks/app.js`, 'script'),
    signal(`${origin}/api/auth/session`, 'fetch', 'POST'),
    signal(`${origin}/api/auth/session`, 'fetch', 'DELETE'),
    signal(`${origin}/api/contact`, 'fetch', 'POST'),
    signal(`${origin}/api/health`),
    signal(`${origin}/api/newsletter/subscribe`, 'fetch', 'POST'),
    signal(`${origin}/api/newsletter/unsubscribe`, 'fetch', 'POST'),
    signal(`${origin}/api/email/reset-password`, 'fetch', 'POST'),
    signal('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword', 'fetch'),
  ]) assert.equal(isProtectedResource(value), false);
  for (const value of [
    signal(`${origin}/api/teams/chat`),
    signal(`${origin}/api/admin/users/example`),
    signal(`${origin}/api/checkout`, 'fetch', 'POST'),
    signal(`${origin}/api/email/send`, 'fetch', 'POST'),
    signal(`${origin}/api/demo/seed`, 'fetch', 'POST'),
    signal(`${origin}/api/sports-hub/rss-refresh`, 'fetch', 'POST'),
    signal(`${origin}/api/public/not-allowlisted`),
    signal('https://firestore.googleapis.com/v1/projects/staging/databases/(default)/documents/teams/example'),
    signal('https://firestore.googleapis.com/v1/projects/staging/databases/(default)/documents:runQuery', 'fetch', 'POST'),
    signal(FIRESTORE_INITIAL_LISTEN_URL),
    signal('https://firestore.googleapis.com/google.firestore.v1.Firestore/RunQuery/channel'),
    signal('https://firestore.googleapis.com/unknown-firestore-rpc'),
  ]) assert.equal(isProtectedResource(value), true);
});

test('phase 9 playwright client retains protected targets when frame attribution is noncanonical', () => {
  const protectedApi = initiatingFrameUrl => ({
    url: `${STAGING_ORIGIN}/api/teams/chat`,
    method: 'GET',
    resourceType: 'fetch',
    initiatingFrameUrl,
  });
  const protectedListener = initiatingFrameUrl => ({
    url: FIRESTORE_INITIAL_LISTEN_URL,
    method: 'POST',
    resourceType: 'fetch',
    initiatingFrameUrl,
  });
  for (const initiatingFrameUrl of ['unattributed:', 'invalid:', 'about:blank', 'https://evil.invalid/admin']) {
    assert.equal(isProtectedResource(protectedApi(initiatingFrameUrl)), true, initiatingFrameUrl);
    assert.equal(isProtectedResource(protectedListener(initiatingFrameUrl)), true, initiatingFrameUrl);
  }
  assert.equal(isProtectedResource({
    ...protectedApi(`${STAGING_ORIGIN}/dashboard`),
    targetKind: 'non-protected',
  }), true, 'a caller-supplied target kind cannot downgrade a protected raw URL');
});

test('phase 9 action window treats login terminal sentinels as nonprotected renders', async () => {
  const transport = createCliTransport(argv => {
    const code = argv[argv.indexOf('run-code') + 1] ?? '';
    if (code.includes('phase9:mark')) return cliResult({ pageId: 'page-a', sequence: 1 });
    if (code.includes('phase9:sample')) return cliResult({
      pageId: 'page-a',
      terminalReached: true,
      loadingVisible: false,
      finalUrl: 'https://example.invalid/login',
      finalPath: '/login',
      visibleSentinels: ['Sign In', 'The email or password is incorrect, or this account is unavailable.'],
      sessionPresent: false,
      protectedRender: true,
      rawRequests: [],
      rawResponses: [],
      rawTeamSelections: [],
      protectedRequests: [],
      protectedListenerStarts: [],
      teamSelectionSignals: [],
      relevantHttpResults: [],
      pageErrors: [],
      appConsoleErrors: [],
      unexpectedRequestFailures: [],
      overflow: 0,
      renderPath: '/login',
      renderSentinel: 'Sign In',
      redirectReason: 'none',
      renderSignals: [
        { kind: 'heading', pathname: '/login', sentinel: 'Sign In' },
        { kind: 'status', pathname: '/login', sentinel: 'The email or password is incorrect, or this account is unavailable.' },
      ],
    });
    return blankAwareCliResult(argv);
  });
  const client = createPlaywrightCliClient({ execute: transport.execute, wrapperPath: '/safe/playwright_cli.sh' });
  await installSignalRecorder(client, 'terminal-render');
  const result = await observeAction({
    client,
    session: 'terminal-render',
    stage: 'login-terminal',
    terminal: async () => {},
    action: async () => {},
  });
  assert.equal(result.protectedRender, false);
});

test('phase 9 action window caps sanitized render history', async () => {
  const transport = createCliTransport(argv => {
    const code = argv[argv.indexOf('run-code') + 1] ?? '';
    if (code.includes('phase9:mark')) return cliResult({ pageId: 'page-a', sequence: 1 });
    if (code.includes('phase9:sample')) return cliResult({
      pageId: 'page-a',
      terminalReached: true,
      loadingVisible: false,
      finalUrl: 'https://example.invalid/family',
      finalPath: '/family',
      visibleSentinels: ['Family Overview'],
      sessionPresent: true,
      protectedRender: true,
      rawRequests: [],
      rawResponses: [],
      rawTeamSelections: [],
      protectedRequests: [],
      protectedListenerStarts: [],
      teamSelectionSignals: [],
      relevantHttpResults: [],
      pageErrors: [],
      appConsoleErrors: [],
      unexpectedRequestFailures: [],
      overflow: 1,
      renderPath: '/family',
      renderSentinel: 'Family Overview',
      redirectReason: 'none',
      renderSignals: Array.from({ length: 1001 }, () => ({ kind: 'heading', pathname: '/family', sentinel: 'Family Overview' })),
    });
    return blankAwareCliResult(argv);
  });
  const client = createPlaywrightCliClient({ execute: transport.execute, wrapperPath: '/safe/playwright_cli.sh' });
  await installSignalRecorder(client, 'bounded-renders');
  const result = await observeAction({
    client,
    session: 'bounded-renders',
    stage: 'bounded-renders',
    terminal: async () => {},
    action: async () => {},
  });
  assert.equal(result.renderSignals.length, 1000);
  assert.equal(result.overflow, 1);
});

test('phase 9 action window marks the same page before action and returns sanitized complete signals', async () => {
  const order = [];
  const transport = createCliTransport(argv => {
    const code = argv[argv.indexOf('run-code') + 1] ?? '';
    if (code.includes('phase9:mark')) {
      order.push('mark:logout');
      return cliResult({ pageId: 'page-a', sequence: 4 });
    }
    if (code.includes('phase9:sample')) {
      order.push('sample:logout');
      return cliResult({
        pageId: 'page-a',
        terminalReached: true,
        loadingVisible: false,
        finalUrl: 'https://example.invalid/login',
        finalPath: '/login',
        visibleSentinels: ['Sign In'],
        sessionPresent: false,
        protectedRender: true,
        rawRequests: [],
        rawResponses: [],
        rawTeamSelections: [],
        protectedRequests: [],
        protectedListenerStarts: [],
        teamSelectionSignals: [],
        relevantHttpResults: [],
        pageErrors: [],
        appConsoleErrors: [],
        unexpectedRequestFailures: [],
        overflow: 0,
        renderPath: '/login',
        renderSentinel: 'Sign In',
        redirectReason: 'none',
        renderSignals: [{ kind: 'heading', pathname: '/dashboard', sentinel: 'Family Overview', text: 'must-not-return' }],
      });
    }
    return blankAwareCliResult(argv);
  });
  const client = createPlaywrightCliClient({ execute: transport.execute, wrapperPath: '/safe/playwright_cli.sh' });
  await installSignalRecorder(client, 'logout');
  order.length = 0;

  const result = await observeAction({
    client,
    session: 'logout',
    stage: 'logout-tab',
    terminal: async () => order.push('terminal:logout'),
    action: async () => order.push('action:logout'),
  });

  assert.deepEqual(order, ['mark:logout', 'action:logout', 'terminal:logout', 'sample:logout']);
  assert.equal(result.protectedRequests, 0);
  assert.equal(result.protectedRender, true);
  assert.equal(Object.hasOwn(result, 'requestSignals'), false);
  assert.deepEqual(result.listenerSignals, []);
  assert.equal(result.protectedListenerStarts, 0);
  assert.deepEqual(result.renderSignals, [{ kind: 'heading', pathname: '/dashboard', sentinel: 'Family Overview' }]);
  assert.equal(JSON.stringify(result).includes('must-not-return'), false);
  assert.equal(result.finalPath, '/login');
  assert.equal(result.visibleSentinels[0], 'Sign In');
});

test('phase 9 action window never returns a legacy signal container or opaque raw query', async () => {
  const opaqueQuery = 'opaque-query=must-not-return';
  const transport = createCliTransport(argv => {
    const code = argv[argv.indexOf('run-code') + 1] ?? '';
    if (code.includes('phase9:mark')) return cliResult({ pageId: 'page-a', sequence: 1 });
    if (code.includes('phase9:sample')) return cliResult({
      pageId: 'page-a',
      terminalReached: true,
      loadingVisible: false,
      finalUrl: `${STAGING_ORIGIN}/dashboard`,
      finalPath: '/dashboard',
      visibleSentinels: ['Dashboard'],
      sessionPresent: true,
      protectedRender: true,
      rawRequests: [{
        url: `${STAGING_ORIGIN}/api/teams/chat?${opaqueQuery}`,
        method: 'GET',
        resourceType: 'fetch',
        headers: {},
        body: '',
        frameUrl: `${STAGING_ORIGIN}/dashboard`,
        navigationGeneration: 0,
      }],
      rawResponses: [],
      rawTeamSelections: [],
      pageErrors: [],
      appConsoleErrors: [],
      unexpectedRequestFailures: [],
      overflow: 0,
      renderPath: '/dashboard',
      renderSentinel: 'Dashboard',
      redirectReason: 'none',
      renderSignals: [{ kind: 'heading', pathname: '/dashboard', sentinel: 'Dashboard' }],
    });
    return blankAwareCliResult(argv);
  });
  const client = createPlaywrightCliClient({ execute: transport.execute, wrapperPath: '/safe/playwright_cli.sh' });
  await installSignalRecorder(client, 'closed-public-signals');
  const result = await observeAction({
    client,
    session: 'closed-public-signals',
    stage: 'closed-public-signals',
    terminal: async () => {},
    action: async () => {},
  });

  assert.equal(Object.hasOwn(result, 'requestSignals'), false);
  assert.equal(result.protectedRequestSignals.length, 1);
  assert.equal(JSON.stringify(result).includes(opaqueQuery), false);
  assert.doesNotThrow(() => validateActionWindow(result));
});

test('phase 9 action window rejects cross-page samples and terminal failures without sampling', async () => {
  let sampled = false;
  const transport = createCliTransport(argv => {
    const code = argv[argv.indexOf('run-code') + 1] ?? '';
    if (code.includes('phase9:mark')) return cliResult({ pageId: 'page-a', sequence: 1 });
    if (code.includes('phase9:sample')) {
      sampled = true;
      return cliResult({ pageId: 'page-b' });
    }
    return blankAwareCliResult(argv);
  });
  const client = createPlaywrightCliClient({ execute: transport.execute, wrapperPath: '/safe/playwright_cli.sh' });
  await installSignalRecorder(client, 'one');
  await assert.rejects(observeAction({
    client,
    session: 'one',
    stage: 'logout-tab',
    terminal: async () => {},
    action: async () => {},
  }), /same page/i);
  assert.equal(sampled, true);

  sampled = false;
  await assert.rejects(observeAction({
    client,
    session: 'one',
    stage: 'logout-tab',
    terminal: async () => { throw new Error('terminal timeout'); },
    action: async () => {},
  }), /terminal timeout/);
  assert.equal(sampled, false, 'a terminal failure must not be swallowed or converted into a sample');
});

test('phase 9 action window rejects incomplete recorder samples instead of defaulting missing signals to zero', async () => {
  const transport = createCliTransport(argv => {
    const code = argv[argv.indexOf('run-code') + 1] ?? '';
    if (code.includes('phase9:mark')) return cliResult({ pageId: 'page-a', sequence: 1 });
    if (code.includes('phase9:sample')) return cliResult({ pageId: 'page-a', terminalReached: true });
    return blankAwareCliResult(argv);
  });
  const client = createPlaywrightCliClient({ execute: transport.execute, wrapperPath: '/safe/playwright_cli.sh' });
  await installSignalRecorder(client, 'one');
  await assert.rejects(observeAction({
    client,
    session: 'one',
    stage: 'logout-tab',
    terminal: async () => {},
    action: async () => {},
  }), /complete signal sample/i);
});

test('phase 9 playwright client rejects malformed, failed, timed-out, and isError responses', async () => {
  for (const [response, message] of [
    [{ stdout: '{', stderr: '', exitCode: 0, timedOut: false }, /valid JSON/i],
    [{ stdout: JSON.stringify({ isError: false, result: null }), stderr: '', exitCode: 2, timedOut: false }, /nonzero/i],
    [{ stdout: '', stderr: '', exitCode: null, timedOut: true }, /timed out/i],
    [{ stdout: JSON.stringify({ isError: true, result: 'provider secret' }), stderr: '', exitCode: 0, timedOut: false }, /reported an error/i],
  ]) {
    const client = createPlaywrightCliClient({ execute: async () => response, wrapperPath: '/safe/playwright_cli.sh' });
    await assert.rejects(client.listBrowsers(), message);
  }
});

test('phase 9 playwright client accepts real wrapper top-level and nested JSON results', async () => {
  const listClient = createPlaywrightCliClient({
    execute: async () => ({ stdout: JSON.stringify({ browsers: [] }), stderr: '', exitCode: 0, timedOut: false }),
    wrapperPath: '/safe/playwright_cli.sh',
  });
  assert.deepEqual(await listClient.listBrowsers(), { browsers: [] });
  const responses = [
    { stdout: JSON.stringify({ session: 'page-a', result: { snapshot: {} } }), stderr: '', exitCode: 0, timedOut: false },
    { stdout: JSON.stringify({ result: JSON.stringify({ url: 'about:blank' }) }), stderr: '', exitCode: 0, timedOut: false },
    { stdout: JSON.stringify({ result: JSON.stringify({ pageId: 'page-a' }) }), stderr: '', exitCode: 0, timedOut: false },
    { stdout: JSON.stringify({ result: JSON.stringify({ pageId: 'page-a' }) }), stderr: '', exitCode: 0, timedOut: false },
  ];
  const client = createPlaywrightCliClient({ execute: async () => responses.shift(), wrapperPath: '/safe/playwright_cli.sh' });
  await installSignalRecorder(client, 'page-a');
  assert.deepEqual(await client.runCode('page-a', 'async (page) => ({ pageId: "page-a" })'), { pageId: 'page-a' });
});

test('phase 9 action window real Chrome captures each independent transient visibility mechanism', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async t => {
  const client = createPlaywrightCliClient({ timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS });
  try {
    for (const mechanism of ['style', 'class', 'hidden', 'aria-hidden']) await t.test(mechanism, async () => {
      const session = `phase9-visibility-${mechanism}`;
      await installSignalRecorder(client, session);
      const hidden = await observeAction({
        client,
        session,
        stage: `${mechanism}-hidden-only`,
        terminal: async () => {},
        action: async () => client.runCode(session, `async (page) => {
          await page.evaluate(mechanism => {
            document.head.innerHTML = '';
            document.body.innerHTML = '<h1>Family Overview</h1>';
            const element = document.querySelector('h1');
            if (mechanism === 'style') element.style.display = 'none';
            if (mechanism === 'class') {
              document.head.innerHTML = '<style>.concealed{display:none}</style>';
              element.classList.add('concealed');
            }
            if (mechanism === 'hidden') element.hidden = true;
            if (mechanism === 'aria-hidden') element.setAttribute('aria-hidden', 'true');
          }, ${JSON.stringify(mechanism)});
          await page.waitForTimeout(50);
          return { ok: true };
        }`),
      });
      assert.equal(hidden.protectedRender, false);

      const transient = await observeAction({
        client,
        session,
        stage: `${mechanism}-transient-visible`,
        terminal: async () => {},
        action: async () => client.runCode(session, `async (page) => {
          const heading = page.locator('h1');
          await heading.evaluate((element, mechanism) => {
            if (mechanism === 'style') element.style.display = 'block';
            if (mechanism === 'class') element.classList.remove('concealed');
            if (mechanism === 'hidden') element.hidden = false;
            if (mechanism === 'aria-hidden') element.setAttribute('aria-hidden', 'false');
          }, ${JSON.stringify(mechanism)});
          await page.waitForTimeout(250);
          await heading.evaluate((element, mechanism) => {
            if (mechanism === 'style') element.style.display = 'none';
            if (mechanism === 'class') element.classList.add('concealed');
            if (mechanism === 'hidden') element.hidden = true;
            if (mechanism === 'aria-hidden') element.setAttribute('aria-hidden', 'true');
          }, ${JSON.stringify(mechanism)});
          return { ok: true };
        }`),
      });
      assert.equal(transient.protectedRender, true, JSON.stringify(transient));
      assert.equal(transient.renderSignals.some(signal => signal.sentinel === 'Family Overview'), true);
    });
  } finally {
    await closeAndVerifyBrowsers(client);
  }
  assert.deepEqual(await client.listBrowsers(), { browsers: [] });
});

test('phase 9 action window real Chrome captures distinct CSS-animation-only protected flashes', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
  const client = createPlaywrightCliClient({ timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS });
  try {
    await installSignalRecorder(client, 'phase9-animation-regression');
    await client.goto('phase9-animation-regression', 'about:blank');
    const hidden = await observeAction({
      client,
      session: 'phase9-animation-regression',
      stage: 'animation-hidden-baseline',
      terminal: async () => {},
      action: async () => client.runCode('phase9-animation-regression', `async (page) => {
        await page.evaluate(() => {
          document.head.innerHTML = '<style>#protected-flash{opacity:0}</style>';
          document.body.innerHTML = '<h1 id="protected-flash">Family Overview</h1>';
        });
        await page.waitForTimeout(50);
        return { ok: true };
      }`),
    });
    assert.equal(hidden.protectedRender, false);

    const flashes = await observeAction({
      client,
      session: 'phase9-animation-regression',
      stage: 'animation-only-flashes',
      terminal: async () => {},
      action: async () => client.runCode('phase9-animation-regression', `async (page) => {
        await page.evaluate(async () => {
          const heading = document.querySelector('#protected-flash');
          for (let flash = 0; flash < 2; flash += 1) {
            const animation = heading.animate([
              { opacity: 0 },
              { opacity: 1, offset: 0.25 },
              { opacity: 1, offset: 0.75 },
              { opacity: 0 },
            ], { duration: 220, fill: 'forwards' });
            await animation.finished;
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          }
        });
        return { ok: true };
      }`),
    });
    assert.equal(flashes.protectedRender, true, JSON.stringify(flashes));
    assert.equal(flashes.renderSignals.filter(signal => signal.sentinel === 'Family Overview').length, 2);
  } finally {
    await closeAndVerifyBrowsers(client);
  }
  assert.deepEqual(await client.listBrowsers(), { browsers: [] });
});

test('phase 9 action window real Chrome refuses recorder installation on a nonblank tab', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
  const client = createPlaywrightCliClient({ timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS });
  try {
    await installSignalRecorder(client, 'phase9-nonblank-regression');
    await client.goto('phase9-nonblank-regression', 'data:text/html,nonblank');
    await assert.rejects(installSignalRecorder(client, 'phase9-nonblank-regression'), /exact current tab.*about:blank/i);
  } finally {
    await closeAndVerifyBrowsers(client);
  }
  assert.deepEqual(await client.listBrowsers(), { browsers: [] });
});

test('phase 9 playwright client fails closed unless close-all yields an empty browser list', async () => {
  const responses = [cliResult({ closed: true }), cliResult({ browsers: [] })];
  const client = createPlaywrightCliClient({ execute: async () => responses.shift(), wrapperPath: '/safe/playwright_cli.sh' });
  assert.deepEqual(await closeAndVerifyBrowsers(client), { browsers: [] });

  const closeFailure = createPlaywrightCliClient({
    execute: async argv => argv.includes('close-all')
      ? { stdout: '', stderr: '', exitCode: 1, timedOut: false }
      : cliResult({ browsers: [] }),
    wrapperPath: '/safe/playwright_cli.sh',
  });
  await assert.rejects(closeAndVerifyBrowsers(closeFailure), /close-all|nonzero/i);

  const nonempty = createPlaywrightCliClient({
    execute: async argv => argv.includes('close-all')
      ? cliResult({ closed: true })
      : cliResult({ browsers: [{ session: 'still-open' }] }),
    wrapperPath: '/safe/playwright_cli.sh',
  });
  await assert.rejects(closeAndVerifyBrowsers(nonempty), /browser sessions remain/i);
});

test('phase 9 evidence contracts expose exact immutable scenario definitions', () => {
  assert.deepEqual(VIEWPORTS, {
    mobile: { width: 390, height: 844 },
    desktop: { width: 1440, height: 900 },
  });
  assert.deepEqual(ROUTE_SCENARIOS, {
    '/admin': { visibleSentinels: ['Account Lookup'] },
    '/club': { visibleSentinels: ['School Hub', 'Club Hub'] },
    '/competition': { visibleSentinels: ['Program League Hub', 'Competition Hub'] },
    '/dashboard/billing': { visibleSentinels: ['Manage Your Plan'] },
    '/coaches-corner': { visibleSentinels: ['Coaches Corner'] },
    '/family': { visibleSentinels: ['Family Overview'] },
  });
  assert.equal(ISOLATION_SCENARIOS.team.endpoint, '/api/teams/chat');
  assert.equal(ISOLATION_SCENARIOS.team.parameter, 'teamId');
  assert.deepEqual(REQUIRED_LOGOUT_STAGES, [
    'logout-tab',
    'stale-tab-reload',
    'stale-tab-back',
    'stale-tab-second-reload',
  ]);
  assert.equal(Object.isFrozen(VIEWPORTS), true);
  assert.equal(Object.isFrozen(VIEWPORTS.mobile), true);
});

test('phase 9 evidence contracts reject incomplete and vacuous action windows', () => {
  assert.throws(() => validateActionWindow({}), /terminalReached/i);
  assert.throws(() => validateActionWindow(safeWindow({ terminalReached: false })), /terminal/i);
  assert.throws(() => validateActionWindow(safeWindow({ loadingVisible: true })), /loading/i);
  assert.throws(() => validateActionWindow(safeWindow({ protectedRequests: undefined })), /protectedRequests/i);
  assert.throws(() => validateActionWindow(safeWindow({ pageErrors: -1 })), /pageErrors/i);
  assert.throws(() => validateActionWindow(safeWindow({ appConsoleErrors: 1 })), /application console/i);
  assert.throws(() => validateActionWindow(safeWindow({ unexpectedRequestFailures: 1 })), /request failure/i);
  assert.throws(() => validateActionWindow(safeWindow({ overflow: 1 })), /overflow/i);
  assert.equal(validateActionWindow(safeWindow()).finalPath, '/family');
});

test('phase 9 evidence contracts accept only closed count-coherent request and listener signals', () => {
  const signal = closedResourceSignal(`${STAGING_ORIGIN}/dashboard`, {
    targetKind: 'firestore-listen',
    method: 'POST',
  });
  const complete = safeWindow({
    protectedRequests: 1,
    protectedRequestSignals: [signal],
    protectedListenerStarts: 1,
    listenerSignals: [signal],
  });
  assert.equal(validateActionWindow(complete).pass, true);

  for (const [field, value] of [
    ['url', `${STAGING_ORIGIN}/api/teams/chat?opaque-query=must-not-return`],
    ['rawUrl', `${STAGING_ORIGIN}/api/teams/chat?opaque-query=must-not-return`],
    ['path', '/api/teams/chat'],
    ['query', 'opaque-query=must-not-return'],
    ['body', 'opaque-body=must-not-return'],
    ['headers', { authorization: 'must-not-return' }],
    ['rawRequests', []],
    ['rawResponses', []],
    ['arbitrary', 'field'],
  ]) {
    assert.throws(() => validateActionWindow({
      ...complete,
      protectedRequestSignals: [{ ...signal, [field]: value }],
    }), /closed resource evidence schema/i, `protected request ${field}`);
    assert.throws(() => validateActionWindow({
      ...complete,
      listenerSignals: [{ ...signal, [field]: value }],
    }), /closed resource evidence schema/i, `protected listener ${field}`);
  }

  assert.throws(() => validateActionWindow({
    ...complete,
    protectedRequests: 2,
  }), /complete protected request signals/i);
  assert.throws(() => validateActionWindow({
    ...complete,
    protectedListenerStarts: 2,
  }), /complete protected listener signals/i);
  assert.throws(() => validateActionWindow({
    ...complete,
    requestSignals: [{ url: `${STAGING_ORIGIN}/api/teams/chat?opaque-query=must-not-return` }],
  }), /legacy request signals/i);
});

test('phase 9 evidence contracts reject unknown action-window acquisition fields and reconstruct a closed result', () => {
  const unknownFields = [
    ['rawRequests', []],
    ['rawResponses', []],
    ['requestSignals', []],
    ['query', 'opaque-query=must-not-return'],
    ['url', `${STAGING_ORIGIN}/api/teams/chat?opaque-query=must-not-return`],
    ['rawUrl', `${STAGING_ORIGIN}/api/teams/chat?opaque-query=must-not-return`],
    ['body', 'opaque-body=must-not-return'],
    ['headers', { authorization: 'must-not-return' }],
    ['acquisition', { rawRequests: [], rawResponses: [] }],
    ['arbitrary', 'field'],
  ];
  for (const [field, value] of unknownFields) {
    assert.throws(
      () => validateActionWindow(safeWindow({ [field]: value })),
      /closed action-window schema|legacy request signals/i,
      field,
    );
  }

  const hidden = safeWindow();
  Object.defineProperty(hidden, 'rawRequests', { value: [], enumerable: false });
  assert.throws(() => validateActionWindow(hidden), /cloneable closed data graph|closed action-window schema/i);

  const symbol = Symbol('rawRequests');
  const symbolWindow = safeWindow();
  symbolWindow[symbol] = [];
  assert.throws(() => validateActionWindow(symbolWindow), /cloneable closed data graph|closed action-window schema/i);

  const inherited = Object.assign(Object.create({ rawRequests: [] }), safeWindow());
  assert.throws(() => validateActionWindow(inherited), /cloneable closed data graph|plain action-window object/i);

  for (const [field, value] of [
    ['renderSignals', [{ kind: 'heading', pathname: '/family', sentinel: 'Family Overview', rawRequests: [] }]],
    ['relevantHttpResults', [{ targetKind: 'staging-protected-api', status: 200, rawUrl: 'opaque:' }]],
  ]) {
    assert.throws(() => validateActionWindow(safeWindow({
      protectedRender: field === 'renderSignals',
      [field]: value,
    })), /closed .* schema/i, field);
  }

  for (const field of ['visibleSentinels', 'teamSelectionSignals', 'relevantHttpResults']) {
    const values = field === 'visibleSentinels'
      ? ['Family Overview']
      : field === 'teamSelectionSignals'
        ? []
        : [];
    values.rawRequests = [];
    assert.throws(
      () => validateActionWindow(safeWindow({ [field]: values })),
      /cloneable closed data graph|closed .* array/i,
      field,
    );
  }

  const request = closedResourceSignal(`${STAGING_ORIGIN}/family`);
  const input = safeWindow({
    protectedRender: true,
    renderSignals: [{ kind: 'heading', pathname: '/family', sentinel: 'Family Overview' }],
    protectedRequests: 1,
    protectedRequestSignals: [request],
    teamSelectionSignals: ['tenant-team-a'],
    relevantHttpResults: [{ targetKind: 'staging-protected-api', status: 200 }],
  });
  const result = validateActionWindow(input);
  assert.deepEqual(Reflect.ownKeys(result).sort(), [
    'appConsoleErrors', 'finalPath', 'finalUrl', 'listenerSignals', 'loadingVisible', 'overflow', 'pageErrors',
    'pageId', 'pass', 'protectedListenerStarts', 'protectedRender', 'protectedRequestSignals', 'protectedRequests',
    'redirectReason', 'relevantHttpResults', 'renderSignals', 'sessionPresent', 'teamSelectionSignals',
    'terminalReached', 'unexpectedRequestFailures', 'visibleSentinels',
  ]);
  assert.notEqual(result.visibleSentinels, input.visibleSentinels);
  assert.notEqual(result.renderSignals, input.renderSignals);
  assert.notEqual(result.renderSignals[0], input.renderSignals[0]);
  assert.notEqual(result.protectedRequestSignals, input.protectedRequestSignals);
  assert.notEqual(result.protectedRequestSignals[0], input.protectedRequestSignals[0]);
  assert.notEqual(result.teamSelectionSignals, input.teamSelectionSignals);
  assert.notEqual(result.relevantHttpResults, input.relevantHttpResults);
  input.visibleSentinels.push('Dashboard');
  input.renderSignals[0].sentinel = 'Dashboard';
  input.protectedRequestSignals[0].method = 'DELETE';
  input.teamSelectionSignals.push('tenant-team-b');
  input.relevantHttpResults[0].status = 500;
  assert.deepEqual(result.visibleSentinels, ['Family Overview']);
  assert.deepEqual(result.renderSignals, [{ kind: 'heading', pathname: '/family', sentinel: 'Family Overview' }]);
  assert.equal(result.protectedRequestSignals[0].method, 'GET');
  assert.deepEqual(result.teamSelectionSignals, ['tenant-team-a']);
  assert.deepEqual(result.relevantHttpResults, [{ targetKind: 'staging-protected-api', status: 200 }]);
});

test('phase 9 evidence validators snapshot caller-owned graphs once and fail closed on dynamic inputs', () => {
  const snapshotError = /must be a cloneable closed data graph/i;

  let terminalReads = 0;
  const statefulWindow = new Proxy(safeWindow(), {
    get(target, property, receiver) {
      if (property === 'terminalReached') {
        terminalReads += 1;
        return terminalReads < 4;
      }
      return Reflect.get(target, property, receiver);
    },
  });
  assert.throws(() => validateActionWindow(statefulWindow), snapshotError);
  assert.equal(terminalReads, 0);

  const routeProxy = new Proxy({
    allowed: true,
    requestedPath: '/family',
    expectedPath: '/family',
    expectedSentinel: 'Family Overview',
    window: safeWindow(),
  }, {
    get(target, property, receiver) {
      if (property === 'allowed') return !Reflect.get(target, property, receiver);
      return Reflect.get(target, property, receiver);
    },
  });
  assert.throws(() => validateRouteResult(routeProxy), snapshotError);

  const renderSignal = new Proxy({
    kind: 'heading', pathname: '/family', sentinel: 'Family Overview',
  }, {});
  assert.throws(() => validateActionWindow(safeWindow({
    protectedRender: true,
    renderSignals: [renderSignal],
  })), snapshotError);

  let methodReads = 0;
  const resourceSignal = new Proxy(closedResourceSignal(`${STAGING_ORIGIN}/family`), {
    get(target, property, receiver) {
      if (property === 'method') {
        methodReads += 1;
        return methodReads < 4 ? 'GET' : 'DELETE';
      }
      return Reflect.get(target, property, receiver);
    },
  });
  assert.throws(() => validateActionWindow(safeWindow({
    protectedRequests: 1,
    protectedRequestSignals: [resourceSignal],
  })), snapshotError);
  assert.throws(() => validateResourceSignal(resourceSignal), snapshotError);
  assert.equal(methodReads, 0);

  assert.throws(() => validateActionWindow(safeWindow({
    visibleSentinels: new Proxy(['Family Overview'], {}),
  })), snapshotError);

  assert.throws(() => validateActionWindow(safeWindow({
    visibleSentinels: ['Family Overview', () => 'dynamic'],
  })), snapshotError);
  assert.throws(() => validateActionWindow(safeWindow({
    redirectReason: Symbol('dynamic'),
  })), snapshotError);

  let accessorCalls = 0;
  const accessorWindow = safeWindow();
  Object.defineProperty(accessorWindow, 'terminalReached', {
    enumerable: true,
    get() {
      accessorCalls += 1;
      return true;
    },
  });
  assert.throws(() => validateActionWindow(accessorWindow), snapshotError);
  assert.equal(accessorCalls, 0);

  const routeInput = {
    allowed: true,
    requestedPath: '/family',
    expectedPath: '/family',
    expectedSentinel: 'Family Overview',
    window: safeWindow({
      protectedRender: true,
      renderSignals: [{ kind: 'heading', pathname: '/family', sentinel: 'Family Overview' }],
      protectedRequests: 1,
      protectedRequestSignals: [closedResourceSignal(`${STAGING_ORIGIN}/family`)],
    }),
  };
  const routeResult = validateRouteResult(routeInput);
  routeInput.allowed = false;
  routeInput.window.visibleSentinels[0] = 'Dashboard';
  routeInput.window.renderSignals[0].sentinel = 'Dashboard';
  routeInput.window.protectedRequestSignals[0].method = 'DELETE';
  assert.equal(routeResult.allowed, true);
  assert.deepEqual(routeResult.window.visibleSentinels, ['Family Overview']);
  assert.equal(routeResult.window.renderSignals[0].sentinel, 'Family Overview');
  assert.equal(routeResult.window.protectedRequestSignals[0].method, 'GET');

  assert.equal(validateActionWindow(safeWindow()).pass, true);
  assert.equal(validateResourceSignal(closedResourceSignal(`${STAGING_ORIGIN}/family`)).method, 'GET');
  assert.throws(
    () => validateResourceSignal(closedResourceSignal('Bearer must-not-return-sensitive-value')),
    /credential-shaped evidence/i,
  );
});

test('phase 9 evidence snapshots reject sparse arrays and hidden data before validation', async t => {
  const snapshotError = /must be a cloneable closed data graph/i;
  const safeStage = name => ({
    name,
    window: safeWindow({
      finalPath: '/login',
      visibleSentinels: ['Sign In'],
      sessionPresent: false,
    }),
  });
  const denseStages = () => REQUIRED_LOGOUT_STAGES.map(safeStage);

  await t.test('rejects a four-hole logout stage array', () => {
    assert.throws(() => validateLogoutStages(new Array(4)), snapshotError);
  });

  await t.test('rejects sparse canonical 20-entry lifecycle arrays', () => {
    const sparseSeed = {
      command: 'seed',
      state: 'seeded',
      aliases: new Array(20),
      counts: { auth: 20, firestore: 82 },
      uidSuffixes: new Array(20),
    };
    assert.throws(() => validateLifecycleResult('seed', sparseSeed, 'seeded'), snapshotError);
  });

  await t.test('rejects an oversized sparse array', () => {
    const oversizedSparse = new Array(1_000_000);
    assert.throws(() => assertNoFixtureIdentifierLeak(oversizedSparse), snapshotError);
  });

  await t.test('counts dense array entries against the global snapshot budget', () => {
    const oversizedDenseGraph = [
      new Array(60_000).fill(null),
      new Array(60_000).fill(null),
    ];
    assert.throws(() => assertNoFixtureIdentifierLeak(oversizedDenseGraph), snapshotError);
  });

  await t.test('rejects a hidden top-level field', () => {
    const hiddenTop = { sessions: [] };
    Object.defineProperty(hiddenTop, 'hiddenCanary', {
      value: 'benign-top-canary',
      enumerable: false,
    });
    assert.throws(
      () => validateLifecycleResult('browser-sessions', hiddenTop, 'browsers-closed'),
      snapshotError,
    );
  });

  await t.test('rejects a hidden nested field', () => {
    const hiddenNested = {
      projectId: 'the-squad-v2-staging',
      checkedAuth: 20,
      checkedFirestore: 82,
      checkedExpectedAbsent: 1,
      authPresent: 0,
      firestorePresent: 0,
      expectedAbsentPresent: 0,
      detail: { state: 'closed' },
    };
    Object.defineProperty(hiddenNested.detail, 'hiddenCanary', {
      value: 'benign-nested-canary',
      enumerable: false,
    });
    assert.throws(
      () => validateLifecycleResult('probe', hiddenNested, 'independently-absent'),
      snapshotError,
    );
  });

  await t.test('rejects a hidden array field', () => {
    const hiddenArray = [];
    Object.defineProperty(hiddenArray, 'hiddenCanary', {
      value: 'benign-array-canary',
      enumerable: false,
    });
    assert.throws(
      () => validateLifecycleResult('browser-sessions', { sessions: hiddenArray }, 'browsers-closed'),
      snapshotError,
    );
  });

  await t.test('rejects a hidden array index', () => {
    const hiddenIndex = denseStages();
    Object.defineProperty(hiddenIndex, '0', {
      value: hiddenIndex[0],
      enumerable: false,
      configurable: true,
      writable: true,
    });
    assert.throws(() => validateLogoutStages(hiddenIndex), snapshotError);
  });

  await t.test('rejects a non-index array field', () => {
    const nonIndexField = denseStages();
    nonIndexField.canary = 'benign-array-field';
    assert.throws(() => validateLogoutStages(nonIndexField), snapshotError);
  });

  await t.test('accepts a frozen intrinsic array length descriptor', () => {
    const frozenLength = denseStages();
    Object.defineProperty(frozenLength, 'length', { writable: false });
    assert.equal(validateLogoutStages(frozenLength).pass, true);
  });

  await t.test('rejects an abnormal array prototype', () => {
    const abnormalPrototype = denseStages();
    Object.setPrototypeOf(abnormalPrototype, null);
    assert.throws(() => validateLogoutStages(abnormalPrototype), snapshotError);
  });

  await t.test('accepts dense arrays and nested plain data', () => {
    assert.equal(validateLogoutStages(denseStages()).pass, true);
    assert.deepEqual(assertNoFixtureIdentifierLeak([
      'dense',
      { nested: Object.freeze(['closed', 'data']) },
    ]), [
      'dense',
      { nested: ['closed', 'data'] },
    ]);
  });
});

test('phase 9 evidence snapshots reject traps and accessors without invoking them', () => {
  const snapshotError = /must be a cloneable closed data graph/i;
  let trapCalls = 0;
  const trappedArray = new Proxy([], {
    getPrototypeOf(target) {
      trapCalls += 1;
      return Reflect.getPrototypeOf(target);
    },
    ownKeys(target) {
      trapCalls += 1;
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(target, property) {
      trapCalls += 1;
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  });
  assert.throws(() => assertNoFixtureIdentifierLeak(trappedArray), snapshotError);
  assert.equal(trapCalls, 0);

  let accessorCalls = 0;
  const nestedAccessor = { sessions: [] };
  Object.defineProperty(nestedAccessor.sessions, 'hiddenCanary', {
    enumerable: false,
    get() {
      accessorCalls += 1;
      return 'must-not-be-read';
    },
  });
  assert.throws(
    () => validateLifecycleResult('browser-sessions', nestedAccessor, 'browsers-closed'),
    snapshotError,
  );
  assert.equal(accessorCalls, 0);
});

test('phase 9 evidence contracts require path and visible readiness for allowed routes', () => {
  assert.throws(() => validateRouteResult({
    allowed: true,
    expectedPath: '/family',
    expectedSentinel: 'Family Overview',
    window: safeWindow({ finalPath: '/family', visibleSentinels: [] }),
  }), /visible sentinel/i);
  assert.throws(() => validateRouteResult({
    allowed: true,
    expectedPath: '/family',
    expectedSentinel: 'Family Overview',
    window: safeWindow({ finalPath: '/dashboard' }),
  }), /pathname/i);
  assert.throws(() => validateRouteResult({
    allowed: true,
    expectedPath: '/family',
    expectedSentinel: 'Unrelated heading',
    window: safeWindow({ visibleSentinels: ['Unrelated heading'] }),
  }), /configured route sentinel/i);
  assert.throws(() => validateRouteResult({
    allowed: true,
    expectedPath: '/family',
    expectedSentinel: 'Family Overview',
    window: safeWindow({ loadingVisible: true }),
  }), /loading/i);
  assert.equal(validateRouteResult({
    allowed: true,
    expectedPath: '/family',
    expectedSentinel: 'Family Overview',
    window: safeWindow(),
  }).pass, true);
});

test('phase 9 evidence contracts bind every passing action window to canonical staging origin and path', () => {
  assert.throws(() => validateActionWindow(safeWindow({
    finalUrl: 'https://evil.invalid/family',
  })), /canonical staging origin/i);
  assert.throws(() => validateActionWindow(safeWindow({
    finalUrl: `${STAGING_ORIGIN}/admin`,
  })), /finalUrl.*finalPath/i);
  assert.throws(() => validateActionWindow(safeWindow({
    finalUrl: `${STAGING_ORIGIN}/family?source=redirect`,
  })), /canonical.*finalUrl/i);
  assert.throws(() => validateActionWindow(safeWindow({
    finalUrl: `${STAGING_ORIGIN}/family#content`,
  })), /canonical.*finalUrl/i);
  assert.equal(validateActionWindow(safeWindow()).pass, true);
});

test('phase 9 evidence contracts reject an extra final protected heading even when it predates the action mark', () => {
  assert.throws(() => validateRouteResult({
    allowed: true,
    requestedPath: '/family',
    expectedPath: '/family',
    expectedSentinel: 'Family Overview',
    window: safeWindow({
      visibleSentinels: ['Dashboard', 'Family Overview'],
      protectedRender: true,
      renderSignals: [{ kind: 'heading', pathname: '/family', sentinel: 'Family Overview' }],
    }),
  }), /final visible protected heading/i);
});

test('phase 9 evidence contracts scope denied activity to the requested path and allow exact authorized landing activity', () => {
  const protectedSignal = initiatingFrameUrl => closedResourceSignal(initiatingFrameUrl, {
    targetKind: 'firestore-listen',
    method: 'POST',
  });
  const denied = overrides => ({
    allowed: false,
    requestedPath: '/admin',
    expectedPath: '/dashboard',
    expectedSentinel: 'Dashboard',
    window: safeWindow({
      finalPath: '/dashboard',
      visibleSentinels: ['Dashboard'],
      protectedRender: true,
      renderSignals: [{ kind: 'heading', pathname: '/dashboard', sentinel: 'Dashboard' }],
      protectedRequests: 1,
      protectedRequestSignals: [protectedSignal(`${STAGING_ORIGIN}/dashboard`)],
      protectedListenerStarts: 1,
      listenerSignals: [protectedSignal(`${STAGING_ORIGIN}/dashboard`)],
      ...overrides,
    }),
  });

  assert.equal(validateRouteResult(denied()).pass, true);
  assert.throws(() => validateRouteResult(denied({
    protectedRequestSignals: [protectedSignal(`${STAGING_ORIGIN}/admin`)],
  })), /denied-target protected request/i);
  assert.throws(() => validateRouteResult(denied({
    listenerSignals: [protectedSignal(`${STAGING_ORIGIN}/admin`)],
  })), /denied-target protected listener/i);
  assert.throws(() => validateRouteResult(denied({
    renderSignals: [
      { kind: 'heading', pathname: '/admin', sentinel: 'Account Lookup' },
      { kind: 'heading', pathname: '/dashboard', sentinel: 'Dashboard' },
    ],
  })), /unexpected protected render/i);

  assert.equal(validateRouteResult({
    allowed: false,
    requestedPath: '/admin',
    expectedPath: '/family',
    expectedSentinel: 'Family Overview',
    window: safeWindow({
      finalPath: '/family',
      visibleSentinels: ['Family Overview'],
      protectedRender: true,
      renderSignals: [{ kind: 'heading', pathname: '/family', sentinel: 'Family Overview' }],
    }),
  }).pass, true);
});

test('phase 9 evidence contracts fail closed on malformed or untrusted denied-route attribution', () => {
  const protectedSignal = (initiatingFrameUrl, listener) => closedResourceSignal(
    initiatingFrameUrl,
    listener ? { targetKind: 'firestore-listen', method: 'POST' } : {},
  );
  const denied = (field, initiatingFrameUrl) => ({
    allowed: false,
    requestedPath: '/admin',
    expectedPath: '/dashboard',
    expectedSentinel: 'Dashboard',
    window: safeWindow({
      finalUrl: `${STAGING_ORIGIN}/dashboard`,
      finalPath: '/dashboard',
      visibleSentinels: ['Dashboard'],
      protectedRender: true,
      renderSignals: [{ kind: 'heading', pathname: '/dashboard', sentinel: 'Dashboard' }],
      [field === 'protectedRequestSignals' ? 'protectedRequests' : 'protectedListenerStarts']: 1,
      [field]: [protectedSignal(initiatingFrameUrl, field === 'listenerSignals')],
    }),
  });
  for (const value of ['unattributed:', 'invalid:', 'about:blank', 'https://evil.invalid/dashboard']) {
    assert.throws(() => validateRouteResult(denied('protectedRequestSignals', value)), /canonical staging.*attribution/i);
    assert.throws(() => validateRouteResult(denied('listenerSignals', value)), /canonical staging.*attribution/i);
  }
});

test('phase 9 evidence contracts permit only the exact canonical landing attribution and reject denied subtrees', () => {
  const signal = initiatingFrameUrl => closedResourceSignal(initiatingFrameUrl);
  const denied = initiatingFrameUrl => ({
    allowed: false,
    requestedPath: '/admin',
    expectedPath: '/dashboard',
    expectedSentinel: 'Dashboard',
    window: safeWindow({
      finalUrl: `${STAGING_ORIGIN}/dashboard`,
      finalPath: '/dashboard',
      visibleSentinels: ['Dashboard'],
      protectedRender: true,
      renderSignals: [{ kind: 'heading', pathname: '/dashboard', sentinel: 'Dashboard' }],
      protectedRequests: 1,
      protectedRequestSignals: [signal(initiatingFrameUrl)],
    }),
  });
  assert.equal(validateRouteResult(denied(`${STAGING_ORIGIN}/dashboard`)).pass, true);
  assert.throws(() => validateRouteResult(denied(`${STAGING_ORIGIN}/family`)), /authorized landing attribution/i);
  assert.throws(() => validateRouteResult(denied(`${STAGING_ORIGIN}/admin/`)), /denied-target protected request/i);
  assert.throws(() => validateRouteResult(denied(`${STAGING_ORIGIN}/admin/transient`)), /denied-target protected request/i);
  assert.throws(() => validateRouteResult(denied(`${STAGING_ORIGIN}/dashboard/`)), /authorized landing attribution/i);
  assert.throws(() => validateRouteResult(denied(`${STAGING_ORIGIN}/dashboard?source=redirect`)), /canonical.*attribution/i);
  assert.throws(() => validateRouteResult(denied(`${STAGING_ORIGIN}/dashboard#content`)), /canonical.*attribution/i);
});

test('phase 9 evidence contracts reject every denied-route transient signal', () => {
  const input = overrides => ({
    allowed: false,
    requestedPath: '/admin',
    expectedPath: '/dashboard',
    expectedSentinel: 'Dashboard',
    window: safeWindow({ finalPath: '/dashboard', visibleSentinels: ['Dashboard'], sessionPresent: true, ...overrides }),
  });
  assert.throws(() => validateRouteResult(input({ protectedRender: true })), /protected render/i);
  assert.throws(() => validateRouteResult(input({ protectedRequests: 1 })), /protected request/i);
  assert.throws(() => validateRouteResult(input({ protectedListenerStarts: 1 })), /protected listener/i);
  assert.equal(validateRouteResult(input({})).pass, true);
});

test('phase 9 evidence contracts require symmetric real-consumer isolation', () => {
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const expectation = buildIsolationExpectation({ runId, alias: 'qa-parent-a' });
  assert.equal(expectation.ownTeamId, `${runId}-team-a`);
  assert.equal(expectation.oppositeTeamId, `${runId}-team-b`);
  assert.deepEqual(expectation.sameOriginApi, [
    {
      label: 'own-team-api',
      endpoint: '/api/teams/chat',
      parameter: 'teamId',
      teamId: `${runId}-team-a`,
      target: `/api/teams/chat?teamId=${runId}-team-a`,
      status: 200,
    },
    {
      label: 'opposite-team-api',
      endpoint: '/api/teams/chat',
      parameter: 'teamId',
      teamId: `${runId}-team-b`,
      target: `/api/teams/chat?teamId=${runId}-team-b`,
      status: 403,
    },
  ]);
  assert.deepEqual(expectation.directFirestore, [
    { label: 'own-team', path: `teams/${runId}-team-a`, status: 200 },
    { label: 'opposite-team', path: `teams/${runId}-team-b`, status: 403 },
    { label: 'own-player', path: `players/${runId}-player-youth-active`, status: 200 },
    { label: 'opposite-player', path: `players/${runId}-youth-player-b`, status: 403 },
  ]);
  const supportedPaths = {
    'qa-parent-a': ['team-a', 'team-b', 'player-youth-active', 'youth-player-b'],
    'qa-parent-b': ['team-b', 'team-a', 'youth-player-b', 'player-youth-active'],
    'qa-adult-player-a': ['team-a', 'team-b', 'player-adult-a', 'youth-player-b'],
    'qa-adult-player-b': ['team-b', 'team-a', 'player-adult-b', 'player-youth-active'],
    'qa-youth-active': ['team-a', 'team-b', 'player-youth-active', 'youth-player-b'],
  };
  for (const [alias, suffixes] of Object.entries(supportedPaths)) {
    const aliasExpectation = buildIsolationExpectation({ runId, alias });
    assert.deepEqual(
      aliasExpectation.directFirestore.map(item => item.path),
      [
        `teams/${runId}-${suffixes[0]}`,
        `teams/${runId}-${suffixes[1]}`,
        `players/${runId}-${suffixes[2]}`,
        `players/${runId}-${suffixes[3]}`,
      ],
    );
    assert.deepEqual(
      [aliasExpectation.ownTeamId, aliasExpectation.oppositeTeamId],
      [`${runId}-${suffixes[0]}`, `${runId}-${suffixes[1]}`],
    );
  }
  assert.throws(() => buildIsolationExpectation({ runId: 'arbitrary', alias: 'qa-parent-a' }), /run ID/i);
  assert.throws(() => buildIsolationExpectation({ runId, alias: 'qa-school-admin' }), /supported isolation alias/i);
  const safe = overrides => ({
    ...expectation,
    sameOriginApi: expectation.sameOriginApi.map(probe => ({ ...probe })),
    directFirestore: expectation.directFirestore.map(probe => ({ ...probe })),
    oppositeProtectedRender: false,
    oppositeListenerStarts: 0,
    ...overrides,
  });
  assert.equal(validateIsolationResult(safe()).pass, true);
  assert.throws(() => validateIsolationResult(safe({ endpoint: '/team' })), /same-origin endpoint/i);
  assert.throws(() => validateIsolationResult(safe({ sameOriginApi: expectation.sameOriginApi.slice(0, 1) })), /same-origin API target pairs/i);
  assert.throws(() => validateIsolationResult(safe({ oppositeTeamId: expectation.ownTeamId })), /oppositeTeamId/i);
  assert.throws(() => validateIsolationResult(safe({ sameOriginApi: [...expectation.sameOriginApi].reverse() })), /own-team-api/i);
  assert.throws(() => validateIsolationResult(safe({
    sameOriginApi: expectation.sameOriginApi.map(item => item.label === 'own-team-api' ? { ...item, target: '/api/teams/chat?teamId=arbitrary' } : item),
  })), /own-team-api.*target/i);
  assert.throws(() => validateIsolationResult(safe({
    sameOriginApi: expectation.sameOriginApi.map(item => item.label === 'opposite-team-api' ? { ...item, status: 200 } : item),
  })), /opposite-team-api.*403/i);
  assert.throws(() => validateIsolationResult(safe({ directFirestore: safe().directFirestore.slice(0, 3) })), /Firestore probe/i);
  assert.throws(() => validateIsolationResult(safe({
    directFirestore: safe().directFirestore.map(item => item.label === 'own-team' ? { ...item, path: 'teams/arbitrary' } : item),
  })), /own-team.*path/i);
  assert.throws(() => validateIsolationResult(safe({
    directFirestore: safe().directFirestore.map(item => item.label === 'opposite-player' ? { ...item, status: 200 } : item),
  })), /opposite-player.*403/i);
  assert.throws(() => validateIsolationResult(safe({ oppositeProtectedRender: true })), /opposite protected render/i);
  assert.throws(() => validateIsolationResult(safe({ oppositeListenerStarts: 1 })), /opposite listener/i);
});

test('phase 9 evidence contracts validate all ordered logout stages independently', () => {
  const safeStage = name => ({
    name,
    window: safeWindow({
      finalPath: '/login',
      visibleSentinels: ['Sign In'],
      sessionPresent: false,
    }),
  });
  const stages = REQUIRED_LOGOUT_STAGES.map(safeStage);
  assert.equal(validateLogoutStages(stages).pass, true);
  assert.throws(() => validateLogoutStages(stages.slice(1)), /every logout stage/i);
  assert.throws(() => validateLogoutStages(stages.map((stage, index) => index === 1
    ? { ...stage, name: 'stale-tab-back' }
    : stage)), /out of order/i);
  for (const [field, value, message] of [
    ['protectedRender', true, /protected render/i],
    ['protectedRequests', 1, /protected request/i],
    ['protectedListenerStarts', 1, /protected listener/i],
    ['sessionPresent', true, /session/i],
  ]) {
    assert.throws(() => validateLogoutStages(stages.map((stage, index) => index === 2
      ? { ...stage, window: { ...stage.window, [field]: value } }
      : stage)), message);
  }
});

test('phase 9 evidence contracts reject transient signals for fresh and pending revocation windows', () => {
  for (const kind of ['fresh-unauthenticated', 'pending-deletion-stale', 'pending-deletion-fresh']) {
    const visibleSentinels = kind === 'pending-deletion-fresh'
      ? ['Sign In', 'The email or password is incorrect, or this account is unavailable.']
      : ['Sign In'];
    const base = safeWindow({
      finalPath: '/login', visibleSentinels, sessionPresent: false,
      redirectReason: kind === 'pending-deletion-stale' ? 'unavailable' : 'none',
      renderSignals: kind === 'pending-deletion-fresh' ? [{
        kind: 'status', pathname: '/login', sentinel: 'The email or password is incorrect, or this account is unavailable.',
      }] : [],
    });
    assert.equal(validateActionWindow(base, { kind }).pass, true);
    assert.throws(() => validateActionWindow({
      ...base, finalUrl: `${STAGING_ORIGIN}/dashboard`, finalPath: '/dashboard',
    }, { kind }), /\/login/i);
    assert.throws(() => validateActionWindow({ ...base, visibleSentinels: [] }, { kind }), /Sign In/i);
    if (kind === 'pending-deletion-fresh') {
      assert.throws(() => validateActionWindow({ ...base, visibleSentinels: ['Sign In'] }, { kind }), /account is unavailable/i);
    }
    if (kind === 'pending-deletion-stale') assert.throws(() => validateActionWindow({
      ...base,
      visibleSentinels: ['Sign In', 'The email or password is incorrect, or this account is unavailable.'],
      renderSignals: [{ kind: 'status', pathname: '/login', sentinel: 'The email or password is incorrect, or this account is unavailable.' }],
    }, { kind }), /must not show.*unavailable/i);
    assert.throws(() => validateActionWindow({ ...base, protectedRender: true }, { kind }), /protected render/i);
    assert.throws(() => validateActionWindow({ ...base, protectedRequests: 1 }, { kind }), /protected request/i);
    assert.throws(() => validateActionWindow({ ...base, protectedListenerStarts: 1 }, { kind }), /protected listener/i);
    assert.throws(() => validateActionWindow({ ...base, sessionPresent: true }, { kind }), /session/i);
  }
});

test('phase 9 evidence contracts validate lifecycle JSON and fail closed', () => {
  const aliases = [
    'qa-coach-owner-a', 'qa-coach-owner-b', 'qa-team-assistant', 'qa-team-member', 'qa-multi-org',
    'qa-fake-superadmin', 'qa-unverified', 'qa-suspended', 'qa-removed-member', 'qa-parent-a',
    'qa-parent-b', 'qa-adult-player-a', 'qa-adult-player-b', 'qa-youth-active', 'qa-league-creator',
    'qa-school-admin', 'qa-superadmin', 'qa-pending-delete', 'qa-missing-profile', 'qa-no-team',
  ];
  const sortedAliases = [
    'qa-adult-player-a', 'qa-adult-player-b', 'qa-coach-owner-a', 'qa-coach-owner-b',
    'qa-fake-superadmin', 'qa-league-creator', 'qa-missing-profile', 'qa-multi-org', 'qa-no-team',
    'qa-parent-a', 'qa-parent-b', 'qa-pending-delete', 'qa-removed-member', 'qa-school-admin',
    'qa-superadmin', 'qa-suspended', 'qa-team-assistant', 'qa-team-member', 'qa-unverified',
    'qa-youth-active',
  ];
  const uidSuffixes = [
    'adult-player-a', 'adult-player-b', 'coach-owner-a', 'coach-owner-b', 'fake-superadmin',
    'league-creator', 'missing-profile', 'multi-org', 'no-team', 'parent-a', 'parent-b',
    'pending-delete', 'removed-member', 'school-admin', 'superadmin', 'suspended', 'team-assistant',
    'team-member', 'unverified', 'youth-active',
  ];
  const preflight = {
    command: 'preflight',
    safe: true,
    projectId: 'the-squad-v2-staging',
    origin: STAGING_ORIGIN,
    plannedAliases: 20,
    plannedTeams: 3,
  };
  assert.equal(validateLifecycleResult('preflight', JSON.stringify(preflight), 'preflight').pass, true);
  assert.throws(() => validateLifecycleResult('preflight', { ...preflight, command: undefined }, 'preflight'), /command/i);
  assert.throws(() => validateLifecycleResult('preflight', { ...preflight, plannedTeams: 1 }, 'preflight'), /plannedTeams/i);
  assert.throws(() => validateLifecycleResult('preflight', { ...preflight, ok: true }, 'preflight'), /producer fields/i);
  assert.throws(() => validateLifecycleResult('preflight', preflight, 'arbitrary'), /lifecycle stage/i);
  assert.throws(() => validateLifecycleResult('seed', '{', 'seeded'), /valid JSON/i);
  assert.throws(() => validateLifecycleResult('inspect', { ok: false }, 'seeded-present'), /ok=true/i);
  const seed = {
    command: 'seed',
    state: 'seeded',
    aliases,
    counts: { auth: 20, firestore: 82 },
    uidSuffixes,
  };
  assert.equal(validateLifecycleResult('seed', seed, 'seeded').pass, true);
  assert.throws(() => validateLifecycleResult('seed', { ...seed, aliases: aliases.slice(1) }, 'seeded'), /aliases/i);
  assert.throws(() => validateLifecycleResult('seed', { ...seed, ok: true }, 'seeded'), /producer fields/i);
  assert.throws(() => validateLifecycleResult('seed', {
    ...seed, counts: { auth: 1, firestore: 1 }, aliases: ['qa-parent-a'], uidSuffixes: ['parent-a'],
  }, 'seeded'), /canonical seed/i);
  assert.throws(() => validateLifecycleResult('transition', {
    command: 'transition', state: 'pending_deletion', uidSuffix: 'pending-delete',
  }, 'pending-deletion'), /alias|producer fields/i);
  assert.equal(validateLifecycleResult('transition', {
    command: 'transition', alias: 'qa-pending-delete', state: 'pending_deletion', uidSuffix: 'pending-delete',
  }, 'pending-deletion').pass, true);
  assert.throws(() => validateLifecycleResult('transition', {
    command: 'transition', alias: 'qa-pending-delete', state: 'pending_deletion', uidSuffix: 'pending-delete', extra: true,
  }, 'pending-deletion'), /producer fields/i);
  assert.throws(() => validateLifecycleResult('transition', {
    command: 'transition', alias: 'qa-pending-delete', state: 'pending_deletion', uidSuffix: 'pending-delete', resumed: false,
  }, 'pending-deletion'), /resumed/i);
  assert.throws(() => validateLifecycleResult('transition', {
    command: 'transition', alias: 'qa-pending-delete', state: 'pending_deletion', uidSuffix: 'pending-delete', ok: false,
  }, 'pending-deletion'), /producer fields/i);
  assert.equal(validateLifecycleResult('transition', {
    command: 'transition', alias: 'qa-pending-delete', state: 'pending_deletion', uidSuffix: 'pending-delete', resumed: true,
  }, 'pending-deletion').pass, true);

  const inspect = {
    command: 'inspect',
    ok: true,
    aliases: sortedAliases,
    states: { manifest: 'seeded', problems: 0 },
    drift: [],
    counts: {
      expected: { auth: 20, firestore: 82 },
      actualPresent: { auth: 20, firestore: 82 },
    },
    uidSuffixes,
  };
  assert.equal(validateLifecycleResult('inspect', inspect, 'seeded-present').pass, true);
  assert.equal(validateLifecycleResult('inspect', {
    ...inspect,
    aliases: [],
    states: { manifest: 'cleaned', problems: 0 },
    counts: { ...inspect.counts, actualPresent: { auth: 0, firestore: 0 } },
  }, 'cleaned-absent').pass, true);
  assert.throws(() => validateLifecycleResult('inspect', { ...inspect, aliases: undefined }, 'seeded-present'), /aliases/i);
  assert.throws(() => validateLifecycleResult('inspect', { ...inspect, aliases: [...sortedAliases].reverse() }, 'seeded-present'), /aliases/i);
  assert.throws(() => validateLifecycleResult('inspect', { ...inspect, uidSuffixes: uidSuffixes.slice(1) }, 'seeded-present'), /UID suffixes/i);
  assert.throws(() => validateLifecycleResult('inspect', {
    ...inspect,
    aliases: [],
    uidSuffixes: [...uidSuffixes].reverse(),
    states: { manifest: 'cleaned', problems: 0 },
    counts: { ...inspect.counts, actualPresent: { auth: 0, firestore: 0 } },
  }, 'cleaned-absent'), /UID suffixes/i);
  assert.throws(() => validateLifecycleResult('inspect', { ...inspect, drift: ['one'] }, 'seeded-present'), /drift/i);
  assert.throws(() => validateLifecycleResult('inspect', { ...inspect, states: { manifest: 'seeded', problems: 1 } }, 'seeded-present'), /problems/i);
  assert.throws(() => validateLifecycleResult('inspect', {
    ...inspect,
    states: { manifest: 'arbitrary', problems: 0 },
    counts: { expected: { auth: 1, firestore: 1 }, actualPresent: { auth: 1, firestore: 1 } },
  }, 'seeded-present'), /expected Auth count|state/i);

  const cleanup = {
    command: 'cleanup',
    ok: true,
    retained: [],
    deleted: { auth: 20, firestore: 82 },
    followUp: {
      retained: { auth: { count: 0, aliases: [] }, firestore: { count: 0, aliases: [] } },
      failures: { auth: { count: 0, aliases: [] }, firestore: { count: 0, aliases: [] } },
    },
  };
  assert.equal(validateLifecycleResult('cleanup', cleanup, 'cleaned').pass, true);
  assert.throws(() => validateLifecycleResult('cleanup', { ...cleanup, extra: true }, 'cleaned'), /producer fields/i);
  assert.throws(() => validateLifecycleResult('cleanup', {
    ...cleanup, deleted: { ...cleanup.deleted, extra: 0 },
  }, 'cleaned'), /producer fields/i);
  assert.throws(() => validateLifecycleResult('cleanup', {
    ...cleanup, followUp: { ...cleanup.followUp, extra: {} },
  }, 'cleaned'), /producer fields/i);
  assert.throws(() => validateLifecycleResult('cleanup', {
    ...cleanup,
    followUp: {
      ...cleanup.followUp,
      retained: { ...cleanup.followUp.retained, auth: { ...cleanup.followUp.retained.auth, extra: 0 } },
    },
  }, 'cleaned'), /producer fields/i);
  assert.throws(() => validateLifecycleResult('cleanup', { ...cleanup, retained: ['one'] }, 'cleaned'), /retained/i);
  assert.throws(() => validateLifecycleResult('cleanup', {
    ...cleanup,
    followUp: { ...cleanup.followUp, failures: { ...cleanup.followUp.failures, auth: { count: 1, aliases: ['one'] } } },
  }, 'cleaned'), /failures/i);
  assert.throws(() => validateLifecycleResult('cleanup', {
    ...cleanup, deleted: { auth: 1, firestore: 1 },
  }, 'cleaned'), /deleted Auth count/i);

  const probe = {
    projectId: 'the-squad-v2-staging',
    checkedAuth: 20,
    checkedFirestore: 82,
    checkedExpectedAbsent: 1,
    authPresent: 0,
    firestorePresent: 0,
    expectedAbsentPresent: 0,
  };
  assert.equal(validateLifecycleResult('probe', probe, 'independently-absent').pass, true);
  assert.throws(() => validateLifecycleResult('probe', { ...probe, checkedExpectedAbsent: 0 }, 'independently-absent'), /expected-absence/i);
  assert.throws(() => validateLifecycleResult('probe', { ...probe, checkedAuth: undefined }, 'independently-absent'), /checked Auth/i);
  assert.throws(() => validateLifecycleResult('probe', probe, 'arbitrary'), /lifecycle stage/i);
  assert.equal(validateLifecycleResult('browser-sessions', { sessions: [] }, 'browsers-closed').pass, true);
  assert.throws(() => validateLifecycleResult('browser-sessions', { sessions: ['open'] }, 'browsers-closed'), /zero browser sessions/i);
});

test('phase 9 evidence contracts reject missing duplicate and arithmetically false ledger rows', () => {
  const groupCounts = {
    'admission-route': 18,
    isolation: 10,
    logout: 10,
    'pending-deletion': 6,
  };
  const rows = Object.entries(groupCounts).flatMap(([group, count], groupIndex) => Array.from({ length: count }, (_, index) =>
    ledgerRow(`${group}-${index}`, group, (groupIndex + index) % 2 === 0 ? '390x844' : '1440x900')));
  const expected = { groupCounts, totals: { total: 44, pass: 44, fail: 0, inconclusive: 0 } };
  assert.equal(validateLedger(rows, expected).pass, true);
  assert.throws(() => validateLedger(rows.map((row, index) => index === 1 ? { ...row, contextId: rows[0].contextId } : row), expected), /duplicate context/i);
  const missing = { ...rows[0] };
  delete missing.visibleState;
  assert.throws(() => validateLedger([missing, ...rows.slice(1)], expected), /visibleState/i);
  assert.throws(() => validateLedger(rows.slice(1), expected), /group count|total/i);
  assert.throws(() => validateLedger(rows, { ...expected, totals: { ...expected.totals, pass: 43 } }), /arithmetic/i);
  for (const [field, value, message] of [
    ['contextId', 7, /contextId/i],
    ['alias', 7, /alias/i],
    ['viewport', '800x600', /viewport/i],
    ['startState', false, /startState/i],
    ['startUrl', 7, /startUrl/i],
    ['action', [], /action/i],
    ['expectedResult', null, /expectedResult/i],
    ['finalUrl', '/family', /absolute canonical finalUrl/i],
    ['finalUrl', 'https://example.com/family', /canonical staging origin/i],
    ['visibleState', {}, /visibleState/i],
    ['sessionPresent', 'present', /sessionPresent/i],
    ['protectedRequests', -1, /protectedRequests/i],
    ['protectedListenerStarts', 0.5, /protectedListenerStarts/i],
    ['relevantHttpDataResult', false, /relevantHttpDataResult/i],
    ['pageErrors', '0', /pageErrors/i],
    ['appConsoleErrors', -1, /appConsoleErrors/i],
    ['unexpectedRequestFailures', null, /unexpectedRequestFailures/i],
    ['overflow', -1, /overflow/i],
    ['result', 'BLOCKED', /result/i],
  ]) {
    assert.throws(() => validateLedger(rows.map((row, index) => index === 0 ? { ...row, [field]: value } : row), expected), message);
  }
  assert.throws(() => validateLedger(rows.slice(0, 18), {
    groupCounts: { 'admission-route': 18 },
    totals: { total: 18, pass: 18, fail: 0, inconclusive: 0 },
  }), /canonical group arithmetic/i);
});

const scenarioWindow = overrides => ({
  ...safeWindow(),
  finalUrl: `${STAGING_ORIGIN}/family`,
  relevantHttpResults: [],
  ...overrides,
});

const scenarioContext = overrides => ({
  contextId: 'admission-route-qa-parent-a-mobile',
  alias: 'qa-parent-a',
  viewport: '390x844',
  startState: 'active',
  startUrl: 'about:blank',
  ...overrides,
});

const createScriptedScenarioClient = windows => {
  const calls = [];
  const queue = [...windows];
  return {
    calls,
    async captureSignalWindow({ stage, action, terminal }) {
      calls.push(`mark:${stage}`);
      await action();
      calls.push(`terminal:${stage}`);
      await terminal();
      const window = queue.shift();
      if (!window) throw new Error(`No scripted window for ${stage}`);
      return window;
    },
  };
};

test('phase 9 browser scenario entrypoints reject acquisition fields before row or aggregate assembly', async () => {
  const context = scenarioContext({ contextId: 'closed-scenario-entrypoint' });
  const actions = { navigate: async () => {}, waitForExactLocation: async () => {} };
  for (const window of [
    scenarioWindow({ rawRequests: [] }),
    scenarioWindow({ acquisition: { rawResponses: [] } }),
    scenarioWindow({
      relevantHttpResults: [{ targetKind: 'staging-protected-api', status: 200, headers: {} }],
    }),
  ]) {
    await assert.rejects(runRouteScenario({
      client: createScriptedScenarioClient([window]),
      session: 'closed-scenario-entrypoint',
      context,
      path: '/family',
      allowed: true,
      actions,
    }), /closed .* schema/i);
  }
});

test('phase 9 browser scenarios require visible readiness and complete denied-route windows', async () => {
  const context = scenarioContext();
  const actions = {
    navigate: async target => target,
    waitForExactLocation: async (path, sentinel) => ({ path, sentinel }),
  };
  for (const [overrides, message] of [
    [{ visibleSentinels: [] }, /visible sentinel/i],
    [{ loadingVisible: true }, /loading/i],
  ]) {
    const client = createScriptedScenarioClient([scenarioWindow(overrides)]);
    await assert.rejects(runRouteScenario({
      client, session: 'admission', context, path: '/family', allowed: true, actions,
    }), message);
  }
  const timeoutClient = createScriptedScenarioClient([scenarioWindow()]);
  await assert.rejects(runRouteScenario({
    client: timeoutClient,
    session: 'timeout',
    context,
    path: '/family',
    allowed: true,
    actions: { ...actions, waitForExactLocation: async () => { throw new Error('readiness timeout'); } },
  }), /readiness timeout/);

  for (const [field, value, message] of [
    ['protectedRender', true, /protected render/i],
    ['protectedRequests', 1, /protected request/i],
    ['protectedListenerStarts', 1, /protected listener/i],
  ]) {
    const client = createScriptedScenarioClient([scenarioWindow({
      finalPath: '/dashboard', finalUrl: `${STAGING_ORIGIN}/dashboard`, visibleSentinels: ['Dashboard'], [field]: value,
    })]);
    await assert.rejects(runRouteScenario({
      client,
      session: 'denied',
      context,
      path: '/admin',
      allowed: false,
      landing: { path: '/dashboard', sentinel: 'Dashboard' },
      actions,
    }), message);
  }

  const passingClient = createScriptedScenarioClient([scenarioWindow()]);
  const row = await runRouteScenario({
    client: passingClient, session: 'allowed', context, path: '/family', allowed: true, actions,
  });
  assert.equal(row.result, 'PASS');
  assert.equal(row.finalUrl, `${STAGING_ORIGIN}/family`);
  assert.deepEqual(passingClient.calls, ['mark:admission-route', 'terminal:admission-route']);
});

test('phase 9 browser scenarios reject a foreign-origin redirect even when its final path and heading match', async () => {
  const client = createScriptedScenarioClient([scenarioWindow({
    finalUrl: 'https://evil.invalid/family',
    finalPath: '/family',
    visibleSentinels: ['Family Overview'],
  })]);
  await assert.rejects(runRouteScenario({
    client,
    session: 'foreign-origin-route',
    context: scenarioContext({ contextId: 'foreign-origin-route' }),
    path: '/family',
    allowed: true,
    actions: { navigate: async () => {}, waitForExactLocation: async () => {} },
  }), /canonical staging origin/i);
});

test('phase 9 browser scenarios use exact symmetric API and Firestore isolation probes', async () => {
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const expectation = buildIsolationExpectation({ runId, alias: 'qa-parent-a' });
  const windows = [
    scenarioWindow({ relevantHttpResults: [{ targetKind: 'staging-protected-api', status: 200 }] }),
    scenarioWindow({ relevantHttpResults: [{ targetKind: 'staging-protected-api', status: 403 }] }),
    ...expectation.directFirestore.map(probe => scenarioWindow({ relevantHttpResults: [{ targetKind: 'firestore-document', status: probe.status }] })),
  ];
  const client = createScriptedScenarioClient(windows);
  const apiCalls = [];
  const firestoreCalls = [];
  const row = await runIsolationScenario({
    client,
    session: 'isolation',
    context: scenarioContext({ contextId: 'isolation-qa-parent-a-mobile' }),
    runId,
    actions: {
      sameOriginGet: async (target, authentication) => {
        apiCalls.push({ target, authentication });
        return target.includes('team-a') ? 200 : 403;
      },
      firestoreGet: async (probe, authentication) => {
        firestoreCalls.push({ probe, authentication });
        return probe.expectedStatus;
      },
      waitForSettled: async () => {},
    },
  });
  assert.deepEqual(apiCalls, expectation.sameOriginApi.map(item => ({
    target: item.target,
    authentication: { session: 'isolation', method: 'GET', credentials: 'same-origin' },
  })));
  assert.equal(apiCalls.some(({ target }) => target.startsWith('/team?teamId=')), false);
  assert.deepEqual(firestoreCalls, expectation.directFirestore.map(({ label, path, status }) => ({
    probe: { label, path, expectedStatus: status },
    authentication: { session: 'isolation' },
  })));
  assert.equal(row.result, 'PASS');

  for (const [mutate, message] of [
    [statuses => { statuses.api[0] = 403; }, /own-team-api.*200/i],
    [statuses => { statuses.api[1] = 200; }, /opposite-team-api.*403/i],
    [statuses => { statuses.firestore.pop(); }, /complete.*Firestore|Firestore.*complete/i],
    [statuses => { statuses.firestore[3] = 200; }, /opposite-player.*403/i],
  ]) {
    const statuses = { api: [200, 403], firestore: [200, 403, 200, 403] };
    mutate(statuses);
    const failingClient = createScriptedScenarioClient([
      ...statuses.api.map(status => scenarioWindow({
        relevantHttpResults: [{ targetKind: 'staging-protected-api', status }],
      })),
      ...statuses.firestore.map(status => scenarioWindow({
        relevantHttpResults: [{ targetKind: 'firestore-document', status }],
      })),
    ]);
    let firestoreIndex = 0;
    let apiIndex = 0;
    await assert.rejects(runIsolationScenario({
      client: failingClient,
      session: 'isolation-fail',
      context: scenarioContext({ contextId: 'isolation-fail-mobile' }),
      runId,
      actions: {
        sameOriginGet: async () => statuses.api[apiIndex++],
        firestoreGet: async () => statuses.firestore[firestoreIndex++],
        waitForSettled: async () => {},
      },
    }), message);
  }
});

test('phase 9 browser scenarios require an authenticated session in each indexed isolation window', async t => {
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const expectation = buildIsolationExpectation({ runId, alias: 'qa-parent-a' });
  const stages = [
    ...expectation.sameOriginApi.map(probe => probe.label),
    ...expectation.directFirestore.map(probe => probe.label),
  ];
  const statuses = [200, 403, 200, 403, 200, 403];

  for (const [windowIndex, stage] of stages.entries()) await t.test(`${windowIndex}:${stage}`, async () => {
    const windows = statuses.map((status, index) => scenarioWindow({
      sessionPresent: index !== windowIndex,
      relevantHttpResults: [{
        targetKind: index < 2 ? 'staging-protected-api' : 'firestore-document',
        status,
      }],
    }));
    let apiIndex = 0;
    let firestoreIndex = 0;
    await assert.rejects(runIsolationScenario({
      client: createScriptedScenarioClient(windows),
      session: `isolation-session-${windowIndex}`,
      context: scenarioContext({ contextId: `isolation-session-${windowIndex}` }),
      runId,
      actions: {
        sameOriginGet: async () => statuses[apiIndex++],
        firestoreGet: async () => statuses[2 + firestoreIndex++],
        waitForSettled: async () => {},
      },
    }), new RegExp(`isolation-${stage}.*authenticated session`, 'i'));
  });
});

test('phase 9 browser scenarios mark before every logout stage and reject transient activity', async () => {
  const clean = scenarioWindow({
    finalPath: '/login', finalUrl: `${STAGING_ORIGIN}/login`, visibleSentinels: ['Sign In'], sessionPresent: false,
  });
  const actionOrder = [];
  const actions = Object.fromEntries(REQUIRED_LOGOUT_STAGES.map(name => [name, async () => actionOrder.push(`action:${name}`)]));
  actions.waitForLogin = async stage => actionOrder.push(`wait:${stage}`);
  const client = createScriptedScenarioClient([...REQUIRED_LOGOUT_STAGES.map(() => clean), clean]);
  actions.freshUnauthenticated = async () => actionOrder.push('action:fresh-isolated-unauthenticated');
  actions.waitForFreshLogin = async () => actionOrder.push('wait:fresh-isolated-unauthenticated');
  const row = await runLogoutScenario({
    client,
    session: 'logout',
    freshSession: 'logout-fresh',
    context: scenarioContext({ contextId: 'logout-qa-parent-a-mobile' }),
    actions,
  });
  assert.equal(row.result, 'PASS');
  assert.deepEqual(client.calls.filter(call => call.startsWith('mark:')), [
    ...REQUIRED_LOGOUT_STAGES.map(name => `mark:${name}`),
    'mark:fresh-isolated-unauthenticated',
  ]);
  assert.deepEqual(actionOrder, [
    ...REQUIRED_LOGOUT_STAGES.flatMap(name => [`action:${name}`, `wait:${name}`]),
    'action:fresh-isolated-unauthenticated', 'wait:fresh-isolated-unauthenticated',
  ]);

  for (const stageIndex of [0, 1, 2, 3]) {
    for (const [field, value, message] of [
      ['protectedRender', true, /protected render/i],
      ['protectedRequests', 1, /protected request/i],
      ['protectedListenerStarts', 1, /protected listener/i],
      ['sessionPresent', true, /session/i],
    ]) {
      const windows = [...REQUIRED_LOGOUT_STAGES.map((_, index) => index === stageIndex ? { ...clean, [field]: value } : clean), clean];
      await assert.rejects(runLogoutScenario({
        client: createScriptedScenarioClient(windows),
        session: 'logout-fail',
        freshSession: 'logout-fresh-fail',
        context: scenarioContext({ contextId: `logout-fail-${stageIndex}-${field}` }),
        actions,
      }), message);
    }
  }
});

test('phase 9 browser scenarios reject transient protected activity for fresh and pending deletion', async () => {
  const fresh = scenarioWindow({
    finalPath: '/login', finalUrl: `${STAGING_ORIGIN}/login`, visibleSentinels: ['Sign In'], sessionPresent: false,
  });
  const pending = {
    ...fresh,
    visibleSentinels: ['Sign In', 'The email or password is incorrect, or this account is unavailable.'],
    renderSignals: [{ kind: 'status', pathname: '/login', sentinel: 'The email or password is incorrect, or this account is unavailable.' }],
  };
  const actions = {
    navigate: async () => {}, waitForLogin: async () => {}, freshLogin: async () => {}, waitForUnavailable: async () => {},
  };
  for (const runner of [runFreshUnauthenticatedScenario, runPendingDeletionScenario]) {
    for (const [field, value, message] of [
      ['protectedRender', true, /protected render/i],
      ['protectedRequests', 1, /protected request/i],
      ['protectedListenerStarts', 1, /protected listener/i],
    ]) {
      const base = runner === runPendingDeletionScenario ? pending : fresh;
      await assert.rejects(runner({
        client: createScriptedScenarioClient([{ ...base, [field]: value }]),
        session: 'revoked',
        context: scenarioContext({
          contextId: `revoked-${field}`,
          alias: runner === runPendingDeletionScenario ? 'qa-pending-delete' : 'qa-parent-a',
        }),
        actions,
      }), message);
    }
  }
  assert.equal((await runFreshUnauthenticatedScenario({
    client: createScriptedScenarioClient([fresh]), session: 'fresh', context: scenarioContext({ contextId: 'fresh' }), actions,
  })).result, 'PASS');
  assert.equal((await runPendingDeletionScenario({
    client: createScriptedScenarioClient([pending]), session: 'pending',
    context: scenarioContext({ contextId: 'pending', alias: 'qa-pending-delete' }), actions,
  })).result, 'PASS');
});

test('phase 9 browser scenarios distinguish active pending baseline, stale revocation, and fresh denial', async () => {
  const active = scenarioWindow({
    finalPath: '/dashboard',
    finalUrl: `${STAGING_ORIGIN}/dashboard`,
    visibleSentinels: ['Dashboard'],
    sessionPresent: true,
  });
  const actions = {
    navigate: async () => {},
    waitForDashboard: async () => {},
  };
  const row = await runPendingDeletionScenario({
    client: createScriptedScenarioClient([active]),
    session: 'pending-active',
    context: scenarioContext({ contextId: 'pending-active', alias: 'qa-pending-delete' }),
    scenario: 'active-baseline',
    actions,
  });
  assert.equal(row.group, 'pending-deletion');
  assert.equal(row.visibleState, 'Dashboard');
  assert.equal(row.sessionPresent, true);
  await assert.rejects(runPendingDeletionScenario({
    client: createScriptedScenarioClient([active]),
    session: 'pending-invalid',
    context: scenarioContext({ contextId: 'pending-invalid', alias: 'qa-pending-delete' }),
    scenario: 'unsupported',
    actions,
  }), /pending-deletion scenario/i);
});

test('phase 9 browser scenarios reject an extra final protected heading on an active landing', async () => {
  const active = scenarioWindow({
    finalPath: '/dashboard',
    finalUrl: `${STAGING_ORIGIN}/dashboard`,
    visibleSentinels: ['Dashboard', 'Family Overview'],
    sessionPresent: true,
    protectedRender: true,
    renderSignals: [{ kind: 'heading', pathname: '/dashboard', sentinel: 'Dashboard' }],
  });
  await assert.rejects(runPendingDeletionScenario({
    client: createScriptedScenarioClient([active]),
    session: 'pending-active-extra-heading',
    context: scenarioContext({ contextId: 'pending-active-extra-heading', alias: 'qa-pending-delete' }),
    scenario: 'active-baseline',
    actions: { navigate: async () => {}, waitForDashboard: async () => {} },
  }), /final visible protected heading/i);
});

test('phase 9 browser scenarios build the exact canonical two-viewport plan and reject invalid contexts', async () => {
  const plan = buildCanonicalScenarioPlan();
  assert.equal(plan.length, 44);
  assert.deepEqual(Object.fromEntries(Object.entries(VIEWPORTS).map(([name, size]) => [name, `${size.width}x${size.height}`])), {
    mobile: '390x844', desktop: '1440x900',
  });
  assert.deepEqual(plan.reduce((counts, entry) => ({ ...counts, [entry.group]: (counts[entry.group] ?? 0) + 1 }), {}), {
    'admission-route': 18,
    isolation: 10,
    logout: 10,
    'pending-deletion': 6,
  });
  assert.deepEqual([...new Set(plan.filter(item => item.group === 'admission-route').map(item => item.alias))], [
    'qa-parent-a', 'qa-adult-player-a', 'qa-youth-active', 'qa-league-creator', 'qa-school-admin',
    'qa-superadmin', 'qa-fake-superadmin', 'qa-missing-profile', 'qa-no-team',
  ]);
  assert.deepEqual([...new Set(plan.filter(item => item.group === 'isolation').map(item => item.alias))], [
    'qa-parent-a', 'qa-adult-player-a', 'qa-youth-active', 'qa-parent-b', 'qa-adult-player-b',
  ]);
  assert.deepEqual([...new Set(plan.filter(item => item.group === 'logout').map(item => item.alias))], [
    'qa-parent-a', 'qa-adult-player-a', 'qa-league-creator', 'qa-school-admin', 'qa-superadmin',
  ]);
  assert.deepEqual([...new Set(plan.filter(item => item.group === 'pending-deletion').map(item => item.alias))], ['qa-pending-delete']);
  assert.equal(new Set(plan.map(item => item.contextId)).size, 44);
  assert.deepEqual([...new Set(plan.map(item => item.viewport))], ['390x844', '1440x900']);
  const expectedLandings = {
    'qa-parent-a': ['/family', 'Family Overview'],
    'qa-adult-player-a': ['/dashboard', 'Dashboard'],
    'qa-youth-active': ['/dashboard', 'Dashboard'],
    'qa-league-creator': ['/competition', 'Competition Hub'],
    'qa-school-admin': ['/club', 'School Hub'],
    'qa-superadmin': ['/admin', 'Account Lookup'],
    'qa-fake-superadmin': ['/dashboard', 'Dashboard'],
    'qa-missing-profile': ['/onboarding', 'Complete your profile'],
    'qa-no-team': ['/teams/join', 'Join & Invite'],
  };
  for (const entry of plan.filter(item => item.group === 'admission-route')) {
    assert.deepEqual([entry.landing.path, entry.landing.sentinel], expectedLandings[entry.alias]);
    assert.deepEqual(entry.routeExpectations.map(route => route.requestedPath), [
      '/admin', '/club', '/competition', '/dashboard/billing', '/coaches-corner', '/family',
    ]);
    assert.equal(entry.routeExpectations.length, 6);
  }
  const settledDeniedLandings = {
    'qa-parent-a': ['/family', 'Family Overview'],
    'qa-league-creator': ['/competition', 'Competition Hub'],
    'qa-school-admin': ['/club', 'School Hub'],
  };
  for (const [alias, expected] of Object.entries(settledDeniedLandings)) {
    const entry = plan.find(item => item.group === 'admission-route' && item.alias === alias);
    const deniedRoutes = entry.routeExpectations.filter(route => !route.allowed);
    assert.equal(deniedRoutes.length > 0, true);
    for (const route of deniedRoutes) assert.deepEqual([route.path, route.sentinel], expected);
  }

  const client = createScriptedScenarioClient([scenarioWindow()]);
  await assert.rejects(runAdmissionScenario({
    client,
    session: 'invalid',
    context: { ...scenarioContext(), startUrl: undefined },
    path: '/family',
    allowed: true,
    actions: { navigate: async () => {}, waitForExactLocation: async () => {} },
  }), /startUrl/i);
  assert.throws(() => buildCanonicalScenarioPlan({ contextIds: ['duplicate', 'duplicate'] }), /duplicate context ID/i);
});

test('phase 9 browser scenarios admission row owns login landing and all six direct routes', async () => {
  const family = overrides => scenarioWindow({
    finalPath: '/family', finalUrl: `${STAGING_ORIGIN}/family`, visibleSentinels: ['Family Overview'], ...overrides,
  });
  const familySignals = count => Array.from(
    { length: count },
    () => closedResourceSignal(`${STAGING_ORIGIN}/family`),
  );
  const windows = [
    family({ protectedRequests: 1, protectedRequestSignals: familySignals(1) }),
    ...['/admin', '/club', '/competition', '/dashboard/billing', '/coaches-corner'].map(() => family({ protectedRender: false })),
    family({ protectedRequests: 2, protectedRequestSignals: familySignals(2) }),
  ];
  const actionCalls = [];
  const client = createScriptedScenarioClient(windows);
  const row = await runAdmissionScenario({
    client,
    session: 'admission-complete',
    context: scenarioContext(),
    actions: {
      loginAndLand: async alias => actionCalls.push(`login:${alias}`),
      navigate: async path => actionCalls.push(`navigate:${path}`),
      waitForExactLocation: async (path, sentinel) => actionCalls.push(`wait:${path}:${sentinel}`),
    },
  });
  assert.deepEqual(actionCalls.filter(item => item.startsWith('login:') || item.startsWith('navigate:')), [
    'login:qa-parent-a',
    'navigate:/admin',
    'navigate:/club',
    'navigate:/competition',
    'navigate:/dashboard/billing',
    'navigate:/coaches-corner',
    'navigate:/family',
  ]);
  assert.equal(client.calls.filter(item => item.startsWith('mark:')).length, 7);
  assert.equal(row.actionSummaries.length, 7);
  assert.equal(row.protectedRequests, 3);
  assert.match(row.action, /login.*6 direct routes/i);
});

test('phase 9 browser scenarios wait for the exact settled landing instead of an intermediate heading', async () => {
  const family = scenarioWindow({
    finalPath: '/family', finalUrl: `${STAGING_ORIGIN}/family`, visibleSentinels: ['Family Overview'],
  });
  const client = createScriptedScenarioClient(Array.from({ length: 7 }, () => family));
  const observations = [];
  let waitIndex = 0;
  const row = await runAdmissionScenario({
    client,
    session: 'parent-settled-landing',
    context: scenarioContext({ contextId: 'parent-settled-landing', alias: 'qa-parent-a' }),
    actions: {
      loginAndLand: async () => {},
      navigate: async () => {},
      waitForExactLocation: async (path, sentinel) => {
        const states = waitIndex++ === 0
          ? [
              { path: '/dashboard', sentinel: 'Dashboard' },
              { path: '/dashboard', sentinel: 'Family Overview' },
              { path: '/family', sentinel: 'Family Overview' },
            ]
          : [{ path, sentinel }];
        for (const state of states) {
          observations.push(state);
          if (state.path === path && state.sentinel === sentinel) return;
        }
        throw new Error('exact settled location was not reached');
      },
    },
  });
  assert.equal(row.result, 'PASS');
  assert.deepEqual(observations.slice(0, 3), [
    { path: '/dashboard', sentinel: 'Dashboard' },
    { path: '/dashboard', sentinel: 'Family Overview' },
    { path: '/family', sentinel: 'Family Overview' },
  ]);
  assert.equal(waitIndex, 7);
});

test('phase 9 browser scenarios reject Dashboard as the final role landing for routed aliases', async () => {
  const dashboard = scenarioWindow({
    finalPath: '/dashboard', finalUrl: `${STAGING_ORIGIN}/dashboard`, visibleSentinels: ['Dashboard'],
  });
  for (const alias of ['qa-parent-a', 'qa-league-creator', 'qa-school-admin']) {
    await assert.rejects(runAdmissionScenario({
      client: createScriptedScenarioClient([dashboard]),
      session: `wrong-final-${alias}`,
      context: scenarioContext({ contextId: `wrong-final-${alias}`, alias }),
      actions: {
        loginAndLand: async () => {},
        navigate: async () => {},
        waitForExactLocation: async () => {},
      },
    }), /exact landing path and heading/i, alias);
  }
});

test('phase 9 browser scenarios retain strict zero protected data for Missing Profile in every admission window', async () => {
  const signal = (initiatingFrameUrl, listener) => closedResourceSignal(
    initiatingFrameUrl,
    listener ? { targetKind: 'firestore-listen', method: 'POST' } : {},
  );
  const cases = [['qa-missing-profile', '/onboarding', 'Complete your profile']];
  for (const [alias, path, sentinel] of cases) {
    const clean = scenarioWindow({
      finalPath: path,
      finalUrl: `${STAGING_ORIGIN}${path}`,
      visibleSentinels: [sentinel],
      protectedRender: false,
      renderSignals: [],
    });
    const run = windows => runAdmissionScenario({
      client: createScriptedScenarioClient(windows),
      session: `incomplete-${alias}`,
      context: scenarioContext({ contextId: `incomplete-${alias}`, alias }),
      actions: {
        loginAndLand: async () => {},
        navigate: async () => {},
        waitForExactLocation: async () => {},
      },
    });
    for (const [countField, signalsField, message] of [
      ['protectedRequests', 'protectedRequestSignals', /protected request/i],
      ['protectedListenerStarts', 'listenerSignals', /protected listener/i],
    ]) {
      for (const windowIndex of [0, 1, 2, 3, 4, 5, 6]) {
        const windows = Array.from({ length: 7 }, () => ({ ...clean }));
        windows[windowIndex] = {
          ...clean,
          [countField]: 1,
          [signalsField]: [signal(`${STAGING_ORIGIN}${path}`, signalsField === 'listenerSignals')],
        };
        await assert.rejects(run(windows), message, `${alias} landing-attributed ${countField} at window ${windowIndex}`);
      }
      for (const [routeIndex, requestedPath] of [
        '/admin', '/club', '/competition', '/dashboard/billing', '/coaches-corner', '/family',
      ].entries()) {
        const deniedTargetWindows = Array.from({ length: 7 }, () => ({ ...clean }));
        deniedTargetWindows[routeIndex + 1] = {
          ...clean,
          [countField]: 1,
          [signalsField]: [signal(`${STAGING_ORIGIN}${requestedPath}`, signalsField === 'listenerSignals')],
        };
        await assert.rejects(run(deniedTargetWindows), message, `${alias} ${requestedPath} ${countField}`);
      }
    }
    const row = await run(Array.from({ length: 7 }, () => ({ ...clean })));
    assert.equal(row.protectedRequests, 0);
    assert.equal(row.protectedListenerStarts, 0);
  }
});

test('phase 9 browser scenarios allow No Team self-account setup while rejecting every fixture-tenant signal', async () => {
  const landingPath = '/teams/join';
  const landing = () => scenarioWindow({
    finalPath: landingPath,
    finalUrl: `${STAGING_ORIGIN}${landingPath}`,
    visibleSentinels: ['Join & Invite'],
    protectedRender: false,
    renderSignals: [],
    protectedRequests: 2,
    protectedRequestSignals: [
      {
        targetKind: 'firestore-listen',
        method: 'POST',
        resourceType: 'fetch',
        initiatingFrameUrl: `${STAGING_ORIGIN}${landingPath}`,
        scopeEvidence: ['self-parent-players-query'],
        resourceScopes: ['self-account'],
      },
      {
        targetKind: 'staging-join-admin-api',
        method: 'PATCH',
        resourceType: 'fetch',
        initiatingFrameUrl: `${STAGING_ORIGIN}${landingPath}`,
        scopeEvidence: ['join-admin-patch'],
        resourceScopes: ['join-admin-lookup'],
      },
    ],
    protectedListenerStarts: 1,
    listenerSignals: [{
      targetKind: 'firestore-listen',
      method: 'POST',
      resourceType: 'fetch',
      initiatingFrameUrl: `${STAGING_ORIGIN}${landingPath}`,
      scopeEvidence: ['self-parent-players-query'],
      resourceScopes: ['self-account'],
    }],
  });
  const run = windows => runAdmissionScenario({
    client: createScriptedScenarioClient(windows),
    session: 'no-team-account-scope',
    context: scenarioContext({ contextId: 'no-team-account-scope', alias: 'qa-no-team' }),
    actions: {
      loginAndLand: async () => {},
      navigate: async () => {},
      waitForExactLocation: async () => {},
    },
  });

  const permitted = await run(Array.from({ length: 7 }, landing));
  assert.equal(permitted.protectedRequests, 14);
  assert.equal(permitted.protectedListenerStarts, 7);

  const deniedRoutes = ['/admin', '/club', '/competition', '/dashboard/billing', '/coaches-corner', '/family'];
  for (const [index, stagePath] of ['/login', ...deniedRoutes].entries()) {
    for (const [scope, message] of [
      ['tenant-team-a', /No Team.*selected Team A/i],
      ['tenant-team-b', /No Team.*selected Team B/i],
    ]) {
      const windows = Array.from({ length: 7 }, landing);
      windows[index] = { ...landing(), teamSelectionSignals: [scope] };
      await assert.rejects(run(windows), message, `${scope} selection in ${stagePath}`);
    }
  }
  for (const [index, requestedPath] of ['/login', ...deniedRoutes].entries()) {
    const windows = Array.from({ length: 7 }, landing);
    windows[index] = {
      ...landing(),
      protectedRequests: 1,
      protectedRequestSignals: [{
        targetKind: 'firestore-document',
        method: 'GET',
        resourceType: 'fetch',
        initiatingFrameUrl: `${STAGING_ORIGIN}${requestedPath === '/login' ? landingPath : requestedPath}`,
        scopeEvidence: ['fixture-team-a-document'],
        resourceScopes: ['tenant-team-a'],
      }],
      protectedListenerStarts: 0,
      listenerSignals: [],
    };
    await assert.rejects(run(windows), /No Team.*Team A tenant/i, `Team A request in ${requestedPath}`);

    const listenerWindows = Array.from({ length: 7 }, landing);
    listenerWindows[index] = {
      ...landing(),
      protectedRequests: 0,
      protectedRequestSignals: [],
      protectedListenerStarts: 1,
      listenerSignals: [{
        targetKind: 'firestore-listen',
        method: 'POST',
        resourceType: 'fetch',
        initiatingFrameUrl: `${STAGING_ORIGIN}${requestedPath === '/login' ? landingPath : requestedPath}`,
        scopeEvidence: ['fixture-team-b-document'],
        resourceScopes: ['tenant-team-b'],
      }],
    };
    await assert.rejects(run(listenerWindows), /No Team.*Team B tenant/i, `Team B listener in ${requestedPath}`);
  }

  const aggregatedEarlyTenant = Array.from({ length: 7 }, landing);
  aggregatedEarlyTenant[0] = {
    ...landing(),
    protectedRequests: 0,
    protectedRequestSignals: [],
    protectedListenerStarts: 1,
    listenerSignals: [{
      targetKind: 'firestore-listen',
      method: 'POST',
      resourceType: 'fetch',
      initiatingFrameUrl: `${STAGING_ORIGIN}${landingPath}`,
      scopeEvidence: ['fixture-team-b-document'],
      resourceScopes: ['tenant-team-b'],
    }],
  };
  await assert.rejects(run(aggregatedEarlyTenant), /No Team.*Team B tenant/i);

  const unscoped = Array.from({ length: 7 }, landing);
  unscoped[6] = {
    ...landing(),
    protectedRequests: 1,
    protectedRequestSignals: [{
      targetKind: 'firestore-listen',
      method: 'POST',
      resourceType: 'fetch',
      initiatingFrameUrl: `${STAGING_ORIGIN}/family`,
      scopeEvidence: ['unscoped-resource'],
      resourceScopes: ['unscoped'],
    }],
    protectedListenerStarts: 0,
    listenerSignals: [],
  };
  await assert.rejects(run(unscoped), /No Team.*typed resource scope/i);
});

test('phase 9 playwright client reduces fixture resource targets to fixed aliases without retaining identifiers', async () => {
  const { classifyFixtureResourceScopes } = await import('../scripts/qa-evidence/phase9/playwright-cli-client.mjs');
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const classify = signal => classifyFixtureResourceScopes(producerRaw(signal), { runId, alias: 'qa-no-team' });
  const firestore = value => `https://firestore.googleapis.com/v1/projects/the-squad-v2-staging/databases/(default)/documents/${value}`;
  const scopes = signal => classify({ method: 'GET', ...signal }).resourceScopes;
  const listen = message => ({
    url: FIRESTORE_INITIAL_LISTEN_URL,
    method: 'POST',
    body: initialListenForm(message),
  });

  assert.deepEqual(scopes({ url: firestore(`users/${runId}-no-team`) }), ['self-account']);
  assert.deepEqual(scopes({ url: firestore(`users/${runId}-no-team/teamMemberships`) }), ['unscoped']);
  assert.deepEqual(scopes({ url: firestore(`users/${runId}-no-team/teamMemberships/member-a`) }), ['self-account']);
  assert.deepEqual(scopes({ url: firestore(`users/${runId}-no-team/payments/payment-a`) }), ['unscoped']);
  assert.deepEqual(scopes({ url: firestore(`users/${runId}-no-team/teamMembershipsOther/member-a`) }), ['unscoped']);
  assert.deepEqual(scopes({ url: `${STAGING_ORIGIN}/api/schools/admins`, method: 'PATCH' }), ['join-admin-lookup']);
  assert.deepEqual(scopes({ url: `${STAGING_ORIGIN}/api/schools/admins`, method: 'GET' }), ['unscoped']);
  assert.deepEqual(scopes({ url: `${STAGING_ORIGIN}/api/other/documents/users/${runId}-no-team` }), ['unscoped']);
  assert.deepEqual(scopes({ url: firestore(`teams/${runId}-team-a`) }), ['tenant-team-a']);
  assert.deepEqual(scopes({
    url: FIRESTORE_INITIAL_LISTEN_URL,
    body: encodeURIComponent(`projects/staging/databases/(default)/documents/teams/${runId}-team-b/members`),
  }), ['unscoped']);
  assert.deepEqual(scopes({ url: firestore('teams/unrelated-team') }), ['tenant-other']);
  assert.deepEqual(scopes(listen({
    database: 'projects/the-squad-v2-staging/databases/(default)',
    addTarget: {
        query: {
          parent: `projects/staging/databases/(default)/documents/users/${runId}-no-team`,
          structuredQuery: { from: [{ collectionId: 'payments' }] },
        },
        targetId: 1,
      },
  })), ['unscoped']);
  assert.deepEqual(scopes(listen({
    database: 'projects/the-squad-v2-staging/databases/(default)',
    addTarget: { query: {
      parent: 'projects/the-squad-v2-staging/databases/(default)/documents',
      structuredQuery: { from: [{ collectionId: 'plans' }] },
    }, targetId: 2 },
  })), ['non-tenant']);

  const result = classify({
    url: FIRESTORE_INITIAL_LISTEN_URL,
    body: `secret=${runId}-team-a`,
  });
  assert.deepEqual(result.resourceScopes, ['unscoped']);
  assert.equal(JSON.stringify(result).includes(runId), false);
});

test('phase 9 playwright client retains every scope from multiplexed Firestore targets and rejects disconnected labels', async () => {
  const { classifyFixtureResourceScopes } = await import('../scripts/qa-evidence/phase9/playwright-cli-client.mjs');
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const selfUid = `${runId}-no-team`;
  const messages = [
    {
      database: 'projects/the-squad-v2-staging/databases/(default)',
      addTarget: {
        documents: {
          documents: [`projects/the-squad-v2-staging/databases/(default)/documents/users/${selfUid}`],
        },
        targetId: 1,
      },
      unexpectedSibling: {
        addTarget: {
          documents: {
            documents: [`projects/the-squad-v2-staging/databases/(default)/documents/players/${runId}-foreign-player`],
          },
          targetId: 9,
        },
      },
    },
    {
      database: 'projects/the-squad-v2-staging/databases/(default)',
      addTarget: {
        documents: { documents: [`projects/the-squad-v2-staging/databases/(default)/documents/teams/${runId}-team-a`] },
        targetId: 2,
      },
    },
    {
      database: 'projects/the-squad-v2-staging/databases/(default)',
      addTarget: {
        documents: { documents: [`projects/the-squad-v2-staging/databases/(default)/documents/teams/${runId}-team-b`] },
        targetId: 3,
      },
    },
    {
      database: 'projects/the-squad-v2-staging/databases/(default)',
      addTarget: {
        documents: { documents: [`projects/the-squad-v2-staging/databases/(default)/documents/leagues/${runId}-league`] },
        targetId: 4,
      },
    },
    {
      database: 'projects/the-squad-v2-staging/databases/(default)',
      addTarget: {
        documents: { documents: [`projects/the-squad-v2-staging/databases/(default)/documents/players/${runId}-foreign-player`] },
        targetId: 5,
      },
    },
  ];
  const body = new URLSearchParams({
    headers: FIRESTORE_LISTEN_HEADER_BLOCK,
    count: String(messages.length),
    ofs: '0',
    ...Object.fromEntries(messages.map((message, index) => [`req${index}___data__`, JSON.stringify(message)])),
  }).toString();

  const result = classifyFixtureResourceScopes(producerRaw({
    url: FIRESTORE_INITIAL_LISTEN_URL,
    method: 'POST',
    body,
  }), { runId, alias: 'qa-no-team' });
  assert.deepEqual(result.resourceScopes, [
    'self-account',
    'tenant-team-a',
    'tenant-team-b',
    'tenant-league',
    'foreign-account',
    'unscoped',
  ]);
  assert.deepEqual(result.scopeEvidence, [
    'self-user-document',
    'fixture-team-a-document',
    'fixture-team-b-document',
    'fixture-league-document',
    'foreign-player-resource',
    'unscoped-resource',
  ]);

  const mixedWindow = safeWindow({
    finalPath: '/teams/join',
    finalUrl: `${STAGING_ORIGIN}/teams/join`,
    visibleSentinels: ['Join & Invite'],
    protectedRequests: 1,
    protectedRequestSignals: [{
      targetKind: 'firestore-listen',
      method: 'POST',
      resourceType: 'fetch',
      initiatingFrameUrl: `${STAGING_ORIGIN}/teams/join`,
      ...result,
    }],
  });
  assert.throws(
    () => validateActionWindow(mixedWindow, { resourcePolicy: 'no-team-tenant-isolation' }),
    /Team A tenant resource/i,
  );

  const forgedScalar = safeWindow({
    finalPath: '/teams/join',
    finalUrl: `${STAGING_ORIGIN}/teams/join`,
    visibleSentinels: ['Join & Invite'],
    protectedRequests: 1,
    protectedRequestSignals: [{
      targetKind: 'firestore-listen',
      method: 'POST',
      resourceType: 'fetch',
      initiatingFrameUrl: `${STAGING_ORIGIN}/teams/join`,
      resourceScope: 'self-account',
    }],
  });
  assert.throws(
    () => validateActionWindow(forgedScalar, { resourcePolicy: 'no-team-tenant-isolation' }),
    /closed resource evidence|resource scopes/i,
  );
  assert.throws(
    () => validateActionWindow(safeWindow({
      finalPath: '/teams/join',
      finalUrl: `${STAGING_ORIGIN}/teams/join`,
      visibleSentinels: ['Join & Invite'],
      protectedRequests: 1,
      protectedRequestSignals: [{
        targetKind: 'firestore-listen',
        method: 'POST',
        resourceType: 'fetch',
        initiatingFrameUrl: `${STAGING_ORIGIN}/teams/join`,
        scopeEvidence: ['fixture-team-a-document'],
        resourceScopes: ['self-account'],
      }],
    }), { resourcePolicy: 'no-team-tenant-isolation' }),
    /derived from.*closed resource evidence/i,
  );
});

test('phase 9 playwright client permits only the exact self-bound parent players query', async () => {
  const { classifyFixtureResourceScopes } = await import('../scripts/qa-evidence/phase9/playwright-cli-client.mjs');
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const selfUid = `${runId}-no-team`;
  const url = FIRESTORE_INITIAL_LISTEN_URL;
  const query = where => ({
    database: 'projects/the-squad-v2-staging/databases/(default)',
    addTarget: {
      query: {
        parent: 'projects/the-squad-v2-staging/databases/(default)/documents',
        structuredQuery: {
          from: [{ collectionId: 'players' }],
          ...(where === undefined ? {} : { where }),
        },
      },
      targetId: 3,
    },
  });
  const parentFilter = value => ({
    fieldFilter: {
      field: { fieldPath: 'parentId' },
      op: 'EQUAL',
      value: { stringValue: value },
    },
  });
  const classify = message => classifyFixtureResourceScopes(producerRaw({
    url,
    method: 'POST',
    body: initialListenForm(message),
  }), { runId, alias: 'qa-no-team' });

  assert.deepEqual(classify(query(parentFilter(selfUid))), {
    scopeEvidence: ['self-parent-players-query'],
    resourceScopes: ['self-account'],
  });
  for (const message of [
    query(undefined),
    query(parentFilter(`${runId}-parent-a`)),
    query({
      compositeFilter: {
        op: 'OR',
        filters: [parentFilter(selfUid), parentFilter(`${runId}-parent-a`)],
      },
    }),
    query({
      compositeFilter: {
        op: 'AND',
        filters: [
          parentFilter(selfUid),
          { fieldFilter: { field: { fieldPath: 'teamId' }, op: 'EQUAL', value: { stringValue: `${runId}-team-a` } } },
        ],
      },
    }),
  ]) {
    const result = classify(message);
    assert.equal(result.resourceScopes.includes('self-account'), false, JSON.stringify(result));
    assert.equal(
      result.resourceScopes.includes('foreign-account') || result.resourceScopes.includes('unscoped'),
      true,
      JSON.stringify(result),
    );
  }
  const expanded = classify(query({
    compositeFilter: {
      op: 'AND',
      filters: [
        parentFilter(selfUid),
        { fieldFilter: { field: { fieldPath: 'teamId' }, op: 'EQUAL', value: { stringValue: `${runId}-team-a` } } },
      ],
    },
  }));
  assert.deepEqual(expanded.resourceScopes, ['unscoped']);
});

test('phase 9 Firestore scoping fails closed on malformed schemas and project mismatches', async () => {
  const { classifyFixtureResourceScopes } = await import('../scripts/qa-evidence/phase9/playwright-cli-client.mjs');
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const selfUid = `${runId}-no-team`;
  const database = 'projects/the-squad-v2-staging/databases/(default)';
  const databaseRoot = `${database}/documents`;
  const listenUrl = FIRESTORE_INITIAL_LISTEN_URL;
  const runQueryUrl = 'https://firestore.googleapis.com/v1/projects/the-squad-v2-staging/databases/(default)/documents:runQuery';
  const classify = signal => classifyFixtureResourceScopes(producerRaw(signal), { runId, alias: 'qa-no-team' });
  const form = (...messages) => new URLSearchParams({
    headers: FIRESTORE_LISTEN_HEADER_BLOCK,
    count: String(messages.length),
    ofs: '0',
    ...Object.fromEntries(messages.map((message, index) => [`req${index}___data__`, JSON.stringify(message)])),
  }).toString();
  const selfQuery = {
    parent: databaseRoot,
    structuredQuery: {
      from: [{ collectionId: 'players' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'parentId' },
          op: 'EQUAL',
          value: { stringValue: selfUid },
        },
      },
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
    },
  };
  const addSelf = {
    database,
    addTarget: { query: selfQuery, targetId: 1 },
  };

  const expectUnscoped = signal => {
    const result = classify(signal);
    assert.equal(result.resourceScopes.includes('unscoped'), true, JSON.stringify(result));
    return result;
  };

  expectUnscoped({
    url: `https://firestore.googleapis.com/v1/projects/wrong-project/databases/(default)/documents/users/${selfUid}`,
    method: 'GET',
  });
  expectUnscoped({
    url: `https://firestore.googleapis.com/v1/${databaseRoot}/teams/${runId}-team-a/members`,
    method: 'GET',
  });
  expectUnscoped({
    url: `https://firestore.googleapis.com/v1/${databaseRoot}/users/${selfUid}?hidden=teams%2F${runId}-team-a`,
    method: 'GET',
  });
  expectUnscoped({ url: runQueryUrl, method: 'POST', body: '' });
  expectUnscoped({ url: runQueryUrl, method: 'POST', body: '{}' });
  assert.deepEqual(classify({
    url: runQueryUrl,
    method: 'POST',
    body: JSON.stringify({ structuredQuery: selfQuery.structuredQuery }),
  }), {
    scopeEvidence: ['self-parent-players-query'],
    resourceScopes: ['self-account'],
  });
  expectUnscoped({
    url: 'https://firestore.googleapis.com/v1/projects/wrong-project/databases/(default)/documents:runQuery',
    method: 'POST',
    body: JSON.stringify({ structuredQuery: selfQuery.structuredQuery }),
  });
  expectUnscoped({
    url: runQueryUrl,
    method: 'POST',
    body: JSON.stringify({ structuredQuery: selfQuery.structuredQuery, hidden: { structuredQuery: selfQuery.structuredQuery } }),
  });
  expectUnscoped({
    url: `${runQueryUrl}?hidden=players`,
    method: 'POST',
    body: JSON.stringify({ structuredQuery: selfQuery.structuredQuery }),
  });
  expectUnscoped({ url: listenUrl, method: 'POST', body: '' });
  expectUnscoped({ url: listenUrl, method: 'POST', body: form({ database, removeTarget: '1' }) });
  expectUnscoped({ url: listenUrl, method: 'POST', body: form({ database: 'projects/wrong-project/databases/(default)', removeTarget: 1 }) });
  const hiddenTarget = expectUnscoped({
    url: listenUrl,
    method: 'POST',
    body: form({
      ...addSelf,
      hidden: {
        addTarget: {
          documents: { documents: [`${databaseRoot}/players/${runId}-foreign-player`] },
          targetId: 9,
        },
      },
    }),
  });
  assert.deepEqual(hiddenTarget.resourceScopes, ['self-account', 'unscoped']);
  assert.deepEqual(classify({
    url: listenUrl,
    method: 'POST',
    body: new URLSearchParams({
      headers: FIRESTORE_LISTEN_HEADER_BLOCK,
      count: '1',
      ofs: '0',
      req0___data__: JSON.stringify(addSelf),
    }).toString(),
  }), {
    scopeEvidence: ['self-parent-players-query'],
    resourceScopes: ['self-account'],
  });
  expectUnscoped({
    url: listenUrl,
    method: 'POST',
    body: new URLSearchParams({
      headers: 'x-hidden-target:players\r\n',
      count: '1',
      ofs: '0',
      req0___data__: JSON.stringify(addSelf),
    }).toString(),
  });
  expectUnscoped({
    url: `${FIRESTORE_LISTEN_BASE_URL}?${new URLSearchParams({
      database: 'projects/wrong-project/databases/(default)',
      VER: '8',
      RID: '0',
      CVER: '22',
      zx: 'phase9test',
    }).toString()}`,
    method: 'POST',
    body: form(addSelf),
  });

  expectUnscoped({ url: FIRESTORE_LISTEN_BASE_URL, method: 'GET', body: '' });
  assert.deepEqual(classify({ url: FIRESTORE_BACKCHANNEL_LISTEN_URL, method: 'GET', body: '' }), {
    scopeEvidence: ['firestore-transport-control'],
    resourceScopes: ['transport-control'],
  });
  assert.deepEqual(classify({ url: FIRESTORE_TERMINATE_LISTEN_URL, method: 'POST', body: '' }), {
    scopeEvidence: ['firestore-transport-control'],
    resourceScopes: ['transport-control'],
  });
  assert.deepEqual(classify({
    url: listenUrl,
    method: 'POST',
    body: initialListenForm(),
  }), {
    scopeEvidence: ['firestore-transport-control'],
    resourceScopes: ['transport-control'],
  });
  expectUnscoped({
    url: listenUrl,
    method: 'POST',
    body: new URLSearchParams({ headers: FIRESTORE_LISTEN_HEADER_BLOCK, count: '0', ofs: '0', unexpected: '1' }).toString(),
  });
  expectUnscoped({
    url: `${listenUrl}&unexpected=players`,
    method: 'POST',
    body: initialListenForm(),
  });
  assert.deepEqual(classify({ url: listenUrl, method: 'POST', body: form({ database, removeTarget: 1 }) }), {
    scopeEvidence: ['unscoped-resource'],
    resourceScopes: ['unscoped'],
  });
});

test('phase 9 Firestore scoping accepts only the exact self-parent players query shape', async () => {
  const { classifyFixtureResourceScopes } = await import('../scripts/qa-evidence/phase9/playwright-cli-client.mjs');
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const selfUid = `${runId}-no-team`;
  const database = 'projects/the-squad-v2-staging/databases/(default)';
  const databaseRoot = `${database}/documents`;
  const listenUrl = FIRESTORE_INITIAL_LISTEN_URL;
  const classify = structuredQuery => classifyFixtureResourceScopes(producerRaw({
    url: listenUrl,
    method: 'POST',
    body: new URLSearchParams({
      headers: FIRESTORE_LISTEN_HEADER_BLOCK,
      count: '1',
      ofs: '0',
      req0___data__: JSON.stringify({
        database,
        addTarget: { query: { parent: databaseRoot, structuredQuery }, targetId: 3 },
      }),
    }).toString(),
  }), { runId, alias: 'qa-no-team' });
  const where = {
    fieldFilter: {
      field: { fieldPath: 'parentId' },
      op: 'EQUAL',
      value: { stringValue: selfUid },
    },
  };
  const exact = allDescendants => ({
    from: [{ collectionId: 'players', ...(allDescendants === undefined ? {} : { allDescendants }) }],
    where,
    orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
  });

  for (const value of [exact(undefined), exact(false), { from: [{ collectionId: 'players' }], where }]) {
    assert.deepEqual(classify(value), {
      scopeEvidence: ['self-parent-players-query'],
      resourceScopes: ['self-account'],
    });
  }
  for (const value of [
    exact('false'),
    exact('true'),
    exact(true),
    { ...exact(false), limit: 1 },
    { ...exact(false), offset: 1 },
    { ...exact(false), startAt: { values: [] } },
    { ...exact(false), endAt: { values: [] } },
    { ...exact(false), select: { fields: [{ fieldPath: 'parentId' }] } },
    { ...exact(false), orderBy: [{ field: { fieldPath: 'parentId' }, direction: 'ASCENDING' }] },
    { ...exact(false), unexpected: { where } },
  ]) {
    const result = classify(value);
    assert.deepEqual(result.resourceScopes, ['unscoped'], JSON.stringify(value));
  }
});

test('phase 9 local client derives request evidence from raw transport facts and ignores forged labels', async () => {
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const forgedPageId = `${runId}-forged-page`;
  const rawJoin = {
    ...joinAdminRaw(),
    targetKind: 'firestore-listen',
    scopeEvidence: ['self-parent-players-query'],
    resourceScopes: ['self-account'],
    initiatingFrameUrl: 'https://evil.invalid/admin',
  };
  const transport = createCliTransport(argv => {
    const code = argv[argv.indexOf('run-code') + 1] ?? '';
    if (code.includes('phase9:mark')) return cliResult({ pageId: forgedPageId, sequence: 1 });
    if (code.includes('phase9:sample')) return cliResult({
      pageId: forgedPageId,
      terminalReached: true,
      loadingVisible: false,
      finalUrl: `${STAGING_ORIGIN}/teams/join`,
      finalPath: '/teams/join',
      visibleSentinels: ['Join & Invite'],
      sessionPresent: true,
      protectedRender: false,
      rawRequests: [rawJoin],
      rawResponses: [],
      rawTeamSelections: [],
      protectedRequests: [],
      protectedListenerStarts: [],
      teamSelectionSignals: [],
      relevantHttpResults: [],
      pageErrors: [],
      appConsoleErrors: [],
      unexpectedRequestFailures: [],
      overflow: 0,
      renderPath: '/teams/join',
      renderSentinel: 'Join & Invite',
      redirectReason: 'none',
      renderSignals: [],
    });
    return blankAwareCliResult(argv);
  });
  const client = createPlaywrightCliClient({
    execute: transport.execute,
    wrapperPath: '/safe/playwright_cli.sh',
    fixtureRunId: runId,
  });
  await installSignalRecorder(client, 'local-derivation');
  const result = await observeAction({
    client,
    session: 'local-derivation',
    stage: 'local-derivation',
    terminal: async () => {},
    action: async () => {},
  });
  assert.equal(result.protectedRequests, 1);
  assert.deepEqual(result.protectedRequestSignals[0], {
    targetKind: 'staging-join-admin-api',
    method: 'PATCH',
    resourceType: 'fetch',
    initiatingFrameUrl: RAW_STAGING_FRAME,
    scopeEvidence: ['join-admin-patch'],
    resourceScopes: ['join-admin-lookup'],
  });
  assert.equal(JSON.stringify(result).includes('self-parent-players-query'), false);
  assert.equal(JSON.stringify(result).includes('evil.invalid'), false);
  assert.equal(JSON.stringify(result).includes(runId), false);
  assert.notEqual(result.pageId, forgedPageId);
});

test('phase 9 join-admin lookup requires the exact bodyless authenticated PATCH producer shape', async () => {
  const { classifyFixtureResourceScopes } = await import('../scripts/qa-evidence/phase9/playwright-cli-client.mjs');
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const classify = signal => classifyFixtureResourceScopes(signal, { runId, alias: 'qa-no-team' });
  assert.deepEqual(classify(joinAdminRaw()), {
    scopeEvidence: ['join-admin-patch'],
    resourceScopes: ['join-admin-lookup'],
  });
  const teamA = `${runId}-team-a`;
  for (const raw of [
    joinAdminRaw({ url: `${STAGING_ORIGIN}/api/schools/admins?teamId=${teamA}` }),
    joinAdminRaw({ url: `${STAGING_ORIGIN}/api/schools/admins#${teamA}` }),
    joinAdminRaw({ body: JSON.stringify({ teamId: teamA }) }),
    joinAdminRaw({ headers: { ...JOIN_ADMIN_PRODUCER_HEADERS, 'x-team-id': teamA } }),
    joinAdminRaw({ frameUrl: `${STAGING_ORIGIN}/teams/${teamA}` }),
    joinAdminRaw({ headers: { ...JOIN_ADMIN_PRODUCER_HEADERS, 'x-unapproved': 'present' } }),
    joinAdminRaw({ resourceType: 'document' }),
    joinAdminRaw({ method: 'POST' }),
    joinAdminRaw({ url: `https://evil.invalid/api/schools/admins` }),
    joinAdminRaw({ url: `${STAGING_ORIGIN}/api/schools/admins/claim` }),
    joinAdminRaw({ headers: { accept: '*/*' } }),
  ]) {
    assert.deepEqual(classify(raw).resourceScopes, ['unscoped'], JSON.stringify(raw));
  }
});

test('phase 9 Firestore producer contract enforces exact depths headers and resume state', async () => {
  const { classifyFixtureResourceScopes } = await import('../scripts/qa-evidence/phase9/playwright-cli-client.mjs');
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const selfUid = `${runId}-no-team`;
  const classify = signal => classifyFixtureResourceScopes(signal, { runId, alias: 'qa-no-team' });
  const documentUrl = path => `https://firestore.googleapis.com/v1/${FIRESTORE_DATABASE}/documents/${path}`;
  const document = (path, overrides = {}) => firestoreRaw({
    url: documentUrl(path),
    method: 'GET',
    headers: FIRESTORE_PRODUCER_HEADERS,
    body: '',
    ...overrides,
  });
  assert.deepEqual(classify(document(`users/${selfUid}/teamMemberships/member-a`)).resourceScopes, ['self-account']);
  assert.deepEqual(classify(document('plans/reference-plan')).resourceScopes, ['non-tenant']);
  for (const raw of [
    document(`users/${selfUid}/teamMemberships/member-a/audit/log-1`),
    document('plans/reference-plan/versions/v1'),
    document(`users/${selfUid}`, { headers: { ...FIRESTORE_PRODUCER_HEADERS, 'google-cloud-resource-prefix': 'projects/wrong/databases/(default)' } }),
    document(`users/${selfUid}`, { headers: { ...FIRESTORE_PRODUCER_HEADERS, 'x-goog-request-params': 'project_id=wrong' } }),
    document(`users/${selfUid}`, { headers: { ...FIRESTORE_PRODUCER_HEADERS, 'content-type': 'application/json' } }),
  ]) assert.deepEqual(classify(raw).resourceScopes, ['unscoped'], JSON.stringify(raw));

  const selfTarget = extra => ({
    database: FIRESTORE_DATABASE,
    addTarget: {
      documents: { documents: [`${FIRESTORE_DATABASE}/documents/users/${selfUid}`] },
      targetId: 1,
      ...extra,
    },
  });
  const listen = (message, headers = FIRESTORE_LISTEN_HEADER_BLOCK) => firestoreRaw({
    body: new URLSearchParams({
      headers,
      count: '1',
      ofs: '0',
      req0___data__: JSON.stringify(message),
    }).toString(),
  });
  assert.deepEqual(classify(listen(selfTarget({ resumeToken: 'AQID', expectedCount: 1 }))).resourceScopes, ['self-account']);
  assert.deepEqual(classify(listen(selfTarget({ readTime: '2026-08-25T14:00:00.000000000Z', expectedCount: 1 }))).resourceScopes, ['self-account']);
  for (const raw of [
    listen(selfTarget({ resumeToken: 'AQID', readTime: '2026-08-25T14:00:00.000000000Z' })),
    listen(selfTarget({ expectedCount: 1 })),
    listen(selfTarget({ resumeToken: '', expectedCount: 1 })),
    listen(selfTarget(), FIRESTORE_LISTEN_HEADER_BLOCK.replace(FIRESTORE_DATABASE, 'projects/wrong/databases/(default)')),
    listen(selfTarget(), FIRESTORE_LISTEN_HEADER_BLOCK.replace('project_id=the-squad-v2-staging', 'project_id=wrong')),
    listen(selfTarget(), FIRESTORE_LISTEN_HEADER_BLOCK.replace('content-type:text/plain', 'content-type:application/json')),
  ]) assert.deepEqual(classify(raw).resourceScopes, ['unscoped'], JSON.stringify(raw));
});

test('phase 9 protected URLs cannot be downgraded by resourceType document', () => {
  for (const url of [
    `${STAGING_ORIGIN}/api/teams/chat?teamId=example`,
    `https://firestore.googleapis.com/v1/${FIRESTORE_DATABASE}/documents/teams/example`,
  ]) assert.equal(isProtectedResource({ url, method: 'GET', resourceType: 'document' }), true, url);
});

test('phase 9 fixture leak guard detects percent and double-percent encoded fixture identifiers', () => {
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const encoded = runId.replaceAll('-', '%2D');
  const doubleEncoded = encoded.replaceAll('%', '%25');
  for (const value of [
    encoded,
    doubleEncoded,
    `${STAGING_ORIGIN}/teams/${encoded}`,
    { pageId: `page-${doubleEncoded}` },
    { nested: { finalPath: `/players/${doubleEncoded}` } },
  ]) assert.throws(() => assertNoFixtureIdentifierLeak(value), /fixture identifier/i);
});

test('phase 9 public render observations reject every string outside the closed source-backed enums', async () => {
  assert.throws(() => validateActionWindow(safeWindow({
    pageId: 'provider-controlled-page',
  })), /page.?id|page identifier|closed/i);
  assert.throws(() => validateActionWindow(safeWindow({
    visibleSentinels: ['Family Overview', 'unknown terminal'],
  })), /closed|sentinel/i);
  assert.throws(() => validateActionWindow(safeWindow({
    renderSignals: [{ kind: 'heading', pathname: '/private-secret', sentinel: 'Dashboard' }],
    protectedRender: true,
  })), /closed|render path/i);

  const base = {
    pageId: 'page-a',
    terminalReached: true,
    loadingVisible: false,
    finalUrl: `${STAGING_ORIGIN}/teams/join`,
    finalPath: '/teams/join',
    visibleSentinels: ['Join & Invite'],
    sessionPresent: true,
    protectedRender: false,
    rawRequests: [],
    rawResponses: [],
    rawTeamSelections: [],
    pageErrors: [],
    appConsoleErrors: [],
    unexpectedRequestFailures: [],
    overflow: 0,
    renderPath: '/teams/join',
    renderSentinel: 'Join & Invite',
    redirectReason: 'none',
    renderSignals: [],
  };
  const cases = [
    sample => { sample.visibleSentinels = ['Bearer header.payload.signature']; },
    sample => { sample.renderSentinel = 'unknown terminal'; },
    sample => { sample.renderSignals = [{ kind: 'heading', pathname: '/teams/join', sentinel: 'unknown heading' }]; },
    sample => { sample.renderSignals = [{ kind: 'status', pathname: '/login', sentinel: 'unknown status' }]; },
    sample => { sample.renderSignals = [{ kind: 'heading', pathname: '/private-secret', sentinel: 'Dashboard' }]; },
  ];

  for (const [index, mutate] of cases.entries()) {
    const raw = structuredClone(base);
    mutate(raw);
    const transport = createCliTransport(argv => {
      const code = argv[argv.indexOf('run-code') + 1] ?? '';
      if (code.includes('phase9:mark')) return cliResult({ pageId: raw.pageId, sequence: 1 });
      if (code.includes('phase9:sample')) return cliResult(raw);
      return blankAwareCliResult(argv);
    });
    const client = createPlaywrightCliClient({ execute: transport.execute, wrapperPath: '/safe/playwright_cli.sh' });
    await installSignalRecorder(client, `closed-render-${index}`);
    await assert.rejects(observeAction({
      client,
      session: `closed-render-${index}`,
      stage: `closed-render-${index}`,
      terminal: async () => {},
      action: async () => {},
    }), /closed|sentinel|render path|credential/i, `case ${index}`);
  }
});

test('phase 9 public evidence scanner rejects malformed percent layers and credential-shaped strings', () => {
  const encodedRunId = 'qa%252Dphase7%252D20260825T140000Z%252Dab12cd34ef56';
  for (const value of [
    `prefix%GG${encodedRunId}`,
    `prefix%${encodedRunId}`,
    '%25GGqa%25252Dphase7%25252D20260825T140000Z%25252Dab12cd34ef56',
  ]) assert.throws(() => assertNoFixtureIdentifierLeak(value), /percent|fixture identifier/i, value);

  for (const value of [
    'Bearer header.payload.signature',
    'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJlLWJ5dGVz',
    'api_key=abcdefghijklmnopqrstuvwx',
    'password:correct-horse-battery-staple',
  ]) assert.throws(() => assertNoFixtureIdentifierLeak({ evidence: value }), /credential/i, value);
});

test('phase 9 percent scanning fails closed at the decode budget without rejecting literal prose percentages', () => {
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const encodeLayers = (value, layers) => {
    let encoded = value.replaceAll('-', '%2D');
    for (let index = 1; index < layers; index += 1) encoded = encoded.replaceAll('%', '%25');
    return encoded;
  };

  for (const layers of [5, 6, 128]) {
    const encoded = encodeLayers(runId, layers);
    assert.throws(
      () => assertNoFixtureIdentifierLeak({ evidence: encoded }),
      /percent|decod.*depth|fixture identifier/i,
      `${layers} encoded layers must fail closed`,
    );
  }
  for (const value of ['coverage is 100% complete', 'coverage: 100%']) {
    assert.doesNotThrow(() => assertNoFixtureIdentifierLeak({ evidence: value }), value);
  }
  for (const value of ['bad%GG', 'bad%2G', 'bad%G2', 'bad%A']) {
    assert.throws(() => assertNoFixtureIdentifierLeak({ evidence: value }), /percent/i, value);
  }
});

test('phase 9 protected producers require exact canonical frame origin and referrer provenance', async () => {
  const { classifyFixtureResourceScopes } = await import('../scripts/qa-evidence/phase9/playwright-cli-client.mjs');
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const selfUid = `${runId}-no-team`;
  const databaseRoot = `${FIRESTORE_DATABASE}/documents`;
  const selfListen = firestoreRaw({
    body: initialListenForm({
      database: FIRESTORE_DATABASE,
      addTarget: {
        query: {
          parent: databaseRoot,
          structuredQuery: {
            from: [{ collectionId: 'players' }],
            where: {
              fieldFilter: {
                field: { fieldPath: 'parentId' }, op: 'EQUAL', value: { stringValue: selfUid },
              },
            },
          },
        },
        targetId: 1,
      },
    }),
  });
  const classify = raw => classifyFixtureResourceScopes(raw, { runId, alias: 'qa-no-team' }).resourceScopes;

  for (const raw of [
    joinAdminRaw({ frameUrl: `${STAGING_ORIGIN}/family` }),
    joinAdminRaw({ frameUrl: 'https://evil.invalid/teams/join' }),
    joinAdminRaw({ headers: { ...JOIN_ADMIN_PRODUCER_HEADERS, origin: 'https://evil.invalid' } }),
    joinAdminRaw({ headers: { ...JOIN_ADMIN_PRODUCER_HEADERS, referer: 'https://evil.invalid/teams/join' } }),
    joinAdminRaw({ headers: { ...JOIN_ADMIN_PRODUCER_HEADERS, accept: 'application/json' } }),
    joinAdminRaw({ headers: { ...JOIN_ADMIN_PRODUCER_HEADERS, 'x-extra': 'present' } }),
    { ...selfListen, frameUrl: `${STAGING_ORIGIN}/family` },
    { ...selfListen, frameUrl: 'https://evil.invalid/teams/join' },
    { ...selfListen, headers: { ...selfListen.headers, origin: 'https://evil.invalid' } },
    { ...selfListen, headers: { ...selfListen.headers, referer: 'https://evil.invalid/' } },
    { ...selfListen, headers: Object.fromEntries(Object.entries(selfListen.headers).filter(([name]) => name !== 'accept')) },
    { ...selfListen, headers: { ...selfListen.headers, 'x-extra': 'present' } },
  ]) assert.deepEqual(classify(raw), ['unscoped'], JSON.stringify(raw));
});

test('phase 9 Listen target IDs are stateful, private, removable, and reusable within one producer body', async () => {
  const { classifyFixtureResourceScopes } = await import('../scripts/qa-evidence/phase9/playwright-cli-client.mjs');
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const databaseRoot = `${FIRESTORE_DATABASE}/documents`;
  const selfTarget = targetId => ({
    database: FIRESTORE_DATABASE,
    addTarget: {
      documents: { documents: [`${databaseRoot}/users/${runId}-no-team`] },
      targetId,
    },
  });
  const removeTarget = targetId => ({ database: FIRESTORE_DATABASE, removeTarget: targetId });
  const classify = (...messages) => classifyFixtureResourceScopes(firestoreRaw({
    body: initialListenForm(...messages),
    listenState: { activeTargetIds: [999] },
  }), { runId, alias: 'qa-no-team' });

  assert.deepEqual(classify(removeTarget(999)).resourceScopes, ['unscoped']);
  assert.deepEqual(classify(selfTarget(1), selfTarget(1)).resourceScopes, ['self-account', 'unscoped']);
  assert.deepEqual(
    classify(selfTarget(1), removeTarget(1), selfTarget(1)).resourceScopes,
    ['self-account', 'transport-control'],
  );
});

test('phase 9 Listen state changes commit only after a complete valid producer request', async () => {
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const databaseRoot = `${FIRESTORE_DATABASE}/documents`;
  const selfTarget = targetId => ({
    database: FIRESTORE_DATABASE,
    addTarget: {
      documents: { documents: [`${databaseRoot}/users/${runId}-no-team`] },
      targetId,
    },
  });
  const malformedTarget = targetId => ({
    database: FIRESTORE_DATABASE,
    addTarget: { documents: { documents: [] }, targetId },
  });
  const removeTarget = targetId => ({ database: FIRESTORE_DATABASE, removeTarget: targetId });
  const bodies = [
    initialListenForm(malformedTarget(1)),
    initialListenForm(removeTarget(1)),
    initialListenForm(selfTarget(2), selfTarget(2)),
    initialListenForm(removeTarget(2)),
    initialListenForm(selfTarget(3)),
    initialListenForm(removeTarget(3), malformedTarget(4)),
    initialListenForm(removeTarget(3)),
    initialListenForm(removeTarget(4)),
  ];
  const expectedScopes = [
    ['unscoped'],
    ['unscoped'],
    ['self-account', 'unscoped'],
    ['unscoped'],
    ['self-account'],
    ['transport-control', 'unscoped'],
    ['transport-control'],
    ['unscoped'],
  ];
  let sequence = 0;
  let sampleIndex = 0;
  const transport = createCliTransport(argv => {
    const code = argv[argv.indexOf('run-code') + 1] ?? '';
    if (code.includes('phase9:mark')) return cliResult({ pageId: 'page-a', sequence: ++sequence });
    if (code.includes('phase9:sample')) return cliResult({
      pageId: 'page-a', terminalReached: true, loadingVisible: false,
      finalUrl: `${STAGING_ORIGIN}/teams/join`, finalPath: '/teams/join',
      visibleSentinels: ['Join & Invite'], sessionPresent: true, protectedRender: false,
      rawRequests: [firestoreRaw({ body: bodies[sampleIndex++] })],
      rawResponses: [], rawTeamSelections: [], pageErrors: [], appConsoleErrors: [],
      unexpectedRequestFailures: [], overflow: 0, renderPath: '/teams/join', renderSentinel: 'Join & Invite',
      redirectReason: 'none', renderSignals: [],
    });
    return blankAwareCliResult(argv);
  });
  const client = createPlaywrightCliClient({
    execute: transport.execute, wrapperPath: '/safe/playwright_cli.sh', fixtureRunId: runId,
  });
  await installSignalRecorder(client, 'transactional-listen');
  for (const expected of expectedScopes) {
    const result = await observeAction({
      client, session: 'transactional-listen', stage: 'transactional-listen',
      terminal: async () => {}, action: async () => {},
    });
    assert.deepEqual(result.protectedRequestSignals[0].resourceScopes, expected);
  }
});

test('phase 9 client owns Listen target state across action windows and resets it on navigation', async () => {
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const databaseRoot = `${FIRESTORE_DATABASE}/documents`;
  const selfTarget = targetId => ({
    database: FIRESTORE_DATABASE,
    addTarget: {
      documents: { documents: [`${databaseRoot}/users/${runId}-no-team`] },
      targetId,
    },
  });
  const removeTarget = targetId => ({ database: FIRESTORE_DATABASE, removeTarget: targetId });
  const messages = [selfTarget(1), selfTarget(1), removeTarget(1), selfTarget(1), selfTarget(1)];
  let sequence = 0;
  let sampleIndex = 0;
  let navigationGeneration = 0;
  const transport = createCliTransport(argv => {
    const code = argv[argv.indexOf('run-code') + 1] ?? '';
    if (code.includes('phase9:mark')) return cliResult({ pageId: 'page-a', sequence: ++sequence });
    if (code.includes('phase9:sample')) {
      const message = messages[sampleIndex++];
      return cliResult({
        pageId: 'page-a', terminalReached: true, loadingVisible: false,
        finalUrl: `${STAGING_ORIGIN}/teams/join`, finalPath: '/teams/join',
        visibleSentinels: ['Join & Invite'], sessionPresent: true, protectedRender: false,
        rawRequests: [firestoreRaw({
          body: initialListenForm(message),
          listenState: { activeTargetIds: [999] },
          navigationGeneration,
        })],
        rawResponses: [], rawTeamSelections: [], pageErrors: [], appConsoleErrors: [],
        unexpectedRequestFailures: [], overflow: 0, renderPath: '/teams/join', renderSentinel: 'Join & Invite',
        redirectReason: 'none', renderSignals: [], navigationGeneration,
      });
    }
    return blankAwareCliResult(argv);
  });
  const client = createPlaywrightCliClient({
    execute: transport.execute, wrapperPath: '/safe/playwright_cli.sh', fixtureRunId: runId,
  });
  await installSignalRecorder(client, 'stateful-listen');
  const capture = () => observeAction({
    client, session: 'stateful-listen', stage: 'stateful-listen', terminal: async () => {}, action: async () => {},
  });

  assert.deepEqual((await capture()).protectedRequestSignals[0].resourceScopes, ['self-account']);
  assert.deepEqual((await capture()).protectedRequestSignals[0].resourceScopes, ['self-account', 'unscoped']);
  assert.deepEqual((await capture()).protectedRequestSignals[0].resourceScopes, ['transport-control']);
  assert.deepEqual((await capture()).protectedRequestSignals[0].resourceScopes, ['self-account']);
  await client.goto('stateful-listen', 'about:blank');
  navigationGeneration += 1;
  assert.deepEqual((await capture()).protectedRequestSignals[0].resourceScopes, ['self-account']);
});

test('phase 9 client binds Listen state to recorder navigation generation for every public run-code path', async () => {
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const databaseRoot = `${FIRESTORE_DATABASE}/documents`;
  const selfTarget = targetId => ({
    database: FIRESTORE_DATABASE,
    addTarget: {
      documents: { documents: [`${databaseRoot}/users/${runId}-no-team`] },
      targetId,
    },
  });
  const removeTarget = targetId => ({ database: FIRESTORE_DATABASE, removeTarget: targetId });
  const queued = [];
  let generation = 0;
  let sequence = 0;
  const transport = createCliTransport(argv => {
    const code = argv[argv.indexOf('run-code') + 1] ?? '';
    if (code.includes('phase9:mark')) return cliResult({
      pageId: 'page-a', sequence: ++sequence, navigationGeneration: generation,
    });
    if (code.includes('phase9:sample')) {
      const message = queued.shift();
      return cliResult({
        pageId: 'page-a', terminalReached: true, loadingVisible: false,
        finalUrl: `${STAGING_ORIGIN}/teams/join`, finalPath: '/teams/join',
        visibleSentinels: ['Join & Invite'], sessionPresent: true, protectedRender: false,
        rawRequests: [firestoreRaw({
          body: initialListenForm(message),
          navigationGeneration: generation,
        })],
        rawResponses: [], rawTeamSelections: [], pageErrors: [], appConsoleErrors: [],
        unexpectedRequestFailures: [], overflow: 0, renderPath: '/teams/join', renderSentinel: 'Join & Invite',
        redirectReason: 'none', renderSignals: [], navigationGeneration: generation,
      });
    }
    return blankAwareCliResult(argv);
  });
  const client = createPlaywrightCliClient({
    execute: transport.execute, wrapperPath: '/safe/playwright_cli.sh', fixtureRunId: runId,
  });
  await installSignalRecorder(client, 'generation-listen');
  const capture = async message => {
    queued.push(message);
    const result = await observeAction({
      client, session: 'generation-listen', stage: 'generation-listen',
      terminal: async () => {}, action: async () => {},
    });
    return result.protectedRequestSignals[0].resourceScopes;
  };

  assert.deepEqual(await capture(selfTarget(10)), ['self-account']);
  await client.runCode('generation-listen', 'async (page) => page.evaluate(() => { document.body.dataset.noNavigation = "true"; })');
  assert.deepEqual(await capture(removeTarget(10)), ['transport-control'], 'DOM-only run-code must retain state');

  for (const [targetId, source] of [
    [11, 'async (page) => page.goto("about:blank")'],
    [12, 'async (page) => page.click("a")'],
    [13, 'async (page) => page.reload()'],
    [14, 'async (page) => page.evaluate(() => { location.href = "about:blank"; })'],
  ]) {
    assert.deepEqual(await capture(selfTarget(targetId)), ['self-account']);
    await client.runCode('generation-listen', source);
    generation += 1;
    assert.deepEqual(
      await capture(removeTarget(targetId)),
      ['unscoped'],
      `navigation generation must reset target ${targetId}`,
    );
  }
});

test('phase 9 real recorder increments navigation generation for goto click reload and location changes', { timeout: LOCAL_REAL_CHROME_EXTENDED_TEST_TIMEOUT_MS }, async () => {
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const databaseRoot = `${FIRESTORE_DATABASE}/documents`;
  const selfTarget = targetId => ({
    database: FIRESTORE_DATABASE,
    addTarget: {
      documents: { documents: [`${databaseRoot}/users/${runId}-no-team`] },
      targetId,
    },
  });
  const removeTarget = targetId => ({ database: FIRESTORE_DATABASE, removeTarget: targetId });
  const client = createPlaywrightCliClient({
    fixtureRunId: runId, timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS,
  });
  const request = async (session, message) => observeAction({
    client,
    session,
    stage: 'real-navigation-generation',
    terminal: async () => {},
    action: () => client.runCode(session, `async (page) => {
      await page.evaluate(async ({ url, body }) => {
        await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body,
        });
      }, {
        url: ${JSON.stringify(FIRESTORE_INITIAL_LISTEN_URL)},
        body: ${JSON.stringify(initialListenForm(message))},
      });
      await page.waitForTimeout(50);
    }`),
  });
  const navigate = async (session, source) => client.runCode(session, source);
  try {
    const session = 'phase9-real-navigation-generation';
    await installSignalRecorder(client, session);
    await client.runCode(session, `async (page) => {
      await page.route(${JSON.stringify(`${STAGING_ORIGIN}/**`)}, route => route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/html' },
        body: '<!doctype html><h1>Join & Invite</h1><a id="same-url" href="/teams/join">same</a>',
      }));
      await page.route('https://firestore.googleapis.com/**', route => route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': ${JSON.stringify(STAGING_ORIGIN)},
          'content-type': 'application/json',
        },
        body: '{}',
      }));
      await page.goto(${JSON.stringify(`${STAGING_ORIGIN}/teams/join`)});
    }`);

    const retained = await request(session, selfTarget(90));
    assert.deepEqual(retained.protectedRequestSignals[0].resourceScopes, ['self-account']);
    await navigate(session, 'async (page) => page.evaluate(() => { document.body.dataset.noNavigation = "true"; })');
    assert.deepEqual((await request(session, removeTarget(90))).protectedRequestSignals[0].resourceScopes, ['transport-control']);

    const cases = [
      [91, `async (page) => page.goto(${JSON.stringify(`${STAGING_ORIGIN}/teams/join`)})`],
      [92, 'async (page) => Promise.all([page.waitForNavigation(), page.click("#same-url")])'],
      [93, 'async (page) => page.reload()'],
      [94, `async (page) => Promise.all([page.waitForNavigation(), page.evaluate(url => { location.href = url; }, ${JSON.stringify(`${STAGING_ORIGIN}/teams/join`)} )])`],
    ];
    for (const [targetId, source] of cases) {
      assert.deepEqual((await request(session, selfTarget(targetId))).protectedRequestSignals[0].resourceScopes, ['self-account']);
      await navigate(session, source);
      assert.deepEqual(
        (await request(session, removeTarget(targetId))).protectedRequestSignals[0].resourceScopes,
        ['unscoped'],
      );
    }
  } finally {
    await closeAndVerifyBrowsers(client);
  }
  assert.deepEqual(await client.listBrowsers(), { browsers: [] });
});

test('phase 9 Listen parser rejects enormous counts and integer fields without throwing or allocating', async () => {
  const { classifyFixtureResourceScopes } = await import('../scripts/qa-evidence/phase9/playwright-cli-client.mjs');
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const classify = raw => classifyFixtureResourceScopes(firestoreRaw(raw), { runId, alias: 'qa-no-team' });
  const bodies = [
    'headers=x&count=4294967295&ofs=0',
    'headers=x&count=9007199254740991&ofs=0',
    initialListenForm({
      database: FIRESTORE_DATABASE,
      addTarget: {
        documents: { documents: [`${FIRESTORE_DATABASE}/documents/users/${runId}-no-team`] },
        targetId: Number.MAX_SAFE_INTEGER,
      },
    }),
    initialListenForm({
      database: FIRESTORE_DATABASE,
      addTarget: {
        documents: { documents: [`${FIRESTORE_DATABASE}/documents/users/${runId}-no-team`] },
        targetId: 1,
        resumeToken: 'AQID',
        expectedCount: Number.MAX_SAFE_INTEGER,
      },
    }),
  ];
  for (const body of bodies) {
    let result;
    assert.doesNotThrow(() => { result = classify({ body }); }, body.slice(0, 80));
    assert.deepEqual(result.resourceScopes, ['unscoped']);
  }
});

test('phase 9 client fails closed when claimed evidence lacks raw request material', async () => {
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const transport = createCliTransport(argv => {
    const code = argv[argv.indexOf('run-code') + 1] ?? '';
    if (code.includes('phase9:mark')) return cliResult({ pageId: 'page-a', sequence: 1 });
    if (code.includes('phase9:sample')) return cliResult({
      pageId: 'page-a',
      terminalReached: true,
      loadingVisible: false,
      finalUrl: `${STAGING_ORIGIN}/teams/join`,
      finalPath: '/teams/join',
      visibleSentinels: ['Join & Invite'],
      sessionPresent: true,
      protectedRender: false,
      rawRequests: [{
        targetKind: 'firestore-listen',
        method: 'POST',
        resourceType: 'fetch',
        initiatingFrameUrl: `${STAGING_ORIGIN}/teams/join`,
        scopeEvidence: ['self-parent-players-query'],
        resourceScopes: ['self-account'],
      }],
      rawResponses: [],
      rawTeamSelections: [],
      protectedRequests: [],
      protectedListenerStarts: [],
      teamSelectionSignals: [],
      relevantHttpResults: [],
      pageErrors: [],
      appConsoleErrors: [],
      unexpectedRequestFailures: [],
      overflow: 0,
      renderPath: '/teams/join',
      renderSentinel: 'Join & Invite',
      redirectReason: 'none',
      renderSignals: [],
    });
    return blankAwareCliResult(argv);
  });
  const client = createPlaywrightCliClient({
    execute: transport.execute,
    wrapperPath: '/safe/playwright_cli.sh',
    fixtureRunId: runId,
  });
  await installSignalRecorder(client, 'unsigned-recorder');
  const derived = await observeAction({
    client,
    session: 'unsigned-recorder',
    stage: 'unsigned-recorder',
    terminal: async () => {},
    action: async () => {},
  });
  assert.equal(derived.protectedRequests, 1);
  assert.deepEqual(derived.protectedRequestSignals[0].scopeEvidence, ['unscoped-resource']);
  assert.deepEqual(derived.protectedRequestSignals[0].resourceScopes, ['unscoped']);
  assert.equal(JSON.stringify(derived).includes('self-parent-players-query'), false);

  const base = {
    method: 'POST',
    resourceType: 'fetch',
    initiatingFrameUrl: `${STAGING_ORIGIN}/teams/join`,
    resourceScopes: ['self-account'],
  };
  assert.throws(() => validateResourceSignal({
    ...base,
    targetKind: 'firestore-document',
    scopeEvidence: ['self-parent-players-query'],
  }), /document.*query|query.*document|target.*evidence/i);
  assert.throws(() => validateResourceSignal({
    ...base,
    targetKind: 'firestore-run-query',
    scopeEvidence: ['self-user-document'],
  }), /query.*document|document.*query|target.*evidence/i);
  assert.throws(() => validateResourceSignal({
    ...base,
    targetKind: 'firestore-document',
    scopeEvidence: ['firestore-transport-control'],
    resourceScopes: ['transport-control'],
  }), /transport.*listener|target.*evidence/i);
});

test('phase 9 real recorder returns raw request facts for local classification only', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const selfUid = `${runId}-no-team`;
  const database = 'projects/the-squad-v2-staging/databases/(default)';
  const url = FIRESTORE_INITIAL_LISTEN_URL;
  const body = new URLSearchParams({
    headers: FIRESTORE_LISTEN_HEADER_BLOCK,
    count: '1',
    ofs: '0',
    req0___data__: JSON.stringify({
      database,
      addTarget: {
        query: {
          parent: `${database}/documents`,
          structuredQuery: {
            from: [{ collectionId: 'players' }],
            where: {
              fieldFilter: {
                field: { fieldPath: 'parentId' },
                op: 'EQUAL',
                value: { stringValue: selfUid },
              },
            },
            orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
          },
        },
        targetId: 3,
      },
    }),
  }).toString();
  const client = createPlaywrightCliClient({
    fixtureRunId: runId, timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS,
  });
  try {
    await installSignalRecorder(client, 'phase9-sealed-recorder');
    await client.goto('phase9-sealed-recorder', 'data:text/html,<title>sealed-recorder</title>');
    const result = await observeAction({
      client,
      session: 'phase9-sealed-recorder',
      stage: 'sealed-recorder-request',
      terminal: async () => {},
      action: () => client.runCode('phase9-sealed-recorder', `async (page) => {
        const url = ${JSON.stringify(url)};
        const body = ${JSON.stringify(body)};
        await page.route(url, route => route.fulfill({
          status: 200,
          headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
          body: '{}',
        }));
        await page.evaluate(async ({ url, body }) => {
          try {
            await fetch(url, {
              method: 'POST',
              headers: { 'content-type': 'application/x-www-form-urlencoded' },
              body,
            });
          } catch {
            // The route is locally fulfilled; browser CORS behavior does not affect request capture.
          }
        }, { url, body });
        await page.waitForTimeout(100);
      }`),
    });
    assert.equal(result.protectedRequests, 1, JSON.stringify(result));
    assert.equal(result.protectedListenerStarts, 1, JSON.stringify(result));
    assert.deepEqual(result.protectedRequestSignals[0], {
      targetKind: 'firestore-listen',
      method: 'POST',
      resourceType: 'fetch',
      initiatingFrameUrl: 'data:',
      scopeEvidence: ['unscoped-resource'],
      resourceScopes: ['unscoped'],
    });
    assert.deepEqual(result.listenerSignals[0], result.protectedRequestSignals[0]);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes('rawRequests'), false);
    assert.equal(serialized.includes('headers'), false);
    assert.equal(serialized.includes('body'), false);
    assert.equal(serialized.includes(url), false);
    assert.equal(serialized.includes(runId), false);
  } finally {
    await closeAndVerifyBrowsers(client);
  }
  assert.deepEqual(await client.listBrowsers(), { browsers: [] });
});

test('phase 9 client closes or rejects every provider-controlled fixture literal before return', async () => {
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const literals = [runId, `${runId}-team-a`, `${runId}-player-youth-active`, `${runId}-no-team`];
  const base = {
    pageId: 'page-a',
    terminalReached: true,
    loadingVisible: false,
    finalUrl: `${STAGING_ORIGIN}/teams/join`,
    finalPath: '/teams/join',
    visibleSentinels: ['Join & Invite'],
    sessionPresent: true,
    protectedRender: false,
    rawRequests: [],
    rawResponses: [],
    rawTeamSelections: [],
    protectedRequests: [],
    protectedListenerStarts: [],
    teamSelectionSignals: [],
    relevantHttpResults: [],
    pageErrors: [],
    appConsoleErrors: [],
    unexpectedRequestFailures: [],
    overflow: 0,
    renderPath: '/teams/join',
    renderSentinel: 'Join & Invite',
    redirectReason: 'none',
    renderSignals: [],
  };
  const cases = [
    sample => { sample.pageId = literals[0]; },
    sample => { sample.finalUrl = `${STAGING_ORIGIN}/teams/${literals[1]}?uid=${literals[3]}`; },
    sample => { sample.finalPath = `/teams/${literals[1]}`; },
    sample => { sample.visibleSentinels = [literals[2]]; },
    sample => { sample.renderSignals = [{ kind: 'heading', pathname: '/teams/join', sentinel: literals[3] }]; },
    sample => { sample.renderSignals = [{ kind: 'heading', pathname: `/players/${literals[2]}`, sentinel: 'Dashboard' }]; },
    sample => { sample.renderPath = `/teams/${literals[1]}`; },
    sample => { sample.renderSentinel = literals[0]; },
    sample => {
      sample.protectedRequests = [{
        targetKind: 'staging-protected-api', method: literals[0], resourceType: 'fetch',
        initiatingFrameUrl: `${STAGING_ORIGIN}/teams/join`,
        scopeEvidence: ['unscoped-resource'], resourceScopes: ['unscoped'],
      }];
    },
    sample => {
      sample.protectedRequests = [{
        targetKind: 'staging-protected-api', method: 'GET', resourceType: literals[2],
        initiatingFrameUrl: `${STAGING_ORIGIN}/teams/join`,
        scopeEvidence: ['unscoped-resource'], resourceScopes: ['unscoped'],
      }];
    },
  ];

  for (const [index, mutate] of cases.entries()) {
    const raw = structuredClone(base);
    mutate(raw);
    assert.equal(literals.some(literal => JSON.stringify(raw).includes(literal)), true, `raw case ${index}`);
    const transport = createCliTransport(argv => {
      const code = argv[argv.indexOf('run-code') + 1] ?? '';
      if (code.includes('phase9:mark')) return cliResult({ pageId: raw.pageId, sequence: 1 });
      if (code.includes('phase9:sample')) return cliResult(raw);
      return blankAwareCliResult(argv);
    });
    const client = createPlaywrightCliClient({
      execute: transport.execute,
      wrapperPath: '/safe/playwright_cli.sh',
      fixtureRunId: runId,
    });
    await installSignalRecorder(client, `fixture-literal-${index}`);
    try {
      const result = await observeAction({
        client,
        session: `fixture-literal-${index}`,
        stage: `fixture-literal-${index}`,
        terminal: async () => {},
        action: async () => {},
      });
      const serialized = JSON.stringify(result);
      for (const literal of literals) assert.equal(serialized.includes(literal), false, `case ${index}: ${literal}`);
    } catch (error) {
      assert.match(error.message, /fixture identifier|closed source-backed/i, `case ${index}`);
    }
  }
});

test('phase 9 client results action summaries and ledger rows never expose fixture identifiers', async () => {
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const fixtureLiterals = [
    runId,
    `${runId}-team-a`,
    `${runId}-team-b`,
    `${runId}-player-youth-active`,
    `${runId}-no-team`,
  ];
  const transport = createCliTransport(argv => {
    const code = argv[argv.indexOf('run-code') + 1] ?? '';
    if (code.includes('phase9:mark')) return cliResult({ pageId: 'page-a', sequence: 1 });
    if (code.includes('phase9:sample')) return cliResult({
      pageId: 'page-a',
      terminalReached: true,
      loadingVisible: false,
      finalUrl: `${STAGING_ORIGIN}/teams/${runId}-team-a?playerId=${runId}-player-youth-active`,
      finalPath: `/teams/${runId}-team-a`,
      visibleSentinels: ['Join & Invite'],
      sessionPresent: true,
      protectedRender: false,
      rawRequests: [],
      rawResponses: [],
      rawTeamSelections: [],
      protectedRequests: [],
      protectedListenerStarts: [],
      teamSelectionSignals: [],
      relevantHttpResults: [],
      pageErrors: [],
      appConsoleErrors: [],
      unexpectedRequestFailures: [],
      overflow: 0,
      renderPath: `/teams/${runId}-team-a`,
      renderSentinel: 'Join & Invite',
      redirectReason: 'none',
      renderSignals: [],
    });
    return blankAwareCliResult(argv);
  });
  const client = createPlaywrightCliClient({
    execute: transport.execute,
    wrapperPath: '/safe/playwright_cli.sh',
    fixtureRunId: runId,
  });
  await installSignalRecorder(client, 'fixture-leak-client');
  const clientResult = await observeAction({
    client,
    session: 'fixture-leak-client',
    stage: 'fixture-leak-client',
    terminal: async () => {},
    action: async () => {},
  });

  const statuses = [200, 403, 200, 403, 200, 403];
  let apiIndex = 0;
  let firestoreIndex = 0;
  const row = await runIsolationScenario({
    client: createScriptedScenarioClient(statuses.map(status => scenarioWindow({
      relevantHttpResults: [{ targetKind: 'firestore-document', status }],
    }))),
    session: 'fixture-leak-isolation',
    context: scenarioContext({ contextId: 'fixture-leak-isolation', alias: 'qa-parent-a' }),
    runId,
    actions: {
      sameOriginGet: async () => statuses[apiIndex++],
      firestoreGet: async () => statuses[2 + firestoreIndex++],
      waitForSettled: async () => {},
    },
  });
  const serialized = JSON.stringify({ clientResult, row });
  for (const literal of fixtureLiterals) assert.equal(serialized.includes(literal), false, literal);

  const groupCounts = { 'admission-route': 18, isolation: 10, logout: 10, 'pending-deletion': 6 };
  const rows = Object.entries(groupCounts).flatMap(([group, count], groupIndex) => Array.from({ length: count }, (_, index) => ({
    ...ledgerRow(`${group}-leak-${index}`, group, (groupIndex + index) % 2 === 0 ? '390x844' : '1440x900'),
    ...(group === 'isolation' && index === 0 ? { action: `/api/teams/chat?teamId=${runId}-team-a` } : {}),
  })));
  assert.throws(() => validateLedger(rows, {
    groupCounts,
    totals: { total: 44, pass: 44, fail: 0, inconclusive: 0 },
  }), /fixture identifier/i);
});

test('phase 9 browser scenarios expose exact route-specific accessible heading contracts', () => {
  assert.deepEqual(ROUTE_SCENARIOS, {
    '/admin': { visibleSentinels: ['Account Lookup'] },
    '/club': { visibleSentinels: ['School Hub', 'Club Hub'] },
    '/competition': { visibleSentinels: ['Program League Hub', 'Competition Hub'] },
    '/dashboard/billing': { visibleSentinels: ['Manage Your Plan'] },
    '/coaches-corner': { visibleSentinels: ['Coaches Corner'] },
    '/family': { visibleSentinels: ['Family Overview'] },
  });
  assert.equal(Object.values(ROUTE_SCENARIOS).flatMap(value => value.visibleSentinels).includes('Admin'), false);
});

test('phase 9 browser scenarios route validation distinguishes expected current heading from transient wrong-route renders', () => {
  assert.equal(validateRouteResult({
    allowed: true,
    expectedPath: '/family',
    expectedSentinel: 'Family Overview',
    window: safeWindow({
      protectedRender: true,
      renderSignals: [{ kind: 'heading', pathname: '/family', sentinel: 'Family Overview' }],
    }),
  }).pass, true);
  assert.throws(() => validateRouteResult({
    allowed: true,
    expectedPath: '/family',
    expectedSentinel: 'Family Overview',
    window: safeWindow({
      protectedRender: true,
      renderSignals: [
        { kind: 'heading', pathname: '/admin', sentinel: 'Account Lookup' },
        { kind: 'heading', pathname: '/family', sentinel: 'Family Overview' },
      ],
    }),
  }), /unexpected protected render/i);
  assert.throws(() => validateRouteResult({
    allowed: false,
    requestedPath: '/admin',
    expectedPath: '/dashboard',
    expectedSentinel: 'Access Denied',
    window: safeWindow({ finalPath: '/dashboard', visibleSentinels: ['Access Denied'] }),
  }), /landing sentinel/i);
  assert.throws(() => validateRouteResult({
    allowed: false,
    requestedPath: '/admin',
    expectedPath: '/dashboard',
    expectedSentinel: 'Family Overview',
    window: safeWindow({ finalPath: '/dashboard', visibleSentinels: ['Family Overview'] }),
  }), /landing sentinel/i);
});

test('phase 9 browser scenarios heading contracts are backed by the real page h1 sources', () => {
  const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  assert.match(source('../src/app/admin/page.tsx'), /<h1[^>]*>Account Lookup<\/h1>/);
  assert.match(source('../src/app/(dashboard)/club/page.tsx'), /<h1[^>]*>[\s\S]*isSchoolMode \? 'School Hub' : 'Club Hub'[\s\S]*<\/h1>/);
  assert.match(source('../src/app/(dashboard)/competition/page.tsx'), /const pageTitle = isSchoolMode \? 'Program League Hub' : 'Competition Hub'/);
  assert.match(source('../src/app/(dashboard)/dashboard/billing/page.tsx'), /<h1[^>]*>[\s\S]*Manage[\s\S]*Your Plan[\s\S]*<\/h1>/);
  assert.match(source('../src/app/(dashboard)/coaches-corner/page.tsx'), /<h1[^>]*>Coaches Corner<\/h1>/);
  assert.match(source('../src/app/(dashboard)/family/page.tsx'), /<h1[^>]*>Family Overview<\/h1>/);
  assert.match(source('../src/app/(dashboard)/dashboard/page.tsx'), /<h1[^>]*>Dashboard<\/h1>/);
  assert.match(source('../src/app/onboarding/page.tsx'), /<h1[^>]*>Complete your profile<\/h1>/);
  assert.match(source('../src/app/(dashboard)/teams/join/page.tsx'), /<h1[^>]*>Join & Invite<\/h1>/);
  const login = source('../src/app/login/page.tsx');
  assert.match(login, /tokenResult\.claims\.role === 'superadmin'[\s\S]*router\.push\('\/admin'\)/);
  assert.match(login, /data\.role === 'admin' \|\| data\.isSchoolAdmin[\s\S]*router\.push\('\/club'\)/);
  assert.match(login, /else \{[\s\S]*router\.push\('\/dashboard'\)/);
});

test('phase 9 browser scenarios recorder requires an exact visible h1 instead of substring body text', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
  const client = createPlaywrightCliClient({ timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS });
  try {
    await installSignalRecorder(client, 'phase9-exact-heading');
    const nonHeading = await observeAction({
      client,
      session: 'phase9-exact-heading',
      stage: 'non-heading-substring',
      terminal: async () => {},
      action: () => client.runCode('phase9-exact-heading', `async (page) => page.evaluate(() => {
        document.body.innerHTML = '<h1>Admin</h1><div>Account Lookup and Admin</div>';
      })`),
    });
    assert.deepEqual(nonHeading.visibleSentinels, []);
    const exactHeading = await observeAction({
      client,
      session: 'phase9-exact-heading',
      stage: 'exact-heading',
      terminal: async () => {},
      action: () => client.runCode('phase9-exact-heading', `async (page) => page.evaluate(() => {
        document.body.innerHTML = '<h1>Account Lookup</h1>';
      })`),
    });
    assert.deepEqual(exactHeading.visibleSentinels, ['Account Lookup']);
  } finally {
    await closeAndVerifyBrowsers(client);
  }
});

test('phase 9 browser scenarios logout row includes a fifth fresh isolated unauthenticated action', async () => {
  const login = scenarioWindow({
    finalPath: '/login', finalUrl: `${STAGING_ORIGIN}/login`, visibleSentinels: ['Sign In'], sessionPresent: false,
  });
  const actions = Object.fromEntries(REQUIRED_LOGOUT_STAGES.map(name => [name, async () => {}]));
  actions.waitForLogin = async () => {};
  actions.freshUnauthenticated = async () => {};
  actions.waitForFreshLogin = async () => {};
  const client = createScriptedScenarioClient([...REQUIRED_LOGOUT_STAGES.map(() => login), login]);
  const row = await runLogoutScenario({
    client,
    session: 'logout-shared',
    freshSession: 'logout-fresh',
    context: scenarioContext({ contextId: 'logout-complete' }),
    actions,
  });
  assert.equal(client.calls.filter(item => item.startsWith('mark:')).length, 5);
  assert.equal(row.actionSummaries.length, 5);
  assert.match(row.action, /fresh isolated/i);
});

test('phase 9 browser scenarios aggregate every isolation action window from actual observations', async () => {
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const expectation = buildIsolationExpectation({ runId, alias: 'qa-parent-a' });
  const statuses = [200, 403, 200, 403, 200, 403];
  const windows = statuses.map((status, index) => scenarioWindow({
    protectedRequests: index + 1,
    protectedRequestSignals: Array.from(
      { length: index + 1 },
      () => closedResourceSignal(`${STAGING_ORIGIN}/dashboard`),
    ),
    relevantHttpResults: [{ targetKind: 'staging-protected-api', status }],
  }));
  let apiIndex = 0;
  let firestoreIndex = 0;
  const row = await runIsolationScenario({
    client: createScriptedScenarioClient(windows),
    session: 'isolation-aggregate',
    context: scenarioContext({ contextId: 'isolation-aggregate' }),
    runId,
    actions: {
      sameOriginGet: async () => statuses[apiIndex++],
      firestoreGet: async () => statuses[2 + firestoreIndex++],
      waitForSettled: async () => {},
    },
  });
  assert.equal(row.protectedRequests, 21);
  assert.equal(row.actionSummaries.length, 6);
  assert.deepEqual(row.actionSummaries.map(item => item.status), statuses);
  assert.equal(row.relevantHttpDataResult, statuses.join(','));
  assert.equal(expectation.directFirestore.length, 4);
});

test('phase 9 browser scenarios pending rows use distinct baseline reload and fresh-login actions', async () => {
  const stale = scenarioWindow({
    finalPath: '/login', finalUrl: `${STAGING_ORIGIN}/login`,
    visibleSentinels: ['Sign In'],
    sessionPresent: false,
    redirectReason: 'unavailable',
  });
  const fresh = {
    ...stale,
    visibleSentinels: ['Sign In', 'The email or password is incorrect, or this account is unavailable.'],
    redirectReason: 'none',
    renderSignals: [{ kind: 'status', pathname: '/login', sentinel: 'The email or password is incorrect, or this account is unavailable.' }],
  };
  const calls = [];
  const terminals = [];
  const shared = {
    waitForLogin: async (...args) => terminals.push(args),
    waitForUnavailable: async (...args) => terminals.push(args),
    reloadRevokedSession: async () => calls.push('reload'),
    freshLogin: async () => calls.push('fresh-login'),
  };
  await runPendingDeletionScenario({
    client: createScriptedScenarioClient([stale]), session: 'pending-stale',
    context: scenarioContext({ contextId: 'pending-stale', alias: 'qa-pending-delete' }),
    scenario: 'stale-session', actions: shared,
  });
  await runPendingDeletionScenario({
    client: createScriptedScenarioClient([fresh]), session: 'pending-fresh',
    context: scenarioContext({ contextId: 'pending-fresh', alias: 'qa-pending-delete' }),
    scenario: 'fresh-login', actions: shared,
  });
  assert.deepEqual(calls, ['reload', 'fresh-login']);
  assert.deepEqual(terminals, [
    ['pending-deletion-stale-session', 'Sign In'],
    ['pending-deletion-fresh-login', 'Sign In'],
    ['pending-deletion-fresh-login', 'The email or password is incorrect, or this account is unavailable.'],
  ]);
});

test('phase 9 browser scenarios allowed and denied active-user routes require an authenticated session', () => {
  for (const result of [
    {
      allowed: true,
      expectedPath: '/family',
      expectedSentinel: 'Family Overview',
      window: safeWindow({ sessionPresent: false }),
    },
    {
      allowed: false,
      requestedPath: '/admin',
      expectedPath: '/dashboard',
      expectedSentinel: 'Dashboard',
      window: safeWindow({
        finalPath: '/dashboard', visibleSentinels: ['Dashboard'], sessionPresent: false,
      }),
    },
  ]) assert.throws(() => validateRouteResult(result), /authenticated session/i);
});

test('phase 9 browser scenarios navigate the exact protected dashboard in fresh unauthenticated contexts', async () => {
  const login = scenarioWindow({
    finalPath: '/login', finalUrl: `${STAGING_ORIGIN}/login`, visibleSentinels: ['Sign In'], sessionPresent: false,
  });
  const requested = [];
  await runFreshUnauthenticatedScenario({
    client: createScriptedScenarioClient([login]), session: 'fresh-dashboard',
    context: scenarioContext({ contextId: 'fresh-dashboard' }),
    actions: { navigate: async path => requested.push(path), waitForLogin: async () => {} },
  });
  assert.deepEqual(requested, ['/dashboard']);
});

test('phase 9 browser scenarios require a distinct logout context and navigate its exact protected dashboard', async () => {
  const login = scenarioWindow({
    finalPath: '/login', finalUrl: `${STAGING_ORIGIN}/login`, visibleSentinels: ['Sign In'], sessionPresent: false,
  });
  const actions = Object.fromEntries(REQUIRED_LOGOUT_STAGES.map(name => [name, async () => {}]));
  const requested = [];
  Object.assign(actions, {
    waitForLogin: async () => {},
    freshUnauthenticated: async path => requested.push(path),
    waitForFreshLogin: async () => {},
  });
  const base = () => ({
    client: createScriptedScenarioClient([...REQUIRED_LOGOUT_STAGES.map(() => login), login]),
    session: 'logout-shared',
    context: scenarioContext({ contextId: 'logout-distinct' }),
    actions,
  });
  await assert.rejects(runLogoutScenario(base()), /freshSession/i);
  await assert.rejects(runLogoutScenario({ ...base(), freshSession: 'logout-shared' }), /distinct/i);
  await runLogoutScenario({ ...base(), freshSession: 'logout-fresh' });
  assert.deepEqual(requested, ['/dashboard']);
});

test('phase 9 browser scenarios recorder observes an exact Radix status toast without classifying it as protected', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
  const client = createPlaywrightCliClient({ timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS });
  try {
    await installSignalRecorder(client, 'phase9-toast-terminal');
    const result = await observeAction({
      client,
      session: 'phase9-toast-terminal',
      stage: 'toast-terminal',
      terminal: async () => {},
      action: () => client.runCode('phase9-toast-terminal', `async (page) => page.evaluate(() => {
        document.body.innerHTML = '<h1>Sign In</h1><div role="status"><div><div>Login Failed</div><div>The email or password is incorrect, or this account is unavailable.</div></div></div>';
      })`),
    });
    assert.deepEqual(result.visibleSentinels, [
      'Sign In',
      'The email or password is incorrect, or this account is unavailable.',
    ]);
    assert.equal(result.renderSignals.some(signal => signal.sentinel === 'The email or password is incorrect, or this account is unavailable.'), true);
    assert.equal(result.protectedRender, false);
  } finally {
    await closeAndVerifyBrowsers(client);
  }
});

test('phase 9 browser scenarios split stale pending revocation from fresh unavailable login', async () => {
  assert.equal(accountSessionRedirect('/dashboard', { allowed: false, code: 'auth/account-unavailable' }), '/login?reason=unavailable');
  const stale = scenarioWindow({
    finalPath: '/login', finalUrl: `${STAGING_ORIGIN}/login`,
    visibleSentinels: ['Sign In'], sessionPresent: false,
    redirectReason: 'unavailable',
  });
  const fresh = scenarioWindow({
    finalPath: '/login', finalUrl: `${STAGING_ORIGIN}/login`,
    visibleSentinels: ['Sign In', 'The email or password is incorrect, or this account is unavailable.'],
    sessionPresent: false,
    redirectReason: 'none',
    renderSignals: [{ kind: 'status', pathname: '/login', sentinel: 'The email or password is incorrect, or this account is unavailable.' }],
  });
  const context = scenarioContext({ contextId: 'pending-split', alias: 'qa-pending-delete' });
  const commonActions = {
    reloadRevokedSession: async () => {}, freshLogin: async () => {}, waitForLogin: async () => {},
    waitForUnavailable: async () => {},
  };
  const staleRow = await runPendingDeletionScenario({
    client: createScriptedScenarioClient([stale]), session: 'pending-stale-split', context,
    scenario: 'stale-session', actions: commonActions,
  });
  assert.equal(staleRow.result, 'PASS');
  assert.equal(staleRow.visibleState, 'Sign In');
  assert.doesNotMatch(staleRow.expectedResult, /unavailable message/i);
  await assert.rejects(runPendingDeletionScenario({
    client: createScriptedScenarioClient([{ ...fresh, redirectReason: 'unavailable' }]), session: 'pending-stale-toast', context,
    scenario: 'stale-session', actions: commonActions,
  }), /must not show.*unavailable/i);
  await assert.rejects(runPendingDeletionScenario({
    client: createScriptedScenarioClient([{ ...stale, redirectReason: 'none' }]), session: 'pending-fresh-no-toast', context,
    scenario: 'fresh-login', actions: commonActions,
  }), /must show.*unavailable/i);
  const freshRow = await runPendingDeletionScenario({
    client: createScriptedScenarioClient([fresh]), session: 'pending-fresh-split', context,
    scenario: 'fresh-login', actions: commonActions,
  });
  assert.equal(freshRow.result, 'PASS');
  assert.equal(freshRow.visibleState, 'The email or password is incorrect, or this account is unavailable.');
});

test('phase 9 action window treats a real Dashboard h1 flash as protected activity', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
  const client = createPlaywrightCliClient({ timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS });
  try {
    await installSignalRecorder(client, 'phase9-dashboard-flash');
    const result = await observeAction({
      client,
      session: 'phase9-dashboard-flash',
      stage: 'dashboard-flash',
      terminal: async () => {},
      action: () => client.runCode('phase9-dashboard-flash', `async (page) => {
        await page.evaluate(() => { document.body.innerHTML = '<h1>Dashboard</h1>'; });
        await page.waitForTimeout(250);
        await page.evaluate(() => { document.body.innerHTML = '<h1>Sign In</h1>'; });
      }`),
    });
    assert.equal(result.protectedRender, true);
    assert.equal(result.renderSignals.some(signal => (
      signal.kind === 'heading' && signal.sentinel === 'Dashboard'
    )), true);
    assert.throws(() => validateActionWindow({
      ...result,
      finalUrl: `${STAGING_ORIGIN}/login`,
      finalPath: '/login',
      visibleSentinels: ['Sign In'],
      sessionPresent: false,
      redirectReason: 'none',
    }, { kind: 'fresh-unauthenticated' }), /protected render/i);
  } finally {
    await closeAndVerifyBrowsers(client);
  }
});

test('phase 9 evidence contracts pending validation uses transient status history and sanitized redirect reason', () => {
  const unavailable = 'The email or password is incorrect, or this account is unavailable.';
  const stale = safeWindow({
    finalPath: '/login', visibleSentinels: ['Sign In'], sessionPresent: false,
    redirectReason: 'unavailable',
    renderSignals: [
      { kind: 'heading', pathname: '/login', sentinel: 'Sign In' },
      { kind: 'status', pathname: '/login', sentinel: unavailable },
    ],
  });
  assert.throws(() => validateActionWindow(stale, { kind: 'pending-deletion-stale' }), /transient.*unavailable status/i);

  const freshWithoutHistory = safeWindow({
    finalPath: '/login', visibleSentinels: ['Sign In', unavailable], sessionPresent: false,
    redirectReason: 'none',
    renderSignals: [{ kind: 'heading', pathname: '/login', sentinel: 'Sign In' }],
  });
  assert.throws(() => validateActionWindow(freshWithoutHistory, { kind: 'pending-deletion-fresh' }), /status signal/i);
  assert.throws(() => validateActionWindow({
    ...stale, renderSignals: stale.renderSignals.slice(0, 1), redirectReason: 'other',
  }, { kind: 'pending-deletion-stale' }), /redirect reason.*unavailable/i);
  assert.throws(() => validateActionWindow({
    ...freshWithoutHistory,
    renderSignals: [...freshWithoutHistory.renderSignals, { kind: 'status', pathname: '/login', sentinel: unavailable }],
    redirectReason: 'unavailable',
  }, { kind: 'pending-deletion-fresh' }), /redirect reason.*none/i);
});

test('phase 9 browser scenarios recorder types approved status history and never protects status text', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
  const client = createPlaywrightCliClient({ timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS });
  try {
    await installSignalRecorder(client, 'phase9-status-observation');
    const result = await observeAction({
      client,
      session: 'phase9-status-observation',
      stage: 'status-observation',
      terminal: async () => {},
      action: () => client.runCode('phase9-status-observation', `async (page) => {
        await page.evaluate(() => { document.body.innerHTML = '<div role="status"><div>Family Overview</div></div>'; });
        await page.waitForTimeout(200);
        await page.evaluate(() => {
          document.querySelector('[role="status"] div').textContent = 'The email or password is incorrect, or this account is unavailable.';
        });
        await page.waitForTimeout(200);
      }`),
    });
    assert.equal(result.protectedRender, false);
    assert.equal(result.renderSignals.some(signal => signal.sentinel === 'Family Overview'), false);
    assert.deepEqual(result.renderSignals.map(({ kind, sentinel }) => ({ kind, sentinel })), [{
      kind: 'status', sentinel: 'The email or password is incorrect, or this account is unavailable.',
    }]);
  } finally {
    await closeAndVerifyBrowsers(client);
  }
});

test('phase 9 action window exposes only the fixed redirect reason enum', async () => {
  const sample = async rawReason => {
    const transport = createCliTransport(argv => {
      const code = argv[argv.indexOf('run-code') + 1] ?? '';
      if (code.includes('phase9:mark')) return cliResult({ pageId: 'page-a', sequence: 1 });
      if (code.includes('phase9:sample')) return cliResult({
        pageId: 'page-a', terminalReached: true, loadingVisible: false,
        finalUrl: 'https://example.invalid/login?reason=unavailable&token=must-not-return', finalPath: '/login',
        visibleSentinels: ['Sign In'], sessionPresent: false, protectedRender: false,
        rawRequests: [], rawResponses: [], rawTeamSelections: [],
        protectedRequests: [], protectedListenerStarts: [], teamSelectionSignals: [], relevantHttpResults: [], pageErrors: [],
        appConsoleErrors: [], unexpectedRequestFailures: [], overflow: 0, renderPath: '/login', renderSentinel: 'Sign In',
        redirectReason: rawReason,
        renderSignals: [{ kind: 'heading', pathname: '/login', sentinel: 'Sign In' }],
      });
      return blankAwareCliResult(argv);
    });
    const client = createPlaywrightCliClient({ execute: transport.execute, wrapperPath: '/safe/playwright_cli.sh' });
    await installSignalRecorder(client, `redirect-${rawReason}`);
    return observeAction({ client, session: `redirect-${rawReason}`, stage: 'redirect-reason', terminal: async () => {}, action: async () => {} });
  };
  for (const reason of ['unavailable', 'none', 'other']) {
    const result = await sample(reason);
    assert.equal(result.redirectReason, reason);
    assert.equal(JSON.stringify(result).includes('must-not-return'), false);
  }
});

test('phase 9 action window binds session evidence to exact staging __session cookie', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async t => {
  const client = createPlaywrightCliClient({ timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS });
  const cases = [
    {
      name: 'wrong-origin exact-name cookie',
      cookies: [{ name: '__session', value: 'opaque-test-value', url: 'https://example.invalid' }],
      expected: false,
    },
    {
      name: 'same-origin auth-like cookie',
      cookies: [{ name: 'auth_session_hint', value: 'opaque-test-value', url: STAGING_ORIGIN }],
      expected: false,
    },
    {
      name: 'same-origin empty exact-name cookie',
      cookies: [{ name: '__session', value: '', url: STAGING_ORIGIN }],
      expected: false,
    },
    {
      name: 'same-origin exact-name cookie',
      cookies: [{ name: '__session', value: 'opaque-test-value', url: STAGING_ORIGIN }],
      expected: true,
    },
  ];
  try {
    for (const [index, entry] of cases.entries()) await t.test(entry.name, async () => {
      const session = `phase9-session-cookie-${index}`;
      await installSignalRecorder(client, session);
      const result = await observeAction({
        client,
        session,
        stage: entry.name,
        terminal: async () => {},
        action: () => client.runCode(session, `async (page) => {
          await page.context().addCookies(${JSON.stringify(entry.cookies)});
        }`),
      });
      assert.equal(result.sessionPresent, entry.expected);
    });
  } finally {
    await closeAndVerifyBrowsers(client);
  }
  assert.deepEqual(await client.listBrowsers(), { browsers: [] });
});

test('phase 9 browser scenarios admission history filters only protected heading signals', async () => {
  const unavailable = 'The email or password is incorrect, or this account is unavailable.';
  const heading = (pathname, sentinel) => ({ kind: 'heading', pathname, sentinel });
  const login = scenarioWindow({
    finalPath: '/admin', finalUrl: `${STAGING_ORIGIN}/admin`, visibleSentinels: ['Account Lookup'],
    protectedRender: true,
    renderSignals: [
      heading('/login', 'Sign In'),
      { kind: 'status', pathname: '/login', sentinel: unavailable },
      heading('/admin', 'Account Lookup'),
    ],
  });
  const routeHeadings = [
    ['/admin', 'Account Lookup'], ['/club', 'Club Hub'], ['/competition', 'Competition Hub'],
    ['/dashboard/billing', 'Manage Your Plan'], ['/coaches-corner', 'Coaches Corner'], ['/family', 'Family Overview'],
  ];
  const windows = [login, ...routeHeadings.map(([pathname, sentinel]) => scenarioWindow({
    finalPath: pathname, finalUrl: `${STAGING_ORIGIN}${pathname}`, visibleSentinels: [sentinel],
    protectedRender: true,
    renderSignals: [heading('/login', 'Sign In'), { kind: 'status', pathname: '/login', sentinel: unavailable }, heading(pathname, sentinel)],
  }))];
  const row = await runAdmissionScenario({
    client: createScriptedScenarioClient(windows), session: 'typed-admission',
    context: scenarioContext({ contextId: 'typed-admission', alias: 'qa-superadmin' }),
    actions: { loginAndLand: async () => {}, navigate: async () => {}, waitForExactLocation: async () => {} },
  });
  assert.equal(row.result, 'PASS');

  const wrong = validateRouteResult.bind(null, {
    allowed: true, expectedPath: '/family', expectedSentinel: 'Family Overview',
    window: safeWindow({ protectedRender: true, renderSignals: [heading('/admin', 'Account Lookup'), heading('/family', 'Family Overview')] }),
  });
  assert.throws(wrong, /unexpected protected render/i);
});

const guardianAliases = [
  'qa-coach-owner-a', 'qa-coach-owner-b', 'qa-team-assistant', 'qa-team-member', 'qa-multi-org',
  'qa-fake-superadmin', 'qa-unverified', 'qa-suspended', 'qa-removed-member', 'qa-parent-a',
  'qa-parent-b', 'qa-adult-player-a', 'qa-adult-player-b', 'qa-youth-active', 'qa-league-creator',
  'qa-school-admin', 'qa-superadmin', 'qa-pending-delete', 'qa-missing-profile', 'qa-no-team',
];
const guardianSortedAliases = [...guardianAliases].sort();
const guardianUidSuffixes = [
  'adult-player-a', 'adult-player-b', 'coach-owner-a', 'coach-owner-b', 'fake-superadmin',
  'league-creator', 'missing-profile', 'multi-org', 'no-team', 'parent-a', 'parent-b',
  'pending-delete', 'removed-member', 'school-admin', 'superadmin', 'suspended', 'team-assistant',
  'team-member', 'unverified', 'youth-active',
];
const guardianRecoveryDefinition = buildFixtureDefinition({
  runId: 'qa-phase7-20260826T120000Z-abcdef123456',
  expiresAt: '2026-09-02T12:00:00Z',
  manifestVersion: 3,
});
const guardianMissingDrift = (authPresent, firestorePresent) => [
  ...guardianRecoveryDefinition.identities.slice(authPresent).map(identity => ({
    kind: 'auth', alias: identity.alias, field: 'presence', reason: 'missing',
  })),
  ...guardianRecoveryDefinition.documents.slice(firestorePresent).map(document => ({
    kind: 'firestore', alias: document.alias, field: 'presence', reason: 'missing',
  })),
];

function lifecycleGuardianFixture(overrides = {}) {
  const runId = 'qa-phase7-20260826T120000Z-abcdef123456';
  const workspace = '/tmp/phase9-core-identities.test';
  const manifestPath = `${workspace}/manifest.json`;
  const credentialPath = `${workspace}/credentials.json`;
  const profileRootPath = `${workspace}/playwright-tmp`;
  const realFilesystemProfile = String(overrides.runnerMode ?? '').startsWith('real-retained-browser');
  const producerTempRoot = resolve(process.env.TMPDIR);
  const definition = buildFixtureDefinition({ runId, expiresAt: '2026-09-02T12:00:00Z', manifestVersion: 3 });
  const authUids = definition.identities.map(identity => identity.uid);
  const firestorePaths = definition.documents.map(document => document.path);
  const expectedAbsentFirestorePaths = definition.expectedAbsentDocuments.map(document => document.path);
  const events = [];
  const files = new Set();
  let workspaceExists = false;
  let profileRootExists = false;
  let producerInventoryCount = 0;
  let cleaned = false;
  let transitioned = false;
  let probeAuthChecks = 0;
  let probeFirestoreChecks = 0;
  const browserSessions = new Set(overrides.initialBrowsers ?? []);
  const manifest = () => {
    const value = {
      version: 3,
      runId,
      projectId: 'the-squad-v2-staging',
      authUids,
      firestorePaths,
      expectedAbsentFirestorePaths,
      state: cleaned ? 'cleaned' : (overrides.manifestState ?? 'seeded'),
      createdAt: '2026-08-26T12:00:00Z',
      updatedAt: '2026-08-26T12:00:00Z',
      expiresAt: '2026-09-02T12:00:00Z',
      transitions: {
        'qa-suspended': { version: 1, state: 'active' },
        'qa-removed-member': { version: 1, state: 'active' },
        'qa-pending-delete': transitioned ? {
          version: 1, state: 'pending_deletion', startedAt: '2026-08-26T12:00:00Z',
          firestoreUpdatedAt: '2026-08-26T12:00:00Z', revokedAt: '2026-08-26T12:00:00Z',
          completedAt: '2026-08-26T12:00:00Z',
        } : { version: 1, state: 'active' },
      },
    };
    return JSON.stringify(overrides.manifestMutation?.(structuredClone(value)) ?? value);
  };
  const inspectResult = () => ({
    command: 'inspect', ok: true,
    aliases: cleaned ? [] : guardianSortedAliases,
    states: { manifest: cleaned ? 'cleaned' : 'seeded', problems: 0 },
    drift: [],
    counts: { expected: { auth: 20, firestore: 82 }, actualPresent: cleaned ? { auth: 0, firestore: 0 } : { auth: 20, firestore: 82 } },
    uidSuffixes: guardianUidSuffixes,
  });
  const results = {
    preflight: { command: 'preflight', safe: true, projectId: 'the-squad-v2-staging', origin: STAGING_ORIGIN, plannedAliases: 20, plannedTeams: 3 },
    seed: { command: 'seed', state: 'seeded', aliases: guardianAliases, counts: { auth: 20, firestore: 82 }, uidSuffixes: guardianUidSuffixes },
    transition: { command: 'transition', alias: 'qa-pending-delete', state: 'pending_deletion', uidSuffix: 'pending-delete' },
    cleanup: { command: 'cleanup', ok: true, retained: [], deleted: { auth: 20, firestore: 82 }, followUp: {
      retained: { auth: { count: 0, aliases: [] }, firestore: { count: 0, aliases: [] } },
      failures: { auth: { count: 0, aliases: [] }, firestore: { count: 0, aliases: [] } },
    } },
  };
  let inspectCount = 0;
  const fixtureCommand = async argv => {
    assert.equal(Array.isArray(argv), true);
    const command = argv[0];
    events.push(`fixture:${command}`);
    assert.deepEqual(argv.slice(1, 5), ['--project', 'the-squad-v2-staging', '--confirm-project', 'the-squad-v2-staging']);
    assert.equal(argv.includes('--run-id'), false);
    if (command === 'preflight') assert.deepEqual(argv.slice(5), ['--origin', STAGING_ORIGIN]);
    else {
      assert.equal(argv[5], '--manifest');
      assert.equal(argv[6], manifestPath);
    }
    if (command === 'seed') {
      if (!overrides.missingManifest) files.add(manifestPath);
      if (!overrides.missingCredential) files.add(credentialPath);
      assert.deepEqual(argv.slice(7), ['--credentials', credentialPath, '--expires-at', '2026-09-02T12:00:00Z']);
    }
    if (command === 'transition') {
      await overrides.beforeTransition?.();
      if (!overrides.transitionNotPersisted) transitioned = true;
      assert.deepEqual(argv.slice(7), ['--alias', 'qa-pending-delete']);
    }
    if (command === 'cleanup') {
      await overrides.beforeCleanup?.();
      cleaned = true;
    }
    const result = command === 'inspect' ? inspectResult() : results[command];
    inspectCount += command === 'inspect' ? 1 : 0;
    if (command === 'inspect' && inspectCount === 1) overrides.afterInitialInspect?.();
    const mutation = overrides.commandResult?.({ command, result: structuredClone(result), inspectCount });
    return mutation ?? { exitCode: 0, stdout: JSON.stringify(result) };
  };
  const browserClient = {
    async closeBrowser(session) {
      events.push(`browser:close:${session}`);
      if (overrides.browserCloseFailure) throw new Error('raw close failure');
      browserSessions.delete(session);
    },
    async closeAllBrowsers() {
      events.push('browser:close-all');
      throw new Error('guardian must never close unowned browser sessions');
    },
    async listBrowsers() {
      events.push('browser:list');
      const afterClose = events.some(event => event.startsWith('browser:close:'));
      const browsers = [...browserSessions].map(name => ({ name }));
      if (overrides.remainingBrowsersAfterClose && afterClose) browsers.push({ name: 'private-session' });
      return { browsers };
    },
  };
  const filesystem = {
    async mkdtemp(prefix) {
      events.push('fs:mkdtemp');
      assert.equal(prefix, '/tmp/phase9-core-identities.');
      if (realFilesystemProfile) {
        if (existsSync(workspace)) rmSync(workspace, { recursive: true, force: true });
        mkdirSync(workspace, { mode: 0o700 });
      }
      workspaceExists = true;
      return workspace;
    },
    async mkdir(path, options) {
      events.push('fs:mkdir-profile');
      assert.equal(path, profileRootPath);
      assert.equal(options.mode, 0o700);
      if (realFilesystemProfile) mkdirSync(profileRootPath, { mode: 0o700 });
      profileRootExists = true;
    },
    async chmod(path, mode) {
      events.push(path === profileRootPath ? 'fs:chmod-profile' : 'fs:chmod');
      assert.equal(new Set([workspace, profileRootPath]).has(path), true);
      assert.equal(mode, 0o700);
    },
    async stat(path) {
      if (path === workspace && workspaceExists) return { isDirectory: () => true, mode: overrides.workspaceMode ?? 0o40700 };
      if (path === profileRootPath && profileRootExists) return { isDirectory: () => true, mode: 0o40700 };
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    },
    async lstat(path) {
      if (
        overrides.preservationLstatUncertain
        && events.some(event => event.startsWith('browser:close'))
        && (path === workspace || path === manifestPath)
      ) throw Object.assign(new Error('uncertain'), { code: 'EACCES' });
      if (path === workspace && workspaceExists) return {
        isDirectory: () => overrides.workspaceLstatType !== 'file',
        isFile: () => overrides.workspaceLstatType === 'file',
        isSymbolicLink: () => overrides.workspaceLstatType === 'symlink',
        mode: overrides.workspaceLstatMode ?? overrides.workspaceMode ?? 0o40700,
      };
      if (path === producerTempRoot) return {
        isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false,
        mode: 0o40700, uid: process.getuid(),
      };
      if (path.startsWith(`${producerTempRoot}/playwright_chromiumdev_profile-`)) return {
        isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false,
        mode: 0o40700, uid: process.getuid(),
      };
      if (path === profileRootPath && profileRootExists) return {
        isDirectory: () => true, isFile: () => false, isSymbolicLink: () => false,
        mode: 0o40700, uid: process.getuid(),
      };
      if (files.has(path)) return {
        isDirectory: () => path === manifestPath && overrides.manifestLstatType === 'directory',
        isFile: () => !(path === manifestPath && new Set(['directory', 'symlink']).has(overrides.manifestLstatType)),
        isSymbolicLink: () => path === manifestPath && overrides.manifestLstatType === 'symlink',
        mode: path === credentialPath ? (overrides.credentialMode ?? 0o100600) : (overrides.manifestMode ?? 0o100600),
      };
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    },
    async readFile(path) {
      events.push('fs:read-manifest');
      if (overrides.corruptManifest) return '{';
      if (!files.has(path)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return manifest();
    },
    async readdir(path) {
      events.push(path === producerTempRoot ? 'fs:profile-inventory' : 'fs:read-profile-root');
      if (path === producerTempRoot) {
        producerInventoryCount += 1;
        if (producerInventoryCount === overrides.globalProfileInventoryFailureAt) {
          throw Object.assign(new Error('transient producer inventory failure'), { code: 'EIO' });
        }
        return producerInventoryCount > 1 ? (overrides.globalProfilesAfter ?? []) : [];
      }
      if (path === profileRootPath && profileRootExists) return [];
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    },
    async removeCredentialFile(path) {
      events.push('fs:remove-credential');
      if (overrides.credentialRemovalFailure) throw new Error('raw credential failure');
      if (path !== credentialPath || !files.has(path)) return false;
      if (!overrides.credentialRemovalLeavesFile) files.delete(path);
      return true;
    },
    async rm(path) {
      if (path === profileRootPath) {
        events.push('fs:remove-profile-root');
        if (realFilesystemProfile) rmSync(profileRootPath, { recursive: true, force: false });
        profileRootExists = false;
        return;
      }
      events.push('fs:remove-workspace');
      if (overrides.workspaceRemovalFailure) throw new Error('raw workspace failure');
      assert.equal(path, workspace);
      if (overrides.workspaceRemovalDeletesFilesOnly) {
        files.clear();
        return;
      }
      if (!overrides.workspaceRemovalLeavesDirectory) {
        if (realFilesystemProfile) rmSync(workspace, { recursive: true, force: false });
        workspaceExists = false;
        files.clear();
      }
    },
  };
  const adapterFactory = async () => {
    events.push('adapter:init');
    return {
      projectId: 'the-squad-v2-staging',
      connect: () => ({
        auth: { async getUser() { probeAuthChecks += 1; throw Object.assign(new Error('not found'), { code: 'auth/user-not-found' }); } },
        firestore: { async get() { probeFirestoreChecks += 1; return { exists: false, data: () => undefined }; } },
      }),
    };
  };
  const handlers = new Map();
  const processHooks = {
    on(name, handler) {
      events.push(`hook:on:${name}`);
      if (overrides.hookOnFailure) throw new Error('raw hook registration');
      handlers.set(name, handler);
    },
    off(name) {
      events.push(`hook:off:${name}`);
      if (overrides.hookOffFailure) throw new Error('raw hook removal');
      handlers.delete(name);
    },
  };
  const deployedSha = '0123456789abcdef0123456789abcdef01234567';
  const stagingRunId = '32856314233';
  const pullRequestNumber = 41;
  const preconditionVerifier = async request => {
    events.push('precondition:verify');
    assert.deepEqual(request, { deployedSha, stagingRunId, pullRequestNumber });
    const result = {
      deployedSha,
      stagingRunId,
      runStatus: 'completed',
      runConclusion: 'success',
      runSha: deployedSha,
      pullRequestNumber,
      pullRequestState: 'OPEN',
      pullRequestMerged: false,
      pullRequestHeadSha: deployedSha,
    };
    return overrides.preconditionResult?.({ request, result: structuredClone(result) }) ?? result;
  };
  const runnerCommand = overrides.runnerCommand ?? guardianChildCommand(overrides.runnerMode ?? 'success');
  return {
    dependencies: {
      fixtureCommand, browserClient: overrides.browserClient ?? browserClient,
      adapterFactory: overrides.adapterFactory ?? adapterFactory,
      filesystem, processHooks, preconditionVerifier, runnerCommand,
      scenarioJoinTimeoutMs: overrides.scenarioJoinTimeoutMs ?? 50,
      beforeTransitionDeadlineMs: overrides.beforeTransitionDeadlineMs,
      afterTransitionDeadlineMs: overrides.afterTransitionDeadlineMs,
    },
    options: {
      projectId: 'the-squad-v2-staging', origin: STAGING_ORIGIN,
      expiresAt: '2026-09-02T12:00:00Z',
      deployedSha, stagingRunId, pullRequestNumber,
    },
    events, handlers, files, browserSessions, workspace, manifestPath, credentialPath,
    get workspaceExists() { return workspaceExists; },
    get probeAuthChecks() { return probeAuthChecks; },
    get probeFirestoreChecks() { return probeFirestoreChecks; },
  };
}

test('phase 9 lifecycle guardian runs the exact ordered state machine and exact absence proof', async () => {
  const fixture = lifecycleGuardianFixture();
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  const { rows, ...summary } = result;
  assert.deepEqual(summary, {
    ok: true,
    state: 'disarmed',
    history: [
      'uninitialized', 'guarded', 'preflighted', 'seeded', 'inspected', 'browsers-closed',
      'preclean-inspected', 'cleaned', 'clean-inspected', 'independently-absent',
      'credential-removed', 'workspace-removed', 'disarmed',
    ],
    browserClosureCertified: true,
    closureCertified: true,
  });
  assert.equal(rows.length, 44);
  assert.deepEqual(fixture.events.filter(event => event.startsWith('fixture:')), [
    'fixture:preflight', 'fixture:seed', 'fixture:inspect', 'fixture:transition',
    'fixture:inspect', 'fixture:cleanup', 'fixture:inspect',
  ]);
  assert.equal(fixture.events.lastIndexOf('browser:list') < fixture.events.indexOf('fixture:cleanup'), true);
  assert.equal(fixture.events.indexOf('adapter:init') < fixture.events.indexOf('fs:remove-credential'), true);
  assert.equal(fixture.events.indexOf('fs:mkdir-profile') < fixture.events.indexOf('fixture:transition'), true);
  assert.equal(fixture.events.indexOf('browser:list') < fixture.events.indexOf('fs:remove-profile-root'), true);
  assert.equal(fixture.events.indexOf('fs:remove-profile-root') < fixture.events.indexOf('fs:remove-workspace'), true);
  assert.equal(fixture.events.filter(event => event === 'fs:profile-inventory').length, 2);
  assert.equal(fixture.events.filter(event => event.startsWith('hook:on:')).length, 4);
  assert.equal(fixture.events.indexOf('hook:on:SIGINT') < fixture.events.indexOf('fs:mkdtemp'), true);
  assert.equal(fixture.events.indexOf('fixture:preflight') < fixture.events.indexOf('fs:mkdtemp'), true);
  assert.equal(fixture.probeAuthChecks, 20);
  assert.equal(fixture.probeFirestoreChecks, 83);
  assert.equal(fixture.workspaceExists, false);
  assert.equal(fixture.handlers.size, 0);
});

test('phase 9 lifecycle guardian rejects any new global Playwright producer profile after confined cleanup', async () => {
  const fixture = lifecycleGuardianFixture({
    globalProfilesAfter: ['playwright_chromiumdev_profile-unconfinedRogue'],
  });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.category, 'scenario-closure-failed');
  assert.equal(result.closureCertified, false);
  assert.equal(result.workspacePreservation, 'verified-present');
  assert.equal(fixture.workspaceExists, true);
  assert.equal(fixture.events.includes('fs:remove-workspace'), false);
});

test('phase 9 lifecycle guardian keeps a transient global profile inventory failure sticky after a clean retry', async () => {
  const fixture = lifecycleGuardianFixture({ globalProfileInventoryFailureAt: 2 });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.category, 'scenario-closure-failed');
  assert.equal(result.browserClosureCertified, false);
  assert.equal(result.closureCertified, false);
  assert.equal(result.workspacePreservation, 'verified-present');
  assert.equal(result.manifestPreservation, 'verified-present');
  assert.equal(fixture.workspaceExists, true);
  assert.equal(fixture.events.filter(event => event === 'fs:profile-inventory').length, 3);
  assert.equal(fixture.events.filter(event => event === 'fs:remove-profile-root').length, 1);
  assert.equal(fixture.events.includes('fs:remove-workspace'), false);
});

test('phase 9 lifecycle guardian keeps a transient inspector execution failure sticky after clean recovery scans', { timeout: 60_000 }, async () => {
  const originalExecFile = childProcess.execFile;
  let inspectorCalls = 0;
  childProcess.execFile = function transientInspectorFailure(command, args, options, callback) {
    if (command === '/usr/bin/python3' && Array.isArray(args)
      && args[0] === '-c' && args.includes('--marker-name')) {
      inspectorCalls += 1;
      if (inspectorCalls === 2) {
        queueMicrotask(() => callback(new Error('transient inspector execution failure'), '', ''));
        return undefined;
      }
    }
    return originalExecFile.call(this, command, args, options, callback);
  };
  syncBuiltinESMExports();
  const fixture = lifecycleGuardianFixture();
  try {
    const guardianModule = await import(
      `../scripts/qa-evidence/phase9/lifecycle-guardian.mjs?sticky-inspector=${Date.now()}`
    );
    const result = await guardianModule.runGuardedLifecycle({
      ...fixture.dependencies, options: fixture.options,
    });
    assert.equal(result.ok, false);
    assert.equal(result.category, 'scenario-closure-failed');
    assert.equal(result.browserClosureCertified, false);
    assert.equal(result.closureCertified, false);
    assert.equal(result.workspacePreservation, 'verified-present');
    assert.equal(result.manifestPreservation, 'verified-present');
    assert.equal(fixture.workspaceExists, true);
    assert.ok(inspectorCalls >= 3, `expected clean recovery scan after call 2, saw ${inspectorCalls}`);
    assert.equal(fixture.events.includes('fs:remove-workspace'), false);
  } finally {
    childProcess.execFile = originalExecFile;
    syncBuiltinESMExports();
  }
});

const realGuardianSession = 'phase9-real-guardian-retained';
const realGuardianTwoSessions = Object.freeze([
  'phase9-real-guardian-retained-a', 'phase9-real-guardian-retained-b',
]);
const realGuardianCrashSession = 'phase9-real-acquisition-crash';
const REAL_GUARDIAN_JOIN_TIMEOUT_MS = 10_000;
const realGuardianInfoPath = phase => `/tmp/phase9-guardian-real-retained-${process.pid}-${phase}.json`;
const realGuardianProfileRoot = '/tmp/phase9-core-identities.test/playwright-tmp';
const realGuardianCommandOptions = temporaryDirectory => temporaryDirectory === undefined
  ? { timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS }
  : {
    timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS,
    sourceEnvironment: { ...process.env, TMPDIR: temporaryDirectory },
    temporaryDirectory,
  };
const realGuardianBrowserClient = Object.freeze({
  closeBrowser: (session, { temporaryDirectory } = {}) => executeCapturedPlaywrightTransportCommand(
    [`-s=${session}`, 'close'], realGuardianCommandOptions(temporaryDirectory),
  ),
  listBrowsers: ({ temporaryDirectory } = {}) => executeCapturedPlaywrightTransportCommand(
    ['list'], realGuardianCommandOptions(temporaryDirectory),
  ),
});
const markedProcessLines = marker => {
  const result = spawnSync('/bin/ps', ['eww', '-axo', 'pid=,command='], {
    encoding: 'utf8', env: { LC_ALL: 'C', PATH: '/usr/bin:/bin' }, maxBuffer: 16_777_216,
    timeout: 30_000,
  });
  assert.equal(result.status, 0);
  const token = `PHASE9_GUARDIAN_RUN_MARKER=${marker}`;
  return result.stdout.split('\n').filter(line => {
    const words = line.split(/\s+/);
    return words.includes(token) || words.includes(`--${token}`);
  });
};
const pidAlive = pid => {
  try { process.kill(pid, 0); return true; } catch (error) {
    if (error?.code === 'ESRCH') return false;
    throw error;
  }
};
const cleanupRealGuardianIntegration = async () => {
  for (const session of [realGuardianSession, ...realGuardianTwoSessions, realGuardianCrashSession]) {
    await realGuardianBrowserClient.closeBrowser(session).catch(() => {});
    if (existsSync(realGuardianProfileRoot)) {
      await realGuardianBrowserClient.closeBrowser(session, {
        temporaryDirectory: realGuardianProfileRoot,
      }).catch(() => {});
    }
  }
  const paths = ['before-transition', 'after-transition'].map(realGuardianInfoPath);
  const fixturePaths = new Set([`/tmp/phase9-extra-chrome-${process.pid}`]);
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const info = JSON.parse(readFileSync(path, 'utf8'));
    if (typeof info.lookalikePath === 'string') fixturePaths.add(info.lookalikePath);
    if (typeof info.lookalikeRoot === 'string') fixturePaths.add(info.lookalikeRoot);
    for (const line of markedProcessLines(info.marker)) {
      const pid = Number(/^\s*([1-9][0-9]*)\s/.exec(line)?.[1]);
      if (!Number.isSafeInteger(pid)) continue;
      try { process.kill(pid, 'SIGTERM'); } catch {}
    }
  }
  await new Promise(resolve => setTimeout(resolve, 100));
  for (const path of paths) {
    if (!existsSync(path)) continue;
    const info = JSON.parse(readFileSync(path, 'utf8'));
    for (const line of markedProcessLines(info.marker)) {
      const pid = Number(/^\s*([1-9][0-9]*)\s/.exec(line)?.[1]);
      if (!Number.isSafeInteger(pid)) continue;
      try { process.kill(pid, 'SIGKILL'); } catch {}
    }
    rmSync(path, { force: true });
  }
  for (const path of fixturePaths) rmSync(path, { recursive: true, force: true });
  const exactWorkspaceRoot = '/tmp/phase9-core-identities.test';
  if (existsSync(exactWorkspaceRoot)) {
    assert.equal(resolve(exactWorkspaceRoot), exactWorkspaceRoot);
    const metadata = lstatSync(exactWorkspaceRoot);
    assert.equal(metadata.isDirectory(), true);
    assert.equal(metadata.isSymbolicLink(), false);
    assert.equal(metadata.mode & 0o777, 0o700);
    assert.equal(metadata.uid, process.getuid());
    rmSync(exactWorkspaceRoot, { recursive: true, force: false });
  }
  assert.equal(existsSync(exactWorkspaceRoot), false);
};

test('phase 9 guardian process identity rejects PID reuse with a different birth identity', async () => {
  const { processInstanceIdentityMatches } = await import(
    '../scripts/qa-evidence/phase9/lifecycle-guardian.mjs'
  );
  assert.equal(typeof processInstanceIdentityMatches, 'function');
  const identity = Object.freeze({
    pid: 41001,
    ppid: 41000,
    pgid: 41001,
    startSec: 1_787_742_896,
    startUsec: 123_456,
    argv: ['/usr/local/bin/node', '/private/tmp/phase9-playwright-transport.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/node_modules/playwright-core/lib/entry/cliDaemon.js', 'phase9-session', '--browser=chrome'],
    executable: '/usr/local/bin/node',
    executableDev: '16777233',
    executableIno: '1152921500',
    executableSize: 237619616,
    executableMtimeNs: '1765364811000000000',
    executableCtimeNs: '1781734921000000000',
    executableMode: 0o755,
    executableUid: 0,
    executableNlink: 1,
    executableSha256: '1'.repeat(64),
    codesignIdentifier: 'node',
    teamIdentifier: 'HX7739G8FX',
  });
  assert.equal(processInstanceIdentityMatches(identity, { ...identity }), true);
  assert.equal(processInstanceIdentityMatches(identity, {
    ...identity, startUsec: 123_457,
  }), false);
  assert.equal(processInstanceIdentityMatches(identity, {
    ...identity, executableIno: '1152921501',
  }), false);
});

test('phase 9 Darwin inspector preserves raw argv boundaries and precise marked process birth identity', { timeout: 30_000 }, async () => {
  const { inspectDarwinMarkedProcesses, processInstanceIdentityMatches } = await import(
    '../scripts/qa-evidence/phase9/lifecycle-guardian.mjs'
  );
  assert.equal(typeof inspectDarwinMarkedProcesses, 'function');
  const markerName = 'PHASE9_GUARDIAN_RUN_MARKER';
  const marker = createHash('sha256').update(`phase9-darwin-inspector-${process.pid}`).digest('hex');
  const children = new Set();
  const launch = (suffix, marked = true) => {
    const child = spawn(process.execPath, [
      '-e', 'process.on("SIGTERM",()=>process.exit(0));setInterval(()=>{},1000)',
      `literal argument with spaces ${suffix}`,
      `--switch-looking=value with spaces ${suffix}`,
    ], {
      env: marked ? { ...process.env, [markerName]: marker } : { ...process.env },
      stdio: 'ignore',
    });
    children.add(child);
    return child;
  };
  const stop = child => new Promise(resolvePromise => {
    if (child.exitCode !== null || child.signalCode !== null) return resolvePromise();
    child.once('close', resolvePromise);
    try { child.kill('SIGKILL'); } catch { resolvePromise(); }
  });
  try {
    let pair;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const first = launch(`a${attempt}`);
      const second = launch(`b${attempt}`);
      const records = await inspectDarwinMarkedProcesses(marker, [first.pid, second.pid]);
      if (records.length === 2 && records[0].startSec === records[1].startSec) {
        pair = { first, second, records };
        break;
      }
      await Promise.all([stop(first), stop(second)]);
    }
    assert.ok(pair, 'test must obtain two marked processes born in the same second');
    const [firstRecord, secondRecord] = pair.records;
    assert.deepEqual(pair.records.map(record => record.pid).sort((left, right) => left - right),
      [pair.first.pid, pair.second.pid].sort((left, right) => left - right));
    assert.equal(firstRecord.markerPresent, true);
    assert.equal(secondRecord.markerPresent, true);
    assert.equal(firstRecord.startSec, secondRecord.startSec);
    assert.notEqual(firstRecord.startUsec, secondRecord.startUsec);
    assert.equal(pair.records.some(record => record.argv.some(argument => (
      argument.startsWith('literal argument with spaces ')
    ))), true);
    assert.equal(pair.records.some(record => record.argv.some(argument => (
      argument.startsWith('--switch-looking=value with spaces ')
    ))), true);
    assert.equal(JSON.stringify(pair.records).includes(marker), false, 'inspector output must not expose marker bytes');

    const identity = {
      pid: firstRecord.pid, ppid: firstRecord.ppid, pgid: firstRecord.pgid,
      startSec: firstRecord.startSec, startUsec: firstRecord.startUsec,
      argv: firstRecord.argv, executable: firstRecord.executable,
      executableDev: '1', executableIno: '2', executableSize: 3,
      executableMtimeNs: '4', executableCtimeNs: '5', executableMode: 0o755,
      executableUid: 0, executableNlink: 1, executableSha256: '1'.repeat(64),
      codesignIdentifier: 'node', teamIdentifier: 'HX7739G8FX',
    };
    assert.equal(processInstanceIdentityMatches(identity, { ...identity, argv: [...identity.argv] }), true);
    assert.equal(processInstanceIdentityMatches(identity, { ...identity, startUsec: identity.startUsec + 1 }), false);

    const unmarked = launch('unmarked', false);
    assert.deepEqual(await inspectDarwinMarkedProcesses(marker, [unmarked.pid]), []);
    await stop(pair.first);
    assert.deepEqual(await inspectDarwinMarkedProcesses(marker, [pair.first.pid]), []);
  } finally {
    await Promise.all([...children].map(stop));
  }
});

test('phase 9 Darwin inspector preserves empty argv elements in explicit and all-PID scans without marker leakage', { timeout: 30_000 }, async () => {
  const { inspectDarwinMarkedProcesses } = await import(
    '../scripts/qa-evidence/phase9/lifecycle-guardian.mjs'
  );
  const markerName = 'PHASE9_GUARDIAN_RUN_MARKER';
  const marker = createHash('sha256').update(`phase9-empty-argv-${process.pid}`).digest('hex');
  const child = spawn(process.execPath, [
    '-e', 'process.on("SIGTERM",()=>process.exit(0));setInterval(()=>{},1000)',
    '', `embedded-${markerName}-name`, `embedded-${marker}-value`, '--switch-looking=one element',
  ], { env: { ...process.env, [markerName]: marker }, stdio: 'ignore' });
  const stop = () => new Promise(resolvePromise => {
    if (child.exitCode !== null || child.signalCode !== null) return resolvePromise();
    child.once('close', resolvePromise);
    try { child.kill('SIGKILL'); } catch { resolvePromise(); }
  });
  try {
    const explicit = await inspectDarwinMarkedProcesses(marker, [child.pid]);
    const all = await inspectDarwinMarkedProcesses(marker);
    assert.equal(explicit.length, 1);
    assert.deepEqual(all, explicit);
    assert.equal(explicit[0].argv.includes(''), true);
    assert.equal(explicit[0].argv.includes('--switch-looking=one element'), true);
    const publicOutput = JSON.stringify(explicit);
    assert.equal(publicOutput.includes(markerName), false);
    assert.equal(publicOutput.includes(marker), false);
  } finally {
    await stop();
  }
});

test('phase 9 Darwin inspector treats a real empty argv0 as a marked rogue without shifting environment into argv', { timeout: 30_000 }, async () => {
  const {
    inspectDarwinMarkedProcessesForTermination,
    terminateMarkedProcesses,
  } = await import('../scripts/qa-evidence/phase9/lifecycle-guardian.mjs');
  assert.equal(typeof inspectDarwinMarkedProcessesForTermination, 'function');
  assert.equal(typeof terminateMarkedProcesses, 'function');
  const markerName = 'PHASE9_GUARDIAN_RUN_MARKER';
  const marker = createHash('sha256').update(`phase9-empty-argv0-${process.pid}`).digest('hex');
  const child = spawn(process.execPath, [
    '-e', 'process.on("SIGTERM",()=>process.exit(0));setInterval(()=>{},1000)',
    '', '--later-empty-preserved',
  ], {
    argv0: '', env: { ...process.env, [markerName]: marker }, stdio: 'ignore',
  });
  try {
    const records = await inspectDarwinMarkedProcessesForTermination(marker, [child.pid]);
    assert.equal(records.length, 1);
    assert.equal(records[0].pid, child.pid);
    assert.equal(records[0].inspectionError, true);
    assert.deepEqual(records[0].argv, []);
    const publicOutput = JSON.stringify(records);
    assert.equal(publicOutput.includes(markerName), false);
    assert.equal(publicOutput.includes(marker), false);
    assert.equal(publicOutput.includes(`${markerName}=`), false);
    let inspectionUncertain = false;
    const terminated = await terminateMarkedProcesses(marker, 1_000, {
      onInspectionError: () => { inspectionUncertain = true; },
    });
    assert.equal(terminated.cleared, true);
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise(resolvePromise => child.once('close', resolvePromise));
    }
    assert.equal(pidAlive(child.pid), false);
    assert.equal(inspectionUncertain, true, 'termination inspection uncertainty must remain sticky after kill');
    assert.deepEqual(await inspectDarwinMarkedProcessesForTermination(marker), []);
    assert.equal(inspectionUncertain, true, 'a later empty audit cannot restore certification');
  } finally {
    try { child.kill('SIGKILL'); } catch {}
  }
});

test('phase 9 Darwin termination keeps a cleared-false result sticky after a clean retry', { timeout: 30_000 }, async () => {
  const originalExecFile = childProcess.execFile;
  let inspectorCalls = 0;
  let liveInspectorOutput = null;
  childProcess.execFile = function boundedSurvivorSnapshot(command, args, options, callback) {
    if (command === '/usr/bin/python3' && Array.isArray(args)
      && args[0] === '-c' && args.includes('--marker-name')) {
      inspectorCalls += 1;
      const callNumber = inspectorCalls;
      if (callNumber === 5 && liveInspectorOutput !== null) {
        queueMicrotask(() => callback(null, liveInspectorOutput, ''));
        return undefined;
      }
      return originalExecFile.call(this, command, args, options, (error, stdout, stderr) => {
        if (!error && callNumber === 1) liveInspectorOutput = stdout;
        callback(error, stdout, stderr);
      });
    }
    return originalExecFile.call(this, command, args, options, callback);
  };
  syncBuiltinESMExports();
  const markerName = 'PHASE9_GUARDIAN_RUN_MARKER';
  const marker = createHash('sha256').update(`phase9-termination-retry-${process.pid}`).digest('hex');
  const child = spawn(process.execPath, [
    '-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)',
  ], { env: { ...process.env, [markerName]: marker }, stdio: 'ignore' });
  let inspectionUncertain = false;
  try {
    const { terminateMarkedProcesses } = await import(
      `../scripts/qa-evidence/phase9/lifecycle-guardian.mjs?cleared-false=${Date.now()}`
    );
    const first = await terminateMarkedProcesses(marker, 0, {
      onInspectionError: () => { inspectionUncertain = true; },
    });
    assert.equal(first.discovered, true);
    assert.equal(first.cleared, false);
    assert.equal(inspectionUncertain, true, 'cleared:false must make process inspection uncertain');
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise(resolvePromise => child.once('close', resolvePromise));
    }
    const retry = await terminateMarkedProcesses(marker, 1_000, {
      onInspectionError: () => { inspectionUncertain = true; },
    });
    assert.equal(retry.cleared, true);
    assert.equal(inspectionUncertain, true, 'a clean retry cannot restore certification');
  } finally {
    try { child.kill('SIGKILL'); } catch {}
    childProcess.execFile = originalExecFile;
    syncBuiltinESMExports();
  }
});

test('phase 9 Darwin inspector keeps marker representation injective and fails closed on unsafe executable paths', { timeout: 30_000 }, async () => {
  const { inspectDarwinMarkedProcessesForTermination } = await import(
    '../scripts/qa-evidence/phase9/lifecycle-guardian.mjs'
  );
  const markerName = 'PHASE9_GUARDIAN_RUN_MARKER';
  const marker = createHash('sha256').update(`phase9-marker-injective-${process.pid}`).digest('hex');
  const trueMarkerArgument = `--${markerName}=${marker}`;
  const children = [];
  const stop = child => new Promise(resolvePromise => {
    if (child.exitCode !== null || child.signalCode !== null) return resolvePromise();
    child.once('close', resolvePromise);
    try { child.kill('SIGKILL'); } catch { resolvePromise(); }
  });
  const unsafeRoot = mkdtempSync('/tmp/phase9-unsafe-executable-');
  try {
    const marked = spawn(process.execPath, [
      '-e', 'setInterval(()=>{},1000)', 'literal-start', '--guardian-marker-present', trueMarkerArgument,
    ], { env: { ...process.env, [markerName]: marker }, stdio: 'ignore' });
    children.push(marked);
    await new Promise(resolvePromise => setTimeout(resolvePromise, 50));
    const [record] = await inspectDarwinMarkedProcessesForTermination(marker, [marked.pid]);
    assert.equal(record.markerPresent, true);
    assert.equal(record.markerArgumentPresent, true);
    assert.equal(record.argv.filter(value => value === '--guardian-marker-present').length, 1);
    assert.equal(record.argv.includes(trueMarkerArgument), false);
    assert.equal(JSON.stringify(record).includes(marker), false);

    const unsafePath = join(unsafeRoot, `credential-fixture-${markerName}-node`);
    copyFileSync(process.execPath, unsafePath);
    chmodSync(unsafePath, 0o700);
    const unsafe = spawn(unsafePath, ['-e', 'setInterval(()=>{},1000)'], {
      env: { ...process.env, [markerName]: marker }, stdio: 'ignore',
    });
    children.push(unsafe);
    await new Promise(resolvePromise => setTimeout(resolvePromise, 50));
    const [unsafeRecord] = await inspectDarwinMarkedProcessesForTermination(marker, [unsafe.pid]);
    assert.equal(unsafeRecord.inspectionError, true);
    assert.equal(unsafeRecord.inspectionErrorKind, 'unsafeExecutablePath');
    assert.equal(unsafeRecord.executable, '');
    const unsafeOutput = JSON.stringify(unsafeRecord);
    assert.equal(unsafeOutput.includes(markerName), false);
    assert.equal(unsafeOutput.includes(marker), false);
    assert.equal(unsafeOutput.includes('credential-fixture'), false);
  } finally {
    await Promise.all(children.map(stop));
    rmSync(unsafeRoot, { recursive: true, force: true });
  }
});

test('phase 9 Darwin inspector bounds aggregate serialization before accumulating many large records', () => {
  const inspectorPath = join(
    testDirectory, '..', 'scripts', 'qa-evidence', 'phase9', 'darwin-process-inspector.py',
  );
  const program = String.raw`
import json, runpy, sys
namespace = runpy.run_path(sys.argv[1], run_name='phase9_inspector_test')
encode = namespace.get('encode_bounded_document')
if not callable(encode):
    raise RuntimeError('bounded-encoder-missing')
iterations = 0
def records():
    global iterations
    payload = 'x' * 16384
    for pid in range(1, 10001):
        iterations += 1
        yield {'pid': pid, 'ppid': 1, 'pgid': 1, 'startSec': 1, 'startUsec': 1,
               'argv': ['/bin/x', payload], 'executable': '/bin/x',
               'markerPresent': True, 'inspectionError': False}
try:
    encode(records())
except RuntimeError as error:
    print(json.dumps({'error': str(error), 'iterations': iterations}))
else:
    raise RuntimeError('aggregate-limit-not-enforced')
`;
  const result = spawnSync('/usr/bin/python3', ['-c', program, inspectorPath], {
    encoding: 'utf8', timeout: 5_000, maxBuffer: 65_536,
    env: { LC_ALL: 'C', PATH: '/usr/bin:/bin' },
  });
  assert.equal(result.status, 0, result.stderr);
  const observed = JSON.parse(result.stdout);
  assert.equal(observed.error, 'aggregate-limit');
  assert.ok(observed.iterations <= 257, `encoder consumed ${observed.iterations} records`);
});

test('phase 9 guardian rejects fixed marked-error inspector records instead of treating them as empty', async () => {
  const { parseDarwinProcessInspectorOutput } = await import(
    '../scripts/qa-evidence/phase9/lifecycle-guardian.mjs'
  );
  assert.equal(typeof parseDarwinProcessInspectorOutput, 'function');
  const record = {
    pid: 43101, ppid: 43100, pgid: 43101, startSec: 1_787_805_000, startUsec: 12,
    argv: [], executable: '', markerPresent: true, markerArgumentPresent: false,
    inspectionError: true, inspectionErrorKind: 'parseFailure',
  };
  const output = JSON.stringify({ version: 2, status: 'ok', records: [record] });
  assert.throws(
    () => parseDarwinProcessInspectorOutput(output, [record.pid]),
    /scenario-closure-failed/i,
  );
  assert.deepEqual(
    parseDarwinProcessInspectorOutput(output, [record.pid], { allowInspectionErrors: true }),
    [record],
  );
  assert.throws(
    () => parseDarwinProcessInspectorOutput(
      JSON.stringify({ version: 2, status: 'error', records: [] }), [],
    ),
    /scenario-closure-failed/i,
  );
});

test('phase 9 guardian rejects oversized and changing marked executables without unbounded reads', { timeout: 60_000 }, async () => {
  const { auditMarkedProcesses } = await import('../scripts/qa-evidence/phase9/lifecycle-guardian.mjs');
  assert.equal(typeof auditMarkedProcesses, 'function');
  const root = mkdtempSync('/tmp/phase9-executable-audit-');
  const children = [];
  const launch = (path, marker) => {
    const child = spawn(path, [
      '-e', 'process.on("SIGTERM",()=>process.exit(0));setInterval(()=>{},1000)',
    ], { env: { ...process.env, PHASE9_GUARDIAN_RUN_MARKER: marker }, stdio: 'ignore' });
    children.push(child);
    return child;
  };
  const stop = child => new Promise(resolvePromise => {
    if (child.exitCode !== null || child.signalCode !== null) return resolvePromise();
    child.once('close', resolvePromise);
    try { child.kill('SIGKILL'); } catch { resolvePromise(); }
  });
  try {
    const cancelledMarker = createHash('sha256').update(`cancelled-${process.pid}`).digest('hex');
    const cancelled = launch(process.execPath, cancelledMarker);
    assert.ok(cancelled.pid > 1);
    const cancellation = new AbortController();
    cancellation.abort();
    await assert.rejects(
      auditMarkedProcesses(cancelledMarker, { signal: cancellation.signal }),
      /scenario-closure-failed/i,
    );
    await stop(cancelled);

    const oversizedPath = join(root, 'oversized-node');
    copyFileSync(process.execPath, oversizedPath);
    chmodSync(oversizedPath, 0o700);
    truncateSync(oversizedPath, 536_870_913);
    const oversizedMarker = createHash('sha256').update(`oversized-${process.pid}`).digest('hex');
    const oversized = launch(oversizedPath, oversizedMarker);
    assert.ok(oversized.pid > 1);
    await assert.rejects(auditMarkedProcesses(oversizedMarker), /scenario-closure-failed/i);
    await stop(oversized);

    const changingPath = join(root, 'changing-node');
    copyFileSync(process.execPath, changingPath);
    chmodSync(changingPath, 0o700);
    const changingMarker = createHash('sha256').update(`changing-${process.pid}`).digest('hex');
    const changing = launch(changingPath, changingMarker);
    assert.ok(changing.pid > 1);
    let mode = 0o700;
    const mutator = setInterval(() => {
      mode = mode === 0o700 ? 0o500 : 0o700;
      try { chmodSync(changingPath, mode); } catch {}
    }, 1);
    try {
      await assert.rejects(auditMarkedProcesses(changingMarker), /scenario-closure-failed/i);
    } finally {
      clearInterval(mutator);
      await stop(changing);
    }
  } finally {
    await Promise.all(children.map(stop));
    rmSync(root, { recursive: true, force: true });
  }
});

test('phase 9 executable hashing rejects a delayed final read within the configured deadline', { timeout: 10_000 }, async () => {
  const executable = realpathSync(
    '/Applications/Xcode.app/Contents/Developer/Library/Frameworks/Python3.framework/Versions/3.9/Resources/Python.app/Contents/MacOS/Python',
  );
  const originalOpen = fs.promises.open;
  fs.promises.open = async (...args) => {
    const handle = await originalOpen(...args);
    if (args[0] !== executable) return handle;
    const delay = () => new Promise(resolvePromise => setTimeout(resolvePromise, 100));
    return {
      stat: handle.stat.bind(handle),
      close: handle.close.bind(handle),
      read: handle.read.bind(handle),
      createReadStream() {
        let reads = 0;
        return {
          [Symbol.asyncIterator]() { return this; },
          async next() {
            if (reads > 0) {
              await delay();
              return { done: true, value: undefined };
            }
            reads += 1;
            const metadata = await handle.stat();
            const buffer = Buffer.alloc(metadata.size);
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
            return { done: false, value: buffer.subarray(0, bytesRead) };
          },
          destroy() {},
        };
      },
    };
  };
  syncBuiltinESMExports();
  const marker = createHash('sha256').update(`phase9-slow-final-read-${process.pid}`).digest('hex');
  const child = spawn('/usr/bin/python3', ['-c', 'import time; time.sleep(5)'], {
    env: { ...process.env, PHASE9_GUARDIAN_RUN_MARKER: marker }, stdio: 'ignore',
  });
  try {
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
    const guardianModule = await import(
      `../scripts/qa-evidence/phase9/lifecycle-guardian.mjs?slow-final-read=${Date.now()}`
    );
    const startedAt = Date.now();
    await assert.rejects(
      guardianModule.auditMarkedProcesses(marker, { executableHashTimeoutMs: 20 }),
      /scenario-closure-failed/i,
    );
    assert.ok(Date.now() - startedAt < 1_000, 'deadline must not await the delayed read');
  } finally {
    fs.promises.open = originalOpen;
    syncBuiltinESMExports();
    try { child.kill('SIGKILL'); } catch {}
  }
});

test('phase 9 guardian Chrome argv schema rejects duplicates, altered values, positional extras, and unknown renderer switches', async () => {
  const { chromeProcessCommandIsExact } = await import(
    '../scripts/qa-evidence/phase9/lifecycle-guardian.mjs'
  );
  assert.equal(typeof chromeProcessCommandIsExact, 'function');
  const marker = 'ab'.repeat(32);
  const binaryPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const appPath = '/Applications/Google Chrome.app';
  const profileRoot = '/tmp/phase9-core-identities.test/playwright-tmp';
  const profilePath = `${profileRoot}/playwright_chromiumdev_profile-a1B2_c3`;
  const mainArguments = [
    '--disable-field-trial-config', '--disable-background-networking',
    '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows',
    '--disable-back-forward-cache', '--disable-breakpad',
    '--disable-client-side-phishing-detection',
    '--disable-component-extensions-with-background-pages', '--disable-component-update',
    '--no-default-browser-check', '--disable-default-apps', '--disable-dev-shm-usage',
    '--disable-edgeupdater', '--disable-extensions',
    '--disable-features=AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,BlockOriginHeaderModificationOnRedirect,Translate,AutoDeElevate,OptimizationHints,msForceBrowserSignIn,msEdgeUpdateLaunchServicesPreferredVersion',
    '--enable-features=CDPScreenshotNewSurface', '--allow-pre-commit-input',
    '--disable-hang-monitor', '--disable-ipc-flooding-protection', '--disable-popup-blocking',
    '--disable-prompt-on-repost', '--disable-renderer-backgrounding',
    '--disable-updater-scheduler', '--force-color-profile=srgb', '--metrics-recording-only',
    '--no-first-run', '--password-store=basic', '--use-mock-keychain',
    '--no-service-autorun', '--export-tagged-pdf', '--disable-search-engine-choice-screen',
    '--unsafely-disable-devtools-self-xss-warnings', '--edge-skip-compat-layer-relaunch',
    '--disable-infobars', '--disable-search-engine-choice-screen', '--disable-sync',
    '--enable-unsafe-swiftshader', '--headless', '--hide-scrollbars', '--mute-audio',
    '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4',
    '--disable-blink-features=AutomationControlled', `--user-data-dir=${profilePath}`,
    '--remote-debugging-pipe', '--no-startup-window',
  ];
  const mainRecord = Object.freeze({
    executable: binaryPath,
    argv: [binaryPath, ...mainArguments],
    markerPresent: true, markerArgumentPresent: true,
  });
  const policy = Object.freeze({ appPath, binaryPath });
  assert.equal(chromeProcessCommandIsExact(mainRecord, { marker, policy, profileRoot }), true);
  assert.equal(chromeProcessCommandIsExact({
    ...mainRecord, argv: [...mainRecord.argv, '--headless'],
  }, { marker, policy, profileRoot }), false);
  assert.equal(chromeProcessCommandIsExact({
    ...mainRecord,
    argv: mainRecord.argv.map(argument => argument.startsWith('--disable-features=')
      ? '--disable-features=TotallyUnreviewed' : argument),
  }, { marker, policy, profileRoot }), false);
  assert.equal(chromeProcessCommandIsExact({
    ...mainRecord, argv: [...mainRecord.argv, 'about:blank'],
  }, { marker, policy, profileRoot }), false);
  assert.equal(chromeProcessCommandIsExact({
    ...mainRecord, argv: [...mainRecord.argv, '--guardian-marker-present'],
  }, { marker, policy, profileRoot }), false);

  const rendererExecutable = `${appPath}/Contents/Frameworks/Google Chrome Framework.framework/Versions/151.0.7922.174/Helpers/Google Chrome Helper (Renderer).app/Contents/MacOS/Google Chrome Helper (Renderer)`;
  const rendererArguments = [
    '--type=renderer', '--noerrdialogs', `--user-data-dir=${profilePath}`,
    '--disable-back-forward-cache', '--disable-background-timer-throttling', '--disable-breakpad',
    '--force-color-profile=srgb', '--remote-debugging-pipe', '--allow-pre-commit-input',
    '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4',
    '--disable-blink-features=AutomationControlled', '--lang=en-US', '--num-raster-threads=4',
    '--enable-zero-copy', '--enable-gpu-memory-buffer-compositor-resources',
    '--enable-main-frame-before-activation', '--renderer-client-id=7',
    '--time-ticks-at-unix-epoch=-1787406128801877', '--launch-time-ticks=379887831643',
    '--shared-files', '--field-trial-handle=1718379636,r,10259959953956197231,17625069593989021452,262144',
    '--enable-features=CDPScreenshotNewSurface',
    '--disable-features=AutoDeElevate,AvoidUnnecessaryBeforeUnloadCheckSync,BlockOriginHeaderModificationOnRedirect,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,OptimizationHints,PaintHolding,ThirdPartyStoragePartitioning,Translate,msEdgeUpdateLaunchServicesPreferredVersion,msForceBrowserSignIn',
    '--variations-seed-version',
    '--pseudonymization-salt-handle=1935764596,r,8868994880592869196,14761491163183821986,4',
    '--trace-process-track-uuid=3190708992871164437', '--seatbelt-client=80',
  ];
  const rendererRecord = Object.freeze({
    executable: rendererExecutable,
    argv: [rendererExecutable, ...rendererArguments],
    markerPresent: true, markerArgumentPresent: false,
  });
  assert.equal(chromeProcessCommandIsExact(
    rendererRecord, { policy, profilePath, profileRoot },
  ), true);
  assert.equal(chromeProcessCommandIsExact({
    ...rendererRecord, argv: [...rendererRecord.argv, '--totally-unreviewed'],
  }, { policy, profilePath, profileRoot }), false);
});

test('phase 9 guardian retains only an exact real browser marker across both lifecycle phases', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
  await cleanupRealGuardianIntegration();
  let retainedBoundaryObserved = false;
  const fixture = lifecycleGuardianFixture({
    runnerMode: 'real-retained-browser',
    scenarioJoinTimeoutMs: REAL_GUARDIAN_JOIN_TIMEOUT_MS,
    browserClient: realGuardianBrowserClient,
    async beforeTransition() {
      const info = JSON.parse(readFileSync(realGuardianInfoPath('before-transition'), 'utf8'));
      assert.deepEqual(
        (await realGuardianBrowserClient.listBrowsers({
          temporaryDirectory: realGuardianProfileRoot,
        })).browsers.map(item => item.name).sort(),
        [realGuardianSession],
      );
      const lines = markedProcessLines(info.marker);
      assert.equal(lines.some(line => line.includes('/node_modules/playwright-core/lib/entry/cliDaemon.js')), true);
      assert.equal(lines.some(line => line.includes('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
        && line.includes(`--PHASE9_GUARDIAN_RUN_MARKER=${info.marker}`)), true);
      retainedBoundaryObserved = true;
    },
  });
  try {
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(retainedBoundaryObserved, true);
    assert.equal(result.rows.length, 44);
    assert.equal(result.rows.filter(row => row.startState === 'pending_deletion').length, 4);
    const beforeInfo = JSON.parse(readFileSync(realGuardianInfoPath('before-transition'), 'utf8'));
    const afterInfo = JSON.parse(readFileSync(realGuardianInfoPath('after-transition'), 'utf8'));
    assert.equal(afterInfo.attached, true);
    const canonicalAfterRelease = buildPhase9ProductionSessionLifecyclePlan(
      buildCanonicalScenarioPlan().filter(row => row.startState === 'pending_deletion'),
      'after-transition',
    ).releasedSessions;
    assert.deepEqual(afterInfo.releasedBrowserSessions, [
      ...canonicalAfterRelease, realGuardianSession,
    ].sort());
    assert.deepEqual((await realGuardianBrowserClient.listBrowsers()).browsers, []);
    assert.deepEqual(markedProcessLines(beforeInfo.marker), []);
    assert.deepEqual(markedProcessLines(afterInfo.marker), []);
  } finally {
    await cleanupRealGuardianIntegration();
  }
});

test('phase 9 guardian owns a real browser before an acquisition-audit crash can strand it', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
  await cleanupRealGuardianIntegration();
  let browserFirstCloseObserved = false;
  const orderedBrowserClient = {
    async closeBrowser(session, context) {
      if (session === realGuardianCrashSession) {
        const info = JSON.parse(readFileSync(realGuardianInfoPath('before-transition'), 'utf8'));
        assert.notDeepEqual(markedProcessLines(info.marker), []);
        browserFirstCloseObserved = true;
      }
      return realGuardianBrowserClient.closeBrowser(session, context);
    },
    listBrowsers: context => realGuardianBrowserClient.listBrowsers(context),
  };
  const fixture = lifecycleGuardianFixture({
    runnerMode: 'real-retained-browser-acquisition-crash',
    scenarioJoinTimeoutMs: REAL_GUARDIAN_JOIN_TIMEOUT_MS,
    browserClient: orderedBrowserClient,
  });
  try {
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(result.ok, false);
    assert.equal(result.browserClosureCertified, false);
    assert.equal(result.closureCertified, false);
    assert.equal(result.workspacePreservation, 'verified-present');
    assert.equal(result.manifestPreservation, 'verified-present');
    assert.equal(browserFirstCloseObserved, true);
    assert.equal(existsSync(realGuardianProfileRoot), false);
    const info = JSON.parse(readFileSync(realGuardianInfoPath('before-transition'), 'utf8'));
    assert.deepEqual(markedProcessLines(info.marker), []);
  } finally {
    await cleanupRealGuardianIntegration();
  }
});

test('phase 9 guardian closes its real browser before killing an extra marked rogue process', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
  await cleanupRealGuardianIntegration();
  let closeObservedLiveRogue = false;
  const orderedBrowserClient = Object.freeze({
    async closeBrowser(session) {
      const info = JSON.parse(readFileSync(realGuardianInfoPath('before-transition'), 'utf8'));
      assert.equal(pidAlive(info.roguePid), true);
      closeObservedLiveRogue = true;
      return realGuardianBrowserClient.closeBrowser(session, { temporaryDirectory: realGuardianProfileRoot });
    },
    listBrowsers: options => realGuardianBrowserClient.listBrowsers(options),
  });
  const fixture = lifecycleGuardianFixture({
    runnerMode: 'real-retained-browser-rogue',
    scenarioJoinTimeoutMs: REAL_GUARDIAN_JOIN_TIMEOUT_MS,
    browserClient: orderedBrowserClient,
  });
  try {
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    const info = JSON.parse(readFileSync(realGuardianInfoPath('before-transition'), 'utf8'));
    assert.equal(result.ok, false);
    assert.equal(result.category, 'scenario-closure-failed');
    assert.equal(result.browserClosureCertified, false);
    assert.equal(result.closureCertified, false);
    assert.equal(result.workspacePreservation, 'verified-present');
    assert.equal(result.manifestPreservation, 'verified-present');
    assert.equal(closeObservedLiveRogue, true);
    assert.equal(fixture.events.includes('fixture:cleanup'), false);
    assert.equal(fixture.workspaceExists, true);
    assert.equal(pidAlive(info.roguePid), false);
    assert.deepEqual((await realGuardianBrowserClient.listBrowsers()).browsers, []);
    assert.deepEqual(markedProcessLines(info.marker), []);
  } finally {
    await cleanupRealGuardianIntegration();
  }
});

test('phase 9 guardian rejects a declared real retained browser missing from inventory', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
  await cleanupRealGuardianIntegration();
  const fixture = lifecycleGuardianFixture({
    runnerMode: 'real-retained-browser-missing-session',
    scenarioJoinTimeoutMs: REAL_GUARDIAN_JOIN_TIMEOUT_MS,
    browserClient: realGuardianBrowserClient,
  });
  try {
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    const info = JSON.parse(readFileSync(realGuardianInfoPath('before-transition'), 'utf8'));
    assert.equal(result.ok, false);
    assert.equal(result.category, 'scenario-closure-failed');
    assert.equal(result.browserClosureCertified, false);
    assert.equal(result.closureCertified, false);
    assert.equal(result.workspacePreservation, 'verified-present');
    assert.equal(result.manifestPreservation, 'verified-present');
    assert.equal(fixture.events.includes('fixture:cleanup'), false);
    assert.deepEqual((await realGuardianBrowserClient.listBrowsers()).browsers, []);
    assert.deepEqual(markedProcessLines(info.marker), []);
  } finally {
    await cleanupRealGuardianIntegration();
  }
});

test('phase 9 guardian binds two real retained sessions to distinct immutable launch receipts', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
  await cleanupRealGuardianIntegration();
  let boundaryReceipts;
  const fixture = lifecycleGuardianFixture({
    runnerMode: 'real-retained-browser-two-sessions',
    scenarioJoinTimeoutMs: REAL_GUARDIAN_JOIN_TIMEOUT_MS,
    browserClient: realGuardianBrowserClient,
    async beforeTransition() {
      const info = JSON.parse(readFileSync(realGuardianInfoPath('before-transition'), 'utf8'));
      assert.deepEqual(
        (await realGuardianBrowserClient.listBrowsers({
          temporaryDirectory: realGuardianProfileRoot,
        })).browsers.map(item => item.name).sort(),
        [...realGuardianTwoSessions],
      );
      assert.deepEqual(info.launchReceipts.map(receipt => receipt.session).sort(), [...realGuardianTwoSessions]);
      assert.equal(new Set(info.launchReceipts.map(receipt => receipt.daemonPid)).size, 2);
      assert.equal(new Set(info.launchReceipts.map(receipt => receipt.chromeMainPid)).size, 2);
      assert.deepEqual(info.viewports, {
        [realGuardianTwoSessions[0]]: { width: 390, height: 844 },
        [realGuardianTwoSessions[1]]: { width: 1440, height: 900 },
      });
      boundaryReceipts = info.launchReceipts;
    },
  });
  try {
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.rows.length, 44);
    assert.equal(result.rows.filter(row => row.startState === 'pending_deletion').length, 4);
    const afterInfo = JSON.parse(readFileSync(realGuardianInfoPath('after-transition'), 'utf8'));
    assert.equal(afterInfo.attached, true);
    assert.deepEqual(afterInfo.viewports, {
      [realGuardianTwoSessions[0]]: { width: 390, height: 844 },
      [realGuardianTwoSessions[1]]: { width: 1440, height: 900 },
    });
    for (const receipt of boundaryReceipts) {
      assert.equal(pidAlive(receipt.daemonPid), false);
      assert.equal(pidAlive(receipt.chromeMainPid), false);
    }
    assert.deepEqual((await realGuardianBrowserClient.listBrowsers()).browsers, []);
  } finally {
    await cleanupRealGuardianIntegration();
  }
});

test('phase 9 guardian rejects two declared sessions when the second Chrome main is missing', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
  await cleanupRealGuardianIntegration();
  const fixture = lifecycleGuardianFixture({
    runnerMode: 'real-retained-browser-two-sessions-missing-second-chrome',
    scenarioJoinTimeoutMs: REAL_GUARDIAN_JOIN_TIMEOUT_MS,
    browserClient: realGuardianBrowserClient,
  });
  try {
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(result.ok, false);
    assert.equal(result.category, 'scenario-closure-failed');
    assert.equal(result.browserClosureCertified, false);
    assert.equal(result.closureCertified, false);
    assert.equal(result.workspacePreservation, 'verified-present');
    assert.equal(result.manifestPreservation, 'verified-present');
    assert.deepEqual((await realGuardianBrowserClient.listBrowsers()).browsers, []);
  } finally {
    await cleanupRealGuardianIntegration();
  }
});

test('phase 9 guardian rejects an extra marked direct Chrome main outside its two receipts', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
  await cleanupRealGuardianIntegration();
  const fixture = lifecycleGuardianFixture({
    runnerMode: 'real-retained-browser-two-sessions-extra-direct-chrome',
    scenarioJoinTimeoutMs: REAL_GUARDIAN_JOIN_TIMEOUT_MS,
    browserClient: realGuardianBrowserClient,
  });
  try {
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    const info = JSON.parse(readFileSync(realGuardianInfoPath('before-transition'), 'utf8'));
    assert.equal(result.ok, false);
    assert.equal(result.category, 'scenario-closure-failed');
    assert.equal(result.browserClosureCertified, false);
    assert.equal(result.closureCertified, false);
    assert.equal(result.workspacePreservation, 'verified-present');
    assert.equal(result.manifestPreservation, 'verified-present');
    assert.equal(pidAlive(info.roguePid), false);
    assert.deepEqual((await realGuardianBrowserClient.listBrowsers()).browsers, []);
  } finally {
    await cleanupRealGuardianIntegration();
  }
});

test('phase 9 guardian rejects a marked daemon command look-alike with the wrong executable', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
  await cleanupRealGuardianIntegration();
  const fixture = lifecycleGuardianFixture({
    runnerMode: 'real-retained-browser-two-sessions-lookalike-daemon',
    scenarioJoinTimeoutMs: REAL_GUARDIAN_JOIN_TIMEOUT_MS,
    browserClient: realGuardianBrowserClient,
  });
  try {
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    const info = JSON.parse(readFileSync(realGuardianInfoPath('before-transition'), 'utf8'));
    assert.equal(result.ok, false);
    assert.equal(result.category, 'scenario-closure-failed');
    assert.equal(result.browserClosureCertified, false);
    assert.equal(result.closureCertified, false);
    assert.equal(result.workspacePreservation, 'verified-present');
    assert.equal(result.manifestPreservation, 'verified-present');
    assert.equal(pidAlive(info.roguePid), false);
    assert.deepEqual((await realGuardianBrowserClient.listBrowsers()).browsers, []);
  } finally {
    await cleanupRealGuardianIntegration();
  }
});

test('phase 9 lifecycle guardian never closes a pre-existing unowned browser session', async () => {
  const fixture = lifecycleGuardianFixture({ initialBrowsers: ['user-owned-session'] });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.category, 'browser-precondition-failed');
  assert.equal(fixture.events.some(event => event.startsWith('browser:close')), false);
  assert.equal(fixture.events.includes('fs:mkdtemp'), false);
  assert.deepEqual([...fixture.browserSessions], ['user-owned-session']);
});

test('phase 9 lifecycle guardian validates exact deployment run and open PR before mutation', async t => {
  for (const [name, mutate] of [
    ['wrong deployed SHA', result => ({ ...result, runSha: 'abcdef0123456789abcdef0123456789abcdef01' })],
    ['wrong staging run', result => ({ ...result, stagingRunId: '99999999999' })],
    ['failed staging run', result => ({ ...result, runConclusion: 'failure' })],
    ['closed PR', result => ({ ...result, pullRequestState: 'CLOSED' })],
    ['merged PR', result => ({ ...result, pullRequestMerged: true })],
    ['wrong PR head', result => ({ ...result, pullRequestHeadSha: 'abcdef0123456789abcdef0123456789abcdef01' })],
  ]) await t.test(name, async () => {
    const fixture = lifecycleGuardianFixture({
      preconditionResult: ({ result }) => mutate(result),
    });
    const lifecycleResult = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(lifecycleResult.ok, false);
    assert.equal(lifecycleResult.category, 'hosted-precondition-failed');
    assert.equal(fixture.events.includes('fs:mkdtemp'), false);
    assert.equal(fixture.events.includes('fixture:seed'), false);
    assert.equal(fixture.events.some(event => event.startsWith('browser:close')), false);
  });
});

test('phase 9 lifecycle guardian rejects command and lifecycle contract failures despite exit zero', async t => {
  const cases = [
    ['nonzero preflight', ({ command, result }) => command === 'preflight' ? { exitCode: 2, stdout: JSON.stringify(result) } : undefined, 'command-failed'],
    ['malformed seed JSON', ({ command }) => command === 'seed' ? { exitCode: 0, stdout: '{' } : undefined, 'invalid-result'],
    ['inspect ok false', ({ command, result, inspectCount }) => command === 'inspect' && inspectCount === 1 ? { exitCode: 0, stdout: JSON.stringify({ ...result, ok: false }) } : undefined, 'invalid-result'],
    ['inspect drift', ({ command, result, inspectCount }) => command === 'inspect' && inspectCount === 1 ? { exitCode: 0, stdout: JSON.stringify({ ...result, drift: ['private'], states: { manifest: 'seeded', problems: 1 } }) } : undefined, 'invalid-result'],
    ['preclean inspect drift', ({ command, result, inspectCount }) => command === 'inspect' && inspectCount === 2 ? { exitCode: 0, stdout: JSON.stringify({ ...result, drift: ['private'], states: { manifest: 'seeded', problems: 1 } }) } : undefined, 'invalid-result'],
    ['malformed transition', ({ command, result }) => command === 'transition' ? { exitCode: 0, stdout: JSON.stringify({ ...result, alias: 'wrong' }) } : undefined, 'invalid-result'],
    ['cleanup ok false on exit zero', ({ command, result }) => command === 'cleanup' ? { exitCode: 0, stdout: JSON.stringify({ ...result, ok: false }) } : undefined, 'invalid-result'],
    ['cleanup retention', ({ command, result }) => command === 'cleanup' ? { exitCode: 0, stdout: JSON.stringify({ ...result, retained: ['auth'] }) } : undefined, 'invalid-result'],
    ['cleanup failures', ({ command, result }) => command === 'cleanup' ? { exitCode: 0, stdout: JSON.stringify({ ...result, followUp: { ...result.followUp, failures: { ...result.followUp.failures, auth: { count: 1, aliases: ['private'] } } } }) } : undefined, 'invalid-result'],
    ['clean inspect still present', ({ command, result, inspectCount }) => command === 'inspect' && inspectCount >= 3 ? { exitCode: 0, stdout: JSON.stringify({ ...result, aliases: guardianSortedAliases, states: { manifest: 'seeded', problems: 0 }, counts: { ...result.counts, actualPresent: { auth: 20, firestore: 82 } } }) } : undefined, 'invalid-result'],
  ];
  for (const [name, commandResult, category] of cases) await t.test(name, async () => {
    const fixture = lifecycleGuardianFixture({ commandResult });
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(result.ok, false);
    assert.equal(result.category, category);
    assert.equal(JSON.stringify(result).includes('/tmp/'), false);
    assert.equal(JSON.stringify(result).includes('private'), false);
  });
});

test('phase 9 lifecycle guardian rejects nonzero fixture exits at every mutating boundary', async t => {
  const cases = [
    ['seed', ({ command }) => command === 'seed'],
    ['initial inspect', ({ command, inspectCount }) => command === 'inspect' && inspectCount === 1],
    ['transition', ({ command }) => command === 'transition'],
    ['preclean inspect', ({ command, inspectCount }) => command === 'inspect' && inspectCount === 2],
    ['cleanup', ({ command }) => command === 'cleanup'],
    ['clean inspect', ({ command, inspectCount }) => command === 'inspect' && inspectCount === 3],
  ];
  for (const [name, matches] of cases) await t.test(name, async () => {
    const fixture = lifecycleGuardianFixture({
      commandResult: details => matches(details)
        ? { exitCode: 9, stdout: JSON.stringify(details.result) }
        : undefined,
    });
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(result.ok, false);
    assert.equal(result.category, 'command-failed');
    assert.equal(JSON.stringify(result).includes(fixture.manifestPath), false);
  });
});

test('phase 9 lifecycle guardian preserves exact recovery state when browser closure or manifest certainty fails', async t => {
  for (const [name, overrides, category, manifestPreservation] of [
    ['browser close failure', { browserCloseFailure: true }, 'browser-closure-failed', 'verified-present'],
    ['browser list remains nonempty', { remainingBrowsersAfterClose: true }, 'browser-closure-failed', 'verified-present'],
    ['manifest is corrupt', { corruptManifest: true }, 'manifest-uncertain', 'uncertain'],
    ['manifest is missing after seed', { missingManifest: true }, 'manifest-uncertain', 'verified-absent'],
  ]) await t.test(name, async () => {
    const fixture = lifecycleGuardianFixture({
      ...overrides,
      ...(overrides.browserCloseFailure || overrides.remainingBrowsersAfterClose
        ? { runnerMode: 'own-before' }
        : {}),
    });
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(result.ok, false);
    assert.equal(result.category, category);
    assert.equal(result.workspacePreservation, 'verified-present');
    assert.equal(result.manifestPreservation, manifestPreservation);
    assert.equal(fixture.workspaceExists, true);
    assert.equal(fixture.events.includes('fs:remove-credential'), false);
    assert.equal(fixture.events.includes('fs:remove-workspace'), false);
  });
});

test('phase 9 lifecycle guardian fails closed on incomplete probe and removal uncertainty', async t => {
  const probe = lifecycleGuardianFixture({
    adapterFactory: async () => ({
      projectId: 'the-squad-v2-staging',
      connect: () => ({
        auth: { async getUser() { throw Object.assign(new Error('not found'), { code: 'auth/user-not-found' }); } },
        firestore: { async get() { throw new Error('raw probe failure'); } },
      }),
    }),
  });
  const probeResult = await runGuardedLifecycle({ ...probe.dependencies, options: probe.options });
  assert.equal(probeResult.ok, false);
  assert.equal(probeResult.category, 'independent-probe-failed');
  assert.equal(probeResult.workspacePreservation, 'verified-present');

  const wrongProject = lifecycleGuardianFixture({
    adapterFactory: async () => ({ projectId: 'wrong-project', connect: () => ({}) }),
  });
  const wrongProjectResult = await runGuardedLifecycle({ ...wrongProject.dependencies, options: wrongProject.options });
  assert.equal(wrongProjectResult.ok, false);
  assert.equal(wrongProjectResult.category, 'independent-probe-failed');

  const unexpectedPresence = lifecycleGuardianFixture({
    adapterFactory: async () => ({
      projectId: 'the-squad-v2-staging',
      connect: () => ({
        auth: { async getUser() { throw Object.assign(new Error('not found'), { code: 'auth/user-not-found' }); } },
        firestore: { async get() { return { exists: true, data: () => ({}) }; } },
      }),
    }),
  });
  const unexpectedPresenceResult = await runGuardedLifecycle({ ...unexpectedPresence.dependencies, options: unexpectedPresence.options });
  assert.equal(unexpectedPresenceResult.ok, false);
  assert.equal(unexpectedPresenceResult.category, 'independent-probe-failed');

  for (const [name, overrides, category] of [
    ['credential removal', { credentialRemovalFailure: true }, 'credential-removal-failed'],
    ['credential still present after removal', { credentialRemovalLeavesFile: true }, 'credential-removal-failed'],
    ['workspace removal', { workspaceRemovalFailure: true }, 'workspace-removal-failed'],
    ['workspace still present after removal', { workspaceRemovalLeavesDirectory: true }, 'workspace-removal-failed'],
    ['workspace partially removed', { workspaceRemovalDeletesFilesOnly: true }, 'workspace-removal-failed'],
  ]) await t.test(name, async () => {
    const fixture = lifecycleGuardianFixture(overrides);
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(result.ok, false);
    assert.equal(result.category, category);
    assert.equal(result.state === 'disarmed', false);
    if (overrides.workspaceRemovalDeletesFilesOnly) {
      assert.equal(result.workspacePreservation, 'verified-present');
      assert.equal(result.manifestPreservation, 'verified-absent');
    }
  });
});

test('phase 9 lifecycle guardian reports preservation uncertainty without claiming presence', async () => {
  const fixture = lifecycleGuardianFixture({
    browserCloseFailure: true,
    preservationLstatUncertain: true,
    runnerMode: 'own-before',
  });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.workspacePreservation, 'uncertain');
  assert.equal(result.manifestPreservation, 'uncertain');
  assert.equal(Object.hasOwn(result, 'workspacePreserved'), false);
  assert.equal(Object.hasOwn(result, 'manifestPreserved'), false);
});

test('phase 9 lifecycle guardian rejects unsafe workspace and private-file boundaries', async t => {
  for (const [name, overrides, category] of [
    ['workspace is not mode 0700', { workspaceMode: 0o40755 }, 'manifest-uncertain'],
    ['manifest is not mode 0600', { manifestMode: 0o100644 }, 'manifest-uncertain'],
    ['credential is missing', { missingCredential: true }, 'credential-uncertain'],
    ['credential is not mode 0600', { credentialMode: 0o100644 }, 'credential-uncertain'],
  ]) await t.test(name, async () => {
    const fixture = lifecycleGuardianFixture(overrides);
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(result.ok, false);
    assert.equal(result.category, category);
    assert.equal(JSON.stringify(result).includes(fixture.workspace), false);
  });
});

test('phase 9 lifecycle guardian fails closed when process guarding cannot arm or disarm', async t => {
  for (const [name, overrides, category] of [
    ['handler registration fails', { hookOnFailure: true }, 'guardian-registration-failed'],
    ['handler removal fails', { hookOffFailure: true }, 'guardian-disarm-failed'],
  ]) await t.test(name, async () => {
    const fixture = lifecycleGuardianFixture(overrides);
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(result.ok, false);
    assert.equal(result.category, category);
    assert.equal(result.state === 'disarmed', false);
    assert.equal(JSON.stringify(result).includes('raw hook'), false);
  });
});

test('phase 9 lifecycle guardian cleans exact resources when either scenario phase fails', async t => {
  for (const phase of ['before-transition', 'after-transition']) await t.test(phase, async () => {
    const fixture = lifecycleGuardianFixture({
      runnerMode: phase === 'before-transition' ? 'fail-before' : 'fail-after',
    });
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(result.ok, false);
    assert.equal(result.category, 'scenario-failed');
    assert.equal(result.closureCertified, true);
    assert.equal(fixture.events.filter(event => event === 'fixture:cleanup').length, 1);
    assert.equal(fixture.workspaceExists, false);
    assert.equal(JSON.stringify(result).includes('provider detail'), false);
  });
});

test('phase 9 lifecycle guardian rejects an unpersisted planned-boundary transition before cleanup', async () => {
  const fixture = lifecycleGuardianFixture({ transitionNotPersisted: true });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.category, 'manifest-uncertain');
  assert.equal(result.closureCertified, true);
  assert.equal(fixture.workspaceExists, false);
  assert.equal(fixture.events.filter(event => event === 'fixture:cleanup').length, 1);
});

test('phase 9 lifecycle guardian interruption is idempotent and reentry fails closed', { timeout: 2_000 }, async () => {
  const startedPath = `/tmp/phase9-guardian-child-hang-${process.pid}`;
  const latePath = `/tmp/phase9-guardian-child-late-${process.pid}`;
  rmSync(startedPath, { force: true });
  rmSync(latePath, { force: true });
  const fixture = lifecycleGuardianFixture({
    runnerMode: 'hang-resume-late-write',
    scenarioJoinTimeoutMs: 20,
  });
  const guardian = createLifecycleGuardian(fixture.dependencies);
  const running = guardian.run(fixture.options);
  while (!existsSync(startedPath)) await new Promise(resolve => setImmediate(resolve));
  const second = await guardian.run(fixture.options);
  assert.equal(second.ok, false);
  assert.equal(second.category, 'reentry');
  const interrupt = fixture.handlers.get('SIGTERM');
  const firstEmergencyPromise = interrupt();
  const secondEmergencyPromise = interrupt();
  assert.equal(firstEmergencyPromise, secondEmergencyPromise);
  const [firstEmergency, secondEmergency] = await Promise.all([firstEmergencyPromise, secondEmergencyPromise]);
  assert.deepEqual(secondEmergency, firstEmergency);
  assert.equal(firstEmergency.ok, false);
  assert.equal(firstEmergency.interrupted, true);
  assert.deepEqual(await running, firstEmergency);
  assert.equal(fixture.events.filter(event => event === 'fixture:cleanup').length, 1);
  assert.equal(fixture.events.filter(event => event === 'fs:remove-workspace').length, 1);
  assert.equal(fixture.events.indexOf('browser:close:phase9-hang-owned') < fixture.events.indexOf('fixture:cleanup'), true);
  assert.equal(fixture.events.includes('browser:close-all'), false);
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(existsSync(latePath), false);
  rmSync(startedPath, { force: true });
  rmSync(latePath, { force: true });
});

test('phase 9 lifecycle guardian rejects arbitrary in-process scenario callbacks', async () => {
  const fixture = lifecycleGuardianFixture();
  fixture.options.beforeTransition = async () => {};
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.category, 'configuration-invalid');
  assert.equal(fixture.events.includes('fs:mkdtemp'), false);
  assert.throws(
    () => createLifecycleGuardian({ ...fixture.dependencies, scenarioRunner: { start() {} } }),
    /configuration-invalid/,
  );
  assert.throws(
    () => createLifecycleGuardian({ ...fixture.dependencies, spawn() {} }),
    /configuration-invalid/,
  );
});

test('phase 9 lifecycle guardian preservation proof rejects a corrupt manifest as uncertain', async () => {
  const fixture = lifecycleGuardianFixture({ corruptManifest: true });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.manifestPreservation, 'uncertain');
});

test('phase 9 lifecycle guardian recovers an exact partial seed with fewer manifest-owned deletions', async () => {
  const fixture = lifecycleGuardianFixture({
    manifestState: 'partial',
    commandResult: ({ command, result, inspectCount }) => {
      if (command === 'seed') return { exitCode: 9, stdout: JSON.stringify(result) };
      if (command === 'inspect' && inspectCount === 1) return {
        exitCode: 0,
        stdout: JSON.stringify({
          ...result,
          ok: false,
          aliases: guardianSortedAliases.slice(0, 3),
          states: { manifest: 'partial', problems: 92 },
          counts: { expected: { auth: 20, firestore: 82 }, actualPresent: { auth: 3, firestore: 7 } },
          drift: guardianMissingDrift(3, 7),
        }),
      };
      if (command === 'cleanup') return {
        exitCode: 0,
        stdout: JSON.stringify({ ...result, deleted: { auth: 3, firestore: 7 } }),
      };
      return undefined;
    },
  });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.category, 'command-failed');
  assert.equal(result.closureCertified, true);
  assert.equal(fixture.events.filter(event => event === 'fixture:cleanup').length, 1);
});

test('phase 9 lifecycle guardian rejects forged child completion and closure claims', async () => {
  const fixture = lifecycleGuardianFixture({
    runnerMode: 'forged-claims',
    scenarioJoinTimeoutMs: 20,
  });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.category, 'scenario-runner-invalid');
  assert.equal(result.closureCertified, true);
  assert.equal(fixture.events.filter(event => event === 'fixture:cleanup').length, 1);
  assert.equal(fixture.events.indexOf('browser:list') < fixture.events.indexOf('fixture:cleanup'), true);
});

test('phase 9 lifecycle guardian keeps a frozen launch-receipt mismatch uncertified', async () => {
  const fixture = lifecycleGuardianFixture({ runnerMode: 'receipt-mismatch' });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.category, 'scenario-closure-failed');
  assert.equal(result.browserClosureCertified, false);
  assert.equal(result.closureCertified, false);
  assert.equal(result.workspacePreservation, 'verified-present');
  assert.equal(result.manifestPreservation, 'verified-present');
  assert.equal(fixture.events.includes('fixture:cleanup'), false);
  assert.equal(fixture.workspaceExists, true);
});

test('phase 9 lifecycle guardian keeps a transient owned-browser inventory failure sticky', async () => {
  const fixture = lifecycleGuardianFixture({ runnerMode: 'own-before' });
  const browserClient = fixture.dependencies.browserClient;
  let inventoryCalls = 0;
  fixture.dependencies.browserClient = {
    closeBrowser: (session, context) => browserClient.closeBrowser(session, context),
    async listBrowsers(context) {
      inventoryCalls += 1;
      if (inventoryCalls === 2) throw new Error('transient owned inventory transport failure');
      return browserClient.listBrowsers(context);
    },
  };
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.browserClosureCertified, false);
  assert.equal(result.closureCertified, false);
  assert.equal(result.workspacePreservation, 'verified-present');
  assert.equal(result.manifestPreservation, 'verified-present');
  assert.equal(fixture.workspaceExists, true);
  assert.equal(fixture.events.includes('fs:remove-workspace'), false);
  assert.ok(inventoryCalls >= 3, `expected clean recovery inventory, saw ${inventoryCalls}`);
});

test('phase 9 lifecycle guardian keeps a transient nonempty browser inventory sticky after clean recovery', async () => {
  const fixture = lifecycleGuardianFixture();
  const browserClient = fixture.dependencies.browserClient;
  let inventoryCalls = 0;
  fixture.dependencies.browserClient = {
    closeBrowser: (session, context) => browserClient.closeBrowser(session, context),
    async listBrowsers(context) {
      inventoryCalls += 1;
      if (inventoryCalls === 4) return { browsers: [{ name: 'phase9-adversarial-unowned' }] };
      return browserClient.listBrowsers(context);
    },
  };
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.browserClosureCertified, false);
  assert.equal(result.closureCertified, false);
  assert.equal(result.workspacePreservation, 'verified-present');
  assert.equal(result.manifestPreservation, 'verified-present');
  assert.equal(fixture.workspaceExists, true);
  assert.equal(fixture.events.includes('fixture:cleanup'), false);
  assert.ok(inventoryCalls >= 5, `expected clean recovery inventory, saw ${inventoryCalls}`);
});

test('phase 9 lifecycle guardian keeps a released-but-live session recovery-owned and uncertified', async () => {
  const fixture = lifecycleGuardianFixture();
  const browserClient = fixture.dependencies.browserClient;
  const releasedSession = 'p9-admission-route-qa-parent-a-mobile';
  let inventoryCalls = 0;
  fixture.dependencies.browserClient = {
    closeBrowser: (session, context) => browserClient.closeBrowser(session, context),
    async listBrowsers(context) {
      inventoryCalls += 1;
      if (inventoryCalls === 2) return { browsers: [{ name: releasedSession }] };
      return browserClient.listBrowsers(context);
    },
  };
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.browserClosureCertified, false);
  assert.equal(result.closureCertified, false);
  assert.equal(result.workspacePreservation, 'verified-present');
  assert.equal(result.manifestPreservation, 'verified-present');
  assert.equal(fixture.events.includes(`browser:close:${releasedSession}`), true);
  assert.equal(fixture.events.includes('fixture:cleanup'), false);
  assert.equal(fixture.workspaceExists, true);
});

test('phase 9 lifecycle guardian immediately registers each streamed acquisition before child crash', async t => {
  for (const [mode, sessions] of [
    ['ownership-crash-first', ['phase9-acquired-first']],
    ['ownership-crash-late', ['phase9-acquired-first', 'phase9-acquired-late']],
  ]) await t.test(mode, async () => {
    const fixture = lifecycleGuardianFixture({ runnerMode: mode });
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(result.ok, false);
    for (const session of sessions) {
      assert.equal(fixture.events.includes(`browser:close:${session}`), true);
    }
    assert.equal(fixture.events.includes('browser:close-all'), false);
  });
});

test('phase 9 lifecycle guardian rejects non-monotonic ownership and rows naming unowned sessions', async t => {
  for (const mode of [
    'ownership-duplicate', 'ownership-mutation', 'ownership-out-of-order', 'row-unowned-session',
  ]) await t.test(mode, async () => {
    const fixture = lifecycleGuardianFixture({ runnerMode: mode });
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(result.ok, false);
    assert.equal(
      result.category,
      mode === 'row-unowned-session' ? 'scenario-runner-invalid' : 'scenario-closure-failed',
    );
    if (mode !== 'row-unowned-session') {
      assert.equal(result.closureCertified, false);
      assert.equal(fixture.workspaceExists, true);
    }
  });
});

test('phase 9 lifecycle guardian rejects legacy and empty-session row protocol records', async t => {
  for (const mode of ['row-version-1', 'row-empty-sessions']) await t.test(mode, async () => {
    const fixture = lifecycleGuardianFixture({ runnerMode: mode });
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(result.ok, false);
    assert.equal(result.category, 'scenario-runner-invalid');
    assert.equal(Object.hasOwn(result, 'rows'), false);
  });
});

test('phase 9 row ownership derives the exact canonical browser sessions', async () => {
  const { canonicalBrowserSessionsForRow } = await import(
    '../scripts/qa-evidence/phase9/lifecycle-guardian.mjs'
  );
  assert.equal(typeof canonicalBrowserSessionsForRow, 'function');
  assert.deepEqual(canonicalBrowserSessionsForRow({
    contextId: 'admission-route-qa-parent-a-mobile', group: 'admission-route',
    viewport: '390x844', startState: 'fresh-context',
  }), ['p9-admission-route-qa-parent-a-mobile']);
  assert.deepEqual(canonicalBrowserSessionsForRow({
    contextId: 'logout-qa-parent-a-mobile', group: 'logout',
    viewport: '390x844', startState: 'authenticated-two-tab',
  }), ['p9-logout-qa-parent-a-mobile', 'p9-logout-qa-parent-a-mobile-fresh']);
  assert.deepEqual(canonicalBrowserSessionsForRow({
    contextId: 'pending-deletion-stale-session-mobile', group: 'pending-deletion',
    viewport: '390x844', startState: 'pending_deletion',
  }), ['p9-pending-deletion-active-baseline-mobile']);
});

test('phase 9 lifecycle guardian bounds child stdio before parsing protocol data', async () => {
  const fixture = lifecycleGuardianFixture({
    runnerMode: 'stdio-overflow',
    scenarioJoinTimeoutMs: 20,
  });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.category, 'scenario-runner-invalid');
  assert.equal(result.closureCertified, true);
  assert.equal(fixture.events.filter(event => event === 'fixture:cleanup').length, 1);
});

test('phase 9 lifecycle guardian applies a finite phase deadline and safely recovers a signal-resistant child', { timeout: 10_000 }, async () => {
  const fixture = lifecycleGuardianFixture({
    runnerMode: 'hang-without-signal',
    scenarioJoinTimeoutMs: 40,
    beforeTransitionDeadlineMs: 60,
    afterTransitionDeadlineMs: 60,
  });
  const running = runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  let watchdog;
  const raced = await Promise.race([
    running,
    new Promise(resolvePromise => {
      watchdog = setTimeout(() => resolvePromise({ category: 'test-timeout' }), 3_000);
    }),
  ]);
  clearTimeout(watchdog);
  if (raced.category === 'test-timeout') {
    await fixture.handlers.get('SIGTERM')?.();
    await running;
  }
  assert.equal(raced.ok, false);
  assert.equal(raced.category, 'scenario-deadline-exceeded');
  assert.equal(raced.browserClosureCertified, true);
  assert.equal(raced.closureCertified, true);
  assert.equal(fixture.events.filter(event => event === 'fixture:cleanup').length, 1);
  assert.equal(fixture.events.indexOf('browser:list') < fixture.events.indexOf('fixture:cleanup'), true);
});

test('phase 9 lifecycle guardian rejects a hidden child browser against independent inventory', async () => {
  const markerPath = `/tmp/phase9-guardian-child-browser-${process.pid}`;
  rmSync(markerPath, { force: true });
  const fixture = lifecycleGuardianFixture({ runnerMode: 'hidden-browser' });
  const browserClient = fixture.dependencies.browserClient;
  fixture.dependencies.browserClient = {
    closeBrowser: session => browserClient.closeBrowser(session),
    async listBrowsers() {
      const result = await browserClient.listBrowsers();
      return existsSync(markerPath)
        ? { browsers: [...result.browsers, { name: 'phase9-hidden-browser' }] }
        : result;
    },
  };
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.category, 'browser-closure-failed');
  assert.equal(result.browserClosureCertified, false);
  assert.equal(result.closureCertified, false);
  assert.equal(result.workspacePreservation, 'verified-present');
  assert.equal(fixture.events.includes('fixture:cleanup'), false);
  rmSync(markerPath, { force: true });
});

test('phase 9 lifecycle guardian terminates and joins a surviving child process group before cleanup', async () => {
  const markerPath = `/tmp/phase9-guardian-child-rogue-${process.pid}.json`;
  rmSync(markerPath, { force: true });
  let roguePid = null;
  const processAlive = pid => {
    try { process.kill(pid, 0); return true; } catch (error) {
      if (error?.code === 'ESRCH') return false;
      throw error;
    }
  };
  const fixture = lifecycleGuardianFixture({
    runnerMode: 'rogue-process',
    scenarioJoinTimeoutMs: 20,
    beforeCleanup() {
      roguePid ??= JSON.parse(readFileSync(markerPath, 'utf8')).pid;
      assert.equal(processAlive(roguePid), false);
    },
  });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  roguePid ??= JSON.parse(readFileSync(markerPath, 'utf8')).pid;
  assert.equal(result.ok, false);
  assert.equal(result.category, 'scenario-closure-failed');
  assert.equal(result.closureCertified, true);
  assert.equal(processAlive(roguePid), false);
  assert.equal(fixture.events.filter(event => event === 'fixture:cleanup').length, 1);
  rmSync(markerPath, { force: true });
});

test('phase 9 lifecycle guardian kills a detached marked descendant before cleanup certification', async () => {
  const markerPath = `/tmp/phase9-guardian-child-detached-${process.pid}.json`;
  rmSync(markerPath, { force: true });
  let detachedPid = null;
  const processAlive = pid => {
    try { process.kill(pid, 0); return true; } catch (error) {
      if (error?.code === 'ESRCH') return false;
      throw error;
    }
  };
  const fixture = lifecycleGuardianFixture({
    runnerMode: 'detached-rogue-process',
    scenarioJoinTimeoutMs: 100,
    beforeCleanup() {
      detachedPid ??= JSON.parse(readFileSync(markerPath, 'utf8')).pid;
      assert.equal(processAlive(detachedPid), false);
    },
  });
  try {
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    detachedPid ??= JSON.parse(readFileSync(markerPath, 'utf8')).pid;
    assert.equal(result.ok, false);
    assert.equal(result.category, 'scenario-closure-failed', JSON.stringify(result));
    assert.equal(result.browserClosureCertified, false);
    assert.equal(result.closureCertified, false);
    assert.equal(result.workspacePreservation, 'verified-present');
    assert.equal(result.manifestPreservation, 'verified-present');
    assert.equal(processAlive(detachedPid), false);
    assert.equal(fixture.events.includes('fixture:cleanup'), false);
  } finally {
    if (detachedPid && processAlive(detachedPid)) {
      try { process.kill(detachedPid, 'SIGKILL'); } catch {}
    }
    rmSync(markerPath, { force: true });
  }
});

test('phase 9 lifecycle guardian finds and kills a marked descendant whose argv exceeds inspector bounds', async () => {
  const markerPath = `/tmp/phase9-guardian-child-malformed-${process.pid}.json`;
  rmSync(markerPath, { force: true });
  let detachedPid = null;
  const processAlive = pid => {
    try { process.kill(pid, 0); return true; } catch (error) {
      if (error?.code === 'ESRCH') return false;
      throw error;
    }
  };
  const fixture = lifecycleGuardianFixture({
    runnerMode: 'detached-malformed-argv-rogue',
    scenarioJoinTimeoutMs: 100,
  });
  try {
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    detachedPid = JSON.parse(readFileSync(markerPath, 'utf8')).pid;
    assert.equal(result.ok, false);
    assert.equal(result.category, 'scenario-closure-failed', JSON.stringify(result));
    assert.equal(result.closureCertified, false);
    assert.equal(processAlive(detachedPid), false);
    assert.equal(fixture.events.includes('fixture:cleanup'), false);
  } finally {
    if (detachedPid && processAlive(detachedPid)) {
      try { process.kill(detachedPid, 'SIGKILL'); } catch {}
    }
    rmSync(markerPath, { force: true });
  }
});

test('phase 9 lifecycle guardian cancels an in-progress startup generation before spawn', async () => {
  const markerPath = `/tmp/phase9-guardian-child-start-${process.pid}`;
  rmSync(markerPath, { force: true });
  let fixture;
  let interruptedVerification = false;
  const hook = createHook({
    init(_asyncId, type) {
      if (interruptedVerification || !new Set(['FSREQPROMISE', 'PROCESSWRAP', 'Timeout']).has(type)) return;
      interruptedVerification = true;
      hook.disable();
      void fixture.handlers.get('SIGTERM')?.();
    },
  });
  fixture = lifecycleGuardianFixture({
    runnerMode: 'start-marker-success',
    afterInitialInspect: () => hook.enable(),
    scenarioJoinTimeoutMs: 100,
  });
  try {
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(interruptedVerification, true);
    assert.equal(result.ok, false);
    assert.equal(result.category, 'interrupted');
    assert.equal(result.interrupted, true);
    assert.equal(existsSync(markerPath), false);
    assert.equal(fixture.events.filter(event => event === 'fixture:cleanup').length, 1);
  } finally {
    hook.disable();
    rmSync(markerPath, { force: true });
  }
});

test('phase 9 lifecycle guardian returns only the validated canonical 44-row child handoff', async () => {
  const fixture = lifecycleGuardianFixture({ runnerMode: 'row-protocol-success' });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.rows.length, 44);
  assert.equal(Object.isFrozen(result.rows), true);
  assert.equal(new Set(result.rows.map(row => row.contextId)).size, 44);
  assert.deepEqual(
    result.rows.map(row => row.contextId),
    buildCanonicalScenarioPlan().map(row => row.contextId),
  );
  assert.deepEqual(
    result.rows.map(row => row.group).reduce((counts, group) => ({
      ...counts, [group]: (counts[group] ?? 0) + 1,
    }), {}),
    { 'admission-route': 18, isolation: 10, logout: 10, 'pending-deletion': 6 },
  );
});

test('phase 9 lifecycle guardian rejects malformed incomplete duplicate and out-of-order row handoffs', async t => {
  for (const mode of [
    'row-extra-field', 'row-duplicate', 'row-out-of-order', 'row-wrong-phase', 'row-early-completion',
  ]) await t.test(mode, async () => {
    const fixture = lifecycleGuardianFixture({ runnerMode: mode });
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(result.ok, false);
    assert.equal(result.category, 'scenario-runner-invalid');
    assert.equal(Object.hasOwn(result, 'rows'), false);
  });
});

test('phase 9 lifecycle guardian executes the exact initially verified bytes after caller paths change', async () => {
  const temporaryDirectory = mkdtempSync(join(testDirectory, 'fixtures', '.phase9-runner-snapshot-'));
  const entrypoint = join(temporaryDirectory, 'runner.mjs');
  const configPath = join(temporaryDirectory, 'runner.json');
  const replacementMarker = `/tmp/phase9-guardian-replacement-${process.pid}`;
  rmSync(replacementMarker, { force: true });
  writeFileSync(entrypoint, readFileSync(guardianChildEntrypoint), { mode: 0o600 });
  writeFileSync(configPath, '{"mode":"row-protocol-success"}\n', { mode: 0o600 });
  chmodSync(entrypoint, 0o600);
  chmodSync(configPath, 0o600);
  const runnerCommand = {
    entrypoint,
    entrypointSha256: sha256File(entrypoint),
    configFiles: [{ path: configPath, sha256: sha256File(configPath) }],
  };
  const fixture = lifecycleGuardianFixture({
    runnerCommand,
    preconditionResult: ({ result }) => {
      writeFileSync(entrypoint, `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(replacementMarker)}, 'reopened');\nprocess.exit(70);\n`, { mode: 0o600 });
      writeFileSync(configPath, '{"mode":"replacement"}\n', { mode: 0o600 });
      return result;
    },
  });
  try {
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.rows.length, 44);
    assert.equal(existsSync(replacementMarker), false);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
    rmSync(replacementMarker, { force: true });
  }
});

test('phase 9 lifecycle guardian preservation proof validates exact filesystem object and journal', async t => {
  for (const [name, overrides, field] of [
    ['workspace symlink', { workspaceLstatType: 'symlink' }, 'workspacePreservation'],
    ['workspace regular file', { workspaceLstatType: 'file' }, 'workspacePreservation'],
    ['workspace wrong mode', { workspaceLstatMode: 0o40755 }, 'workspacePreservation'],
    ['manifest symlink', { manifestLstatType: 'symlink' }, 'manifestPreservation'],
    ['manifest directory', { manifestLstatType: 'directory' }, 'manifestPreservation'],
    ['manifest wrong mode', { manifestMode: 0o100644 }, 'manifestPreservation'],
    ['manifest corrupt JSON', { corruptManifest: true }, 'manifestPreservation'],
    ['manifest mismatched run journal', {
      manifestMutation: value => ({ ...value, runId: 'qa-phase7-20260826T120001Z-fedcba654321' }),
    }, 'manifestPreservation'],
  ]) await t.test(name, async () => {
    const fixture = lifecycleGuardianFixture(overrides);
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(result.ok, false);
    assert.equal(result[field], 'uncertain');
    assert.equal(JSON.stringify(result).includes(fixture.workspace), false);
  });
});

test('phase 9 lifecycle guardian recovers planned and partial journals from exact present counts', async t => {
  for (const [name, manifestState, authPresent, firestorePresent] of [
    ['planned empty journal', 'planned', 0, 0],
    ['partial Auth seed', 'partial', 7, 0],
    ['partial Firestore seed', 'partial', 20, 13],
    ['partial mixed seed', 'partial', 4, 11],
  ]) await t.test(name, async () => {
    const drift = guardianMissingDrift(authPresent, firestorePresent);
    const fixture = lifecycleGuardianFixture({
      manifestState,
      commandResult: ({ command, result, inspectCount }) => {
        if (command === 'seed') return { exitCode: 9, stdout: JSON.stringify(result) };
        if (command === 'inspect' && inspectCount === 1) return {
          exitCode: 0,
          stdout: JSON.stringify({
            ...result,
            ok: false,
            aliases: authPresent + firestorePresent === 0 ? [] : guardianSortedAliases.slice(0, 2),
            states: { manifest: manifestState, problems: drift.length },
            counts: { expected: { auth: 20, firestore: 82 }, actualPresent: { auth: authPresent, firestore: firestorePresent } },
            drift,
          }),
        };
        if (command === 'cleanup') return {
          exitCode: 0,
          stdout: JSON.stringify({ ...result, deleted: { auth: authPresent, firestore: firestorePresent } }),
        };
        return undefined;
      },
    });
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(result.ok, false);
    assert.equal(result.category, 'command-failed');
    assert.equal(result.closureCertified, true);
    assert.equal(fixture.events.filter(event => event === 'fixture:cleanup').length, 1);
    assert.equal(fixture.probeAuthChecks, 20);
    assert.equal(fixture.probeFirestoreChecks, 83);
    assert.equal(fixture.workspaceExists, false);
  });
});

test('phase 9 lifecycle guardian preserves unsafe recovery drift without cleanup', async () => {
  const drift = guardianMissingDrift(1, 1);
  drift[19] = { ...drift[19], field: 'shape', reason: 'mismatch' };
  const fixture = lifecycleGuardianFixture({
    manifestState: 'partial',
    commandResult: ({ command, result, inspectCount }) => {
      if (command === 'seed') return { exitCode: 9, stdout: JSON.stringify(result) };
      if (command === 'inspect' && inspectCount === 1) return {
        exitCode: 0,
        stdout: JSON.stringify({
          ...result,
          ok: false,
          aliases: ['qa-unverified'],
          states: { manifest: 'partial', problems: drift.length },
          counts: { expected: { auth: 20, firestore: 82 }, actualPresent: { auth: 1, firestore: 1 } },
          drift,
        }),
      };
      return undefined;
    },
  });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.category, 'recovery-inspect-uncertain');
  assert.equal(result.closureCertified, false);
  assert.equal(result.workspacePreservation, 'verified-present');
  assert.equal(result.manifestPreservation, 'verified-present');
  assert.equal(fixture.events.includes('fixture:cleanup'), false);
  assert.equal(fixture.events.includes('adapter:init'), false);
});

test('phase 9 lifecycle guardian rejects a self-consistent alternate manifest after identity pinning', async () => {
  const alternateRunId = 'qa-phase7-20260826T120001Z-fedcba654321';
  const alternate = buildFixtureDefinition({
    runId: alternateRunId,
    expiresAt: '2026-09-02T12:00:00Z',
    manifestVersion: 3,
  });
  let reads = 0;
  const fixture = lifecycleGuardianFixture({
    manifestMutation: value => {
      reads += 1;
      if (reads === 1) return value;
      return {
        ...value,
        runId: alternateRunId,
        authUids: alternate.identities.map(identity => identity.uid),
        firestorePaths: alternate.documents.map(document => document.path),
        expectedAbsentFirestorePaths: alternate.expectedAbsentDocuments.map(document => document.path),
      };
    },
  });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.category, 'manifest-uncertain');
  assert.equal(result.manifestPreservation, 'uncertain');
  assert.equal(fixture.events.includes('fixture:cleanup'), false);
  assert.equal(fixture.workspaceExists, true);
});

test('phase 9 lifecycle guardian rejects rewriting an already pinned lifecycle checkpoint', async () => {
  let reads = 0;
  const fixture = lifecycleGuardianFixture({
    manifestMutation: value => {
      reads += 1;
      if (reads < 3 || value.transitions['qa-pending-delete'].state !== 'pending_deletion') return value;
      return {
        ...value,
        transitions: {
          ...value.transitions,
          'qa-pending-delete': {
            ...value.transitions['qa-pending-delete'],
            startedAt: '2026-08-26T12:00:01Z',
            firestoreUpdatedAt: '2026-08-26T12:00:01Z',
            revokedAt: '2026-08-26T12:00:01Z',
            completedAt: '2026-08-26T12:00:01Z',
          },
        },
      };
    },
  });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.category, 'manifest-uncertain');
  assert.equal(result.manifestPreservation, 'uncertain');
  assert.equal(fixture.events.includes('fixture:cleanup'), false);
});

test('phase 9 lifecycle guardian snapshots only inert closed runner command data', async t => {
  await t.test('Proxy and accessor descriptors are rejected without invoking traps', () => {
    let traps = 0;
    const proxy = new Proxy({}, {
      ownKeys() { traps += 1; return []; },
      getOwnPropertyDescriptor() { traps += 1; return undefined; },
      get() { traps += 1; return undefined; },
    });
    const proxyFixture = lifecycleGuardianFixture({ runnerCommand: proxy });
    assert.throws(() => createLifecycleGuardian(proxyFixture.dependencies), /scenario-runner-invalid/);
    assert.equal(traps, 0);

    let getterCalls = 0;
    const accessor = {
      configFiles: guardianChildCommand('success').configFiles,
      entrypointSha256: sha256File(guardianChildEntrypoint),
    };
    Object.defineProperty(accessor, 'entrypoint', {
      enumerable: true,
      get() { getterCalls += 1; return guardianChildEntrypoint; },
    });
    const accessorFixture = lifecycleGuardianFixture({ runnerCommand: accessor });
    assert.throws(() => createLifecycleGuardian(accessorFixture.dependencies), /scenario-runner-invalid/);
    assert.equal(getterCalls, 0);

    let arrayGetterCalls = 0;
    const configFiles = [];
    Object.defineProperty(configFiles, '0', {
      enumerable: true,
      get() {
        arrayGetterCalls += 1;
        return guardianChildCommand('success').configFiles[0];
      },
    });
    Object.defineProperty(configFiles, 'length', { value: 1, writable: true });
    const arrayAccessorFixture = lifecycleGuardianFixture({
      runnerCommand: {
        entrypoint: guardianChildEntrypoint,
        entrypointSha256: sha256File(guardianChildEntrypoint),
        configFiles,
      },
    });
    assert.throws(() => createLifecycleGuardian(arrayAccessorFixture.dependencies), /scenario-runner-invalid/);
    assert.equal(arrayGetterCalls, 0);
  });

  await t.test('hash mismatch fails before guarding or fixture mutation', async () => {
    const command = guardianChildCommand('success');
    const fixture = lifecycleGuardianFixture({
      runnerCommand: { ...command, entrypointSha256: '0'.repeat(64) },
    });
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(result.ok, false);
    assert.equal(result.category, 'scenario-runner-invalid');
    assert.equal(fixture.events.includes('fs:mkdtemp'), false);
    assert.equal(fixture.events.includes('fixture:preflight'), false);
  });

  await t.test('trusted child source cannot reference the guardian marker name', async () => {
    const temporaryDirectory = mkdtempSync(join(testDirectory, 'fixtures', '.phase9-marker-reference-'));
    const entrypoint = join(temporaryDirectory, 'runner.mjs');
    writeFileSync(entrypoint, `${readFileSync(guardianChildEntrypoint, 'utf8')}\n// PHASE9_GUARDIAN_RUN_MARKER\n`, {
      mode: 0o600,
    });
    const source = guardianChildCommand('success');
    const fixture = lifecycleGuardianFixture({
      runnerCommand: {
        ...source,
        entrypoint,
        entrypointSha256: sha256File(entrypoint),
      },
    });
    try {
      const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
      assert.equal(result.ok, false);
      assert.equal(result.category, 'scenario-runner-invalid');
      assert.equal(fixture.events.includes('fixture:preflight'), false);
    } finally {
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });

  await t.test('late descriptor replacement cannot change the captured child command', async () => {
    const source = guardianChildCommand('success');
    const command = {
      entrypoint: source.entrypoint,
      entrypointSha256: source.entrypointSha256,
      configFiles: [...source.configFiles],
    };
    const fixture = lifecycleGuardianFixture({ runnerCommand: command });
    const guardian = createLifecycleGuardian(fixture.dependencies);
    command.entrypoint = '/tmp/untrusted-runner.mjs';
    command.entrypointSha256 = '0'.repeat(64);
    command.configFiles.length = 0;
    const result = await guardian.run(fixture.options);
    assert.equal(result.ok, true, JSON.stringify(result));
  });
});

test('phase 9 lifecycle guardian contains hostile child intrinsic mutations in its OS process', async () => {
  const native = {
    Promise: globalThis.Promise,
    promiseThen: Promise.prototype.then,
    objectKeys: Object.keys,
    objectPrototypeValue: Object.prototype.phase9ChildMutation,
    arrayIsArray: Array.isArray,
    arrayPush: Array.prototype.push,
    reflectOwnKeys: Reflect.ownKeys,
    reflectApply: Reflect.apply,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
  };
  const fixture = lifecycleGuardianFixture({ runnerMode: 'mutate-globals' });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, true);
  assert.equal(globalThis.Promise, native.Promise);
  assert.equal(Promise.prototype.then, native.promiseThen);
  assert.equal(Object.keys, native.objectKeys);
  assert.equal(Object.prototype.phase9ChildMutation, native.objectPrototypeValue);
  assert.equal(Array.isArray, native.arrayIsArray);
  assert.equal(Array.prototype.push, native.arrayPush);
  assert.equal(Reflect.ownKeys, native.reflectOwnKeys);
  assert.equal(Reflect.apply, native.reflectApply);
  assert.equal(globalThis.setTimeout, native.setTimeout);
  assert.equal(globalThis.clearTimeout, native.clearTimeout);
});

test('phase 9 lifecycle guardian authorizes only the planned pending-delete manifest transition', async t => {
  const completedTransition = (state, includesCacheDeletion = false) => ({
    version: 1,
    state,
    startedAt: '2026-08-26T12:00:00Z',
    firestoreUpdatedAt: '2026-08-26T12:00:00Z',
    ...(includesCacheDeletion ? { cacheDeletedAt: '2026-08-26T12:00:00Z' } : {}),
    revokedAt: '2026-08-26T12:00:00Z',
    completedAt: '2026-08-26T12:00:00Z',
  });
  for (const [alias, transition] of [
    ['qa-suspended', completedTransition('suspended')],
    ['qa-removed-member', completedTransition('removed', true)],
  ]) await t.test(`rejects internally valid ${alias} advancement`, async () => {
    const fixture = lifecycleGuardianFixture({
      manifestMutation: value => value.transitions['qa-pending-delete'].state === 'pending_deletion'
        ? { ...value, transitions: { ...value.transitions, [alias]: transition } }
        : value,
    });
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(result.ok, false);
    assert.equal(result.category, 'manifest-uncertain');
    assert.equal(result.manifestPreservation, 'uncertain');
    assert.equal(fixture.events.includes('fixture:cleanup'), false);
  });

  await t.test('rejects pending-delete advancement before the planned boundary', async () => {
    const fixture = lifecycleGuardianFixture({
      commandResult: ({ command, result }) => command === 'seed'
        ? { exitCode: 9, stdout: JSON.stringify(result) }
        : undefined,
      manifestMutation: value => ({
        ...value,
        transitions: {
          ...value.transitions,
          'qa-pending-delete': completedTransition('pending_deletion'),
        },
      }),
    });
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(result.ok, false);
    assert.equal(result.category, 'manifest-uncertain');
    assert.equal(result.closureCertified, false);
    assert.equal(fixture.events.includes('fixture:cleanup'), false);
  });
});

test('phase 9 lifecycle guardian bounds pending-delete checkpoints to manifest time', async t => {
  const cases = [
    ['checkpoint before the pinned manifest time', {
      startedAt: '2026-08-26T11:59:59Z', firestoreUpdatedAt: '2026-08-26T11:59:59Z',
      revokedAt: '2026-08-26T11:59:59Z', completedAt: '2026-08-26T11:59:59Z',
    }],
    ['checkpoint after the candidate updated time', {
      startedAt: '2026-08-26T12:00:01Z', firestoreUpdatedAt: '2026-08-26T12:00:01Z',
      revokedAt: '2026-08-26T12:00:01Z', completedAt: '2026-08-26T12:00:01Z',
    }],
    ['checkpoint order travels backward', {
      startedAt: '2026-08-26T12:00:00Z', firestoreUpdatedAt: '2026-08-26T12:00:02Z',
      revokedAt: '2026-08-26T12:00:01Z', completedAt: '2026-08-26T12:00:03Z',
      updatedAt: '2026-08-26T12:00:03Z',
    }],
  ];
  for (const [name, timestamps] of cases) await t.test(name, async () => {
    const fixture = lifecycleGuardianFixture({
      manifestMutation: value => {
        if (value.transitions['qa-pending-delete'].state !== 'pending_deletion') return value;
        const { updatedAt, ...checkpoints } = timestamps;
        return {
          ...value,
          ...(updatedAt ? { updatedAt } : {}),
          transitions: {
            ...value.transitions,
            'qa-pending-delete': {
              ...value.transitions['qa-pending-delete'],
              ...checkpoints,
            },
          },
        };
      },
    });
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(result.ok, false);
    assert.equal(result.category, 'manifest-uncertain');
    assert.equal(fixture.events.includes('fixture:cleanup'), false);
  });
});

test('phase 9 lifecycle guardian accepts the exact in-bound pending-delete checkpoint sequence', async () => {
  const fixture = lifecycleGuardianFixture({
    manifestMutation: value => value.transitions['qa-pending-delete'].state === 'pending_deletion'
      ? {
        ...value,
        updatedAt: '2026-08-26T12:00:04Z',
        transitions: {
          ...value.transitions,
          'qa-pending-delete': {
            ...value.transitions['qa-pending-delete'],
            startedAt: '2026-08-26T12:00:01Z',
            firestoreUpdatedAt: '2026-08-26T12:00:02Z',
            revokedAt: '2026-08-26T12:00:03Z',
            completedAt: '2026-08-26T12:00:04Z',
          },
        },
      }
      : value,
  });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, true);
});

test('phase 9 lifecycle guardian launches only a verified repository-owned child command', async () => {
  const fixture = lifecycleGuardianFixture();
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, true);
});

test('phase 9 lifecycle guardian strips Node preload injection from the child environment', async () => {
  const markerPath = `/tmp/phase9-guardian-node-options-${process.pid}`;
  const environmentMarkerPath = `/tmp/phase9-guardian-preload-env-${process.pid}`;
  const preloadPath = join(testDirectory, 'fixtures', 'phase9-lifecycle-node-options-preload.mjs');
  rmSync(markerPath, { force: true });
  rmSync(environmentMarkerPath, { force: true });
  if (process.env.PHASE9_PRELOAD_IMPORT_REGRESSION === '1') {
    const fixture = lifecycleGuardianFixture();
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(result.ok, true);
    assert.equal(existsSync(markerPath), false);
    assert.equal(existsSync(environmentMarkerPath), false);
    return;
  }
  const child = spawnSync(process.execPath, [
    '--test',
    '--test-name-pattern=phase 9 lifecycle guardian strips Node preload injection from the child environment',
    fileURLToPath(import.meta.url),
  ], {
    cwd: dirname(testDirectory),
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_OPTIONS: `--import=${pathToFileURL(preloadPath).href}`,
      NODE_PATH: '/tmp/phase9-untrusted-node-path',
      PHASE9_PRELOAD_IMPORT_REGRESSION: '1',
    },
    timeout: 30_000,
  });
  assert.equal(child.status, 0, child.stderr || child.stdout);
  rmSync(markerPath, { force: true });
  rmSync(environmentMarkerPath, { force: true });
});

function task5CanonicalRows() {
  return buildCanonicalScenarioPlan().map(item => ({
    contextId: item.contextId, group: item.group, alias: item.alias, viewport: item.viewport,
    startState: item.startState, startUrl: 'about:blank', action: 'canonical audited action',
    expectedResult: 'canonical expected result', finalUrl: `${STAGING_ORIGIN}/login`, visibleState: 'Sign In',
    sessionPresent: false, protectedRequests: 0, protectedListenerStarts: 0,
    relevantHttpDataResult: 'none', pageErrors: 0, appConsoleErrors: 0,
    unexpectedRequestFailures: 0, overflow: 0, result: 'PASS',
  }));
}

const task5Lifecycle = Object.freeze({
  ok: true, state: 'disarmed',
  history: Object.freeze([
    'uninitialized', 'guarded', 'preflighted', 'seeded', 'inspected', 'browsers-closed',
    'preclean-inspected', 'cleaned', 'clean-inspected', 'independently-absent',
    'credential-removed', 'workspace-removed', 'disarmed',
  ]),
  browserClosureCertified: true, closureCertified: true,
});
const task5Deployment = Object.freeze({
  projectId: 'the-squad-v2-staging', origin: STAGING_ORIGIN,
  deployedSha: '0123456789abcdef0123456789abcdef01234567',
  stagingRunId: '32856314233', pullRequestNumber: 41,
});

test('phase 9 evidence writer atomically writes only the four approved sanitized Markdown files', async () => {
  const { createPhase9EvidenceWriter } = await import('../scripts/qa-evidence/phase9/evidence-writer.mjs');
  const root = mkdtempSync('/tmp/phase9-evidence-writer-test.');
  const outputDirectory = join(root, phase9EvidenceDirectorySuffix);
  mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  const { write } = createPhase9EvidenceWriter({ repositoryRoot: root });
  try {
    const result = await write({
      lifecycle: task5Lifecycle, rows: task5CanonicalRows(), deployment: task5Deployment, outputDirectory,
    });
    assert.deepEqual(result.files, ['00-environment.md', '01-fixture-lifecycle.md', '03-browser-ledger.md', '04-cleanup.md']);
    assert.deepEqual(readdirSync(outputDirectory), result.files);
    assert.deepEqual(Array.from(new Set(result.files.map(name => statSync(join(outputDirectory, name)).mode & 0o777))), [0o644]);
    assert.match(readFileSync(join(outputDirectory, '03-browser-ledger.md'), 'utf8'), /44\/44/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('phase 9 evidence writer rejects incomplete, duplicate, unsafe, and inconsistent evidence before any write', async () => {
  const { createPhase9EvidenceWriter, writePhase9Evidence } = await import('../scripts/qa-evidence/phase9/evidence-writer.mjs');
  const root = mkdtempSync('/tmp/phase9-evidence-writer-reject.');
  const outputDirectory = join(root, phase9EvidenceDirectorySuffix);
  mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  const { write } = createPhase9EvidenceWriter({ repositoryRoot: root });
  const base = { lifecycle: task5Lifecycle, rows: task5CanonicalRows(), deployment: task5Deployment, outputDirectory };
  try {
    await assert.rejects(write({ ...base, rows: [base.rows[0], ...base.rows] }), /duplicate|arithmetic/i);
    await assert.rejects(write({
      ...base, rows: base.rows.map((row, index) => index ? row : { ...row, visibleState: 'token=raw-secret' }),
    }), /unsafe|sensitive/i);
    await assert.rejects(write({ ...base, deployment: { ...base.deployment, origin: 'https://example.invalid' } }), /deployment/i);
    await assert.rejects(write({ ...base, outputDirectory: root }), /evidence directory/i);
    await assert.rejects(writePhase9Evidence(base), /evidence directory/i);
    assert.deepEqual(readdirSync(outputDirectory), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('phase 9 client binds every action window to a verified viewport and rejects label drift', async () => {
  const { setAndVerifyViewport } = await import('../scripts/qa-evidence/phase9/playwright-cli-client.mjs');
  assert.equal(typeof setAndVerifyViewport, 'function');
  const transport = createCliTransport(argv => {
    const code = argv[argv.indexOf('run-code') + 1] ?? '';
    if (code.includes('phase9:verify-about-blank')) return cliResult({ url: 'about:blank' });
    if (code.includes('setViewportSize')) return cliResult({ width: 390, height: 844 });
    return cliResult({ pageId: 'raw', navigationGeneration: 0 });
  });
  const client = createPlaywrightCliClient({ execute: transport.execute, wrapperPath: '/safe/playwright_cli.sh' });
  await installSignalRecorder(client, 'viewport-binding');
  assert.equal(await setAndVerifyViewport(client, 'viewport-binding', { width: 390, height: 844 }), '390x844');
});

test('phase 9 client attaches to an exact retained session without issuing open', async () => {
  const { attachExistingSignalRecorder } = await import('../scripts/qa-evidence/phase9/playwright-cli-client.mjs');
  assert.equal(typeof attachExistingSignalRecorder, 'function');
  const calls = [];
  const execute = async argv => {
    calls.push(argv);
    if (argv.includes('list')) return { exitCode: 0, stdout: JSON.stringify({ browsers: [{ name: 'retained' }] }) };
    return { exitCode: 0, stdout: JSON.stringify({ result: JSON.stringify({ pageId: 'raw', navigationGeneration: 0, url: `${STAGING_ORIGIN}/dashboard`, viewport: { width: 390, height: 844 }, marker: 'retained' }) }) };
  };
  const client = createPlaywrightCliClient({ execute, wrapperPath: '/safe/playwright_cli.sh' });
  await attachExistingSignalRecorder(client, 'retained', { width: 390, height: 844, marker: 'retained', requireAuthenticated: true });
  assert.equal(calls.some(argv => argv.includes('open')), false);
});

test('phase 9 real Chrome applies both exact viewports and retains the same process set across attachment', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
  const { attachExistingSignalRecorder, setAndVerifyViewport } = await import('../scripts/qa-evidence/phase9/playwright-cli-client.mjs');
  const chromePids = () => spawnSync('ps', ['-axo', 'pid=,command='], {
    encoding: 'utf8', timeout: 30_000,
  }).stdout
    .split('\n').filter(line => /Google Chrome.*--remote-debugging-pipe/.test(line)).map(line => line.trim().split(/\s+/)[0]).sort();
  const first = createPlaywrightCliClient({ timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS });
  try {
    await installSignalRecorder(first, 'phase9-real-retained');
    assert.equal(await setAndVerifyViewport(first, 'phase9-real-retained', { width: 390, height: 844 }), '390x844');
    await first.runCode('phase9-real-retained', "async (page) => { page.__phase9RetainedSessionMarker = 'phase9-real-retained'; return true; }");
    const beforeInventory = await first.listBrowsers();
    const beforePids = chromePids();
    const attached = createPlaywrightCliClient({ timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS });
    assert.deepEqual(await attachExistingSignalRecorder(attached, 'phase9-real-retained', {
      width: 390, height: 844, marker: 'phase9-real-retained',
    }), { session: 'phase9-real-retained', viewport: '390x844' });
    assert.deepEqual(chromePids(), beforePids);
    assert.deepEqual(await attached.listBrowsers(), beforeInventory);
    const desktop = createPlaywrightCliClient({ timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS });
    await installSignalRecorder(desktop, 'phase9-real-desktop');
    assert.equal(await setAndVerifyViewport(desktop, 'phase9-real-desktop', { width: 1440, height: 900 }), '1440x900');
  } finally {
    await closeAndVerifyBrowsers(first);
  }
});

test('phase 9 real Chrome applies and reads back each exact viewport on every new tab before navigation', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
  const { setAndVerifyViewport } = await import('../scripts/qa-evidence/phase9/playwright-cli-client.mjs');
  const client = createPlaywrightCliClient({ timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS });
  try {
    for (const [session, viewport] of [
      ['phase9-new-tab-mobile', { width: 390, height: 844 }],
      ['phase9-new-tab-desktop', { width: 1440, height: 900 }],
    ]) {
      await installSignalRecorder(client, session);
      await setAndVerifyViewport(client, session, viewport);
      await client.tabNew(session, 'about:blank');
      await installSignalRecorder(client, session);
      assert.deepEqual(await client.runCode(session, 'async (page) => page.viewportSize()'), viewport);
    }
  } finally { await closeAndVerifyBrowsers(client); }
});

test('phase 9 client closes the owned browser when a new-tab viewport readback mismatches', async () => {
  let viewportCalls = 0;
  const transport = createCliTransport(argv => {
    const code = argv[argv.indexOf('run-code') + 1] ?? '';
    if (code.includes('phase9:verify-about-blank')) return cliResult({ url: 'about:blank' });
    if (code.includes('setViewportSize')) return cliResult(++viewportCalls === 1
      ? { width: 390, height: 844 } : { width: 1280, height: 720 });
    if (argv.includes('list')) return cliResult({ browsers: [] });
    return cliResult({ pageId: 'raw', navigationGeneration: 0 });
  });
  const client = createPlaywrightCliClient({ execute: transport.execute, wrapperPath: '/safe/playwright_cli.sh' });
  await installSignalRecorder(client, 'viewport-close');
  await setAndVerifyViewport(client, 'viewport-close', { width: 390, height: 844 });
  await assert.rejects(client.tabNew('viewport-close', 'about:blank'), /viewport.*closed/i);
  assert.equal(transport.calls.some(argv => argv.includes('close')), true);
});

test('phase 9 client retains ownership after new-tab viewport close failure and permits exact retry', async () => {
  let viewportCalls = 0;
  let closeCalls = 0;
  let listCalls = 0;
  const transport = createCliTransport(argv => {
    const code = argv[argv.indexOf('run-code') + 1] ?? '';
    if (code.includes('phase9:verify-about-blank')) return cliResult({ url: 'about:blank' });
    if (code.includes('setViewportSize')) return cliResult(++viewportCalls === 1
      ? { width: 390, height: 844 } : { width: 1280, height: 720 });
    if (argv.includes('close')) return ++closeCalls === 1
      ? { stdout: '', stderr: '', exitCode: 1, timedOut: false }
      : cliResult({ closed: true });
    if (argv.includes('list')) return cliResult({ browsers: ++listCalls === 1 ? [{ name: 'viewport-owned' }] : [] });
    return cliResult({ pageId: 'raw', navigationGeneration: 0 });
  });
  const client = createPlaywrightCliClient({ execute: transport.execute, wrapperPath: '/safe/playwright_cli.sh' });
  await installSignalRecorder(client, 'viewport-owned');
  await setAndVerifyViewport(client, 'viewport-owned', { width: 390, height: 844 });
  await assert.rejects(client.tabNew('viewport-owned'), /ownership.*retained/i);
  await assert.rejects(client.closeBrowser('viewport-owned'), /ownership.*retained/i);
  await client.closeBrowser('viewport-owned');
  await assert.rejects(client.closeBrowser('viewport-owned'), /exact session.*opened/i);
  assert.equal(closeCalls, 3);
});

test('phase 9 committed runner uses a pinned local Playwright transport and literal artifact hashes', async () => {
  const { PHASE9_ARTIFACT_PINS, phase9PlaywrightTransport } = await import('../scripts/qa-evidence/phase9/cli.mjs');
  assert.match(PHASE9_ARTIFACT_PINS.child, /^[0-9a-f]{64}$/);
  assert.match(PHASE9_ARTIFACT_PINS.config, /^[0-9a-f]{64}$/);
  assert.match(PHASE9_ARTIFACT_PINS.helper, /^[0-9a-f]{64}$/);
  assert.match(PHASE9_ARTIFACT_PINS.processInspector, /^[0-9a-f]{64}$/);
  assert.equal(
    sha256File(join(testDirectory, '..', 'scripts', 'qa-evidence', 'phase9', 'darwin-process-inspector.py')),
    PHASE9_ARTIFACT_PINS.processInspector,
  );
  assert.equal(phase9PlaywrightTransport.version, '0.1.18');
  assert.equal(phase9PlaywrightTransport.coreVersion, '1.63.0-alpha-2026-08-05');
  assert.match(phase9PlaywrightTransport.artifactPath, /playwright-transport\.bundle\.json\.gz$/);
});

test('phase 9 production child client factory enforces the 90000 millisecond command deadline', async () => {
  const { createPhase9ProductionCliClient } = await import(
    '../scripts/qa-evidence/phase9/playwright-cli-client.mjs'
  );
  assert.equal(typeof createPhase9ProductionCliClient, 'function');
  let observedTimeout = null;
  const client = createPhase9ProductionCliClient({
    wrapperPath: '/safe/playwright_cli.sh',
    execute: async (_argv, options) => {
      observedTimeout = options.timeoutMs;
      return { stdout: JSON.stringify({ result: { browsers: [] } }), stderr: '', exitCode: 0 };
    },
  });
  await client.listBrowsers();
  assert.equal(observedTimeout, 90_000);
  const generated = readFileSync(
    join(testDirectory, '..', 'scripts', 'qa-evidence', 'phase9', 'child-runner.mjs'), 'utf8',
  );
  assert.equal(generated.match(/timeoutMs:9e4/g)?.length, 1);
});

test('phase 9 production child reserves ownership before local acquisition and reports its receipt before browser action', () => {
  const source = readFileSync(join(
    testDirectory, '..', 'scripts', 'qa-evidence', 'phase9', 'child-runner-source.mjs',
  ), 'utf8');
  const openStart = source.indexOf('const openWithReceipt = async session =>');
  const ownershipIntent = source.indexOf("type: 'ownership-intent', version: 4", openStart);
  const authorization = source.indexOf('await requireOwnershipAuthorization(session, ownershipSequence);', ownershipIntent);
  const acquired = source.indexOf('await acquireBlankBrowser(client, session);', authorization);
  const receipt = source.indexOf('const launchReceipt = await captureLaunchReceipt(session);', acquired);
  const ownershipAdd = source.indexOf("type: 'ownership-add', version: 4", receipt);
  const arm = source.indexOf('await armAcquiredSignalRecorder(client, session);', ownershipAdd);
  assert.ok(openStart >= 0 && openStart < ownershipIntent && ownershipIntent < authorization
    && authorization < acquired && acquired < receipt && receipt < ownershipAdd && ownershipAdd < arm);
  const attachStart = source.indexOf('const confirmAttachedOwnership = session =>');
  const ownershipAttach = source.indexOf("type: 'ownership-attach', version: 4", attachStart);
  const attachAction = source.indexOf('await attachExistingSignalRecorder(client, session', ownershipAttach);
  assert.ok(attachStart >= 0 && attachStart < ownershipAttach && ownershipAttach < attachAction);
});

test('phase 9 production session plan releases completed rows and retains only pending baselines', () => {
  const canonical = buildCanonicalScenarioPlan();
  const before = buildPhase9ProductionSessionLifecyclePlan(
    canonical.filter(row => row.startState !== 'pending_deletion'), 'before-transition',
  );
  const after = buildPhase9ProductionSessionLifecyclePlan(
    canonical.filter(row => row.startState === 'pending_deletion'), 'after-transition',
  );
  assert.equal(before.rows.length, 40);
  assert.equal(before.releasedSessions.length, 48);
  assert.equal(before.rows.every(row => row.sessions.every(session => (
    before.historySessions.includes(session)
  ))), true);
  assert.equal(before.rows.some(row => row.sessions.every(session => (
    before.releasedSessions.includes(session)
  ))), true);
  assert.deepEqual(before.boundarySessions, [
    'p9-pending-deletion-active-baseline-desktop',
    'p9-pending-deletion-active-baseline-mobile',
  ]);
  assert.equal(before.maxBoundaryInventory, 2);
  assert.equal(after.rows.length, 4);
  assert.equal(after.releasedSessions.length, 4);
  assert.deepEqual(after.boundarySessions, []);

  const source = readFileSync(join(
    testDirectory, '..', 'scripts', 'qa-evidence', 'phase9', 'child-runner-source.mjs',
  ), 'utf8');
  const resultValidation = source.indexOf("if (result?.result !== 'PASS')");
  const release = source.indexOf('await closeAndRelease(', resultValidation);
  const ownershipComplete = source.indexOf("type: 'ownership-complete', version: 4", release);
  assert.ok(resultValidation >= 0 && resultValidation < release && release < ownershipComplete);
  const releaseStart = source.indexOf('const closeAndRelease = async sessions =>');
  const exactClose = source.indexOf('await client.closeBrowser(session);', releaseStart);
  const exactInventory = source.indexOf('await exactBrowserInventory(expected);', exactClose);
  const processAbsence = source.indexOf('await waitForReceiptProcessesAbsent(receipt);', exactInventory);
  const releaseRecord = source.indexOf("type: 'ownership-release', version: 4", processAbsence);
  assert.ok(releaseStart >= 0 && releaseStart < exactClose && exactClose < exactInventory
    && exactInventory < processAbsence && processAbsence < releaseRecord);
});

test('phase 9 committed transport is a self-contained reviewed artifact outside node_modules', async () => {
  const { PHASE9_ARTIFACT_PINS, phase9PlaywrightTransport } = await import('../scripts/qa-evidence/phase9/cli.mjs');
  assert.match(PHASE9_ARTIFACT_PINS.transport, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(phase9PlaywrightTransport.artifactPath, /node_modules/);
  assert.match(phase9PlaywrightTransport.artifactPath, /playwright-transport\.bundle\.json\.gz$/);
  assert.equal(sha256File(phase9PlaywrightTransport.artifactPath), PHASE9_ARTIFACT_PINS.transport);
  const manifest = JSON.parse(readFileSync(phase9PlaywrightTransport.manifestPath, 'utf8'));
  assert.deepEqual(Object.keys(manifest).sort(), [
    'artifactSha256', 'files', 'format', 'playwrightCliVersion', 'playwrightCoreVersion', 'version',
  ]);
  assert.equal(manifest.artifactSha256, PHASE9_ARTIFACT_PINS.transport);
  assert.equal(manifest.playwrightCliVersion, '0.1.18');
  assert.equal(manifest.playwrightCoreVersion, '1.63.0-alpha-2026-08-05');
  assert.equal(manifest.files.some(file => file.path === 'node_modules/playwright-core/lib/entry/cliDaemon.js'), true);
  assert.equal(manifest.files.every(file => /^[0-9a-f]{64}$/.test(file.sha256)), true);
});

test('phase 9 captured transport ignores later bundle-path and installed-transitive replacement', async () => {
  const { capturePlaywrightTransport } = await import('../scripts/qa-evidence/phase9/playwright-cli-client.mjs');
  const { PHASE9_ARTIFACT_PINS, phase9PlaywrightTransport } = await import('../scripts/qa-evidence/phase9/cli.mjs');
  const root = mkdtempSync('/private/tmp/phase9-captured-transport-');
  const copiedArtifact = join(root, 'playwright-transport.bundle.json.gz');
  const installedTransitive = join(testDirectory, '..', 'node_modules', 'playwright-core', 'lib', 'tools', 'cli-client', 'output.js');
  const originalTransitive = readFileSync(installedTransitive);
  const originalMode = statSync(installedTransitive).mode & 0o777;
  try {
    writeFileSync(copiedArtifact, readFileSync(phase9PlaywrightTransport.artifactPath), { flag: 'wx', mode: 0o644 });
    const captured = capturePlaywrightTransport({
      artifactPath: copiedArtifact, expectedSha256: PHASE9_ARTIFACT_PINS.transport,
    });
    writeFileSync(copiedArtifact, 'attacker-bundle\n');
    writeFileSync(installedTransitive, 'throw new Error("attacker-transitive-executed");\n');
    const client = createPlaywrightCliClient({ transport: captured, timeoutMs: 30_000 });
    assert.deepEqual(await client.listBrowsers(), { browsers: [] });
  } finally {
    writeFileSync(installedTransitive, originalTransitive); chmodSync(installedTransitive, originalMode);
    rmSync(root, { recursive: true, force: true });
  }
});

test('phase 9 transport closes its environment and controlled fetch audit observes exactly zero calls', async () => {
  const { auditPlaywrightTransportFetches, buildPlaywrightTransportEnvironment } = await import('../scripts/qa-evidence/phase9/playwright-cli-client.mjs');
  assert.deepEqual(buildPlaywrightTransportEnvironment({
    HOME: '/safe-home', NODE_OPTIONS: '--require /attacker/preload.cjs', NODE_PATH: '/attacker/modules',
    npm_config_registry: 'https://attacker.invalid', HTTPS_PROXY: 'https://attacker.invalid',
  }), {
    HOME: '/safe-home', PATH: '/usr/bin:/bin:/usr/sbin:/sbin', NO_UPDATE_NOTIFIER: '1', CI: '1',
    npm_config_offline: 'true', NPM_CONFIG_OFFLINE: 'true',
    npm_config_update_notifier: 'false', NPM_CONFIG_UPDATE_NOTIFIER: 'false',
  });
  const temporaryDirectory = mkdtempSync('/tmp/phase9-playwright-env-');
  try {
    assert.equal(buildPlaywrightTransportEnvironment(
      { TMPDIR: temporaryDirectory }, { temporaryDirectory },
    ).TMPDIR, temporaryDirectory);
    assert.throws(() => buildPlaywrightTransportEnvironment(
      { TMPDIR: '/tmp' }, { temporaryDirectory },
    ), /temporary directory/i);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
  assert.deepEqual(await auditPlaywrightTransportFetches(), { fetchCalls: 0, browsers: 0 });
});

test('phase 9 offline browser transport confines disposable profiles and creates no global producer prefix', async () => {
  const globalTempRoot = resolve(process.env.TMPDIR);
  const inventory = () => readdirSync(globalTempRoot)
    .filter(name => name.startsWith('playwright_chromiumdev_profile-')).sort();
  const before = inventory();
  const workspace = mkdtempSync('/tmp/phase9-core-identities.profile-test-');
  const temporaryDirectory = join(workspace, 'playwright-tmp');
  mkdirSync(temporaryDirectory, { mode: 0o700 });
  const profile = join(temporaryDirectory, 'playwright_chromiumdev_profile-offlineTest');
  let open = false;
  const execute = async (argv, options) => {
    assert.equal(options.env.TMPDIR, temporaryDirectory);
    if (argv.includes('open')) {
      mkdirSync(profile, { mode: 0o700 });
      open = true;
      return { exitCode: 0, stdout: JSON.stringify({ ok: true }) };
    }
    if (argv.includes('run-code')) {
      return {
        exitCode: 0,
        stdout: JSON.stringify({ result: JSON.stringify({
          url: 'about:blank', pageId: 'offline-page', navigationGeneration: 0,
        }) }),
      };
    }
    if (argv.includes('close')) {
      rmSync(profile, { recursive: true, force: false });
      open = false;
      return { exitCode: 0, stdout: JSON.stringify({ ok: true }) };
    }
    if (argv.includes('list')) {
      return { exitCode: 0, stdout: JSON.stringify({ browsers: open ? [{ name: 'offline-profile' }] : [] }) };
    }
    throw new Error('unexpected offline command');
  };
  try {
    const client = createPlaywrightCliClient({
      wrapperPath: '/safe/playwright_cli.sh', execute,
      sourceEnvironment: { TMPDIR: temporaryDirectory }, temporaryDirectory,
    });
    await installSignalRecorder(client, 'offline-profile');
    assert.deepEqual(readdirSync(temporaryDirectory), ['playwright_chromiumdev_profile-offlineTest']);
    await client.closeBrowser('offline-profile');
    assert.deepEqual(readdirSync(temporaryDirectory), []);
    assert.deepEqual(inventory(), before);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
  assert.equal(existsSync(workspace), false);
  assert.deepEqual(inventory(), before);
});

test('phase 9 writer rejects a symlinked evidence-directory ancestor before creating any file', async () => {
  const { createPhase9EvidenceWriter } = await import('../scripts/qa-evidence/phase9/evidence-writer.mjs');
  const root = mkdtempSync('/tmp/phase9-writer-boundary-');
  const outside = mkdtempSync('/tmp/phase9-writer-outside-');
  try {
    mkdirSync(join(root, 'docs', 'qa'), { recursive: true });
    symlinkSync(outside, join(root, 'docs', 'qa', 'production-audit'));
    const writer = createPhase9EvidenceWriter({ repositoryRoot: root });
    await assert.rejects(writer.write({
      lifecycle: task5Lifecycle, rows: task5CanonicalRows(), deployment: task5Deployment,
      outputDirectory: join(root, phase9EvidenceDirectorySuffix),
    }), /real|symlink|boundary|directory/i);
    assert.deepEqual(readdirSync(outside), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('phase 9 writer detects an ancestor identity swap and writes no bytes outside', async () => {
  const { createPhase9EvidenceWriter } = await import('../scripts/qa-evidence/phase9/evidence-writer.mjs');
  const root = mkdtempSync('/tmp/phase9-writer-swap-');
  const outside = mkdtempSync('/tmp/phase9-writer-swap-outside-');
  const outputDirectory = join(root, phase9EvidenceDirectorySuffix);
  const ancestor = join(root, 'docs', 'qa', 'production-audit');
  mkdirSync(outputDirectory, { recursive: true });
  let hits = 0;
  const filesystem = {
    ...fsPromises,
    async lstat(path) {
      if (path === ancestor && ++hits === 2) {
        renameSync(ancestor, `${ancestor}.retained`);
        symlinkSync(outside, ancestor);
      }
      return fsPromises.lstat(path);
    },
  };
  try {
    const writer = createPhase9EvidenceWriter({ repositoryRoot: root, filesystem });
    await assert.rejects(writer.write({
      lifecycle: task5Lifecycle, rows: task5CanonicalRows(), deployment: task5Deployment, outputDirectory,
    }), /boundary|symlink|identity/i);
    assert.deepEqual(readdirSync(outside), []);
  } finally {
    rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true });
  }
});

test('phase 9 writer anchors temp creation to the held directory descriptor during an ancestor swap', async () => {
  const { createPhase9EvidenceWriter } = await import('../scripts/qa-evidence/phase9/evidence-writer.mjs');
  const root = mkdtempSync('/tmp/phase9-writer-open-swap-');
  const outside = mkdtempSync('/tmp/phase9-writer-open-outside-');
  const outputDirectory = join(root, phase9EvidenceDirectorySuffix);
  const ancestor = join(root, 'docs', 'qa', 'production-audit');
  mkdirSync(outputDirectory, { recursive: true });
  const outsideOutput = join(outside, 'runs', '2026-08-25-phase9-core-identities');
  mkdirSync(outsideOutput, { recursive: true });
  let swapped = false;
  let outsideObserved = false;
  const filesystem = {
    ...fsPromises,
    async open(path, ...args) {
      if (!swapped && path === outputDirectory) {
        swapped = true;
        renameSync(ancestor, `${ancestor}.retained`);
        symlinkSync(outside, ancestor);
      }
      const handle = await fsPromises.open(path, ...args);
      outsideObserved ||= readdirSync(outsideOutput).length !== 0;
      return handle;
    },
  };
  try {
    const writer = createPhase9EvidenceWriter({ repositoryRoot: root, filesystem });
    await assert.rejects(writer.write({
      lifecycle: task5Lifecycle, rows: task5CanonicalRows(), deployment: task5Deployment, outputDirectory,
    }), /boundary|atomically|identity/i);
    assert.equal(outsideObserved, false);
    assert.deepEqual(readdirSync(outsideOutput), []);
  } finally {
    rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true });
  }
});

test('phase 9 writer keeps promotion on the held directory descriptor after its ancestor is replaced', async () => {
  const { createPhase9EvidenceWriter, PHASE9_EVIDENCE_FILES } = await import('../scripts/qa-evidence/phase9/evidence-writer.mjs');
  const root = mkdtempSync('/tmp/phase9-writer-promote-swap-');
  const outside = mkdtempSync('/tmp/phase9-writer-promote-outside-');
  const outputDirectory = join(root, phase9EvidenceDirectorySuffix);
  const ancestor = join(root, 'docs', 'qa', 'production-audit');
  const outsideOutput = join(outside, 'runs', '2026-08-25-phase9-core-identities');
  mkdirSync(outputDirectory, { recursive: true }); mkdirSync(outsideOutput, { recursive: true });
  try {
    const writer = createPhase9EvidenceWriter({
      repositoryRoot: root, helperEnvironment: { PHASE9_WRITER_TEST_BEFORE_PROMOTION_MS: '300' },
    });
    const pending = writer.write({
      lifecycle: task5Lifecycle, rows: task5CanonicalRows(), deployment: task5Deployment, outputDirectory,
    });
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
    renameSync(ancestor, `${ancestor}.retained`); symlinkSync(outside, ancestor);
    await pending;
    assert.deepEqual(readdirSync(outsideOutput), []);
    const retainedOutput = join(`${ancestor}.retained`, 'runs', '2026-08-25-phase9-core-identities');
    assert.deepEqual(readdirSync(retainedOutput).sort(), [...PHASE9_EVIDENCE_FILES].sort());
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});

test('phase 9 writer rolls back every promoted file after a mid-transaction rename failure', async () => {
  const { createPhase9EvidenceWriter, PHASE9_EVIDENCE_FILES } = await import('../scripts/qa-evidence/phase9/evidence-writer.mjs');
  const root = mkdtempSync('/tmp/phase9-writer-rollback-');
  const outputDirectory = join(root, phase9EvidenceDirectorySuffix);
  mkdirSync(outputDirectory, { recursive: true });
  for (const name of PHASE9_EVIDENCE_FILES) writeFileSync(join(outputDirectory, name), `original:${name}\n`);
  try {
    const writer = createPhase9EvidenceWriter({
      repositoryRoot: root, helperEnvironment: { PHASE9_WRITER_TEST_FAIL_PROMOTION: '2' },
    });
    await assert.rejects(writer.write({
      lifecycle: task5Lifecycle, rows: task5CanonicalRows(), deployment: task5Deployment, outputDirectory,
    }), /atomically/i);
    assert.deepEqual(readdirSync(outputDirectory).sort(), [...PHASE9_EVIDENCE_FILES].sort());
    for (const name of PHASE9_EVIDENCE_FILES) assert.equal(readFileSync(join(outputDirectory, name), 'utf8'), `original:${name}\n`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('phase 9 writer restores from held backup bytes when a backup pathname is replaced', async () => {
  const { createPhase9EvidenceWriter, PHASE9_EVIDENCE_FILES } = await import('../scripts/qa-evidence/phase9/evidence-writer.mjs');
  const root = mkdtempSync('/tmp/phase9-writer-hostile-backup-');
  const outputDirectory = join(root, phase9EvidenceDirectorySuffix);
  mkdirSync(outputDirectory, { recursive: true });
  for (const name of PHASE9_EVIDENCE_FILES) writeFileSync(join(outputDirectory, name), `original:${name}\n`);
  let hostileBackupName;
  try {
    const writer = createPhase9EvidenceWriter({
      repositoryRoot: root,
      helperEnvironment: {
        PHASE9_WRITER_TEST_BEFORE_PROMOTION_MS: '300', PHASE9_WRITER_TEST_FAIL_PROMOTION: '2',
      },
    });
    const pending = writer.write({
      lifecycle: task5Lifecycle, rows: task5CanonicalRows(), deployment: task5Deployment, outputDirectory,
    });
    const deadline = Date.now() + 2_000;
    while (!hostileBackupName && Date.now() < deadline) {
      hostileBackupName = readdirSync(outputDirectory).find(name => name.endsWith('.bak'));
      if (!hostileBackupName) await new Promise(resolvePromise => setTimeout(resolvePromise, 5));
    }
    assert.ok(hostileBackupName, 'helper did not expose a backup pathname for the hostile replacement regression');
    const hostileBackupPath = join(outputDirectory, hostileBackupName);
    rmSync(hostileBackupPath);
    writeFileSync(hostileBackupPath, 'attacker-backup-content\n', { flag: 'wx', mode: 0o640 });

    await assert.rejects(pending, /recovery status is uncertain; directory preserved for manual recovery/i);

    for (const name of PHASE9_EVIDENCE_FILES) {
      assert.equal(readFileSync(join(outputDirectory, name), 'utf8'), `original:${name}\n`);
    }
    const privateArtifacts = readdirSync(outputDirectory).filter(name => name.startsWith('.'));
    assert.deepEqual(privateArtifacts, [hostileBackupName]);
    assert.equal(readFileSync(hostileBackupPath, 'utf8'), 'attacker-backup-content\n');
    assert.equal(statSync(hostileBackupPath).mode & 0o777, 0o640);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('phase 9 writer removes a stolen backup inode only after descriptor identity proof', async () => {
  const { createPhase9EvidenceWriter, PHASE9_EVIDENCE_FILES } = await import('../scripts/qa-evidence/phase9/evidence-writer.mjs');
  const root = mkdtempSync('/tmp/phase9-writer-stolen-backup-');
  const outputDirectory = join(root, phase9EvidenceDirectorySuffix);
  mkdirSync(outputDirectory, { recursive: true });
  for (const name of PHASE9_EVIDENCE_FILES) writeFileSync(join(outputDirectory, name), `original:${name}\n`);
  try {
    const writer = createPhase9EvidenceWriter({
      repositoryRoot: root,
      helperEnvironment: {
        PHASE9_WRITER_TEST_BEFORE_PROMOTION_MS: '300', PHASE9_WRITER_TEST_FAIL_PROMOTION: '2',
      },
    });
    const pending = writer.write({
      lifecycle: task5Lifecycle, rows: task5CanonicalRows(), deployment: task5Deployment, outputDirectory,
    });
    let backupNames;
    const deadline = Date.now() + 2_000;
    while (!backupNames && Date.now() < deadline) {
      const candidates = readdirSync(outputDirectory).filter(name => name.endsWith('.bak'));
      if (candidates.length === PHASE9_EVIDENCE_FILES.length) backupNames = candidates;
      else await new Promise(resolvePromise => setTimeout(resolvePromise, 5));
    }
    assert.ok(backupNames, 'helper did not expose every backup pathname for the stolen-entry regression');
    const [backupName] = backupNames;
    renameSync(join(outputDirectory, backupName), join(outputDirectory, `${backupName}.stolen`));

    await assert.rejects(pending, /atomically/i);

    assert.deepEqual(readdirSync(outputDirectory).sort(), [...PHASE9_EVIDENCE_FILES].sort());
    for (const name of PHASE9_EVIDENCE_FILES) {
      assert.equal(readFileSync(join(outputDirectory, name), 'utf8'), `original:${name}\n`);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('phase 9 writer removes transaction-owned public output when rollback preparation or promotion fails', async () => {
  const { createPhase9EvidenceWriter, PHASE9_EVIDENCE_FILES } = await import('../scripts/qa-evidence/phase9/evidence-writer.mjs');
  for (const rollbackFailure of [
    ['PHASE9_WRITER_TEST_FAIL_ROLLBACK_PREPARATION', '2'],
    ['PHASE9_WRITER_TEST_FAIL_ROLLBACK_PROMOTION', '2'],
  ]) {
    const root = mkdtempSync('/tmp/phase9-writer-unsafe-recovery-');
    const outputDirectory = join(root, phase9EvidenceDirectorySuffix);
    mkdirSync(outputDirectory, { recursive: true });
    for (const name of PHASE9_EVIDENCE_FILES) writeFileSync(join(outputDirectory, name), `original:${name}\n`);
    try {
      const writer = createPhase9EvidenceWriter({
        repositoryRoot: root,
        helperEnvironment: {
          PHASE9_WRITER_TEST_FAIL_PROMOTION: '2', [rollbackFailure[0]]: rollbackFailure[1],
        },
      });
      await assert.rejects(writer.write({
        lifecycle: task5Lifecycle, rows: task5CanonicalRows(), deployment: task5Deployment, outputDirectory,
      }), /recovery.*incomplete/i);

      assert.equal(existsSync(join(outputDirectory, PHASE9_EVIDENCE_FILES[0])), false);
      for (const name of PHASE9_EVIDENCE_FILES.slice(1)) {
        assert.equal(readFileSync(join(outputDirectory, name), 'utf8'), `original:${name}\n`);
      }
      assert.equal(readdirSync(outputDirectory).some(name => name.startsWith('.')), false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('phase 9 writer never promotes a recovery pathname swapped immediately before rollback rename', async () => {
  const { createPhase9EvidenceWriter, PHASE9_EVIDENCE_FILES } = await import('../scripts/qa-evidence/phase9/evidence-writer.mjs');
  const root = mkdtempSync('/tmp/phase9-writer-rollback-swap-');
  const outputDirectory = join(root, phase9EvidenceDirectorySuffix);
  mkdirSync(outputDirectory, { recursive: true });
  for (const name of PHASE9_EVIDENCE_FILES) writeFileSync(join(outputDirectory, name), `original:${name}\n`);
  let hostileRecoveryName;
  try {
    const writer = createPhase9EvidenceWriter({
      repositoryRoot: root,
      helperEnvironment: {
        PHASE9_WRITER_TEST_FAIL_PROMOTION: '2',
        PHASE9_WRITER_TEST_BEFORE_ROLLBACK_PROMOTION_MS: '500',
      },
    });
    const pending = writer.write({
      lifecycle: task5Lifecycle, rows: task5CanonicalRows(), deployment: task5Deployment, outputDirectory,
    });
    const deadline = Date.now() + 2_000;
    while (!hostileRecoveryName && Date.now() < deadline) {
      hostileRecoveryName = readdirSync(outputDirectory).find(name => name.endsWith('.rollback.tmp'));
      if (!hostileRecoveryName) await new Promise(resolvePromise => setTimeout(resolvePromise, 5));
    }
    assert.ok(hostileRecoveryName, 'helper did not expose a recovery temp for the promotion-race regression');
    const hostileRecoveryPath = join(outputDirectory, hostileRecoveryName);
    rmSync(hostileRecoveryPath);
    writeFileSync(hostileRecoveryPath, 'attacker-recovery-content\n', { flag: 'wx', mode: 0o640 });

    await assert.rejects(pending, /recovery status is uncertain; directory preserved for manual recovery/i);
    for (const name of PHASE9_EVIDENCE_FILES) {
      const path = join(outputDirectory, name);
      if (existsSync(path)) assert.notEqual(readFileSync(path, 'utf8'), 'attacker-recovery-content\n');
    }
    assert.equal(readFileSync(hostileRecoveryPath, 'utf8'), 'attacker-recovery-content\n');
    assert.equal(statSync(hostileRecoveryPath).mode & 0o777, 0o640);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('phase 9 writer reports only the fixed uncertain result when bounded emergency inventory overflows', async () => {
  const { createPhase9EvidenceWriter, PHASE9_EVIDENCE_FILES } = await import('../scripts/qa-evidence/phase9/evidence-writer.mjs');
  const root = mkdtempSync('/tmp/phase9-writer-emergency-overflow-');
  const outputDirectory = join(root, phase9EvidenceDirectorySuffix);
  mkdirSync(outputDirectory, { recursive: true });
  for (const name of PHASE9_EVIDENCE_FILES) writeFileSync(join(outputDirectory, name), `original:${name}\n`);
  try {
    const writer = createPhase9EvidenceWriter({
      repositoryRoot: root,
      helperEnvironment: {
        PHASE9_WRITER_TEST_BEFORE_PROMOTION_MS: '500', PHASE9_WRITER_TEST_STEAL_PROMOTION: '1',
      },
    });
    const pending = writer.write({
      lifecycle: task5Lifecycle, rows: task5CanonicalRows(), deployment: task5Deployment, outputDirectory,
    });
    const deadline = Date.now() + 2_000;
    while (!readdirSync(outputDirectory).some(name => name.endsWith('.bak')) && Date.now() < deadline) {
      await new Promise(resolvePromise => setTimeout(resolvePromise, 5));
    }
    for (let index = 0; index < 33; index += 1) {
      writeFileSync(join(outputDirectory, `.hostile-${String(index).padStart(2, '0')}`), 'foreign\n', { flag: 'wx', mode: 0o640 });
    }
    const error = await pending.then(() => null, reason => reason);
    assert.equal(error?.message, 'Evidence recovery status is uncertain; directory preserved for manual recovery.');
    assert.doesNotMatch(error.message, /output was removed|restored atomically/i);
    assert.equal(readdirSync(outputDirectory).filter(name => name.startsWith('.hostile-')).length, 33);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('phase 9 writer removes a stolen promoted inode after restoring the original set', async () => {
  const { createPhase9EvidenceWriter, PHASE9_EVIDENCE_FILES } = await import('../scripts/qa-evidence/phase9/evidence-writer.mjs');
  const root = mkdtempSync('/tmp/phase9-writer-stolen-promotion-');
  const outputDirectory = join(root, phase9EvidenceDirectorySuffix);
  mkdirSync(outputDirectory, { recursive: true });
  for (const name of PHASE9_EVIDENCE_FILES) writeFileSync(join(outputDirectory, name), `original:${name}\n`);
  try {
    const writer = createPhase9EvidenceWriter({
      repositoryRoot: root, helperEnvironment: { PHASE9_WRITER_TEST_STEAL_PROMOTION: '1' },
    });
    await assert.rejects(writer.write({
      lifecycle: task5Lifecycle, rows: task5CanonicalRows(), deployment: task5Deployment, outputDirectory,
    }), /atomically/i);
    assert.deepEqual(readdirSync(outputDirectory).sort(), [...PHASE9_EVIDENCE_FILES].sort());
    for (const name of PHASE9_EVIDENCE_FILES) {
      assert.equal(readFileSync(join(outputDirectory, name), 'utf8'), `original:${name}\n`);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('phase 9 writer executes captured helper bytes after the verified helper path is replaced', async () => {
  const { createPhase9EvidenceWriter, PHASE9_EVIDENCE_FILES } = await import('../scripts/qa-evidence/phase9/evidence-writer.mjs');
  const root = mkdtempSync('/private/tmp/phase9-writer-captured-helper-');
  const outputDirectory = join(root, phase9EvidenceDirectorySuffix);
  const helperPath = join(root, 'captured-helper.py');
  const reviewedHelper = join(testDirectory, '..', 'scripts', 'qa-evidence', 'phase9', 'evidence-dirfd-helper.py');
  mkdirSync(outputDirectory, { recursive: true }); writeFileSync(helperPath, readFileSync(reviewedHelper));
  let replaced = false;
  const filesystem = {
    ...fsPromises,
    async readFile(path, ...args) {
      const bytes = await fsPromises.readFile(path, ...args);
      if (path === helperPath && !replaced) { replaced = true; writeFileSync(helperPath, 'raise SystemExit(91)\n'); }
      return bytes;
    },
  };
  try {
    const writer = createPhase9EvidenceWriter({ repositoryRoot: root, filesystem, helperPath });
    await writer.write({ lifecycle: task5Lifecycle, rows: task5CanonicalRows(), deployment: task5Deployment, outputDirectory });
    assert.deepEqual(readdirSync(outputDirectory).sort(), [...PHASE9_EVIDENCE_FILES].sort());
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('phase 9 writer rejects FIFO and hardlinked targets promptly without opening or modifying them', async () => {
  const { createPhase9EvidenceWriter } = await import('../scripts/qa-evidence/phase9/evidence-writer.mjs');
  for (const kind of ['fifo', 'hardlink']) {
    const root = mkdtempSync(`/tmp/phase9-writer-${kind}-`);
    const outputDirectory = join(root, phase9EvidenceDirectorySuffix); mkdirSync(outputDirectory, { recursive: true });
    const target = join(outputDirectory, '00-environment.md');
    if (kind === 'fifo') assert.equal(spawnSync('/usr/bin/mkfifo', [target]).status, 0);
    else { writeFileSync(target, 'original'); linkSync(target, join(root, 'external-link')); }
    const started = Date.now();
    try {
      const writer = createPhase9EvidenceWriter({ repositoryRoot: root, helperTimeoutMs: 2_000 });
      await assert.rejects(writer.write({
        lifecycle: task5Lifecycle, rows: task5CanonicalRows(), deployment: task5Deployment, outputDirectory,
      }), /recovery status is uncertain; directory preserved for manual recovery/i);
      assert.ok(Date.now() - started < 2_000, `${kind} rejection blocked`);
      assert.deepEqual(readdirSync(outputDirectory), ['00-environment.md']);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('phase 9 writer rejects stale crash artifacts on the next run without writing anything', async () => {
  const { createPhase9EvidenceWriter } = await import('../scripts/qa-evidence/phase9/evidence-writer.mjs');
  const root = mkdtempSync('/tmp/phase9-writer-crash-artifact-');
  const outputDirectory = join(root, phase9EvidenceDirectorySuffix); mkdirSync(outputDirectory, { recursive: true });
  const input = { lifecycle: task5Lifecycle, rows: task5CanonicalRows(), deployment: task5Deployment, outputDirectory };
  try {
    const crashing = createPhase9EvidenceWriter({
      repositoryRoot: root, helperEnvironment: { PHASE9_WRITER_TEST_SIGKILL_AFTER_TEMP: '1' }, helperTimeoutMs: 2_000,
    });
    await assert.rejects(crashing.write(input), /recovery status is uncertain; directory preserved for manual recovery/i);
    const stale = readdirSync(outputDirectory);
    assert.equal(stale.length, 1); assert.match(stale[0], /\.tmp$/);
    const retry = createPhase9EvidenceWriter({ repositoryRoot: root });
    await assert.rejects(retry.write(input), /recovery status is uncertain; directory preserved for manual recovery/i);
    assert.deepEqual(readdirSync(outputDirectory), stale);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('phase 9 writer detects a promoted path replacement and rolls back without changing an external inode', async () => {
  const { createPhase9EvidenceWriter } = await import('../scripts/qa-evidence/phase9/evidence-writer.mjs');
  const root = mkdtempSync('/tmp/phase9-writer-replaced-promotion-');
  const outputDirectory = join(root, phase9EvidenceDirectorySuffix); mkdirSync(outputDirectory, { recursive: true });
  try {
    const writer = createPhase9EvidenceWriter({
      repositoryRoot: root, helperEnvironment: { PHASE9_WRITER_TEST_REPLACE_PROMOTION: '1' },
    });
    await assert.rejects(writer.write({
      lifecycle: task5Lifecycle, rows: task5CanonicalRows(), deployment: task5Deployment, outputDirectory,
    }), /atomically/i);
    assert.deepEqual(readdirSync(outputDirectory), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('phase 9 writer terminates and joins a hanging helper without creating files', async () => {
  const { createPhase9EvidenceWriter } = await import('../scripts/qa-evidence/phase9/evidence-writer.mjs');
  const root = mkdtempSync('/tmp/phase9-writer-hang-');
  const outputDirectory = join(root, phase9EvidenceDirectorySuffix); mkdirSync(outputDirectory, { recursive: true });
  try {
    const writer = createPhase9EvidenceWriter({
      repositoryRoot: root, helperEnvironment: { PHASE9_WRITER_TEST_HANG: '1' }, helperTimeoutMs: 200,
    });
    await assert.rejects(writer.write({
      lifecycle: task5Lifecycle, rows: task5CanonicalRows(), deployment: task5Deployment, outputDirectory,
    }), /recovery status is uncertain; directory preserved for manual recovery/i);
    assert.deepEqual(readdirSync(outputDirectory), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('phase 9 evidence CLI dry-run builds the exact inert 44-row plan and pinned child descriptor', () => {
  const cliPath = join(testDirectory, '..', 'scripts', 'qa-evidence', 'phase9', 'cli.mjs');
  const result = spawnSync(process.execPath, [cliPath, 'dry-run'], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output, {
    ok: true, command: 'dry-run', network: false, firebase: false, browserNavigation: false,
    projectId: 'the-squad-v2-staging', origin: STAGING_ORIGIN, rows: 44,
    beforeTransition: 40, afterTransition: 4, childSha256: output.childSha256,
  });
  assert.match(output.childSha256, /^[0-9a-f]{64}$/);
});

test('phase 9 evidence CLI hosted admission rejects missing explicit staging proof without side effects', () => {
  const cliPath = join(testDirectory, '..', 'scripts', 'qa-evidence', 'phase9', 'cli.mjs');
  const result = spawnSync(process.execPath, [cliPath, 'hosted'], { encoding: 'utf8', timeout: 30_000 });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /explicit staging|--staging/i);
});

test('phase 9 evidence CLI pins the reviewed self-contained child and one exact config artifact', async () => {
  const { buildRunnerCommand } = await import('../scripts/qa-evidence/phase9/cli.mjs');
  const descriptor = await buildRunnerCommand();
  assert.deepEqual(Object.keys(descriptor).sort(), ['configFiles', 'entrypoint', 'entrypointSha256']);
  assert.equal(descriptor.entrypoint, join(testDirectory, '..', 'scripts', 'qa-evidence', 'phase9', 'child-runner.mjs'));
  assert.equal(descriptor.entrypointSha256, sha256File(descriptor.entrypoint));
  assert.equal(readFileSync(descriptor.entrypoint).byteLength <= 131_072, true);
  assert.equal(descriptor.configFiles.length, 1);
  assert.equal(descriptor.configFiles[0].sha256, sha256File(descriptor.configFiles[0].path));
  const source = readFileSync(descriptor.entrypoint, 'utf8');
  const specifiers = [...source.matchAll(/(?:\bfrom\s+|\bimport\()\s*["']([^"']+)["']/g)].map(match => match[1]);
  assert.equal(specifiers.every(specifier => specifier.startsWith('node:')), true);
  assert.doesNotMatch(source, /PHASE9_GUARDIAN_RUN_MARKER|NODE_OPTIONS|NODE_PATH/);
});

test('phase 9 evidence child selects each logout tab before the action window mark', async () => {
  const login = scenarioWindow({
    finalPath: '/login', finalUrl: `${STAGING_ORIGIN}/login`, visibleSentinels: ['Sign In'], sessionPresent: false,
  });
  const client = createScriptedScenarioClient([...REQUIRED_LOGOUT_STAGES.map(() => login), login]);
  const events = [];
  const capture = client.captureSignalWindow.bind(client);
  client.captureSignalWindow = async request => {
    events.push(`mark:${request.stage}`);
    return capture({
      ...request,
      action: async () => { events.push(`action:${request.stage}`); await request.action(); },
    });
  };
  const actions = Object.fromEntries(REQUIRED_LOGOUT_STAGES.map(name => [name, async () => {}]));
  Object.assign(actions, {
    selectStage: async name => events.push(`select:${name}`),
    waitForLogin: async () => {}, freshUnauthenticated: async () => {}, waitForFreshLogin: async () => {},
  });
  await runLogoutScenario({
    client, session: 'logout-shared', freshSession: 'logout-fresh',
    context: scenarioContext({ contextId: 'logout-tab-order' }), actions,
  });
  assert.deepEqual(events.slice(0, 12), REQUIRED_LOGOUT_STAGES.flatMap(name => [
    `select:${name}`, `mark:${name}`, `action:${name}`,
  ]));
});

test('phase 9 transport preserves only the exact guardian marker into a real descendant', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
  const {
    buildPlaywrightTransportEnvironment,
    createPlaywrightCliClient: createRuntimeClient,
  } = await import('../scripts/qa-evidence/phase9/playwright-cli-client.mjs');
  const guardianMarkerName = 'PHASE9_GUARDIAN_RUN_MARKER';
  const guardianMarker = createHash('sha256').update(`phase9-marker-${process.pid}`).digest('hex');
  const sourceEnvironment = {
    HOME: process.env.HOME,
    [guardianMarkerName]: guardianMarker,
    PHASE9_UNTRUSTED_MARKER: 'must-not-propagate',
    NODE_OPTIONS: '--require /attacker/preload.cjs',
  };
  const closed = buildPlaywrightTransportEnvironment(sourceEnvironment, { guardianMarkerName });
  assert.equal(closed[guardianMarkerName], guardianMarker);
  assert.equal(Object.hasOwn(closed, 'PHASE9_UNTRUSTED_MARKER'), false);
  assert.equal(Object.hasOwn(closed, 'NODE_OPTIONS'), false);
  assert.throws(
    () => buildPlaywrightTransportEnvironment(sourceEnvironment, { guardianMarkerName: 'PHASE9_UNTRUSTED_MARKER' }),
    /guardian marker/i,
  );

  let audited = false;
  const client = createRuntimeClient({
    guardianMarkerName,
    sourceEnvironment,
    timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS,
    executionHooks: {
      async afterSpawn({ pid }) {
        if (audited) return;
        const result = spawnSync('/bin/ps', ['eww', '-axo', 'pid=,command='], {
          encoding: 'utf8', timeout: 30_000,
        });
        assert.equal(result.status, 0, result.stderr);
        const line = result.stdout.split('\n').find(candidate => new RegExp(`^\\s*${pid}\\s`).test(candidate));
        assert.ok(line, `transport descendant ${pid} was absent from ps audit`);
        assert.equal(line.includes(` ${process.execPath} `), true);
        assert.equal(line.split(/\s+/).includes(`${guardianMarkerName}=${guardianMarker}`), true);
        assert.equal(line.includes('PHASE9_UNTRUSTED_MARKER=must-not-propagate'), false);
        audited = true;
      },
    },
  });
  try {
    await installSignalRecorder(client, 'phase9-marker-descendant');
    assert.equal(audited, true);
    const result = spawnSync('/bin/ps', ['eww', '-axo', 'pid=,command='], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const markerToken = `${guardianMarkerName}=${guardianMarker}`;
    const markedDescendants = result.stdout.split('\n').filter(line => {
      const words = line.split(/\s+/);
      return words.includes(markerToken) || words.includes(`--${markerToken}`);
    });
    assert.equal(markedDescendants.some(line => line.includes('cliDaemon.js')), true);
    assert.equal(markedDescendants.some(line => line.includes('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')), true);
    assert.equal(markedDescendants.every(line => !line.includes('PHASE9_UNTRUSTED_MARKER=must-not-propagate')), true);
  } finally {
    await closeAndVerifyBrowsers(client);
  }
});

test('phase 9 transport uses a fresh verified materialization for every explicit Node command', async () => {
  const { executeCapturedPlaywrightTransportCommand } = await import('../scripts/qa-evidence/phase9/playwright-cli-client.mjs');
  const materializations = [];
  await executeCapturedPlaywrightTransportCommand(['list'], {
    sourceEnvironment: { HOME: process.env.HOME, PATH: '/path-that-does-not-contain-node' },
    executionHooks: { beforeSpawn: value => materializations.push(value) },
  });
  assert.equal(materializations.length, 1);
  const first = materializations[0];
  assert.equal(existsSync(first.root), false, 'a completed transport command must remove its materialization');

  mkdirSync(dirname(first.entrypoint), { mode: 0o700, recursive: true });
  writeFileSync(first.entrypoint, 'process.exit(91)\n');
  const priorTransitive = join(first.root, 'node_modules', 'playwright-core', 'lib', 'coreBundle.js');
  mkdirSync(dirname(priorTransitive), { mode: 0o700, recursive: true });
  writeFileSync(priorTransitive, 'throw new Error("prior-root-transitive")\n');
  try {
    await executeCapturedPlaywrightTransportCommand(['list'], {
      sourceEnvironment: { HOME: process.env.HOME, PATH: '/path-that-does-not-contain-node' },
      executionHooks: { beforeSpawn: value => materializations.push(value) },
    });
    assert.equal(materializations.length, 2);
    assert.notEqual(materializations[1].root, first.root);
    assert.equal(existsSync(materializations[1].root), false);
    assert.equal(readFileSync(first.entrypoint, 'utf8'), 'process.exit(91)\n');
    assert.equal(readFileSync(priorTransitive, 'utf8'), 'throw new Error("prior-root-transitive")\n');
  } finally {
    rmSync(first.root, { recursive: true, force: true });
  }

  let permissionAttackedRoot;
  await assert.rejects(executeCapturedPlaywrightTransportCommand(['list'], {
    sourceEnvironment: { HOME: process.env.HOME, PATH: '/path-that-does-not-contain-node' },
    executionHooks: {
      beforeSpawn({ root, entrypoint }) {
        permissionAttackedRoot = root;
        chmodSync(dirname(entrypoint), 0o755);
      },
    },
  }), /materialized.*changed|transport.*integrity/i);
  assert.equal(existsSync(permissionAttackedRoot), false, 'a directory permission race must leave no stale root');

  let attackedRoot;
  await assert.rejects(executeCapturedPlaywrightTransportCommand(['list'], {
    sourceEnvironment: { HOME: process.env.HOME, PATH: '/path-that-does-not-contain-node' },
    executionHooks: {
      beforeSpawn({ root, entrypoint }) {
        attackedRoot = root;
        chmodSync(entrypoint, 0o600);
        writeFileSync(entrypoint, 'process.exit(0)\n');
      },
    },
  }), /materialized.*changed|transport.*integrity/i);
  assert.equal(existsSync(attackedRoot), false, 'a rejected pre-spawn mutation must leave no stale root');
});

test('phase 9 client verifies Chrome immediately before every browser launch', async () => {
  let checks = 0;
  let launches = 0;
  const transport = createCliTransport(argv => {
    if (argv.includes('open')) launches += 1;
    return blankAwareCliResult(argv, { pageId: 'raw', navigationGeneration: 0 });
  });
  const client = createPlaywrightCliClient({
    execute: transport.execute,
    wrapperPath: '/safe/playwright_cli.sh',
    verifyChromeBeforeLaunch: async () => {
      checks += 1;
      if (checks === 2) throw new Error('External system Chrome identity changed.');
    },
  });
  await installSignalRecorder(client, 'phase9-chrome-first');
  await assert.rejects(
    installSignalRecorder(client, 'phase9-chrome-second'),
    /Chrome identity changed/i,
  );
  assert.equal(checks, 2);
  assert.equal(launches, 1, 'the second launch must fail before transport execution');
});

test('phase 9 runner config contains only repository-relative repository paths', () => {
  const configPath = join(testDirectory, '..', 'scripts', 'qa-evidence', 'phase9', 'runner-config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(config.playwrightArtifact, 'scripts/qa-evidence/phase9/playwright-transport.bundle.json.gz');
  assert.equal(config.playwrightArtifact.startsWith('/'), false);
  assert.equal(config.playwrightArtifact.split('/').includes('..'), false);
  assert.deepEqual(config.nodeRuntime, {
    path: process.execPath,
    sha256: sha256File(process.execPath),
    codesignIdentifier: 'node',
    teamIdentifier: 'HX7739G8FX',
  });
  assert.deepEqual(config.chrome, {
    appPath: '/Applications/Google Chrome.app',
    binaryPath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    binarySha256: sha256File('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    codesignIdentifier: 'com.google.Chrome',
    teamIdentifier: 'EQHXZ8M8AV',
  });
});
