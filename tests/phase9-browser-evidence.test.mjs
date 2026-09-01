import assert from 'node:assert/strict';
import { createHook } from 'node:async_hooks';
import childProcess, { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs, {
  chmodSync, closeSync, constants as fsConstants, copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, symlinkSync, truncateSync, writeFileSync,
} from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
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
  acquireBlankBrowser,
  armAcquiredSignalRecorder,
  classifyStableTerminalSample,
  classifyRequestFailureSignal,
  closeAndVerifyBrowsers,
  createPlaywrightCliClient,
  createPhase9ProductionCliClient,
  executeCapturedPlaywrightTransportCommand,
  installSignalRecorder,
  isExpectedPriorDocumentFirestoreListenAbort,
  isExpectedPriorDocumentRscAbort,
  isProtectedResource,
  setAndVerifyViewport,
  waitForStableExactLocation,
} from '../scripts/qa-evidence/phase9/playwright-cli-client.mjs';
import { observeAction } from '../scripts/qa-evidence/phase9/signal-window.mjs';
import {
  buildCanonicalScenarioPlan,
  runAdmissionScenario,
  aggregateWindows,
  rebuildRequestFailureSignals,
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
import { openBoundPrivateInputs } from '../scripts/qa-evidence/phase9/private-input-reader.mjs';

const phase9EvidenceDirectorySuffix = join(
  'docs', 'qa', 'production-audit', 'runs', '2026-08-25-phase9-core-identities',
);

const testDirectory = dirname(fileURLToPath(import.meta.url));
const guardianChildEntrypoint = join(testDirectory, 'fixtures', 'phase9-lifecycle-child.mjs');
const LOCAL_REAL_CHROME_TEST_TIMEOUT_MS = 1_200_000;
const LOCAL_REAL_CHROME_EXTENDED_TEST_TIMEOUT_MS = 1_800_000;
const LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS = 90_000;
const DARWIN_RUNTIME_SKIP_REASON = 'Darwin-only: executes or compares the exact pinned macOS Node, Python, Chrome, Playwright, evidence-helper, or process-inspector runtime.';
const PHASE9_TEST_PLATFORM = process.env.PHASE9_TEST_PLATFORM ?? process.platform;
const NO_TEAM_POLICY_DIAGNOSTICS = Object.freeze([
  ['window-no-team-render', 'protected-render'],
  ['window-no-team-selection', 'team-a'],
  ['window-no-team-selection', 'team-b'],
  ['window-no-team-selection', 'other'],
  ['window-no-team-request', 'team-a'],
  ['window-no-team-request', 'team-b'],
  ['window-no-team-request', 'league'],
  ['window-no-team-request', 'other'],
  ['window-no-team-request', 'foreign'],
  ['window-no-team-request', 'unscoped-firestore-document'],
  ['window-no-team-request', 'unscoped-firestore-run-query'],
  ['window-no-team-request', 'unscoped-firestore-listen'],
  ['window-no-team-request', 'unscoped-firestore-protected'],
  ['window-no-team-request', 'unscoped-staging-join-admin-api'],
  ['window-no-team-request', 'unscoped-staging-protected-api'],
  ['window-no-team-listener', 'team-a'],
  ['window-no-team-listener', 'team-b'],
  ['window-no-team-listener', 'league'],
  ['window-no-team-listener', 'other'],
  ['window-no-team-listener', 'foreign'],
  ['window-no-team-listener', 'unscoped-firestore-document'],
  ['window-no-team-listener', 'unscoped-firestore-run-query'],
  ['window-no-team-listener', 'unscoped-firestore-listen'],
  ['window-no-team-listener', 'unscoped-firestore-protected'],
  ['window-no-team-listener', 'unscoped-staging-join-admin-api'],
  ['window-no-team-listener', 'unscoped-staging-protected-api'],
]);
const darwinRuntimeTests = [];
const darwinRuntimeTest = (name, options, implementation) => {
  const normalizedOptions = typeof options === 'function' ? {} : options;
  const normalizedImplementation = typeof options === 'function' ? options : implementation;
  darwinRuntimeTests.push(name);
  return test(name, {
    ...normalizedOptions,
    skip: PHASE9_TEST_PLATFORM === 'darwin' ? false : DARWIN_RUNTIME_SKIP_REASON,
  }, normalizedImplementation);
};
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
    unexpectedRequestFailureSignals: [],
    overflow: 0,
    ...overrides,
  };
};

const canonicalRequestFailureSummary = Object.freeze({
  failureClass: 'connection',
  targetClass: 'firestore',
  resourceType: 'xhr',
  navigationRelationship: 'prior-document',
  multiplicity: 'multiple',
});

const STAGING_ORIGIN = 'https://studio--the-squad-v2-staging.us-east4.hosted.app';
const FIRESTORE_DATABASE = 'projects/the-squad-v2-staging/databases/(default)';
const FIRESTORE_LISTEN_BASE_URL = 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel';
const FIRESTORE_INITIAL_LISTEN_URL = `${FIRESTORE_LISTEN_BASE_URL}?${new URLSearchParams({
  database: FIRESTORE_DATABASE,
  VER: '8',
  RID: '0',
  CVER: '22',
  zx: 'phase9test',
  t: '1',
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
  t: '1',
}).toString()}`;
const FIRESTORE_TERMINATE_LISTEN_URL = `${FIRESTORE_LISTEN_BASE_URL}?${new URLSearchParams({
  database: FIRESTORE_DATABASE,
  VER: '8',
  RID: '1',
  SID: 'phase9session',
  TYPE: 'terminate',
  zx: 'phase9test',
  t: '1',
}).toString()}`;
const BROWSER_PRODUCER_HEADERS = Object.freeze({
  accept: '*/*',
  origin: STAGING_ORIGIN,
  referer: `${STAGING_ORIGIN}/`,
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/152.0.0.0 Safari/537.36',
  'sec-ch-ua': '"Chromium";v="152", "Not?A_Brand";v="24", "Google Chrome";v="152"',
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

test('phase 9 request failure classifier emits closed summaries for every public class', () => {
  const sensitiveUrl = 'https://qa-phase7-20260829T123456Z-abcdefghijkl/asset.js?session=browser-session-label';
  const input = overrides => ({
    failureText: 'net::ERR_FAILED',
    url: sensitiveUrl,
    resourceType: 'fetch',
    isNavigationRequest: false,
    isMainFrame: false,
    startGeneration: 4,
    currentGeneration: 4,
    ...overrides,
  });
  for (const [failureText, failureClass] of [
    ['net::ERR_ABORTED', 'aborted'],
    ['net::ERR_TIMED_OUT', 'timeout'],
    ['net::ERR_NAME_NOT_RESOLVED', 'name-resolution'],
    ['net::ERR_CONNECTION_REFUSED', 'connection'],
    ['net::ERR_CERT_AUTHORITY_INVALID', 'tls'],
    ['net::ERR_BLOCKED_BY_CLIENT', 'policy-blocked'],
    ['net::ERR_FAILED', 'other'],
  ]) {
    assert.deepEqual(classifyRequestFailureSignal(input({ failureText })), {
      failureClass, targetClass: 'other', resourceType: 'fetch', navigationRelationship: 'subresource',
    });
  }
  for (const [url, resourceType, targetClass] of [
    [`${STAGING_ORIGIN}/api/health`, 'fetch', 'public-api'],
    [`${STAGING_ORIGIN}/api/teams/chat`, 'xhr', 'protected-api'],
    ['https://firestore.googleapis.com/v1/projects/example/databases/(default)/documents/a', 'fetch', 'firestore'],
    ['https://identitytoolkit.googleapis.com/v1/accounts:lookup', 'fetch', 'identity'],
    [`${STAGING_ORIGIN}/assets/app.js`, 'script', 'static'],
  ]) {
    assert.deepEqual(classifyRequestFailureSignal(input({ url, resourceType })), {
      failureClass: 'other', targetClass, resourceType: ['fetch', 'xhr'].includes(resourceType) ? resourceType : 'other',
      navigationRelationship: 'subresource',
    });
  }
  for (const [startGeneration, currentGeneration, navigationRelationship] of [
    [4, 4, 'current-document'],
    [3, 4, 'prior-document'],
    [undefined, 4, 'unknown'],
    [5, 4, 'unknown'],
  ]) {
    assert.deepEqual(classifyRequestFailureSignal(input({
      url: `${STAGING_ORIGIN}/family`, resourceType: 'document', isNavigationRequest: true, isMainFrame: true,
      startGeneration, currentGeneration,
    })), {
      failureClass: 'other', targetClass: 'document', resourceType: 'other', navigationRelationship,
    });
  }
  assert.deepEqual(classifyRequestFailureSignal(input({
    failureText: null, url: null, resourceType: 'unrecognized', isNavigationRequest: 'yes', isMainFrame: true,
    startGeneration: 'four', currentGeneration: 4,
  })), {
    failureClass: 'other', targetClass: 'other', resourceType: 'other', navigationRelationship: 'unknown',
  });
  assert.deepEqual(classifyRequestFailureSignal(new Proxy({}, {
    get() { throw new Error('raw browser value must stay private'); },
  })), {
    failureClass: 'other', targetClass: 'other', resourceType: 'other', navigationRelationship: 'unknown',
  });
  const serialized = JSON.stringify(classifyRequestFailureSignal(input({
    failureText: 'net::ERR_NAME_NOT_RESOLVED qa-phase7-20260829T123456Z-abcdefghijkl browser-session-label',
  })));
  for (const forbidden of [sensitiveUrl, 'session=browser-session-label', 'qa-phase7-20260829T123456Z-abcdefghijkl', 'net::ERR_NAME_NOT_RESOLVED', 'browser-session-label']) {
    assert.equal(serialized.includes(forbidden), false, `classifier leaked ${forbidden}`);
  }
});

test('phase 9 request failure suppression is exact to current-or-prior same-origin RSC aborts', () => {
  const valid = {
    failureText: 'net::ERR_ABORTED',
    url: `${STAGING_ORIGIN}/_next/rsc/family`,
    method: 'GET',
    resourceType: 'fetch',
    isNavigationRequest: false,
    isMainFrame: true,
    isRscRequest: true,
    startHardNavigationGeneration: 1,
    currentHardNavigationGeneration: 2,
  };
  assert.equal(isExpectedPriorDocumentRscAbort(valid), true);
  assert.equal(isExpectedPriorDocumentRscAbort({
    ...valid,
    startHardNavigationGeneration: valid.currentHardNavigationGeneration,
  }), true);
  for (const overrides of [
    { failureText: 'net::ERR_TIMED_OUT' },
    { failureText: 'net::ERR_ABORTED_BY_CLIENT' },
    { failureText: 'prefix net::ERR_ABORTED suffix' },
    { method: 'POST' },
    { url: `${STAGING_ORIGIN}/api` },
    { url: `${STAGING_ORIGIN}/api?RSC=1` },
    { url: `${STAGING_ORIGIN}/api/teams/chat` },
    { url: `${STAGING_ORIGIN}/%61pi/teams/chat` },
    { url: `${STAGING_ORIGIN}\\api\\teams\\chat` },
    { url: 'https://studio--the-squad-v2-staging.us-east4.hosted.app.evil.example/family' },
    { url: 'https://user@studio--the-squad-v2-staging.us-east4.hosted.app/family' },
    { url: 'https://firestore.googleapis.com/v1/projects/example/databases/(default)/documents/a' },
    { resourceType: 'xhr' },
    { isNavigationRequest: true },
    { isMainFrame: false },
    { isRscRequest: false },
    { startHardNavigationGeneration: 3 },
    { startHardNavigationGeneration: undefined },
    { currentHardNavigationGeneration: undefined },
  ]) {
    assert.equal(isExpectedPriorDocumentRscAbort({ ...valid, ...overrides }), false, JSON.stringify(overrides));
  }
});

test('phase 9 request failure suppression is exact to current-or-prior-document Firestore Listen aborts', () => {
  const listenPrefix = 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?';
  const database = 'database=projects%2Fthe-squad-v2-staging%2Fdatabases%2F(default)';
  const valid = {
    failureText: 'net::ERR_ABORTED',
    url: `${listenPrefix}${database}&VER=8&RID=rpc&SID=session&AID=1&CI=0&TYPE=xmlhttp&zx=token&t=1`,
    method: 'GET',
    resourceType: 'fetch',
    isNavigationRequest: false,
    isMainFrame: true,
    isRscRequest: false,
    startHardNavigationGeneration: 1,
    currentHardNavigationGeneration: 2,
  };
  assert.equal(isExpectedPriorDocumentFirestoreListenAbort(valid), true);
  assert.equal(isExpectedPriorDocumentFirestoreListenAbort({
    ...valid,
    startHardNavigationGeneration: valid.currentHardNavigationGeneration,
  }), true);
  assert.equal(isExpectedPriorDocumentFirestoreListenAbort({
    ...valid,
    url: valid.url.replace('&t=1', '&t=2'),
  }), true);
  assert.equal(isExpectedPriorDocumentFirestoreListenAbort({
    ...valid,
    url: valid.url.replace('&t=1', '&t=3'),
  }), true);
  assert.equal(isExpectedPriorDocumentFirestoreListenAbort({ ...valid, resourceType: 'xhr' }), true);
  assert.equal(isExpectedPriorDocumentFirestoreListenAbort({
    ...valid,
    method: 'POST',
    url: `${listenPrefix}${database}&VER=8&RID=123&CVER=22&X-HTTP-Session-Id=gsessionid&zx=token&t=1`,
  }), true);
  for (const overrides of [
    { failureText: 'net::ERR_TIMED_OUT' },
    { failureText: 'net::ERR_ABORTED_BY_CLIENT' },
    { method: 'PUT' },
    { resourceType: 'document' },
    { isNavigationRequest: true },
    { isMainFrame: false },
    { startHardNavigationGeneration: 3 },
    { startHardNavigationGeneration: undefined },
    { currentHardNavigationGeneration: undefined },
    { url: valid.url.replace('&t=1', '') },
    { url: valid.url.replace('&t=1', '&t=0') },
    { url: valid.url.replace('&t=1', '&t=4') },
    { url: `${valid.url}&t=1` },
    { url: 'https://firestore.googleapis.com/v1/projects/the-squad-v2-staging/databases/(default)/documents/users/example' },
    { url: 'https://firestore.googleapis.com/v1/projects/the-squad-v2-staging/databases/(default)/documents:runQuery' },
    { url: `${listenPrefix}database=projects%2Fwrong-project%2Fdatabases%2F(default)&VER=8&RID=rpc&SID=session&AID=1&CI=0&TYPE=xmlhttp&zx=token` },
    { url: `${listenPrefix}${database}&VER=7&RID=rpc&SID=session&AID=1&CI=0&TYPE=xmlhttp&zx=token` },
    { url: `${listenPrefix}${database}&VER=8&RID=rpc&SID=session&AID=1&CI=0&TYPE=xmlhttp&zx=token&unknown=1` },
    { url: `${listenPrefix}${database}&${database}&VER=8&RID=rpc&SID=session&AID=1&CI=0&TYPE=xmlhttp&zx=token` },
    { url: `${listenPrefix}${database}&VER=8&RID=rpc&SID=session&AID=1&CI=0&TYPE=xmlhttp&zx=token#fragment` },
    { url: `https://user@firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?${database}&VER=8&RID=rpc&SID=session&AID=1&CI=0&TYPE=xmlhttp&zx=token` },
  ]) {
    assert.equal(
      isExpectedPriorDocumentFirestoreListenAbort({ ...valid, ...overrides }),
      false,
      JSON.stringify(overrides),
    );
  }
});

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

test('phase 9 action window reports a closed visible-contract diagnostic before rejecting the sample', async () => {
  const checkpoints = [];
  const transport = createCliTransport(argv => {
    const code = argv[argv.indexOf('run-code') + 1] ?? '';
    if (code.includes('phase9:mark')) return cliResult({ pageId: 'page-a', sequence: 1 });
    if (code.includes('phase9:sample')) return cliResult({
      pageId: 'page-a', terminalReached: true, loadingVisible: false,
      finalUrl: `${STAGING_ORIGIN}/family`, finalPath: '/family',
      visibleSentinels: ['not-a-reviewed-heading'], sessionPresent: true,
      protectedRender: false, rawRequests: [], rawResponses: [], rawTeamSelections: [],
      pageErrors: [], appConsoleErrors: [], unexpectedRequestFailures: [], overflow: 0,
      renderPath: '/family', renderSentinel: '', redirectReason: 'none', renderSignals: [],
    });
    return blankAwareCliResult(argv);
  });
  const client = createPlaywrightCliClient({
    execute: transport.execute,
    wrapperPath: '/safe/playwright_cli.sh',
    onDiagnosticCheckpoint: (checkpoint, reason) => checkpoints.push([checkpoint, reason]),
  });
  await installSignalRecorder(client, 'visible-contract-diagnostic');
  await assert.rejects(observeAction({
    client, session: 'visible-contract-diagnostic', stage: 'admission-login',
    terminal: async () => {}, action: async () => {},
  }), /visible sentinels/i);
  assert.deepEqual(checkpoints.at(-1), ['window-visible-contract', 'visible-contract-invalid']);
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

darwinRuntimeTest('phase 9 action window real Chrome captures each independent transient visibility mechanism', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async t => {
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

darwinRuntimeTest('phase 9 action window real Chrome captures distinct CSS-animation-only protected flashes', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
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

darwinRuntimeTest('phase 9 action window classifies real request failures', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
  const client = createPhase9ProductionCliClient({ timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS });
  const session = 'phase9-request-failure-classification';
  const captureFailure = async errorCode => observeAction({
    client,
    session,
    stage: `request-failure-${errorCode}`,
    terminal: async () => {},
    action: async () => client.runCode(session, `async (page) => {
      const target = 'https://phase9-request-failure.invalid/${errorCode}';
      await page.route(target, route => route.abort(${JSON.stringify(errorCode)}));
      await page.evaluate(target => fetch(target).catch(() => undefined), target);
      await page.unroute(target);
      return { ok: true };
    }`),
  });
  try {
    await installSignalRecorder(client, session);
    const aborted = await captureFailure('aborted');
    const timedOut = await captureFailure('timedout');
    const multiple = await observeAction({
      client,
      session,
      stage: 'request-failure-multiple',
      terminal: async () => {},
      action: async () => client.runCode(session, `async (page) => {
        const targets = [
          'https://phase9-request-failure.invalid/multiple-a',
          'https://phase9-request-failure.invalid/multiple-b',
        ];
        await Promise.all(targets.map(target => page.route(target, route => route.abort('aborted'))));
        await page.evaluate(targets => Promise.all(targets.map(target => fetch(target).catch(() => undefined))), targets);
        await Promise.all(targets.map(target => page.unroute(target)));
        return { ok: true };
      }`),
    });
    assert.equal(aborted.unexpectedRequestFailures, 1);
    assert.equal(timedOut.unexpectedRequestFailures, 1);
    assert.deepEqual(aborted.unexpectedRequestFailureSignals, [{
      failureClass: 'aborted', targetClass: 'other', resourceType: 'fetch',
      navigationRelationship: 'subresource', multiplicity: 'single',
    }]);
    assert.deepEqual(timedOut.unexpectedRequestFailureSignals, [{
      failureClass: 'timeout', targetClass: 'other', resourceType: 'fetch',
      navigationRelationship: 'subresource', multiplicity: 'single',
    }]);
    assert.equal(multiple.unexpectedRequestFailures, 2);
    assert.deepEqual(multiple.unexpectedRequestFailureSignals, [
      {
        failureClass: 'aborted', targetClass: 'other', resourceType: 'fetch',
        navigationRelationship: 'subresource', multiplicity: 'multiple',
      },
      {
        failureClass: 'aborted', targetClass: 'other', resourceType: 'fetch',
        navigationRelationship: 'subresource', multiplicity: 'multiple',
      },
    ]);
  } finally {
    await closeAndVerifyBrowsers(client);
  }
  assert.deepEqual(await client.listBrowsers(), { browsers: [] });
});

darwinRuntimeTest('phase 9 recorder ignores exact current-or-prior RSC and Firestore Listen aborts', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
  const client = createPhase9ProductionCliClient({ timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS });
  const session = 'phase9-prior-rsc-abort';
  try {
    await installSignalRecorder(client, session);
    const cases = [
      {
        label: 'expected-rsc', path: '/_next/rsc/expected', headers: { RSC: '1' }, abort: 'aborted',
        expectedSignals: [],
      },
      {
        label: 'expected-current-rsc', sameDocument: true,
        path: '/_next/rsc/expected-current', headers: { RSC: '1' }, abort: 'aborted',
        expectedSignals: [],
      },
      {
        label: 'non-rsc', path: '/_next/rsc/non-rsc', headers: {}, abort: 'aborted',
        expectedSignals: [{
          failureClass: 'aborted', targetClass: 'other', resourceType: 'fetch',
          navigationRelationship: 'subresource', multiplicity: 'single',
        }],
      },
      {
        label: 'protected-rsc', path: '/api/teams/chat', headers: { RSC: '1' }, abort: 'aborted',
        expectedSignals: [{
          failureClass: 'aborted', targetClass: 'protected-api', resourceType: 'fetch',
          navigationRelationship: 'subresource', multiplicity: 'single',
        }],
      },
      {
        label: 'timed-out-rsc', path: '/_next/rsc/timed-out', headers: { RSC: '1' }, abort: 'timedout',
        expectedSignals: [{
          failureClass: 'timeout', targetClass: 'other', resourceType: 'fetch',
          navigationRelationship: 'subresource', multiplicity: 'single',
        }],
      },
      {
        label: 'expected-firestore-listen-get',
        target: 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?database=projects%2Fthe-squad-v2-staging%2Fdatabases%2F(default)&VER=8&RID=rpc&SID=session&AID=1&CI=0&TYPE=xmlhttp&zx=token&t=1',
        headers: {}, method: 'GET', abort: 'aborted', expectedSignals: [],
      },
      {
        label: 'expected-current-firestore-listen-get', sameDocument: true,
        target: 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?database=projects%2Fthe-squad-v2-staging%2Fdatabases%2F(default)&VER=8&RID=rpc&SID=session&AID=1&CI=0&TYPE=xmlhttp&zx=token&t=1',
        headers: {}, method: 'GET', abort: 'aborted', expectedSignals: [],
      },
      {
        label: 'expected-firestore-listen-post',
        target: 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?database=projects%2Fthe-squad-v2-staging%2Fdatabases%2F(default)&VER=8&RID=123&CVER=22&X-HTTP-Session-Id=gsessionid&zx=token&t=1',
        headers: {}, method: 'POST', body: 'count=0&ofs=0', abort: 'aborted', expectedSignals: [],
      },
      {
        label: 'firestore-document',
        target: 'https://firestore.googleapis.com/v1/projects/the-squad-v2-staging/databases/(default)/documents/users/example',
        headers: {}, method: 'GET', abort: 'aborted',
        expectedSignals: [{
          failureClass: 'aborted', targetClass: 'firestore', resourceType: 'fetch',
          navigationRelationship: 'subresource', multiplicity: 'single',
        }],
      },
      {
        label: 'timed-out-firestore-listen',
        target: 'https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?database=projects%2Fthe-squad-v2-staging%2Fdatabases%2F(default)&VER=8&RID=rpc&SID=session&AID=1&CI=0&TYPE=xmlhttp&zx=token&t=1',
        headers: {}, method: 'GET', abort: 'timedout',
        expectedSignals: [{
          failureClass: 'timeout', targetClass: 'firestore', resourceType: 'fetch',
          navigationRelationship: 'subresource', multiplicity: 'single',
        }],
      },
    ];
    for (const requestCase of cases) {
      let rawObservation;
      const result = await observeAction({
        client,
        session,
        stage: `prior-rsc-hard-navigation-${requestCase.label}`,
        terminal: async () => {},
        action: async () => {
          rawObservation = await client.runCode(session, `async (page) => {
        const origin = ${JSON.stringify(STAGING_ORIGIN)};
        const requestCase = ${JSON.stringify(requestCase)};
        const initialDocument = origin + '/family?case=' + requestCase.label;
        const nextDocument = origin + '/admin?case=' + requestCase.label;
        const target = requestCase.target || origin + requestCase.path;
        let releaseFailures;
        const navigationStarted = new Promise(resolve => { releaseFailures = resolve; });
        const rawFailureLabels = [];
        let recordRawFailures;
        const rawFailuresRecorded = new Promise(resolve => { recordRawFailures = resolve; });
        const onRequestFailed = request => {
          if (request.url() !== target) return;
          rawFailureLabels.push(requestCase.label);
          recordRawFailures();
        };
        const onRequest = request => {
          if (request.isNavigationRequest() && request.frame() === page.mainFrame() && request.url() === nextDocument) {
            releaseFailures();
          }
        };
        const routeHandler = async route => {
          const request = route.request();
          const url = request.url();
          if (url === initialDocument) {
            await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>initial</title>' });
            return;
          }
          if (url === nextDocument) {
            await rawFailuresRecorded;
            await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>next</title>' });
            return;
          }
          if (url !== target) throw new Error('Unexpected intercepted request.');
          if (!requestCase.sameDocument) await navigationStarted;
          await route.abort(requestCase.abort);
        };
        page.on('requestfailed', onRequestFailed);
        page.on('request', onRequest);
        await page.route(origin + '/**', routeHandler);
        if (!target.startsWith(origin + '/')) await page.route(target, routeHandler);
        try {
          await page.goto(initialDocument);
          const seen = page.waitForRequest(target);
          await page.evaluate(({ target, headers, method, body }) => {
            void fetch(target, { headers, method, ...(body === undefined ? {} : { body }) }).catch(() => undefined);
          }, { target, headers: requestCase.headers, method: requestCase.method || 'GET', body: requestCase.body });
          await seen;
          if (!requestCase.sameDocument) await page.goto(nextDocument);
          await rawFailuresRecorded;
          return { ok: true, rawFailureLabels };
        } finally {
          page.off('requestfailed', onRequestFailed);
          page.off('request', onRequest);
          await page.unroute(origin + '/**', routeHandler);
          if (!target.startsWith(origin + '/')) await page.unroute(target, routeHandler);
        }
      }`);
        },
      });
      assert.deepEqual(rawObservation, { ok: true, rawFailureLabels: [requestCase.label] });
      assert.equal(result.unexpectedRequestFailures, requestCase.expectedSignals.length, JSON.stringify(result));
      assert.deepEqual(result.unexpectedRequestFailureSignals, requestCase.expectedSignals);
    }
  } finally {
    await closeAndVerifyBrowsers(client);
  }
  assert.deepEqual(await client.listBrowsers(), { browsers: [] });
});

darwinRuntimeTest('phase 9 action window real Chrome refuses recorder installation on a nonblank tab', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
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

test('phase 9 action-window validator reports only the exact closed failing boundary', async t => {
  const protectedRender = safeWindow({
    renderSignals: [{ kind: 'heading', pathname: '/family', sentinel: 'Family Overview' }],
    protectedRender: true,
  });
  const cases = [
    ['schema', {}, {}, /terminalReached/i, ['window-schema', 'schema-invalid']],
    ['terminal', safeWindow({ terminalReached: false }), {}, /terminal state/i,
      ['window-terminal', 'terminal-invalid']],
    ['loading', safeWindow({ loadingVisible: true }), {}, /loading state/i,
      ['window-loading', 'loading-invalid']],
    ['location', safeWindow({ finalUrl: `${STAGING_ORIGIN}/dashboard` }), {}, /finalUrl|pathname|location/i,
      ['window-location', 'location-invalid']],
    ['page error', safeWindow({ pageErrors: 1 }), {}, /page errors/i,
      ['window-page-error', 'page-error-invalid']],
    ['console error', safeWindow({ appConsoleErrors: 1 }), {}, /application console/i,
      ['window-console-error', 'console-error-invalid']],
    ['request failure', safeWindow({ unexpectedRequestFailures: 1 }), {}, /request failure/i,
      ['window-request-failure', 'request-failure-invalid']],
    ['overflow', safeWindow({ overflow: 1 }), {}, /overflow/i,
      ['window-overflow', 'overflow-invalid']],
    ['render coherence', safeWindow({
      renderSignals: [{ kind: 'heading', pathname: '/family', sentinel: 'Family Overview' }],
      protectedRender: false,
    }), {}, /protected render flag/i, ['window-render-coherence', 'render-coherence-invalid']],
    ['resource', safeWindow({ protectedRequests: 1 }), {}, /complete protected request signals/i,
      ['window-resource', 'resource-invalid']],
    ['policy', protectedRender, { requireNoProtected: true }, /protected render/i,
      ['window-policy', 'policy-invalid']],
  ];
  for (const [name, window, options, expectedError, expectedDiagnostic] of cases) await t.test(name, () => {
    const checkpoints = [];
    assert.throws(
      () => validateActionWindow(window, options, (checkpoint, reason) => checkpoints.push([checkpoint, reason])),
      expectedError,
    );
    assert.deepEqual(checkpoints.at(-1), expectedDiagnostic);
    assert.equal(checkpoints.flat().every(value => typeof value === 'string'), true);
  });
});

test('phase 9 request failure contract accepts only count-coherent closed summaries', async t => {
  const requestFailure = Object.freeze({
    failureClass: 'aborted',
    targetClass: 'protected-api',
    resourceType: 'fetch',
    navigationRelationship: 'subresource',
    multiplicity: 'single',
  });
  const failingWindow = () => safeWindow({
    unexpectedRequestFailures: 1,
    unexpectedRequestFailureSignals: [{ ...requestFailure }],
  });

  const zero = validateActionWindow(safeWindow());
  assert.deepEqual(zero.unexpectedRequestFailureSignals, []);
  assert.notEqual(zero.unexpectedRequestFailureSignals, safeWindow().unexpectedRequestFailureSignals);

  const reports = [];
  assert.throws(
    () => validateActionWindow(failingWindow(), {}, (...report) => reports.push(report)),
    /request failure/i,
  );
  assert.deepEqual(reports.at(-1), ['window-request-failure', 'request-failure-invalid', requestFailure]);

  const malformed = [
    ['count mismatch', safeWindow({ unexpectedRequestFailures: 1, unexpectedRequestFailureSignals: [] })],
    ['wrong multiplicity', safeWindow({
      unexpectedRequestFailures: 2,
      unexpectedRequestFailureSignals: [{ ...requestFailure }, { ...requestFailure }],
    })],
    ['extra key', safeWindow({
      unexpectedRequestFailures: 1,
      unexpectedRequestFailureSignals: [{ ...requestFailure, rawUrl: 'https://secret.invalid/?token=must-not-return' }],
    })],
    ['raw failure text', safeWindow({
      unexpectedRequestFailures: 1,
      unexpectedRequestFailureSignals: [{ ...requestFailure, failureText: 'net::ERR_FAILED secret=must-not-return' }],
    })],
    ['missing key', safeWindow({
      unexpectedRequestFailures: 1,
      unexpectedRequestFailureSignals: [{ failureClass: 'aborted', targetClass: 'protected-api', resourceType: 'fetch', multiplicity: 'single' }],
    })],
    ['out of enum', safeWindow({
      unexpectedRequestFailures: 1,
      unexpectedRequestFailureSignals: [{ ...requestFailure, failureClass: 'net::ERR_FAILED' }],
    })],
    ['sparse array', safeWindow({
      unexpectedRequestFailures: 1,
      unexpectedRequestFailureSignals: Object.assign(new Array(1), {}),
    })],
    ['accessor', (() => {
      const signal = { ...requestFailure };
      Object.defineProperty(signal, 'failureClass', { enumerable: true, get: () => 'aborted' });
      return safeWindow({ unexpectedRequestFailures: 1, unexpectedRequestFailureSignals: [signal] });
    })()],
    ['proxy', safeWindow({
      unexpectedRequestFailures: 1,
      unexpectedRequestFailureSignals: [new Proxy({ ...requestFailure }, {})],
    })],
    ['over limit', safeWindow({
      unexpectedRequestFailures: 1001,
      unexpectedRequestFailureSignals: Array.from({ length: 1001 }, () => ({ ...requestFailure, multiplicity: 'multiple' })),
    })],
  ];
  for (const [name, window] of malformed) await t.test(name, () => {
    const malformedReports = [];
    assert.throws(
      () => validateActionWindow(window, {}, (...report) => malformedReports.push(report)),
      /request.failure|credential-shaped evidence|cloneable closed data graph/i,
    );
    assert.equal(malformedReports.every(report => report.length === 2), true);
  });
});

test('phase 9 request failure diagnostic cannot alter its validated summary', () => {
  const window = safeWindow({
    unexpectedRequestFailures: 1,
    unexpectedRequestFailureSignals: [{
      failureClass: 'aborted', targetClass: 'protected-api', resourceType: 'fetch',
      navigationRelationship: 'subresource', multiplicity: 'single',
    }],
  });
  const originalIncludes = Array.prototype.includes;
  const reports = [];
  try {
    assert.throws(() => validateActionWindow(window, {}, (...report) => {
      reports.push(report);
      window.unexpectedRequestFailures = 0;
      window.unexpectedRequestFailureSignals.length = 0;
      Array.prototype.includes = () => true;
    }), /request failure/i);
  } finally {
    Array.prototype.includes = originalIncludes;
  }
  assert.deepEqual(reports.at(-1), [
    'window-request-failure', 'request-failure-invalid', {
      failureClass: 'aborted', targetClass: 'protected-api', resourceType: 'fetch',
      navigationRelationship: 'subresource', multiplicity: 'single',
    },
  ]);
});

test('phase 9 aggregate windows rebuild request failure summaries from the complete count', () => {
  const singleDiagnostics = [];
  assert.throws(
    () => aggregateWindows([safeWindow({
      unexpectedRequestFailures: 1,
      unexpectedRequestFailureSignals: [{
        failureClass: 'connection', targetClass: 'firestore', resourceType: 'xhr',
        navigationRelationship: 'prior-document', multiplicity: 'multiple',
        rawUrl: 'https://secret.invalid/single?token=must-not-return',
      }],
    })], {}, (...report) => singleDiagnostics.push(report)),
    /request failure/i,
  );
  assert.deepEqual(singleDiagnostics.at(-1), ['window-request-failure', 'request-failure-invalid', {
    failureClass: 'connection', targetClass: 'firestore', resourceType: 'xhr',
    navigationRelationship: 'prior-document', multiplicity: 'single',
  }]);

  const windows = [
    safeWindow({
      unexpectedRequestFailures: 1,
      unexpectedRequestFailureSignals: [{
        failureClass: 'aborted', targetClass: 'protected-api', resourceType: 'fetch',
        navigationRelationship: 'subresource', multiplicity: 'single',
        rawUrl: 'https://secret.invalid/one?token=must-not-return',
      }],
    }),
    safeWindow({
      unexpectedRequestFailures: 1,
      unexpectedRequestFailureSignals: [{
        failureClass: 'timeout', targetClass: 'identity', resourceType: 'xhr',
        navigationRelationship: 'current-document', multiplicity: 'multiple',
        failureText: 'net::ERR_TIMED_OUT secret=must-not-return',
      }],
    }),
  ];
  const rebuiltSignals = rebuildRequestFailureSignals(
    windows.flatMap(window => window.unexpectedRequestFailureSignals),
  );
  assert.deepEqual(rebuiltSignals, [
    {
      failureClass: 'aborted', targetClass: 'protected-api', resourceType: 'fetch',
      navigationRelationship: 'subresource', multiplicity: 'multiple',
    },
    {
      failureClass: 'timeout', targetClass: 'identity', resourceType: 'xhr',
      navigationRelationship: 'current-document', multiplicity: 'multiple',
    },
  ]);
  assert.equal(Object.isFrozen(rebuiltSignals), true);
  assert.equal(rebuiltSignals.every(signal => Object.isFrozen(signal)), true);
  const diagnostics = [];
  assert.throws(
    () => aggregateWindows(windows, {}, (...report) => diagnostics.push(report)),
    /request failure/i,
  );
  assert.deepEqual(diagnostics.at(-1), ['window-request-failure', 'request-failure-invalid', {
    failureClass: 'aborted', targetClass: 'protected-api', resourceType: 'fetch',
    navigationRelationship: 'subresource', multiplicity: 'multiple',
  }]);
});

test('phase 9 action-window diagnostics cannot mutate caller inputs into a passing snapshot', async t => {
  const assertClosedDiagnostics = checkpoints => {
    assert.equal(checkpoints.length > 0, true);
    assert.equal(checkpoints.every(pair => (
      Array.isArray(pair)
      && pair.length === 2
      && pair.every(value => typeof value === 'string' && /^[a-z-]+$/.test(value))
    )), true);
  };
  await t.test('window value', () => {
    const window = safeWindow({ terminalReached: false, pageErrors: 1 });
    const checkpoints = [];
    assert.throws(() => validateActionWindow(window, {}, (checkpoint, reason) => {
      checkpoints.push([checkpoint, reason]);
      window.terminalReached = true;
      window.pageErrors = 0;
    }), /terminal state/i);
    assert.deepEqual(checkpoints.at(-1), ['window-terminal', 'terminal-invalid']);
    assertClosedDiagnostics(checkpoints);
  });
  await t.test('window options', () => {
    const window = safeWindow({
      renderSignals: [{ kind: 'heading', pathname: '/family', sentinel: 'Family Overview' }],
      protectedRender: true,
    });
    const options = { requireNoProtected: true };
    const checkpoints = [];
    assert.throws(() => validateActionWindow(window, options, (checkpoint, reason) => {
      checkpoints.push([checkpoint, reason]);
      options.requireNoProtected = false;
    }), /protected render/i);
    assert.deepEqual(checkpoints.at(-1), ['window-policy', 'policy-invalid']);
    assertClosedDiagnostics(checkpoints);
  });
});

test('phase 9 action-window diagnostic reporting cannot throw or tamper with validation intrinsics', async t => {
  await t.test('reporter throw preserves the validation decision', () => {
    assert.throws(
      () => validateActionWindow(safeWindow({ terminalReached: false }), {}, () => {
        throw new Error('reporter-controlled-error');
      }),
      error => /terminal state/i.test(error?.message) && !/reporter-controlled/i.test(error?.message),
    );
    assert.equal(validateActionWindow(safeWindow(), {}, () => {
      throw new Error('reporter-controlled-error');
    }).pass, true);
  });
  await t.test('reporter prototype tampering occurs only after the decision', () => {
    const originalIncludes = Array.prototype.includes;
    const originalTest = RegExp.prototype.test;
    let thrown;
    let reports = 0;
    try {
      validateActionWindow(safeWindow({
        pageId: 'untrusted-page-id',
        visibleSentinels: ['Untrusted sentinel'],
      }), {}, () => {
        reports += 1;
        Array.prototype.includes = () => true;
        RegExp.prototype.test = () => true;
      });
    } catch (error) {
      thrown = error;
    } finally {
      Array.prototype.includes = originalIncludes;
      RegExp.prototype.test = originalTest;
    }
    assert.match(thrown?.message ?? '', /pageId|sentinel/i);
    assert.equal(reports > 0, true);
  });
});

test('phase 9 action-window graph-shape failures retain the fixed schema diagnostic', async t => {
  const hiddenWindow = safeWindow();
  Object.defineProperty(hiddenWindow, 'hidden', { value: true, enumerable: false });
  const symbolWindow = safeWindow();
  symbolWindow[Symbol('hidden')] = true;
  const accessorWindow = safeWindow();
  Object.defineProperty(accessorWindow, 'terminalReached', {
    get() { throw new Error('accessor-must-not-run'); },
    enumerable: true,
  });
  let windowProxyTraps = 0;
  const proxyWindow = new Proxy(safeWindow(), {
    ownKeys(target) { windowProxyTraps += 1; return Reflect.ownKeys(target); },
  });
  let optionsProxyTraps = 0;
  const proxyOptions = new Proxy({}, {
    ownKeys(target) { optionsProxyTraps += 1; return Reflect.ownKeys(target); },
  });
  const cases = [
    ['hidden own property', hiddenWindow, {}],
    ['symbol property', symbolWindow, {}],
    ['accessor property', accessorWindow, {}],
    ['Proxy window', proxyWindow, {}],
    ['Proxy options', safeWindow(), proxyOptions],
  ];
  for (const [name, window, options] of cases) await t.test(name, () => {
    const checkpoints = [];
    assert.throws(
      () => validateActionWindow(window, options, (checkpoint, reason) => checkpoints.push([checkpoint, reason])),
      /cloneable closed data graph/i,
    );
    assert.deepEqual(checkpoints, [['window-schema', 'schema-invalid']]);
  });
  assert.equal(windowProxyTraps, 0);
  assert.equal(optionsProxyTraps, 0);
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
    'terminalReached', 'unexpectedRequestFailureSignals', 'unexpectedRequestFailures', 'visibleSentinels',
  ]);
  assert.notEqual(result.visibleSentinels, input.visibleSentinels);
  assert.notEqual(result.renderSignals, input.renderSignals);
  assert.notEqual(result.renderSignals[0], input.renderSignals[0]);
  assert.notEqual(result.protectedRequestSignals, input.protectedRequestSignals);
  assert.notEqual(result.protectedRequestSignals[0], input.protectedRequestSignals[0]);
  assert.notEqual(result.teamSelectionSignals, input.teamSelectionSignals);
  assert.notEqual(result.relevantHttpResults, input.relevantHttpResults);
  assert.notEqual(result.unexpectedRequestFailureSignals, input.unexpectedRequestFailureSignals);
  input.visibleSentinels.push('Dashboard');
  input.renderSignals[0].sentinel = 'Dashboard';
  input.protectedRequestSignals[0].method = 'DELETE';
  input.teamSelectionSignals.push('tenant-team-b');
  input.relevantHttpResults[0].status = 500;
  input.unexpectedRequestFailureSignals.push({
    failureClass: 'other', targetClass: 'other', resourceType: 'other',
    navigationRelationship: 'unknown', multiplicity: 'single',
  });
  assert.deepEqual(result.visibleSentinels, ['Family Overview']);
  assert.deepEqual(result.renderSignals, [{ kind: 'heading', pathname: '/family', sentinel: 'Family Overview' }]);
  assert.equal(result.protectedRequestSignals[0].method, 'GET');
  assert.deepEqual(result.teamSelectionSignals, ['tenant-team-a']);
  assert.deepEqual(result.relevantHttpResults, [{ targetKind: 'staging-protected-api', status: 200 }]);
  assert.deepEqual(result.unexpectedRequestFailureSignals, []);
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

test('phase 9 production scenario exports preserve closed request failure attribution at every action window', async t => {
  const requestFailure = Object.freeze({
    failureClass: 'connection',
    targetClass: 'firestore',
    resourceType: 'xhr',
    navigationRelationship: 'prior-document',
    multiplicity: 'single',
  });
  const failureWindow = overrides => scenarioWindow({
    unexpectedRequestFailures: 1,
    unexpectedRequestFailureSignals: [{ ...requestFailure }],
    ...overrides,
  });
  const runId = 'qa-phase7-20260825T140000Z-ab12cd34ef56';
  const cases = [
    ['direct route', diagnostic => runRouteScenario({
      client: createScriptedScenarioClient([failureWindow()]),
      session: 'request-failure-route',
      context: scenarioContext({ contextId: 'request-failure-route' }),
      path: '/family',
      allowed: true,
      actions: { navigate: async () => {}, waitForExactLocation: async () => {}, diagnostic },
    })],
    ['isolation', diagnostic => runIsolationScenario({
      client: createScriptedScenarioClient([failureWindow()]),
      session: 'request-failure-isolation',
      context: scenarioContext({ contextId: 'request-failure-isolation' }),
      runId,
      actions: {
        sameOriginGet: async () => 200,
        firestoreGet: async probe => probe.expectedStatus,
        waitForSettled: async () => {},
        diagnostic,
      },
    })],
    ['logout stage', diagnostic => runLogoutScenario({
      client: createScriptedScenarioClient([
        failureWindow(),
        ...REQUIRED_LOGOUT_STAGES.slice(1).map(() => failureWindow()),
      ]),
      session: 'request-failure-logout',
      freshSession: 'request-failure-logout-fresh',
      context: scenarioContext({ contextId: 'request-failure-logout' }),
      actions: {
        ...Object.fromEntries(REQUIRED_LOGOUT_STAGES.map(name => [name, async () => {}])),
        waitForLogin: async () => {},
        freshUnauthenticated: async () => {},
        waitForFreshLogin: async () => {},
        diagnostic,
      },
    })],
    ['fresh unauthenticated', diagnostic => runFreshUnauthenticatedScenario({
      client: createScriptedScenarioClient([failureWindow()]),
      session: 'request-failure-fresh',
      context: scenarioContext({ contextId: 'request-failure-fresh' }),
      actions: { navigate: async () => {}, waitForLogin: async () => {}, diagnostic },
    })],
    ['pending-deletion stale', diagnostic => runPendingDeletionScenario({
      client: createScriptedScenarioClient([failureWindow()]),
      session: 'request-failure-pending-stale',
      context: scenarioContext({ contextId: 'request-failure-pending-stale', alias: 'qa-pending-delete' }),
      scenario: 'stale-session',
      actions: { reloadRevokedSession: async () => {}, waitForLogin: async () => {}, diagnostic },
    })],
    ['pending-deletion fresh', diagnostic => runPendingDeletionScenario({
      client: createScriptedScenarioClient([failureWindow()]),
      session: 'request-failure-pending-fresh',
      context: scenarioContext({ contextId: 'request-failure-pending-fresh', alias: 'qa-pending-delete' }),
      scenario: 'fresh-login',
      actions: {
        freshLogin: async () => {},
        waitForLogin: async () => {},
        waitForUnavailable: async () => {},
        diagnostic,
      },
    })],
    ['pending-deletion active baseline', diagnostic => runPendingDeletionScenario({
      client: createScriptedScenarioClient([failureWindow()]),
      session: 'request-failure-pending-active',
      context: scenarioContext({ contextId: 'request-failure-pending-active', alias: 'qa-pending-delete' }),
      scenario: 'active-baseline',
      actions: { navigate: async () => {}, waitForDashboard: async () => {}, diagnostic },
    })],
  ];

  for (const [name, run] of cases) await t.test(name, async () => {
    const reports = [];
    await assert.rejects(run((...report) => reports.push(report)), /request failure/i);
    assert.deepEqual(reports.at(-1), [
      'window-request-failure',
      'request-failure-invalid',
      requestFailure,
    ]);
    assert.notEqual(reports.at(-1)[2], requestFailure);
    assert.equal(JSON.stringify(reports).includes('must-not-return'), false);
  });

  await t.test('diagnostic callback failure cannot replace the scenario decision', async () => {
    await assert.rejects(runRouteScenario({
      client: createScriptedScenarioClient([failureWindow()]),
      session: 'request-failure-callback-isolation',
      context: scenarioContext({ contextId: 'request-failure-callback-isolation' }),
      path: '/family',
      allowed: true,
      actions: {
        navigate: async () => {},
        waitForExactLocation: async () => {},
        diagnostic: () => { throw new Error('reporter-controlled-error'); },
      },
    }), error => /request failure/i.test(error?.message) && !/reporter-controlled/i.test(error?.message));
  });
});

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
    'qa-league-creator': ['/dashboard', 'Competition Hub'],
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
    'qa-league-creator': ['/dashboard', 'Competition Hub'],
    'qa-school-admin': ['/club', 'School Hub'],
  };
  for (const [alias, expected] of Object.entries(settledDeniedLandings)) {
    const entry = plan.find(item => item.group === 'admission-route' && item.alias === alias);
    const deniedRoutes = entry.routeExpectations.filter(route => !route.allowed);
    assert.equal(deniedRoutes.length > 0, true);
    for (const route of deniedRoutes) assert.deepEqual([route.path, route.sentinel], expected);
  }
  const leagueCreator = plan.find(item => item.group === 'admission-route' && item.alias === 'qa-league-creator');
  assert.deepEqual(
    leagueCreator.routeExpectations.find(route => route.requestedPath === '/coaches-corner'),
    {
      requestedPath: '/coaches-corner',
      allowed: false,
      path: '/dashboard',
      sentinel: 'Competition Hub',
    },
  );

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

test('phase 9 browser scenarios accept Competition Hub as the exact League Creator dashboard landing', async () => {
  const windowAt = (path, sentinel) => scenarioWindow({
    finalPath: path,
    finalUrl: `${STAGING_ORIGIN}${path}`,
    visibleSentinels: [sentinel],
    protectedRender: false,
  });
  const windows = [
    windowAt('/dashboard', 'Competition Hub'),
    windowAt('/dashboard', 'Competition Hub'),
    windowAt('/dashboard', 'Competition Hub'),
    windowAt('/competition', 'Competition Hub'),
    windowAt('/dashboard/billing', 'Manage Your Plan'),
    windowAt('/dashboard', 'Competition Hub'),
    windowAt('/dashboard', 'Competition Hub'),
  ];
  const row = await runAdmissionScenario({
    client: createScriptedScenarioClient(windows),
    session: 'league-creator-dashboard-landing',
    context: scenarioContext({
      contextId: 'admission-route-qa-league-creator-mobile',
      alias: 'qa-league-creator',
    }),
    actions: {
      loginAndLand: async () => {},
      navigate: async () => {},
      waitForExactLocation: async () => {},
    },
  });

  assert.equal(row.result, 'PASS');
  assert.equal(row.finalUrl, `${STAGING_ORIGIN}/dashboard`);
  assert.deepEqual(row.actionSummaries.map(summary => [summary.requestedPath, summary.finalPath]), [
    ['/login', '/dashboard'],
    ['/admin', '/dashboard'],
    ['/club', '/dashboard'],
    ['/competition', '/competition'],
    ['/dashboard/billing', '/dashboard/billing'],
    ['/coaches-corner', '/dashboard'],
    ['/family', '/dashboard'],
  ]);
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

test('phase 9 admission scenario reports closed diagnostics for each landing contract boundary', async t => {
  const cases = [
    ['action window', scenarioWindow({ pageErrors: 1 }), /page errors/i,
      ['window-page-error', 'page-error-invalid']],
    ['final path', scenarioWindow({
      finalPath: '/dashboard', finalUrl: `${STAGING_ORIGIN}/dashboard`, visibleSentinels: ['Dashboard'],
    }), /exact landing path and heading/i, ['landing-expectation', 'landing-mismatch']],
    ['session', scenarioWindow({ sessionPresent: false }), /authenticated session/i,
      ['landing-session', 'session-missing']],
    ['render history', scenarioWindow({
      renderSignals: [{ kind: 'heading', pathname: '/dashboard', sentinel: 'Dashboard' }],
      protectedRender: true,
    }), /unexpected protected render/i, ['landing-render-history', 'render-history-invalid']],
  ];
  for (const [name, window, message, expectedDiagnostic] of cases) await t.test(name, async () => {
    const checkpoints = [];
    await assert.rejects(runAdmissionScenario({
      client: createScriptedScenarioClient([window]),
      session: `parent-landing-diagnostic-${name}`,
      context: scenarioContext({ contextId: `parent-landing-diagnostic-${name}`, alias: 'qa-parent-a' }),
      actions: {
        loginAndLand: async () => {}, navigate: async () => {}, waitForExactLocation: async () => {},
        diagnostic: (checkpoint, reason) => checkpoints.push([checkpoint, reason]),
      },
    }), message);
    assert.deepEqual(checkpoints.at(-1), expectedDiagnostic);
  });
});

test('phase 9 admission route diagnostic identifies the exact fixed route and contract branch', async () => {
  const family = scenarioWindow({
    finalPath: '/family', finalUrl: `${STAGING_ORIGIN}/family`, visibleSentinels: ['Family Overview'],
  });
  const wrongAdminLanding = scenarioWindow({
    finalPath: '/dashboard', finalUrl: `${STAGING_ORIGIN}/dashboard`, visibleSentinels: ['Dashboard'],
  });
  const diagnostics = [];
  await assert.rejects(runAdmissionScenario({
    client: createScriptedScenarioClient([family, wrongAdminLanding]),
    session: 'parent-route-diagnostic',
    context: scenarioContext({ contextId: 'parent-route-diagnostic', alias: 'qa-parent-a' }),
    actions: {
      loginAndLand: async () => {}, navigate: async () => {}, waitForExactLocation: async () => {},
      diagnostic: (checkpoint, reason) => diagnostics.push([checkpoint, reason]),
    },
  }), /pathname does not match/i);
  assert.deepEqual(diagnostics.at(-1), ['route-location', '/admin']);
});

test('phase 9 route validation reports every fixed contract branch without free-form detail', () => {
  const base = {
    allowed: false,
    requestedPath: '/admin',
    expectedPath: '/family',
    expectedSentinel: 'Family Overview',
  };
  const family = overrides => scenarioWindow({
    finalPath: '/family', finalUrl: `${STAGING_ORIGIN}/family`, visibleSentinels: ['Family Overview'],
    ...overrides,
  });
  const cases = [
    ['route-session', family({ sessionPresent: false })],
    ['route-location', family({ finalPath: '/dashboard', finalUrl: `${STAGING_ORIGIN}/dashboard` })],
    ['route-heading', family({ visibleSentinels: ['Dashboard'] })],
    ['route-render', family({
      protectedRender: true,
      renderSignals: [{ kind: 'heading', pathname: '/dashboard', sentinel: 'Dashboard' }],
    })],
    ['route-attribution', family({
      protectedRequests: 1,
      protectedRequestSignals: [closedResourceSignal(`${STAGING_ORIGIN}/admin`)],
    })],
  ];
  for (const [checkpoint, window] of cases) {
    const diagnostics = [];
    assert.throws(
      () => validateRouteResult({ ...base, window }, (...report) => diagnostics.push(report)),
      undefined,
      checkpoint,
    );
    assert.deepEqual(diagnostics.at(-1), [checkpoint, '/admin'], checkpoint);
  }
});

test('phase 9 route validation rejects inherited and prototype-polluted route names generically', () => {
  const window = scenarioWindow({
    finalPath: '/family', finalUrl: `${STAGING_ORIGIN}/family`, visibleSentinels: ['Family Overview'],
  });
  const assertGenericRejection = requestedPath => {
    const diagnostics = [];
    assert.throws(() => validateRouteResult({
      allowed: false,
      requestedPath,
      expectedPath: '/family',
      expectedSentinel: 'Family Overview',
      window,
    }, (...report) => diagnostics.push(report)), /configured protected route/i, requestedPath);
    assert.deepEqual(diagnostics, [['route-expectation', 'route-mismatch']], requestedPath);
  };
  for (const requestedPath of ['toString', 'constructor', '__proto__']) {
    assertGenericRejection(requestedPath);
  }
  Object.defineProperty(Object.prototype, '/prototype-polluted-route', {
    configurable: true,
    value: ROUTE_SCENARIOS['/admin'],
  });
  try {
    assertGenericRejection('/prototype-polluted-route');
  } finally {
    delete Object.prototype['/prototype-polluted-route'];
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
  const run = (windows, diagnostics = []) => runAdmissionScenario({
    client: createScriptedScenarioClient(windows),
    session: 'no-team-account-scope',
    context: scenarioContext({ contextId: 'no-team-account-scope', alias: 'qa-no-team' }),
    actions: {
      loginAndLand: async () => {},
      navigate: async () => {},
      waitForExactLocation: async () => {},
      diagnostic: (...entry) => diagnostics.push(entry),
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

  const requestDiagnostics = [];
  await assert.rejects(run(unscoped, requestDiagnostics), /No Team.*typed resource scope/i);
  assert.deepEqual(requestDiagnostics.at(-1), [
    'window-no-team-request',
    'unscoped-firestore-listen',
  ]);

  const joinAdminUnscoped = Array.from({ length: 7 }, landing);
  joinAdminUnscoped[1] = {
    ...landing(),
    protectedRequests: 1,
    protectedRequestSignals: [{
      targetKind: 'staging-join-admin-api',
      method: 'PATCH',
      resourceType: 'fetch',
      initiatingFrameUrl: `${STAGING_ORIGIN}/admin`,
      scopeEvidence: ['unscoped-resource'],
      resourceScopes: ['unscoped'],
    }],
    protectedListenerStarts: 0,
    listenerSignals: [],
  };
  const joinAdminDiagnostics = [];
  await assert.rejects(run(joinAdminUnscoped, joinAdminDiagnostics), /No Team.*typed resource scope/i);
  assert.deepEqual(joinAdminDiagnostics.at(-1), [
    'window-no-team-request',
    'unscoped-staging-join-admin-api',
  ]);

  const protectedFirestoreUnscoped = Array.from({ length: 7 }, landing);
  protectedFirestoreUnscoped[1] = {
    ...landing(),
    protectedRequests: 1,
    protectedRequestSignals: [{
      targetKind: 'firestore-protected',
      method: 'GET',
      resourceType: 'fetch',
      initiatingFrameUrl: `${STAGING_ORIGIN}/admin`,
      scopeEvidence: ['unscoped-resource'],
      resourceScopes: ['unscoped'],
    }],
    protectedListenerStarts: 0,
    listenerSignals: [],
  };
  const protectedFirestoreDiagnostics = [];
  await assert.rejects(run(protectedFirestoreUnscoped, protectedFirestoreDiagnostics), /No Team.*typed resource scope/i);
  assert.deepEqual(protectedFirestoreDiagnostics.at(-1), [
    'window-no-team-request',
    'unscoped-firestore-protected',
  ]);

  const tenantListener = Array.from({ length: 7 }, landing);
  tenantListener[3] = {
    ...landing(),
    protectedRequests: 0,
    protectedRequestSignals: [],
    protectedListenerStarts: 1,
    listenerSignals: [{
      targetKind: 'firestore-listen',
      method: 'POST',
      resourceType: 'fetch',
      initiatingFrameUrl: `${STAGING_ORIGIN}/competition`,
      scopeEvidence: ['fixture-team-b-query'],
      resourceScopes: ['tenant-team-b'],
    }],
  };
  const listenerDiagnostics = [];
  await assert.rejects(run(tenantListener, listenerDiagnostics), /No Team.*Team B tenant/i);
  assert.deepEqual(listenerDiagnostics.at(-1), [
    'window-no-team-listener',
    'team-b',
  ]);
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

  assert.deepEqual(classify(producerRaw({
    ...listen({
      database: FIRESTORE_DATABASE,
      addTarget: {
        documents: { documents: [`${FIRESTORE_DATABASE}/documents/users/${runId}-no-team`] },
        targetId: 3,
      },
    }),
    headers: {
      ...FIRESTORE_LISTEN_TRANSPORT_HEADERS,
      'sec-ch-ua': '"Not=A?Brand";v="99", "Google Chrome";v="152", "Chromium";v="152"',
    },
  })).resourceScopes, ['unscoped']);

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
  expectUnscoped({ url: listenUrl.replace('&t=1', ''), method: 'POST', body: form(addSelf) });
  expectUnscoped({ url: listenUrl.replace('&t=1', '&t=0'), method: 'POST', body: form(addSelf) });
  expectUnscoped({ url: listenUrl.replace('&t=1', '&t=4'), method: 'POST', body: form(addSelf) });
  expectUnscoped({ url: `${listenUrl}&t=1`, method: 'POST', body: form(addSelf) });
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

darwinRuntimeTest('phase 9 real recorder increments navigation generation for goto click reload and location changes', { timeout: LOCAL_REAL_CHROME_EXTENDED_TEST_TIMEOUT_MS }, async () => {
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
    assert.deepEqual(
      retained.protectedRequestSignals[0].resourceScopes,
      ['self-account'],
      JSON.stringify(retained.protectedRequestSignals[0]),
    );
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

darwinRuntimeTest('phase 9 real recorder returns raw request facts for local classification only', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
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

test('the family page honors the trusted superadmin authority admitted by the route policy', () => {
  const family = readFileSync(new URL('../src/app/(dashboard)/family/page.tsx', import.meta.url), 'utf8');
  assert.match(family, /isParent,[\s\S]*isSuperAdmin,[\s\S]*user,/);
  assert.match(family, /if \(!isParent && !isSuperAdmin\) \{/);
});

darwinRuntimeTest('phase 9 browser scenarios recorder requires an exact visible h1 instead of substring body text', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
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
    const transformedHeading = await observeAction({
      client,
      session: 'phase9-exact-heading',
      stage: 'source-heading-under-css-transform',
      terminal: async () => {},
      action: () => client.runCode('phase9-exact-heading', `async (page) => page.evaluate(() => {
        document.body.innerHTML = '<style>h1 { text-transform: uppercase; }</style><h1>Family Overview</h1>';
      })`),
    });
    assert.deepEqual(await client.runCode(
      'phase9-exact-heading',
      `async (page) => page.evaluate(() => {
        const heading = document.querySelector('h1');
        return { innerText: heading.innerText, textContent: heading.textContent };
      })`,
    ), { innerText: 'FAMILY OVERVIEW', textContent: 'Family Overview' });
    assert.deepEqual(transformedHeading.visibleSentinels, ['Family Overview']);
  } finally {
    await closeAndVerifyBrowsers(client);
  }
});

darwinRuntimeTest('phase 9 terminal diagnostics match exact source headings under CSS text transforms', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
  const diagnostics = [];
  const client = createPlaywrightCliClient({
    timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS,
    onDiagnosticCheckpoint: (checkpoint, reason) => diagnostics.push([checkpoint, reason]),
  });
  try {
    await installSignalRecorder(client, 'phase9-transformed-terminal-heading');
    await client.runCode('phase9-transformed-terminal-heading', `async (page) => page.evaluate(() => {
      document.body.innerHTML = '<style>h1 { text-transform: uppercase; }</style><h1>Family Access Required</h1>';
    })`);
    assert.deepEqual(await client.runCode(
      'phase9-transformed-terminal-heading',
      `async (page) => page.evaluate(() => {
        const heading = document.querySelector('h1');
        return { innerText: heading.innerText, textContent: heading.textContent };
      })`,
    ), { innerText: 'FAMILY ACCESS REQUIRED', textContent: 'Family Access Required' });
    await assert.rejects(
      waitForStableExactLocation(client, 'phase9-transformed-terminal-heading', 'about:blank', 'Family Overview'),
      /stable terminal location/i,
    );
    assert.deepEqual(diagnostics.at(-1), ['terminal-role', 'role-restricted']);
  } finally {
    await closeAndVerifyBrowsers(client);
  }
});

darwinRuntimeTest('phase 9 recorder synchronously refreshes the final visible sentinel snapshot', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
  const client = createPlaywrightCliClient({ timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS });
  try {
    await installSignalRecorder(client, 'phase9-synchronous-final-sentinel');
    const sentinels = await client.runCode('phase9-synchronous-final-sentinel', `async (page) => page.evaluate(() => {
      document.body.innerHTML = '<h1>Family Overview</h1>';
      return globalThis.__phase9VisibleSentinels?.() || [];
    })`);
    assert.deepEqual(sentinels, ['Family Overview']);
  } finally {
    await closeAndVerifyBrowsers(client);
  }
});

darwinRuntimeTest('phase 9 terminal location must remain exact before the final evidence sample', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
  const client = createPlaywrightCliClient({ timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS });
  try {
    await installSignalRecorder(client, 'phase9-stable-final-location');
    await client.runCode('phase9-stable-final-location', `async (page) => page.evaluate(() => {
      document.body.innerHTML = '<h1>Family Overview</h1>';
      globalThis.__phase9StableFinal = false;
      let visible = true;
      const transient = setInterval(() => {
        visible = !visible;
        document.body.innerHTML = visible ? '<h1>Family Overview</h1>' : '';
      }, 100);
      setTimeout(() => {
        clearInterval(transient);
        document.body.innerHTML = '<h1>Family Overview</h1>';
        globalThis.__phase9StableFinal = true;
      }, 15000);
      return true;
    })`);
    await waitForStableExactLocation(client, 'phase9-stable-final-location', 'about:blank', 'Family Overview');
    assert.equal(await client.runCode(
      'phase9-stable-final-location',
      'async (page) => page.evaluate(() => globalThis.__phase9StableFinal === true)',
    ), true);
  } finally {
    await closeAndVerifyBrowsers(client);
  }
});

darwinRuntimeTest('phase 9 stable terminal polling survives a hard document navigation', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
  const client = createPlaywrightCliClient({ timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS });
  try {
    await installSignalRecorder(client, 'phase9-stable-hard-navigation');
    await client.runCode('phase9-stable-hard-navigation', `async (page) => {
      await page.addInitScript(() => {
        if (window.name !== 'phase9-stable-hard-navigation') return;
        addEventListener('DOMContentLoaded', () => {
          document.body.innerHTML = '<h1>Family Overview</h1>';
          globalThis.__phase9StableAfterNavigation = true;
        }, { once: true });
      });
      return page.evaluate(() => {
        document.body.innerHTML = '<h1>Dashboard</h1>';
        window.name = 'phase9-stable-hard-navigation';
        setTimeout(() => location.reload(), 5000);
        return true;
      });
    }`);
    await waitForStableExactLocation(client, 'phase9-stable-hard-navigation', 'about:blank', 'Family Overview');
    assert.equal(await client.runCode(
      'phase9-stable-hard-navigation',
      'async (page) => page.evaluate(() => globalThis.__phase9StableAfterNavigation === true)',
    ), true);
  } finally {
    await closeAndVerifyBrowsers(client);
  }
});

test('phase 9 stable terminal timeout reports only closed route and heading boundaries', async () => {
  for (const [outcome, expected] of [
    ['location-mismatch', ['terminal-location', 'location-mismatch']],
    ['observer-mismatch', ['terminal-observer', 'observer-mismatch']],
    ['role-restricted', ['terminal-role', 'role-restricted']],
    ['loading-stalled', ['terminal-loading', 'loading-stalled']],
    ['runtime-error', ['terminal-runtime', 'runtime-error']],
    ['heading-missing', ['terminal-heading', 'heading-missing']],
    ['not-reached', ['terminal-wait', 'terminal-not-reached']],
  ]) {
    const diagnostics = [];
    const transport = createCliTransport(argv => {
      const code = argv[argv.indexOf('run-code') + 1] ?? '';
      if (code.includes('phase9:verify-about-blank')) return cliResult({ url: 'about:blank' });
      if (code.includes('phase9:install')) return cliResult({ navigationGeneration: 0 });
      if (argv.includes('run-code')) return cliResult(JSON.stringify(outcome));
      return cliResult({ ok: true });
    });
    const client = createPlaywrightCliClient({
      execute: transport.execute,
      wrapperPath: '/safe/playwright_cli.sh',
      onDiagnosticCheckpoint: (checkpoint, reason) => diagnostics.push([checkpoint, reason]),
    });
    await installSignalRecorder(client, `phase9-terminal-${outcome}`);
    await assert.rejects(
      waitForStableExactLocation(client, `phase9-terminal-${outcome}`, 'about:blank', 'Family Overview'),
      /stable terminal location/i,
    );
    assert.deepEqual(diagnostics.at(-1), expected);
  }
});

test('phase 9 stable terminal sample classification is closed and ordered', () => {
  const atExpectedPath = { locationMatches: true, sentinelVisible: false };
  for (const [sample, outcome] of [
    [{ locationMatches: false }, 'location-mismatch'],
    [{ ...atExpectedPath, direct: true }, 'observer-mismatch'],
    [{ ...atExpectedPath, restricted: true }, 'role-restricted'],
    [{ ...atExpectedPath, loading: true }, 'loading-stalled'],
    [{ ...atExpectedPath, runtime: true }, 'runtime-error'],
    [atExpectedPath, 'heading-missing'],
    [null, 'not-reached'],
  ]) assert.equal(classifyStableTerminalSample(sample), outcome);

  assert.equal(classifyStableTerminalSample({
    ...atExpectedPath,
    direct: true,
    restricted: true,
    loading: true,
    runtime: true,
  }), 'observer-mismatch');
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

darwinRuntimeTest('phase 9 browser scenarios recorder observes an exact Radix status toast without classifying it as protected', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
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

darwinRuntimeTest('phase 9 action window treats a real Dashboard h1 flash as protected activity', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
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

darwinRuntimeTest('phase 9 browser scenarios recorder types approved status history and never protects status text', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
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

darwinRuntimeTest('phase 9 action window binds session evidence to exact staging __session cookie', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async t => {
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
  const producerTempRoot = resolve(process.env.TMPDIR || tmpdir());
  let processAuditCalls = 0;
  const portableProcessMarkerPath = {
    'rogue-process': `/tmp/phase9-guardian-child-rogue-${process.pid}.json`,
    'detached-rogue-process': `/tmp/phase9-guardian-child-detached-${process.pid}.json`,
    'detached-malformed-argv-rogue': `/tmp/phase9-guardian-child-malformed-${process.pid}.json`,
  }[overrides.runnerMode];
  const portableProcessPid = () => {
    if (!portableProcessMarkerPath || !existsSync(portableProcessMarkerPath)) return null;
    try {
      const pid = JSON.parse(readFileSync(portableProcessMarkerPath, 'utf8')).pid;
      if (!Number.isSafeInteger(pid) || pid <= 1) return null;
      process.kill(pid, 0);
      return pid;
    } catch { return null; }
  };
  const portableProcessAuditor = async (_marker, { onInspectionError } = {}) => {
    processAuditCalls += 1;
    if (processAuditCalls === overrides.processAuditFailureAt) {
      onInspectionError?.();
      throw new Error('injected portable process audit failure');
    }
    const pid = portableProcessPid();
    return pid === null ? [] : [{ pid }];
  };
  const portableProcessTerminator = async (_marker, _timeoutMs, { onInspectionError } = {}) => {
    const pid = portableProcessPid();
    if (pid === null) return { cleared: true, discovered: false };
    onInspectionError?.();
    try { process.kill(pid, 'SIGKILL'); } catch (error) {
      if (error?.code !== 'ESRCH') return { cleared: false, discovered: true };
    }
    for (let attempt = 0; attempt < 100 && portableProcessPid() !== null; attempt += 1) {
      await new Promise(resolvePromise => setTimeout(resolvePromise, 10));
    }
    return { cleared: portableProcessPid() === null, discovered: true };
  };
  const definition = buildFixtureDefinition({ runId, expiresAt: '2026-09-02T12:00:00Z', manifestVersion: 3 });
  const authUids = definition.identities.map(identity => identity.uid);
  const firestorePaths = definition.documents.map(document => document.path);
  const expectedAbsentFirestorePaths = definition.expectedAbsentDocuments.map(document => document.path);
  const events = [];
  const terminalCheckpoints = [];
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
        uid: process.getuid(), dev: 1, ino: 1, nlink: 2, size: 0, mtimeMs: 0, ctimeMs: 0,
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
        dev: 1, ino: 2, nlink: 2, size: 0, mtimeMs: 0, ctimeMs: 0,
      };
      if (files.has(path)) return {
        isDirectory: () => path === manifestPath && overrides.manifestLstatType === 'directory',
        isFile: () => !(path === manifestPath && new Set(['directory', 'symlink']).has(overrides.manifestLstatType)),
        isSymbolicLink: () => path === manifestPath && overrides.manifestLstatType === 'symlink',
        mode: path === credentialPath ? (overrides.credentialMode ?? 0o100600) : (overrides.manifestMode ?? 0o100600),
      };
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    },
    async open(path) {
      return {
        stat: () => filesystem.lstat(path),
        close: async () => {},
      };
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
    async removePlaywrightTree() {
      events.push('fs:remove-profile-root');
      if (realFilesystemProfile) rmSync(profileRootPath, { recursive: true, force: false });
      profileRootExists = false;
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
  const terminalCertificateWriter = async value => {
    events.push(`certificate:${value?.phase ?? 'invalid'}`);
    terminalCheckpoints.push(structuredClone(value));
    if (value?.phase === overrides.terminalCertificateFailureAt) {
      throw new Error('injected terminal certificate failure');
    }
  };
  const runnerCommand = overrides.runnerCommand ?? guardianChildCommand(overrides.runnerMode ?? 'success');
  return {
    dependencies: {
      fixtureCommand, browserClient: overrides.browserClient ?? browserClient,
      adapterFactory: overrides.adapterFactory ?? adapterFactory,
      filesystem, processHooks, preconditionVerifier, runnerCommand, terminalCertificateWriter,
      producerTempRoot,
      ...((PHASE9_TEST_PLATFORM !== 'darwin' || overrides.forcePortableProcessAudit) ? {
        processAuditor: portableProcessAuditor,
        processTerminator: portableProcessTerminator,
      } : {}),
      scenarioJoinTimeoutMs: overrides.scenarioJoinTimeoutMs ?? 50,
      beforeTransitionDeadlineMs: overrides.beforeTransitionDeadlineMs,
      afterTransitionDeadlineMs: overrides.afterTransitionDeadlineMs,
    },
    options: {
      projectId: 'the-squad-v2-staging', origin: STAGING_ORIGIN,
      expiresAt: '2026-09-02T12:00:00Z',
      deployedSha, stagingRunId, pullRequestNumber,
    },
    events, handlers, files, browserSessions, workspace, manifestPath, credentialPath, terminalCheckpoints,
    get workspaceExists() { return workspaceExists; },
    get probeAuthChecks() { return probeAuthChecks; },
    get probeFirestoreChecks() { return probeFirestoreChecks; },
    get processAuditCalls() { return processAuditCalls; },
    get portableDescendantPids() {
      const pid = portableProcessPid();
      return pid === null ? [] : [pid];
    },
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
  assert.deepEqual(fixture.events.filter(event => event.startsWith('certificate:') && event !== 'certificate:progress'), [
    'certificate:closure-pending',
  ]);
  assert.equal(fixture.events.indexOf('certificate:closure-pending') < fixture.events.indexOf('fs:remove-credential'), true);
});

test('phase 9 guardian preserves exact recovery state when the pre-removal certificate checkpoint fails', async () => {
  const fixture = lifecycleGuardianFixture({ terminalCertificateFailureAt: 'closure-pending' });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.category, 'terminal-certificate-failed');
  assert.equal(result.closureCertified, true);
  assert.equal(result.workspacePreservation, 'verified-present');
  assert.equal(result.manifestPreservation, 'verified-present');
  assert.equal(fixture.workspaceExists, true);
  assert.equal(fixture.files.has(fixture.credentialPath), true);
  assert.equal(fixture.events.includes('fs:remove-credential'), false);
  assert.equal(fixture.events.includes('fs:remove-workspace'), false);
});

test('phase 9 guardian retains the primary lifecycle failure when terminal checkpoint handling also fails', async () => {
  const fixture = lifecycleGuardianFixture({
    runnerMode: 'fail-before',
    terminalCertificateFailureAt: 'closure-pending',
  });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.category, 'terminal-certificate-failed');
  assert.equal(result.primaryCategory, 'scenario-failed');
  assert.equal(result.primaryStage, 'inspected');
  assert.deepEqual(result.history, [
    'uninitialized', 'guarded', 'preflighted', 'seeded', 'inspected',
  ]);
  assert.equal(result.closureCertified, true);
  assert.equal(fixture.workspaceExists, true);
  assert.equal(fixture.files.has(fixture.credentialPath), true);
});

test('phase 9 guardian writes no second checkpoint after terminal removal', async () => {
  const fixture = lifecycleGuardianFixture();
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.closureCertified, true);
  assert.equal(fixture.workspaceExists, false);
  assert.deepEqual(
    fixture.terminalCheckpoints.map(value => value.phase).filter(phase => phase !== 'progress'),
    ['closure-pending'],
  );
});

test('phase 9 portable guardian audit seam finishes bounded without a descendant', { timeout: 5_000 }, async () => {
  const fixture = lifecycleGuardianFixture({ forcePortableProcessAudit: true });
  assert.equal(typeof fixture.dependencies.processAuditor, 'function');
  assert.equal(typeof fixture.dependencies.processTerminator, 'function');
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(fixture.processAuditCalls > 0, true);
  assert.deepEqual(fixture.portableDescendantPids, []);
});

test('phase 9 non-Darwin portable guardian suite exits bounded with zero descendants', { timeout: 70_000 }, () => {
  const processInventory = () => spawnSync('/bin/ps', ['-axo', 'command='], {
    encoding: 'utf8', timeout: 10_000,
  }).stdout.split('\n').filter(line => (
    line.includes('phase9-lifecycle-child.mjs')
    || line.includes('phase9-rogue-')
    || line.includes('phase9-detached-rogue-')
  )).sort();
  const before = processInventory();
  const childEnvironment = {
    ...process.env, PHASE9_TEST_PLATFORM: 'linux', PHASE9_PORTABILITY_CHILD: '1',
  };
  delete childEnvironment.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, [
    '--test',
    '--test-name-pattern=phase 9 lifecycle guardian|phase 9 portable guardian audit seam',
    fileURLToPath(import.meta.url),
  ], {
    cwd: dirname(testDirectory),
    encoding: 'utf8',
    env: childEnvironment,
    timeout: 60_000,
  });
  assert.equal(child.error?.code, undefined, child.error?.message);
  assert.equal(child.signal, null, child.stderr || child.stdout);
  assert.equal(child.status, 0, child.stderr || child.stdout);
  assert.match(child.stdout, /tests 124[\s\S]*pass 124[\s\S]*fail 0/);
  assert.deepEqual(processInventory(), before);
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
  const fixture = lifecycleGuardianFixture({
    forcePortableProcessAudit: true,
    processAuditFailureAt: 2,
  });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.category, 'scenario-closure-failed');
  assert.equal(result.browserClosureCertified, false);
  assert.equal(result.closureCertified, false);
  assert.equal(result.workspacePreservation, 'verified-present');
  assert.equal(result.manifestPreservation, 'verified-present');
  assert.equal(fixture.workspaceExists, true);
  assert.ok(fixture.processAuditCalls >= 3, `expected clean recovery scan after call 2, saw ${fixture.processAuditCalls}`);
  assert.equal(fixture.events.includes('fs:remove-workspace'), false);
});

const realGuardianSession = 'p9-pending-deletion-active-baseline-mobile';
const realGuardianTwoSessions = Object.freeze([
  'p9-pending-deletion-active-baseline-mobile',
  'p9-pending-deletion-active-baseline-desktop',
]);
const realGuardianCrashSession = 'p9-admission-route-qa-parent-a-mobile';
const REAL_GUARDIAN_JOIN_TIMEOUT_MS = 60_000;
const realGuardianInfoPath = phase => `/tmp/phase9-guardian-real-retained-${process.pid}-${phase}.json`;
const realGuardianProfileRoot = '/tmp/phase9-core-identities.test/playwright-tmp';
const realGuardianCommandOptions = temporaryDirectory => temporaryDirectory === undefined
  ? { timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS }
  : {
    timeoutMs: LOCAL_REAL_CHROME_COMMAND_TIMEOUT_MS,
    sourceEnvironment: { ...process.env, TMPDIR: temporaryDirectory },
    temporaryDirectory,
  };
const executeRealGuardianCommand = async (args, temporaryDirectory) => {
  if (temporaryDirectory === undefined) {
    return executeCapturedPlaywrightTransportCommand(args, realGuardianCommandOptions());
  }
  const descriptor = openSync(
    temporaryDirectory,
    fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
  );
  try {
    return await executeCapturedPlaywrightTransportCommand(args, {
      ...realGuardianCommandOptions(temporaryDirectory), profileDirectoryDescriptor: descriptor,
    });
  } finally {
    closeSync(descriptor);
  }
};
const realGuardianBrowserClient = Object.freeze({
  closeBrowser: (session, { temporaryDirectory } = {}) => executeRealGuardianCommand(
    [`-s=${session}`, 'close'], temporaryDirectory,
  ),
  listBrowsers: ({ temporaryDirectory } = {}) => executeRealGuardianCommand(
    ['list'], temporaryDirectory,
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

darwinRuntimeTest('phase 9 Darwin inspector preserves raw argv boundaries and precise marked process birth identity', { timeout: 30_000 }, async () => {
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

darwinRuntimeTest('phase 9 Darwin inspector preserves empty argv elements in explicit and all-PID scans without marker leakage', { timeout: 30_000 }, async () => {
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

darwinRuntimeTest('phase 9 Darwin inspector treats a real empty argv0 as a marked rogue without shifting environment into argv', { timeout: 30_000 }, async () => {
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

darwinRuntimeTest('phase 9 Darwin termination keeps a cleared-false result sticky after a clean retry', { timeout: 30_000 }, async () => {
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

darwinRuntimeTest('phase 9 Darwin inspector keeps marker representation injective and fails closed on unsafe executable paths', { timeout: 30_000 }, async () => {
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

darwinRuntimeTest('phase 9 executable hashing rejects a delayed final read within the configured deadline', { timeout: 10_000 }, async () => {
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
  const absoluteProfileOptions = Object.freeze({
    marker, policy, profileRoot, profileMode: 'absolute',
  });
  assert.equal(chromeProcessCommandIsExact(mainRecord, absoluteProfileOptions), true);
  const relativeProfilePath = 'playwright_chromiumdev_profile-a1B2_c3';
  const relativeMainRecord = Object.freeze({
    ...mainRecord,
    argv: mainRecord.argv.map(argument => argument === `--user-data-dir=${profilePath}`
      ? `--user-data-dir=${relativeProfilePath}` : argument),
  });
  assert.equal(chromeProcessCommandIsExact(
    relativeMainRecord, { marker, policy, profileRoot, profileMode: 'descriptor-relative' },
  ), true, 'a descriptor-rooted launch must accept only the exact relative profile basename');
  assert.equal(chromeProcessCommandIsExact(
    mainRecord, { marker, policy, profileRoot, profileMode: 'descriptor-relative' },
  ), false, 'descriptor mode must reject the former absolute profile spelling');
  assert.equal(chromeProcessCommandIsExact(relativeMainRecord, absoluteProfileOptions), false,
    'absolute compatibility mode must reject a relative profile spelling');
  assert.equal(chromeProcessCommandIsExact({
    ...relativeMainRecord,
    argv: relativeMainRecord.argv.map(argument => argument.startsWith('--user-data-dir=')
      ? '--user-data-dir=../playwright_chromiumdev_profile-a1B2_c3' : argument),
  }, { marker, policy, profileRoot, profileMode: 'descriptor-relative' }), false);
  assert.equal(chromeProcessCommandIsExact({
    ...mainRecord, argv: [...mainRecord.argv, '--headless'],
  }, absoluteProfileOptions), false);
  assert.equal(chromeProcessCommandIsExact({
    ...mainRecord,
    argv: mainRecord.argv.map(argument => argument.startsWith('--disable-features=')
      ? '--disable-features=TotallyUnreviewed' : argument),
  }, absoluteProfileOptions), false);
  assert.equal(chromeProcessCommandIsExact({
    ...mainRecord, argv: [...mainRecord.argv, 'about:blank'],
  }, absoluteProfileOptions), false);
  assert.equal(chromeProcessCommandIsExact({
    ...mainRecord, argv: [...mainRecord.argv, '--guardian-marker-present'],
  }, absoluteProfileOptions), false);

  const rendererExecutable = `${appPath}/Contents/Frameworks/Google Chrome Framework.framework/Versions/152.0.7977.65/Helpers/Google Chrome Helper (Renderer).app/Contents/MacOS/Google Chrome Helper (Renderer)`;
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
    rendererRecord, { policy, profilePath, profileRoot, profileMode: 'absolute' },
  ), true);
  assert.equal(chromeProcessCommandIsExact({
    ...rendererRecord, argv: [...rendererRecord.argv, '--totally-unreviewed'],
  }, { policy, profilePath, profileRoot, profileMode: 'absolute' }), false);
});

darwinRuntimeTest('phase 9 guardian retains only an exact real browser marker across both lifecycle phases', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
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
        [...realGuardianTwoSessions].sort(),
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
    assert.deepEqual(afterInfo.releasedBrowserSessions, canonicalAfterRelease);
    assert.deepEqual((await realGuardianBrowserClient.listBrowsers()).browsers, []);
    assert.deepEqual(markedProcessLines(beforeInfo.marker), []);
    assert.deepEqual(markedProcessLines(afterInfo.marker), []);
  } finally {
    await cleanupRealGuardianIntegration();
  }
});

darwinRuntimeTest('phase 9 guardian owns a real browser before an acquisition-audit crash can strand it', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
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

darwinRuntimeTest('phase 9 guardian closes its real browser before killing an extra marked rogue process', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
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

darwinRuntimeTest('phase 9 guardian rejects a declared real retained browser missing from inventory', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
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

darwinRuntimeTest('phase 9 guardian binds two real retained sessions to distinct immutable launch receipts', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
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
        [...realGuardianTwoSessions].sort(),
      );
      assert.deepEqual(
        info.launchReceipts.map(receipt => receipt.session).sort(), [...realGuardianTwoSessions].sort(),
      );
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

darwinRuntimeTest('phase 9 guardian rejects two declared sessions when the second Chrome main is missing', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
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

darwinRuntimeTest('phase 9 guardian rejects an extra marked direct Chrome main outside its two receipts', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
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

darwinRuntimeTest('phase 9 guardian rejects a marked daemon command look-alike with the wrong executable', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
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

test('phase 9 protocol-v4 failure terminal validates every closed stage against exact ownership', async () => {
  const { canonicalBrowserSessionsForRow, validateRunnerFailureTerminal } = await import(
    '../scripts/qa-evidence/phase9/lifecycle-guardian.mjs'
  );
  assert.equal(typeof validateRunnerFailureTerminal, 'function');
  const session = 'p9-admission-route-qa-parent-a-mobile';
  const receipt = { session, daemonPid: 910001, chromeMainPid: 910002 };
  const accepted = {
    phase: 'before-transition',
    ownershipSequence: 1,
    pendingOwnershipIntent: null,
    activeAnnouncedSessions: new Set([session]),
    attachedSessions: new Set(),
    activeAnnouncedReceipts: new Map([[session, receipt]]),
    releasedSessions: new Set(),
    ownershipComplete: false,
    terminal: null,
    currentContext: { contextOrdinal: 0, contextId: 'admission-route-qa-parent-a-mobile' },
  };
  const diagnosticsByStage = {
    authorization: [
      ['runner-initialization', 'runner-invalid'],
      ['context-start', 'context-invalid'],
      ['ownership-authorization', 'authorization-failed'],
    ],
    acquisition: [['browser-acquisition', 'acquisition-failed']],
    receipt: [['launch-receipt', 'receipt-invalid']],
    recorder: [['recorder-arm', 'recorder-failed']],
    viewport: [['viewport-verify', 'viewport-mismatch']],
    login: [['login-submit', 'login-failed']],
    'scenario-action': [
      ['observation-arm', 'observation-failed'],
      ['scenario-action', 'action-failed'],
      ['terminal-wait', 'terminal-not-reached'],
      ['terminal-location', 'location-mismatch'],
      ['terminal-observer', 'observer-mismatch'],
      ['terminal-role', 'role-restricted'],
      ['terminal-loading', 'loading-stalled'],
      ['terminal-runtime', 'runtime-error'],
      ['terminal-heading', 'heading-missing'],
      ['observation-sample', 'observation-failed'],
      ['window-validation', 'expectation-mismatch'],
      ['window-sample-contract', 'sample-contract-invalid'],
      ['window-observation-contract', 'observation-contract-invalid'],
      ['window-visible-contract', 'visible-contract-invalid'],
      ['window-resource-contract', 'resource-contract-invalid'],
      ['window-render-contract', 'render-contract-invalid'],
      ['window-output-contract', 'output-contract-invalid'],
      ['window-schema', 'schema-invalid'],
      ['window-location', 'location-invalid'],
      ['window-terminal', 'terminal-invalid'],
      ['window-loading', 'loading-invalid'],
      ['window-page-error', 'page-error-invalid'],
      ['window-console-error', 'console-error-invalid'],
      ['window-request-failure', 'request-failure-invalid'],
      ['window-overflow', 'overflow-invalid'],
      ['window-render-coherence', 'render-coherence-invalid'],
      ['window-resource', 'resource-invalid'],
      ['window-policy', 'policy-invalid'],
      ...NO_TEAM_POLICY_DIAGNOSTICS,
      ['landing-expectation', 'landing-mismatch'],
      ['landing-heading', 'heading-mismatch'],
      ['landing-session', 'session-missing'],
      ['landing-render-history', 'render-history-invalid'],
      ['route-expectation', 'route-mismatch'],
      ['route-session', '/admin'],
      ['route-location', '/club'],
      ['route-heading', '/competition'],
      ['route-render', '/dashboard/billing'],
      ['route-attribution', '/coaches-corner'],
      ['row-validation', 'row-invalid'],
    ],
    'row-emission': [
      ['row-emission', 'row-invalid'],
      ['private-finalization', 'finalization-failed'],
    ],
    release: [['ownership-release', 'release-failed']],
  };
  for (const [stage, category] of [
    ['authorization', 'scenario-runner-invalid'],
    ['acquisition', 'scenario-runner-invalid'],
    ['receipt', 'scenario-runner-invalid'],
    ['recorder', 'scenario-runner-invalid'],
    ['viewport', 'scenario-runner-invalid'],
    ['login', 'scenario-failed'],
    ['scenario-action', 'scenario-failed'],
    ['row-emission', 'scenario-runner-invalid'],
    ['release', 'scenario-runner-invalid'],
  ]) {
    const stageAccepted = stage === 'acquisition' ? {
      ...accepted,
      pendingOwnershipIntent: { sequence: 1, session },
      activeAnnouncedSessions: new Set(),
      activeAnnouncedReceipts: new Map(),
    } : stage === 'row-emission' ? { ...accepted, ownershipComplete: true } : accepted;
    for (const [checkpoint, reason] of diagnosticsByStage[stage]) {
      const diagnosticAccepted = checkpoint === 'runner-initialization'
        ? { ...stageAccepted, currentContext: null }
        : stageAccepted;
      const noTeamDiagnostic = Object.hasOwn(
        Object.fromEntries(NO_TEAM_POLICY_DIAGNOSTICS), checkpoint,
      );
      const noTeamSession = 'p9-admission-route-qa-no-team-mobile';
      const noTeamReceipt = { session: noTeamSession, daemonPid: 910003, chromeMainPid: 910004 };
      const acceptedForDiagnostic = noTeamDiagnostic ? {
        ...diagnosticAccepted,
        currentContext: { contextOrdinal: 8, contextId: 'admission-route-qa-no-team-mobile' },
        activeAnnouncedSessions: new Set([noTeamSession]),
        activeAnnouncedReceipts: new Map([[noTeamSession, noTeamReceipt]]),
      } : diagnosticAccepted;
      const terminal = validateRunnerFailureTerminal({
        version: 4, type: 'failure', phase: 'before-transition', sequence: 1,
        category, stage,
        contextOrdinal: noTeamDiagnostic ? 8 : 0,
        contextId: noTeamDiagnostic
          ? 'admission-route-qa-no-team-mobile'
          : 'admission-route-qa-parent-a-mobile',
        checkpoint, reason,
        pendingBrowserSession: acceptedForDiagnostic.pendingOwnershipIntent?.session ?? null,
        browserSessions: [...acceptedForDiagnostic.activeAnnouncedSessions], attachedBrowserSessions: [],
        launchReceipts: [...acceptedForDiagnostic.activeAnnouncedReceipts.values()], releasedBrowserSessions: [],
      }, acceptedForDiagnostic);
      assert.deepEqual({ ok: terminal.ok, category: terminal.category, stage: terminal.stage }, {
        ok: false, category, stage,
      }, checkpoint);
      assert.equal(Object.hasOwn(terminal.diagnostic, 'requestFailure'), false, checkpoint);
    }
  }
  assert.throws(() => validateRunnerFailureTerminal({
    version: 4, type: 'failure', phase: 'before-transition', sequence: 1,
    category: 'scenario-failed', stage: 'scenario-action',
    contextOrdinal: 0, contextId: 'admission-route-qa-parent-a-mobile',
    checkpoint: 'route-location', reason: '/login', pendingBrowserSession: null,
    browserSessions: [session], attachedBrowserSessions: [], launchReceipts: [receipt],
    releasedBrowserSessions: [],
  }, accepted), /scenario-runner-invalid/);
  let admittedRouteContexts = 0;
  let rejectedNonRouteContexts = 0;
  for (const phase of ['before-transition', 'after-transition']) {
    const phaseRows = buildCanonicalScenarioPlan().filter(row => (
      phase === 'before-transition' ? row.startState !== 'pending_deletion' : row.startState === 'pending_deletion'
    ));
    for (const [contextOrdinal, row] of phaseRows.entries()) {
      const rowSessions = canonicalBrowserSessionsForRow(row);
      const rowReceipts = rowSessions.map((rowSession, sessionIndex) => Object.freeze({
        session: rowSession,
        daemonPid: 930000 + (phase === 'before-transition' ? 0 : 1000) + contextOrdinal * 10 + sessionIndex * 2,
        chromeMainPid: 930001 + (phase === 'before-transition' ? 0 : 1000) + contextOrdinal * 10 + sessionIndex * 2,
      }));
      const rowAccepted = {
        ...accepted,
        phase,
        activeAnnouncedSessions: new Set(rowSessions),
        activeAnnouncedReceipts: new Map(rowReceipts.map(rowReceipt => [rowReceipt.session, rowReceipt])),
        currentContext: { contextOrdinal, contextId: row.contextId },
      };
      const rowFailure = {
        version: 4, type: 'failure', phase, sequence: 1,
        category: 'scenario-failed', stage: 'scenario-action',
        contextOrdinal, contextId: row.contextId,
        checkpoint: 'scenario-action', reason: 'action-failed', pendingBrowserSession: null,
        browserSessions: rowSessions, attachedBrowserSessions: [], launchReceipts: rowReceipts,
        releasedBrowserSessions: [],
      };
      assert.doesNotThrow(
        () => validateRunnerFailureTerminal(rowFailure, rowAccepted),
        `${phase}:${row.contextId}:baseline`,
      );
      const routeFailure = { ...rowFailure, checkpoint: 'route-location', reason: '/admin' };
      if (row.group === 'admission-route') {
        assert.doesNotThrow(
          () => validateRunnerFailureTerminal(routeFailure, rowAccepted),
          `${phase}:${row.contextId}:route`,
        );
        admittedRouteContexts += 1;
      } else {
        assert.throws(
          () => validateRunnerFailureTerminal(routeFailure, rowAccepted),
          /scenario-runner-invalid/,
          `${phase}:${row.contextId}:route`,
        );
        rejectedNonRouteContexts += 1;
      }
    }
  }
  assert.equal(admittedRouteContexts, 18);
  assert.equal(rejectedNonRouteContexts, 26);
});

test('phase 9 request failure protocol preserves one closed summary and rejects diagnostic forgery', async t => {
  const { validateRunnerFailureTerminal } = await import(
    '../scripts/qa-evidence/phase9/lifecycle-guardian.mjs'
  );
  const session = 'p9-admission-route-qa-parent-a-mobile';
  const receipt = { session, daemonPid: 915001, chromeMainPid: 915002 };
  const accepted = {
    phase: 'before-transition', ownershipSequence: 1, pendingOwnershipIntent: null,
    activeAnnouncedSessions: new Set([session]), attachedSessions: new Set(),
    activeAnnouncedReceipts: new Map([[session, receipt]]), releasedSessions: new Set(),
    ownershipComplete: false, terminal: null,
    currentContext: { contextOrdinal: 0, contextId: 'admission-route-qa-parent-a-mobile' },
  };
  const valid = {
    version: 4, type: 'failure', phase: 'before-transition', sequence: 1,
    category: 'scenario-failed', stage: 'scenario-action', pendingBrowserSession: null,
    contextOrdinal: 0, contextId: 'admission-route-qa-parent-a-mobile',
    checkpoint: 'window-request-failure', reason: 'request-failure-invalid',
    requestFailure: { ...canonicalRequestFailureSummary },
    browserSessions: [session], attachedBrowserSessions: [], launchReceipts: [receipt],
    releasedBrowserSessions: [],
  };
  const terminal = validateRunnerFailureTerminal(valid, accepted);
  assert.deepEqual(terminal.diagnostic, {
    contextOrdinal: 0,
    contextId: 'admission-route-qa-parent-a-mobile',
    checkpoint: 'window-request-failure',
    reason: 'request-failure-invalid',
    requestFailure: canonicalRequestFailureSummary,
  });
  assert.equal(Object.isFrozen(terminal.diagnostic.requestFailure), true);
  assert.notEqual(terminal.diagnostic.requestFailure, valid.requestFailure);

  const fixedOnly = structuredClone(valid);
  delete fixedOnly.requestFailure;
  const malformedPreSummary = validateRunnerFailureTerminal(fixedOnly, accepted);
  assert.equal(Object.hasOwn(malformedPreSummary.diagnostic, 'requestFailure'), false);

  const malformedSummaries = [
    ['missing detail', (() => {
      const requestFailure = { ...valid.requestFailure };
      delete requestFailure.multiplicity;
      return requestFailure;
    })()],
    ['extra key', { ...valid.requestFailure, rawUrl: 'https://secret.invalid/?token=must-not-return' }],
    ['failure class', { ...valid.requestFailure, failureClass: 'net::ERR_CONNECTION_REFUSED' }],
    ['target class', { ...valid.requestFailure, targetClass: 'https://secret.invalid/raw-target' }],
    ['resource type', { ...valid.requestFailure, resourceType: 'document' }],
    ['navigation relationship', { ...valid.requestFailure, navigationRelationship: 'browser-session-label' }],
    ['multiplicity', { ...valid.requestFailure, multiplicity: 'many' }],
    ['raw error', { ...valid.requestFailure, rawError: 'net::ERR_FAILED secret=must-not-return' }],
    ['fixture string', { ...valid.requestFailure, fixture: 'qa-phase7-20260829T123456Z-abcdefghijkl' }],
    ['session string', { ...valid.requestFailure, session: 'p9-secret-session' }],
    ['array', Object.values(valid.requestFailure)],
    ['foreign prototype', Object.assign(Object.create({ inherited: true }), valid.requestFailure)],
    ['symbol key', Object.assign({ ...valid.requestFailure }, { [Symbol('raw')]: 'must-not-return' })],
    ['cycle', (() => { const value = { ...valid.requestFailure }; value.self = value; return value; })()],
    ['accessor', (() => {
      const value = { ...valid.requestFailure };
      Object.defineProperty(value, 'failureClass', { enumerable: true, get: () => 'connection' });
      return value;
    })()],
    ['proxy', new Proxy({ ...valid.requestFailure }, {})],
  ];
  for (const [name, requestFailure] of malformedSummaries) await t.test(name, () => {
    assert.throws(
      () => validateRunnerFailureTerminal({ ...valid, requestFailure }, accepted),
      /scenario-runner-invalid/,
    );
  });
  assert.throws(() => validateRunnerFailureTerminal({
    ...valid,
    checkpoint: 'scenario-action',
    reason: 'action-failed',
  }, accepted), /scenario-runner-invalid/);
});

test('phase 9 request failure protocol reaches guardian certificate only after clean child closure', async t => {
  const runMode = async (mode, assertion) => {
    const configPath = join(
      testDirectory, 'fixtures', `.phase9-lifecycle-child-${mode}-${process.pid}.json`,
    );
    writeFileSync(configPath, `${JSON.stringify({ mode })}\n`, { mode: 0o600, flag: 'wx' });
    try {
      const runnerCommand = Object.freeze({
        entrypoint: guardianChildEntrypoint,
        entrypointSha256: sha256File(guardianChildEntrypoint),
        configFiles: Object.freeze([Object.freeze({
          path: configPath,
          sha256: sha256File(configPath),
        })]),
      });
      const fixture = lifecycleGuardianFixture({ runnerCommand });
      const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
      await assertion({ fixture, result });
    } finally {
      rmSync(configPath, { force: true });
    }
  };

  await t.test('clean close preserves child summary into the closure checkpoint', () => runMode(
    'request-failure-terminal',
    ({ fixture, result }) => {
      assert.equal(result.ok, false);
      assert.equal(result.primaryCategory, 'scenario-failed');
      assert.equal(result.primaryStage, 'scenario-action');
      assert.deepEqual(result.diagnostic.requestFailure, canonicalRequestFailureSummary);
      const checkpoint = fixture.terminalCheckpoints.find(value => value.phase === 'closure-pending');
      assert.deepEqual(checkpoint.diagnostic.requestFailure, canonicalRequestFailureSummary);
      assert.equal(JSON.stringify(checkpoint).includes('must-not-return'), false);
    },
  ));
  await t.test('trailing output invalidates the untrusted child summary', () => runMode(
    'request-failure-terminal-trailing',
    ({ result }) => {
      assert.equal(result.ok, false);
      assert.equal(result.primaryCategory, 'scenario-runner-invalid');
      assert.equal(Object.hasOwn(result, 'diagnostic'), false);
    },
  ));
});

test('phase 9 protocol-v4 failure terminal rejects forged, malformed, stale, and sensitive payloads', async t => {
  const { validateRunnerFailureTerminal } = await import(
    '../scripts/qa-evidence/phase9/lifecycle-guardian.mjs'
  );
  assert.equal(typeof validateRunnerFailureTerminal, 'function');
  const session = 'p9-admission-route-qa-parent-a-mobile';
  const receipt = { session, daemonPid: 920001, chromeMainPid: 920002 };
  const accepted = {
    phase: 'before-transition', ownershipSequence: 1, pendingOwnershipIntent: null,
    activeAnnouncedSessions: new Set([session]), attachedSessions: new Set(),
    activeAnnouncedReceipts: new Map([[session, receipt]]), releasedSessions: new Set(),
    ownershipComplete: false, terminal: null,
    currentContext: { contextOrdinal: 0, contextId: 'admission-route-qa-parent-a-mobile' },
  };
  const valid = {
    version: 4, type: 'failure', phase: 'before-transition', sequence: 1,
    category: 'scenario-failed', stage: 'login', pendingBrowserSession: null,
    contextOrdinal: 0, contextId: 'admission-route-qa-parent-a-mobile',
    checkpoint: 'login-submit', reason: 'login-failed',
    browserSessions: [session], attachedBrowserSessions: [], launchReceipts: [receipt],
    releasedBrowserSessions: [],
  };
  const cases = [
    ['extra key', { ...valid, rawError: 'secret-token-and-url' }, accepted],
    ['category', { ...valid, category: 'operation-failed' }, accepted],
    ['stage', { ...valid, stage: 'https://secret.invalid/path' }, accepted],
    ['context ordinal', { ...valid, contextOrdinal: 1 }, accepted],
    ['context id', { ...valid, contextId: 'isolation-qa-parent-a-mobile' }, accepted],
    ['future canonical context pair', {
      ...valid,
      category: 'scenario-runner-invalid', stage: 'authorization',
      contextOrdinal: 1, contextId: 'admission-route-qa-adult-player-a-mobile',
      checkpoint: 'context-start', reason: 'context-invalid',
    }, accepted],
    ['checkpoint', { ...valid, checkpoint: 'raw-checkpoint' }, accepted],
    ['retired coarse window checkpoint', {
      ...valid, stage: 'scenario-action', checkpoint: 'landing-window-contract', reason: 'window-contract-invalid',
    }, accepted],
    ['reason', { ...valid, reason: 'raw-secret-reason' }, accepted],
    ['checkpoint reason mismatch', { ...valid, reason: 'action-failed' }, accepted],
    ['checkpoint stage mismatch', {
      ...valid, checkpoint: 'scenario-action', reason: 'action-failed',
    }, accepted],
    ['phase', { ...valid, phase: 'after-transition' }, accepted],
    ['sequence', { ...valid, sequence: 2 }, accepted],
    ['pending', { ...valid, pendingBrowserSession: session }, accepted],
    ['missing session', { ...valid, browserSessions: [] }, accepted],
    ['duplicate session', { ...valid, browserSessions: [session, session] }, accepted],
    ['forged receipt', { ...valid, launchReceipts: [{ ...receipt, chromeMainPid: 920003 }] }, accepted],
    ['stale release', { ...valid, releasedBrowserSessions: [session] }, accepted],
    ['stale canonical context pair', {
      ...valid,
      browserSessions: ['p9-admission-route-qa-adult-player-a-mobile'],
      launchReceipts: [{
        session: 'p9-admission-route-qa-adult-player-a-mobile',
        daemonPid: 920003,
        chromeMainPid: 920004,
      }],
      releasedBrowserSessions: [session],
    }, {
      ...accepted,
      activeAnnouncedSessions: new Set(['p9-admission-route-qa-adult-player-a-mobile']),
      activeAnnouncedReceipts: new Map([['p9-admission-route-qa-adult-player-a-mobile', {
        session: 'p9-admission-route-qa-adult-player-a-mobile',
        daemonPid: 920003,
        chromeMainPid: 920004,
      }]]),
      releasedSessions: new Set([session]),
      currentContext: { contextOrdinal: 1, contextId: 'admission-route-qa-adult-player-a-mobile' },
    }],
    ['acquisition without reservation', {
      ...valid, category: 'scenario-runner-invalid', stage: 'acquisition',
    }, accepted],
    ['post-acquisition stage with reservation', {
      ...valid, pendingBrowserSession: 'phase9-pending-failure',
    }, {
      ...accepted,
      pendingOwnershipIntent: { sequence: 1, session: 'phase9-pending-failure' },
    }],
    ...['recorder', 'viewport', 'login', 'scenario-action', 'release'].map(stage => [
      `empty ownership at ${stage}`,
      {
        ...valid,
        category: new Set(['login', 'scenario-action']).has(stage)
          ? 'scenario-failed' : 'scenario-runner-invalid',
        stage,
        browserSessions: [],
        launchReceipts: [],
      },
      {
        ...accepted,
        activeAnnouncedSessions: new Set(),
        activeAnnouncedReceipts: new Map(),
      },
    ]),
    ['row emission before ownership completion', {
      ...valid, category: 'scenario-runner-invalid', stage: 'row-emission',
    }, accepted],
    ['non-row failure after ownership completion', valid, { ...accepted, ownershipComplete: true }],
    ['after terminal', valid, { ...accepted, terminal: { ok: true } }],
  ];
  for (const [name, message, state] of cases) await t.test(name, () => {
    assert.throws(() => validateRunnerFailureTerminal(message, state), /scenario-runner-invalid/);
  });
});

test('phase 9 guardian preserves every validated child failure stage through exact cleanup', async t => {
  for (const [stage, category] of [
    ['authorization', 'scenario-runner-invalid'],
    ['acquisition', 'scenario-runner-invalid'],
    ['receipt', 'scenario-runner-invalid'],
    ['recorder', 'scenario-runner-invalid'],
    ['viewport', 'scenario-runner-invalid'],
    ['login', 'scenario-failed'],
    ['scenario-action', 'scenario-failed'],
    ['row-emission', 'scenario-runner-invalid'],
    ['release', 'scenario-runner-invalid'],
  ]) await t.test(stage, async () => {
    const fixture = lifecycleGuardianFixture({ runnerMode: `failure-terminal-${stage}` });
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(result.ok, false);
    assert.equal(result.category, category);
    assert.equal(result.primaryCategory, category);
    assert.equal(result.primaryStage, stage);
    const expectedDiagnosticContext = stage === 'row-emission'
      ? { contextOrdinal: 39, contextId: 'pending-deletion-active-baseline-desktop' }
      : { contextOrdinal: 0, contextId: 'admission-route-qa-parent-a-mobile' };
    assert.deepEqual({
      contextOrdinal: result.diagnostic.contextOrdinal,
      contextId: result.diagnostic.contextId,
    }, expectedDiagnosticContext);
    assert.equal(typeof result.diagnostic.checkpoint, 'string');
    assert.equal(typeof result.diagnostic.reason, 'string');
    assert.equal(result.closureCertified, true);
    assert.equal(fixture.events.some(event => event.startsWith('browser:close:')), true);
    assert.equal(fixture.events.filter(event => event === 'fixture:cleanup').length, 1);
    assert.equal(JSON.stringify(result).includes('secret'), false);
    assert.equal(JSON.stringify(fixture.terminalCheckpoints).includes('p9-admission-route-qa-parent-a-mobile'), false);
    assert.equal(
      JSON.stringify(fixture.terminalCheckpoints).includes(expectedDiagnosticContext.contextId), true,
    );
  });
});

test('phase 9 production child sanitizes initialization failure into one closed terminal', () => {
  const repositoryRoot = join(testDirectory, '..');
  const workspace = join(tmpdir(), 'phase9-synthetic-init-failure');
  const markerName = 'PHASE9_GUARDIAN_RUN_MARKER';
  const result = spawnSync(process.execPath, [
    '--input-type=module', '--eval', readFileSync(join(
      repositoryRoot, 'scripts/qa-evidence/phase9/child-runner.mjs',
    ), 'utf8'), '--',
    '--phase', 'before-transition',
    '--workspace', workspace,
    '--manifest', join(workspace, 'manifest.json'),
    '--credentials', join(workspace, 'credentials.json'),
    '--guardian-marker-env', markerName,
    '--config-base64', Buffer.from('{}').toString('base64'),
  ], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      TMPDIR: join(workspace, 'playwright-tmp'),
      [markerName]: 'a'.repeat(64),
    },
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.equal(result.stderr, '');
  const lines = result.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0], {
    type: 'failure', version: 4, phase: 'before-transition', sequence: 0,
    category: 'scenario-runner-invalid', stage: 'authorization',
    contextOrdinal: 0, contextId: 'admission-route-qa-parent-a-mobile',
    checkpoint: 'runner-initialization', reason: 'runner-invalid',
    pendingBrowserSession: null, browserSessions: [], attachedBrowserSessions: [],
    launchReceipts: [], releasedBrowserSessions: [],
  });
  assert.equal(JSON.stringify(lines).includes(workspace), false);
});

test('phase 9 guardian discards failure attribution when trailing protocol output invalidates the terminal', async () => {
  const fixture = lifecycleGuardianFixture({ runnerMode: 'failure-terminal-login-trailing' });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.category, 'scenario-runner-invalid');
  assert.equal(result.primaryCategory, 'scenario-runner-invalid');
  assert.notEqual(result.primaryStage, 'login');
  assert.equal(result.closureCertified, true);
  assert.equal(fixture.events.includes('browser:close:p9-admission-route-qa-parent-a-mobile'), true);
  assert.equal(fixture.events.filter(event => event === 'fixture:cleanup').length, 1);
});

test('phase 9 guardian rejects a valid but stale canonical failure context after the next row starts', async () => {
  const fixture = lifecycleGuardianFixture({ runnerMode: 'failure-terminal-stale-context' });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.category, 'scenario-runner-invalid');
  assert.equal(result.primaryCategory, 'scenario-runner-invalid');
  assert.notEqual(result.primaryStage, 'scenario-action');
  assert.equal(result.closureCertified, true);
  assert.equal(fixture.events.includes('browser:close:p9-admission-route-qa-adult-player-a-mobile'), true);
  assert.equal(fixture.events.filter(event => event === 'fixture:cleanup').length, 1);
});

test('phase 9 guardian accepts an exact later-row context-start failure after prior release', async () => {
  const fixture = lifecycleGuardianFixture({ runnerMode: 'failure-terminal-context-start-later' });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.primaryCategory, 'scenario-runner-invalid');
  assert.equal(result.primaryStage, 'authorization');
  assert.deepEqual(result.diagnostic, {
    contextOrdinal: 1,
    contextId: 'admission-route-qa-adult-player-a-mobile',
    checkpoint: 'context-start',
    reason: 'context-invalid',
  });
  assert.equal(result.closureCertified, true);
});

test('phase 9 guardian rejects duplicate, skipped, and backward canonical context progress', async t => {
  for (const mode of [
    'failure-terminal-context-duplicate',
    'failure-terminal-context-skip',
    'failure-terminal-context-backward',
  ]) {
    await t.test(mode, async () => {
      const fixture = lifecycleGuardianFixture({ runnerMode: mode });
      const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
      assert.equal(result.ok, false);
      assert.equal(result.primaryCategory, 'scenario-runner-invalid');
      assert.equal(result.diagnostic, undefined);
      assert.equal(result.closureCertified, true);
      assert.equal(fixture.events.filter(event => event === 'fixture:cleanup').length, 1);
    });
  }
});

test('phase 9 guardian rejects future-row ownership under the current canonical context', async () => {
  const fixture = lifecycleGuardianFixture({ runnerMode: 'failure-terminal-future-ownership' });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.primaryCategory, 'scenario-runner-invalid');
  assert.equal(result.diagnostic, undefined);
  assert.equal(result.closureCertified, false);
  assert.equal(fixture.events.filter(event => event === 'fixture:cleanup').length, 0);
});

test('phase 9 guardian rejects ownership before the first canonical context-start', async () => {
  const fixture = lifecycleGuardianFixture({ runnerMode: 'ownership-before-context' });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.primaryCategory, 'scenario-runner-invalid');
  assert.equal(result.diagnostic, undefined);
  assert.equal(result.closureCertified, false);
});

test('phase 9 guardian rejects advancing context while prior non-pending ownership is active', async () => {
  const fixture = lifecycleGuardianFixture({ runnerMode: 'next-context-with-active-ownership' });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.primaryCategory, 'scenario-runner-invalid');
  assert.equal(result.diagnostic, undefined);
  assert.equal(result.closureCertified, true);
  assert.equal(fixture.events.includes('browser:close:p9-admission-route-qa-parent-a-mobile'), true);
});

test('phase 9 guardian rejects a complete canonical row stream without context-start records', async () => {
  const fixture = lifecycleGuardianFixture({ runnerMode: 'complete-without-context' });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.primaryCategory, 'scenario-runner-invalid');
  assert.equal(result.diagnostic, undefined);
  assert.equal(result.closureCertified, false);
  assert.equal(result.rows, undefined);
});

test('phase 9 guardian preserves a valid failure candidate across clean-protocol child closure failure', async () => {
  const fixture = lifecycleGuardianFixture({ runnerMode: 'failure-terminal-login-nonzero' });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.category, 'scenario-closure-failed');
  assert.equal(result.primaryCategory, 'scenario-failed');
  assert.equal(result.primaryStage, 'login');
  assert.equal(result.closureCertified, true);
  assert.equal(fixture.events.includes('browser:close:p9-admission-route-qa-parent-a-mobile'), true);
});

test('phase 9 guardian waits for timed-out failure-terminal stdio closure before attribution', async () => {
  const fixture = lifecycleGuardianFixture({
    runnerMode: 'failure-terminal-login-hang-trailing',
    scenarioJoinTimeoutMs: 20,
  });
  const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
  assert.equal(result.ok, false);
  assert.equal(result.category, 'scenario-runner-invalid');
  assert.equal(result.primaryCategory, 'scenario-runner-invalid');
  assert.notEqual(result.primaryStage, 'login');
  assert.equal(result.closureCertified, true);
  assert.equal(fixture.events.includes('browser:close:p9-admission-route-qa-parent-a-mobile'), true);
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

test('phase 9 lifecycle guardian interruption is idempotent and reentry fails closed', { timeout: 90_000 }, async () => {
  const descendantInventory = () => spawnSync('/bin/ps', ['-axo', 'command='], {
    encoding: 'utf8', timeout: 10_000,
  }).stdout.split('\n').filter(line => line.includes('phase9-lifecycle-child.mjs')).sort();
  const initialDescendants = descendantInventory();
  for (let iteration = 0; iteration < 50; iteration += 1) {
    const startedPath = `/tmp/phase9-guardian-child-hang-${process.pid}`;
    const startedTempPath = `${startedPath}.tmp`;
    const latePath = `/tmp/phase9-guardian-child-late-${process.pid}`;
    rmSync(startedPath, { force: true });
    rmSync(startedTempPath, { force: true });
    rmSync(latePath, { force: true });
    const fixture = lifecycleGuardianFixture({
      runnerMode: 'hang-resume-late-write',
      scenarioJoinTimeoutMs: 20,
    });
    const guardian = createLifecycleGuardian(fixture.dependencies);
    let runningSettled = false;
    const running = guardian.run(fixture.options).finally(() => { runningSettled = true; });
    try {
      const startupDeadline = Date.now() + 2_000;
      while (!existsSync(startedPath)) {
        assert.equal(Date.now() < startupDeadline, true, `iteration ${iteration} child startup exceeded deadline`);
        await new Promise(resolvePromise => setImmediate(resolvePromise));
      }
      assert.deepEqual(JSON.parse(readFileSync(startedPath, 'utf8')), {
        version: 4,
        phase: 'before-transition',
        sequence: 0,
        session: 'p9-admission-route-qa-parent-a-mobile',
        ownershipAuthorized: true,
      });
      await new Promise(resolvePromise => setTimeout(resolvePromise, 50));
      assert.equal(runningSettled, false, `iteration ${iteration} entered ordinary recovery before signal`);
      const reentry = guardian.run(fixture.options);
      const interrupt = fixture.handlers.get('SIGTERM');
      assert.equal(typeof interrupt, 'function');
      const firstEmergencyPromise = interrupt();
      const secondEmergencyPromise = interrupt();
      assert.equal(firstEmergencyPromise, secondEmergencyPromise);
      const [second, firstEmergency, secondEmergency] = await Promise.all([
        reentry, firstEmergencyPromise, secondEmergencyPromise,
      ]);
      assert.equal(second.ok, false);
      assert.equal(second.category, 'reentry');
      assert.deepEqual(secondEmergency, firstEmergency);
      assert.equal(firstEmergency.ok, false);
      assert.equal(firstEmergency.interrupted, true);
      assert.deepEqual(await running, firstEmergency);
      assert.equal(fixture.events.filter(event => event === 'fixture:cleanup').length, 1);
      assert.equal(fixture.events.filter(event => event === 'fs:remove-workspace').length, 1);
      assert.equal(fixture.events.indexOf('browser:close:phase9-hang-owned') < fixture.events.indexOf('fixture:cleanup'), true);
      assert.equal(fixture.events.includes('browser:close-all'), false);
      await new Promise(resolvePromise => setTimeout(resolvePromise, 200));
      assert.equal(existsSync(latePath), false);
    } finally {
      await fixture.handlers.get('SIGTERM')?.();
      await running;
      rmSync(startedPath, { force: true });
      rmSync(startedTempPath, { force: true });
      rmSync(latePath, { force: true });
    }
  }
  assert.deepEqual(descendantInventory(), initialDescendants);
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
    ['ownership-crash-first', ['p9-admission-route-qa-parent-a-mobile']],
    ['ownership-crash-late', [
      'p9-admission-route-qa-parent-a-mobile',
      'p9-admission-route-qa-adult-player-a-mobile',
    ]],
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
      if (mode === 'ownership-duplicate') {
        assert.equal(
          fixture.events.includes('browser:close:p9-admission-route-qa-parent-a-mobile'), true,
        );
      } else if (mode === 'ownership-mutation') {
        assert.equal(
          fixture.events.includes('browser:close:p9-pending-deletion-active-baseline-mobile'), true,
        );
        assert.equal(
          fixture.events.includes('browser:close:p9-pending-deletion-active-baseline-desktop'), true,
        );
      } else {
        assert.equal(fixture.events.some(event => event.startsWith('browser:close:')), false);
      }
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
  try {
    const result = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    roguePid ??= JSON.parse(readFileSync(markerPath, 'utf8')).pid;
    assert.equal(result.ok, false);
    assert.equal(result.category, 'scenario-closure-failed');
    assert.equal(result.closureCertified, true);
    assert.equal(processAlive(roguePid), false);
    assert.equal(fixture.events.filter(event => event === 'fixture:cleanup').length, 1);
  } finally {
    if (roguePid && processAlive(roguePid)) {
      try { process.kill(roguePid, 'SIGKILL'); } catch {}
    }
    rmSync(markerPath, { force: true });
  }
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

function task5TerminalCertificate(status = 'closure-pending', overrides = {}) {
  return {
    version: 2,
    command: 'hosted',
    status,
    exitCode: status === 'complete' ? 0 : 1,
    category: status === 'complete' ? 'none' : status === 'closure-pending' ? 'pending' : 'operation-failed',
    primaryCategory: status === 'complete' || status === 'closure-pending' ? 'none' : 'operation-failed',
    primaryStage: status === 'complete' ? 'disarmed' : 'independently-absent',
    deployment: {
      deployedSha: task5Deployment.deployedSha,
      stagingRunId: task5Deployment.stagingRunId,
      pullRequestNumber: task5Deployment.pullRequestNumber,
    },
    lifecycle: {
      state: status === 'complete' ? 'disarmed' : 'independently-absent',
      history: status === 'complete' ? [...task5Lifecycle.history] : task5Lifecycle.history.slice(0, 10),
      preflight: { plannedAliases: 20, plannedTeams: 3 },
      seed: { auth: 20, firestore: 82 },
      initialInspect: { expectedAuth: 20, expectedFirestore: 82, actualAuth: 20, actualFirestore: 82 },
      precleanInspect: { expectedAuth: 20, expectedFirestore: 82, actualAuth: 20, actualFirestore: 82 },
      cleanup: { deletedAuth: 20, deletedFirestore: 82, retainedAuth: 0, retainedFirestore: 0, failedAuth: 0, failedFirestore: 0 },
      cleanInspect: { expectedAuth: 20, expectedFirestore: 82, actualAuth: 0, actualFirestore: 0 },
      independentProbe: { checkedAuth: 20, checkedFirestore: 82, checkedExpectedAbsent: 1, authPresent: 0, firestorePresent: 0, expectedAbsentPresent: 0 },
      browserClosureCertified: true,
      processClosureCertified: true,
      profileClosureCertified: true,
      fixtureClosureCertified: true,
      credentialRemoved: status === 'complete',
      workspaceRemoved: status === 'complete',
    },
    evidence: { rows: status === 'complete' ? 44 : 0, written: status === 'complete' },
    ...overrides,
  };
}

test('phase 9 request failure certificate preserves the exact optional closed diagnostic', async t => {
  const { canonicalPhase9TerminalCertificate } = await import(
    '../scripts/qa-evidence/phase9/terminal-certificate-writer.mjs'
  );
  const certificate = status => task5TerminalCertificate(status, {
    primaryCategory: 'scenario-failed',
    primaryStage: 'scenario-action',
    diagnostic: {
      contextOrdinal: 0,
      contextId: 'admission-route-qa-parent-a-mobile',
      checkpoint: 'window-request-failure',
      reason: 'request-failure-invalid',
      requestFailure: { ...canonicalRequestFailureSummary },
    },
  });
  for (const status of ['closure-pending', 'failed']) {
    const expected = certificate(status);
    const parsed = JSON.parse(canonicalPhase9TerminalCertificate(expected));
    assert.deepEqual(parsed.diagnostic.requestFailure, canonicalRequestFailureSummary, status);
    assert.deepEqual(Object.keys(parsed.diagnostic.requestFailure).sort(), [
      'failureClass', 'multiplicity', 'navigationRelationship', 'resourceType', 'targetClass',
    ]);
  }

  const fixedOnly = certificate('failed');
  delete fixedOnly.diagnostic.requestFailure;
  assert.doesNotThrow(() => canonicalPhase9TerminalCertificate(fixedOnly));
  const ordinary = certificate('failed');
  ordinary.diagnostic = {
    ...ordinary.diagnostic,
    checkpoint: 'scenario-action',
    reason: 'action-failed',
  };
  delete ordinary.diagnostic.requestFailure;
  const ordinaryParsed = JSON.parse(canonicalPhase9TerminalCertificate(ordinary));
  assert.equal(Object.hasOwn(ordinaryParsed.diagnostic, 'requestFailure'), false);

  const malformedSummaries = [
    ['missing detail', (() => {
      const requestFailure = { ...canonicalRequestFailureSummary };
      delete requestFailure.targetClass;
      return requestFailure;
    })()],
    ['extra key', { ...canonicalRequestFailureSummary, rawUrl: 'https://secret.invalid/?token=must-not-return' }],
    ['failure class', { ...canonicalRequestFailureSummary, failureClass: 'net::ERR_FAILED' }],
    ['target class', { ...canonicalRequestFailureSummary, targetClass: 'qa-phase7-20260829T123456Z-abcdefghijkl' }],
    ['resource type', { ...canonicalRequestFailureSummary, resourceType: 'script' }],
    ['navigation relationship', { ...canonicalRequestFailureSummary, navigationRelationship: 'raw-session' }],
    ['multiplicity', { ...canonicalRequestFailureSummary, multiplicity: 2 }],
    ['raw error', { ...canonicalRequestFailureSummary, error: 'secret=must-not-return' }],
    ['array', Object.values(canonicalRequestFailureSummary)],
    ['foreign prototype', Object.assign(Object.create({ inherited: true }), canonicalRequestFailureSummary)],
    ['symbol key', Object.assign({ ...canonicalRequestFailureSummary }, { [Symbol('raw')]: 'must-not-return' })],
    ['cycle', (() => { const value = { ...canonicalRequestFailureSummary }; value.self = value; return value; })()],
    ['accessor', (() => {
      const value = { ...canonicalRequestFailureSummary };
      Object.defineProperty(value, 'failureClass', { enumerable: true, get: () => 'connection' });
      return value;
    })()],
    ['proxy', new Proxy({ ...canonicalRequestFailureSummary }, {})],
  ];
  for (const [name, requestFailure] of malformedSummaries) await t.test(name, () => {
    const forged = certificate('failed');
    forged.diagnostic.requestFailure = requestFailure;
    assert.throws(() => canonicalPhase9TerminalCertificate(forged), /terminal certificate/i);
  });
  const stale = certificate('failed');
  stale.diagnostic = {
    ...stale.diagnostic,
    checkpoint: 'scenario-action',
    reason: 'action-failed',
  };
  assert.throws(() => canonicalPhase9TerminalCertificate(stale), /terminal certificate/i);
});

darwinRuntimeTest('phase 9 terminal certificate survives discarded console output and exact workspace removal', async () => {
  const { createPhase9TerminalCertificateWriter } = await import('../scripts/qa-evidence/phase9/terminal-certificate-writer.mjs');
  const root = realpathSync(mkdtempSync('/tmp/phase9-terminal-certificate.'));
  const parent = join(root, 'results');
  const workspace = join(root, 'workspace');
  mkdirSync(parent, { mode: 0o700 });
  mkdirSync(workspace, { mode: 0o700 });
  const resultPath = join(parent, 'hosted-result.json');
  let writer = null;
  try {
    writer = await createPhase9TerminalCertificateWriter({
      resultPath, repositoryRoot: dirname(testDirectory), workspacePath: workspace,
      evidenceDirectory: join(dirname(testDirectory), phase9EvidenceDirectorySuffix),
    });
    await writer.write(task5TerminalCertificate('closure-pending'));
    rmSync(workspace, { recursive: true, force: false });
    await writer.write(task5TerminalCertificate('complete'));
    assert.deepEqual(JSON.parse(readFileSync(resultPath, 'utf8')), task5TerminalCertificate('complete'));
    assert.equal(statSync(resultPath).mode & 0o777, 0o600);
    assert.deepEqual(readdirSync(parent), ['hosted-result.json']);
  } finally {
    await writer?.close();
    rmSync(root, { recursive: true, force: true });
  }
});

darwinRuntimeTest('phase 9 terminal certificate rejects a byte-identical symlink swap after helper success', async () => {
  const {
    canonicalPhase9TerminalCertificate, createPhase9TerminalCertificateWriter,
  } = await import('../scripts/qa-evidence/phase9/terminal-certificate-writer.mjs');
  const root = realpathSync(mkdtempSync('/tmp/phase9-terminal-post-helper-swap.'));
  const parent = join(root, 'results');
  const workspace = join(root, 'workspace');
  const resultPath = join(parent, 'hosted-result.json');
  const stolenPath = join(root, 'stolen-result.json');
  const foreignPath = join(root, 'foreign-result.json');
  mkdirSync(parent, { mode: 0o700 });
  mkdirSync(workspace, { mode: 0o700 });
  const complete = task5TerminalCertificate('complete');
  writeFileSync(foreignPath, canonicalPhase9TerminalCertificate(complete), { mode: 0o600 });
  let swapBeforeOpen = false;
  let swapped = false;
  const filesystem = {
    ...fsPromises,
    async open(path, ...args) {
      if (swapBeforeOpen && !swapped && path === resultPath) {
        swapped = true;
        renameSync(resultPath, stolenPath);
        symlinkSync(foreignPath, resultPath);
      }
      return fsPromises.open(path, ...args);
    },
  };
  let writer = null;
  try {
    writer = await createPhase9TerminalCertificateWriter({
      resultPath, repositoryRoot: dirname(testDirectory), workspacePath: workspace,
      evidenceDirectory: join(dirname(testDirectory), phase9EvidenceDirectorySuffix), filesystem,
    });
    await writer.write(task5TerminalCertificate('closure-pending'));
    swapBeforeOpen = true;
    await assert.rejects(writer.write(complete), /terminal certificate/i);
    assert.equal(swapped, true, 'the post-helper pre-open seam must be exercised');
    assert.equal(lstatSync(resultPath).isSymbolicLink(), true);
    assert.equal(readFileSync(foreignPath, 'utf8'), canonicalPhase9TerminalCertificate(complete));
  } finally {
    await writer?.close();
    rmSync(root, { recursive: true, force: true });
  }
});

darwinRuntimeTest('phase 9 terminal certificate binds checkpoint and complete acceptance to one held result identity', async () => {
  const {
    canonicalPhase9TerminalCertificate, createPhase9TerminalCertificateWriter,
  } = await import('../scripts/qa-evidence/phase9/terminal-certificate-writer.mjs');
  for (const status of ['closure-pending', 'complete']) {
    for (const seam of ['pre-open', 'during-read', 'post-read']) {
      const root = realpathSync(mkdtempSync('/tmp/phase9-terminal-held-result.'));
      const parent = join(root, 'results');
      const workspace = join(root, 'workspace');
      const resultPath = join(parent, 'hosted-result.json');
      const stolenPath = join(root, 'stolen-result.json');
      const foreignPath = join(root, 'foreign-result.json');
      mkdirSync(parent, { mode: 0o700 });
      mkdirSync(workspace, { mode: 0o700 });
      const certificate = task5TerminalCertificate(status);
      const document = canonicalPhase9TerminalCertificate(certificate);
      writeFileSync(foreignPath, document, { mode: 0o600 });
      let armed = false;
      let swapped = false;
      const swap = () => {
        if (swapped) return;
        swapped = true;
        renameSync(resultPath, stolenPath);
        symlinkSync(foreignPath, resultPath);
      };
      const filesystem = {
        ...fsPromises,
        async open(path, ...args) {
          if (armed && path === resultPath && seam === 'pre-open') swap();
          const handle = await fsPromises.open(path, ...args);
          if (!armed || path !== resultPath || seam === 'pre-open') return handle;
          let statCalls = 0;
          return {
            async stat(...statArgs) {
              const metadata = await handle.stat(...statArgs);
              statCalls += 1;
              if (seam === 'post-read' && statCalls === 2) swap();
              return metadata;
            },
            async read(...readArgs) {
              const result = await handle.read(...readArgs);
              if (seam === 'during-read') swap();
              return result;
            },
            close: (...closeArgs) => handle.close(...closeArgs),
          };
        },
      };
      let writer = null;
      try {
        writer = await createPhase9TerminalCertificateWriter({
          resultPath, repositoryRoot: dirname(testDirectory), workspacePath: workspace,
          evidenceDirectory: join(dirname(testDirectory), phase9EvidenceDirectorySuffix), filesystem,
        });
        if (status === 'complete') await writer.write(task5TerminalCertificate('closure-pending'));
        armed = true;
        await assert.rejects(writer.write(certificate), /terminal certificate/i, `${status} ${seam}`);
        assert.equal(swapped, true, `${status} ${seam} must exercise its swap seam`);
        assert.equal(lstatSync(resultPath).isSymbolicLink(), true, `${status} ${seam}`);
        assert.equal(readFileSync(foreignPath, 'utf8'), document, `${status} ${seam}`);
        assert.equal(readFileSync(stolenPath, 'utf8'), document, `${status} ${seam}`);
      } finally {
        await writer?.close();
        rmSync(root, { recursive: true, force: true });
      }
    }
  }
});

darwinRuntimeTest('phase 9 completed guardian cleanup retains its external terminal certificate when console output is discarded', async () => {
  const { createPhase9TerminalCertificateWriter } = await import('../scripts/qa-evidence/phase9/terminal-certificate-writer.mjs');
  const root = realpathSync(mkdtempSync('/tmp/phase9-terminal-guardian.'));
  const parent = join(root, 'results');
  const writerWorkspace = join(root, 'workspace');
  mkdirSync(parent, { mode: 0o700 });
  mkdirSync(writerWorkspace, { mode: 0o700 });
  const resultPath = join(parent, 'hosted-result.json');
  const fixture = lifecycleGuardianFixture();
  let latest = null;
  const writer = await createPhase9TerminalCertificateWriter({
    resultPath, repositoryRoot: dirname(testDirectory), workspacePath: writerWorkspace,
    evidenceDirectory: join(dirname(testDirectory), phase9EvidenceDirectorySuffix),
  });
  fixture.dependencies.terminalCertificateWriter = async ({ phase, lifecycle }) => {
    latest = lifecycle;
    if (phase === 'closure-pending') {
      await writer.write(task5TerminalCertificate('closure-pending', { lifecycle }));
    }
  };
  try {
    const lifecycle = await runGuardedLifecycle({ ...fixture.dependencies, options: fixture.options });
    assert.equal(lifecycle.ok, true, JSON.stringify(lifecycle));
    await writer.write(task5TerminalCertificate('complete', {
      lifecycle: {
        ...latest, state: lifecycle.state, history: lifecycle.history,
        credentialRemoved: true, workspaceRemoved: true,
      },
    }));
    const retained = JSON.parse(readFileSync(resultPath, 'utf8'));
    assert.equal(retained.status, 'complete');
    assert.equal(retained.lifecycle.workspaceRemoved, true);
    assert.equal(retained.lifecycle.independentProbe.checkedAuth, 20);
    assert.equal(retained.lifecycle.independentProbe.checkedFirestore, 82);
    assert.equal(retained.lifecycle.independentProbe.checkedExpectedAbsent, 1);
    assert.equal(JSON.stringify(retained).includes('qa-phase7-'), false);
  } finally {
    await writer.close();
    rmSync(root, { recursive: true, force: true });
  }
});

darwinRuntimeTest('phase 9 terminal certificate promotion failure preserves the exact prior checkpoint', async () => {
  const { createPhase9TerminalCertificateWriter } = await import('../scripts/qa-evidence/phase9/terminal-certificate-writer.mjs');
  const root = realpathSync(mkdtempSync('/tmp/phase9-terminal-certificate-failure.'));
  const parent = join(root, 'results');
  const workspace = join(root, 'workspace');
  mkdirSync(parent, { mode: 0o700 });
  mkdirSync(workspace, { mode: 0o700 });
  const resultPath = join(parent, 'hosted-result.json');
  let failing = null;
  try {
    const initial = await createPhase9TerminalCertificateWriter({
      resultPath, repositoryRoot: dirname(testDirectory), workspacePath: workspace,
      evidenceDirectory: join(dirname(testDirectory), phase9EvidenceDirectorySuffix),
    });
    const checkpoint = task5TerminalCertificate('closure-pending', {
      primaryCategory: 'scenario-failed',
      primaryStage: 'scenario-action',
      diagnostic: {
        contextOrdinal: 0,
        contextId: 'admission-route-qa-parent-a-mobile',
        checkpoint: 'window-request-failure',
        reason: 'request-failure-invalid',
        requestFailure: { ...canonicalRequestFailureSummary },
      },
    });
    await initial.write(checkpoint);
    await initial.close();
    failing = await createPhase9TerminalCertificateWriter({
      resultPath, repositoryRoot: dirname(testDirectory), workspacePath: workspace,
      evidenceDirectory: join(dirname(testDirectory), phase9EvidenceDirectorySuffix),
      helperEnvironment: { PHASE9_CERTIFICATE_TEST_FAIL_PROMOTION: '1' },
    });
    await assert.rejects(failing.write(task5TerminalCertificate('complete')), /terminal certificate/i);
    assert.deepEqual(JSON.parse(readFileSync(resultPath, 'utf8')), checkpoint);
    assert.deepEqual(readdirSync(parent), ['hosted-result.json']);
  } finally {
    await failing?.close();
    rmSync(root, { recursive: true, force: true });
  }
});

darwinRuntimeTest('phase 9 terminal certificate rejects unsafe paths, parent types, permissions, and sensitive payloads', async () => {
  const { createPhase9TerminalCertificateWriter } = await import('../scripts/qa-evidence/phase9/terminal-certificate-writer.mjs');
  const root = realpathSync(mkdtempSync('/tmp/phase9-terminal-certificate-reject.'));
  const parent = join(root, 'results');
  const workspace = join(root, 'workspace');
  mkdirSync(parent, { mode: 0o700 });
  mkdirSync(workspace, { mode: 0o700 });
  const common = { repositoryRoot: dirname(testDirectory), workspacePath: workspace, evidenceDirectory: join(dirname(testDirectory), phase9EvidenceDirectorySuffix) };
  let writer = null;
  try {
    await assert.rejects(createPhase9TerminalCertificateWriter({ ...common, resultPath: join(workspace, 'result.json') }), /external/i);
    chmodSync(parent, 0o755);
    await assert.rejects(createPhase9TerminalCertificateWriter({ ...common, resultPath: join(parent, 'result.json') }), /private|0700/i);
    chmodSync(parent, 0o700);
    symlinkSync(parent, join(root, 'result-link'));
    await assert.rejects(createPhase9TerminalCertificateWriter({ ...common, resultPath: join(root, 'result-link', 'result.json') }), /symlink|canonical/i);
    writer = await createPhase9TerminalCertificateWriter({ ...common, resultPath: join(parent, 'result.json') });
    await assert.rejects(writer.write(task5TerminalCertificate('failed', { category: 'password=raw-secret' })), /sensitive|category/i);
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    await writer?.close();
    rmSync(root, { recursive: true, force: true });
  }
});

darwinRuntimeTest('phase 9 terminal certificate confines result paths against canonical workspace aliases', async () => {
  const { createPhase9TerminalCertificateWriter } = await import('../scripts/qa-evidence/phase9/terminal-certificate-writer.mjs');
  const canonicalTemporaryRoot = realpathSync('/tmp');
  const canonicalWorkspace = realpathSync(mkdtempSync(join(canonicalTemporaryRoot, 'phase9-terminal-canonical-workspace.')));
  const lexicalWorkspace = join('/tmp', canonicalWorkspace.slice(canonicalTemporaryRoot.length + 1));
  assert.notEqual(lexicalWorkspace, canonicalWorkspace, 'Darwin /tmp must exercise its canonical alias');
  const parent = join(canonicalWorkspace, 'results');
  mkdirSync(parent, { mode: 0o700 });
  const attempt = createPhase9TerminalCertificateWriter({
    resultPath: join(parent, 'result.json'), repositoryRoot: dirname(testDirectory),
    workspacePath: lexicalWorkspace,
    evidenceDirectory: join(dirname(testDirectory), phase9EvidenceDirectorySuffix),
  }).then(async writer => { await writer.close(); return writer; });
  try {
    await assert.rejects(attempt, /canonical|external|workspace/i);
  } finally {
    rmSync(canonicalWorkspace, { recursive: true, force: true });
  }
});

test('phase 9 hosted result admission rejects a lexically relative path before resolution', async () => {
  const { resolvePhase9ResultPath } = await import('../scripts/qa-evidence/phase9/cli.mjs');
  assert.throws(() => resolvePhase9ResultPath('relative/result.json'), /absolute/i);
  assert.equal(resolvePhase9ResultPath('/private/tmp/phase9-result/result.json'), '/private/tmp/phase9-result/result.json');
});

test('phase 9 terminal result confinement rejects a portable symlinked workspace alias', async () => {
  const { assertPhase9TerminalResultConfinement } = await import('../scripts/qa-evidence/phase9/terminal-certificate-writer.mjs');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'phase9-terminal-portable-confinement.')));
  const workspace = join(root, 'workspace');
  const alias = join(root, 'workspace-alias');
  const parent = join(workspace, 'results');
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  symlinkSync(workspace, alias);
  try {
    assert.throws(() => assertPhase9TerminalResultConfinement({
      resultPath: join(parent, 'result.json'), parentPath: parent,
      canonicalParent: realpathSync(parent), canonicalRepository: realpathSync(dirname(testDirectory)),
      canonicalWorkspace: realpathSync(alias),
      canonicalEvidence: realpathSync(join(dirname(testDirectory), phase9EvidenceDirectorySuffix)),
    }), /external/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('phase 9 terminal writer rejects non-Darwin before filesystem access or mutation', async () => {
  const { createPhase9TerminalCertificateWriter } = await import('../scripts/qa-evidence/phase9/terminal-certificate-writer.mjs');
  const filesystem = new Proxy({}, {
    get() { throw new Error('filesystem-accessed'); },
  });
  await assert.rejects(createPhase9TerminalCertificateWriter({
    resultPath: '/tmp/phase9-result/result.json', repositoryRoot: '/tmp/repository',
    workspacePath: '/tmp/workspace', evidenceDirectory: '/tmp/evidence',
    filesystem, platform: 'linux',
  }), /requires Darwin/);
});

test('phase 9 terminal checkpoint validator requires every exact certified closure fact', async () => {
  const {
    canonicalPhase9TerminalCertificate, canonicalPhase9TerminalRecoveryCertificate,
  } = await import('../scripts/qa-evidence/phase9/terminal-certificate-writer.mjs');
  const base = task5TerminalCertificate('closure-pending');
  const mutations = [
    ['null preflight', { preflight: null }],
    ['wrong preflight aliases', { preflight: { plannedAliases: 19, plannedTeams: 3 } }],
    ['wrong preflight teams', { preflight: { plannedAliases: 20, plannedTeams: 2 } }],
    ['null seed', { seed: null }],
    ['wrong seed', { seed: { auth: 20, firestore: 81 } }],
    ['drifted initial inspect', { initialInspect: { expectedAuth: 20, expectedFirestore: 82, actualAuth: 19, actualFirestore: 82 } }],
    ['drifted preclean inspect', { precleanInspect: { expectedAuth: 20, expectedFirestore: 82, actualAuth: 20, actualFirestore: 81 } }],
    ['incomplete cleanup', { cleanup: { deletedAuth: 19, deletedFirestore: 82, retainedAuth: 0, retainedFirestore: 0, failedAuth: 0, failedFirestore: 0 } }],
    ['retained cleanup resource', { cleanup: { deletedAuth: 20, deletedFirestore: 82, retainedAuth: 1, retainedFirestore: 0, failedAuth: 0, failedFirestore: 0 } }],
    ['nonempty clean inspect', { cleanInspect: { expectedAuth: 20, expectedFirestore: 82, actualAuth: 0, actualFirestore: 1 } }],
    ['incomplete independent probe', { independentProbe: { checkedAuth: 20, checkedFirestore: 81, checkedExpectedAbsent: 1, authPresent: 0, firestorePresent: 0, expectedAbsentPresent: 0 } }],
    ['present independent resource', { independentProbe: { checkedAuth: 20, checkedFirestore: 82, checkedExpectedAbsent: 1, authPresent: 1, firestorePresent: 0, expectedAbsentPresent: 0 } }],
    ['uncertified browser closure', { browserClosureCertified: false }],
    ['uncertified process closure', { processClosureCertified: false }],
    ['uncertified profile closure', { profileClosureCertified: false }],
    ['uncertified fixture closure', { fixtureClosureCertified: false }],
    ['early credential removal', { credentialRemoved: true }],
    ['early workspace removal', { workspaceRemoved: true }],
  ];
  for (const [name, lifecycleMutation] of mutations) {
    assert.throws(
      () => canonicalPhase9TerminalCertificate({
        ...base, lifecycle: { ...base.lifecycle, ...lifecycleMutation },
      }),
      /terminal certificate/i,
      name,
    );
  }
  const complete = task5TerminalCertificate('complete');
  assert.throws(
    () => canonicalPhase9TerminalCertificate({
      ...complete, lifecycle: { ...complete.lifecycle, preflight: null },
    }),
    /terminal certificate/i,
  );
  assert.throws(
    () => canonicalPhase9TerminalCertificate(task5TerminalCertificate('failed', { category: 'password=raw-secret' })),
    /terminal certificate/i,
  );
  assert.doesNotThrow(() => canonicalPhase9TerminalCertificate(base));
  assert.doesNotThrow(() => canonicalPhase9TerminalCertificate(complete));
  assert.throws(
    () => canonicalPhase9TerminalCertificate({ ...base, primaryCategory: 'raw-secret-category' }),
    /terminal certificate/i,
  );
  assert.throws(
    () => canonicalPhase9TerminalCertificate({ ...base, primaryStage: 'raw-stage' }),
    /terminal certificate/i,
  );
  const missingPrimary = structuredClone(base);
  delete missingPrimary.primaryCategory;
  assert.throws(() => canonicalPhase9TerminalCertificate(missingPrimary), /terminal certificate/i);
  assert.doesNotThrow(() => canonicalPhase9TerminalCertificate({
    ...base,
    primaryCategory: 'scenario-failed',
    primaryStage: 'inspected',
    lifecycle: {
      ...base.lifecycle,
      state: 'inspected',
      history: task5Lifecycle.history.slice(0, 5),
    },
  }));
  const certificateDiagnostics = {
    authorization: ['ownership-authorization', 'authorization-failed'],
    acquisition: ['browser-acquisition', 'acquisition-failed'],
    receipt: ['launch-receipt', 'receipt-invalid'],
    recorder: ['recorder-arm', 'recorder-failed'],
    viewport: ['viewport-verify', 'viewport-mismatch'],
    login: ['login-submit', 'login-failed'],
    'scenario-action': ['scenario-action', 'action-failed'],
    'row-emission': ['row-emission', 'row-invalid'],
    release: ['ownership-release', 'release-failed'],
  };
  for (const primaryStage of [
    'authorization', 'acquisition', 'receipt', 'recorder', 'viewport', 'login',
    'scenario-action', 'row-emission', 'release',
  ]) assert.doesNotThrow(() => canonicalPhase9TerminalCertificate({
    ...base,
    primaryCategory: new Set(['login', 'scenario-action']).has(primaryStage)
      ? 'scenario-failed' : 'scenario-runner-invalid',
    primaryStage,
    diagnostic: {
      contextOrdinal: 0,
      contextId: 'admission-route-qa-parent-a-mobile',
      checkpoint: certificateDiagnostics[primaryStage][0],
      reason: certificateDiagnostics[primaryStage][1],
    },
    lifecycle: {
      ...base.lifecycle,
      state: 'inspected',
      history: task5Lifecycle.history.slice(0, 5),
    },
  }));
  assert.throws(() => canonicalPhase9TerminalCertificate({
    ...base,
    primaryCategory: 'scenario-failed',
    primaryStage: 'scenario-action',
  }), /terminal certificate/i);
  const diagnosticCertificate = {
    ...base,
    primaryCategory: 'scenario-failed',
    primaryStage: 'scenario-action',
    diagnostic: {
      contextOrdinal: 0,
      contextId: 'admission-route-qa-parent-a-mobile',
      checkpoint: 'terminal-wait',
      reason: 'terminal-not-reached',
    },
  };
  assert.doesNotThrow(() => canonicalPhase9TerminalCertificate(diagnosticCertificate));
  for (const [checkpoint, reason] of [
    ['terminal-location', 'location-mismatch'],
    ['terminal-observer', 'observer-mismatch'],
    ['terminal-role', 'role-restricted'],
    ['terminal-loading', 'loading-stalled'],
    ['terminal-runtime', 'runtime-error'],
    ['terminal-heading', 'heading-missing'],
    ['window-schema', 'schema-invalid'],
    ['window-location', 'location-invalid'],
    ['window-terminal', 'terminal-invalid'],
    ['window-loading', 'loading-invalid'],
    ['window-page-error', 'page-error-invalid'],
    ['window-console-error', 'console-error-invalid'],
    ['window-request-failure', 'request-failure-invalid'],
    ['window-overflow', 'overflow-invalid'],
    ['window-render-coherence', 'render-coherence-invalid'],
    ['window-resource', 'resource-invalid'],
    ['window-policy', 'policy-invalid'],
    ...NO_TEAM_POLICY_DIAGNOSTICS,
    ['route-session', '/admin'],
    ['route-location', '/club'],
    ['route-heading', '/competition'],
    ['route-render', '/dashboard/billing'],
    ['route-attribution', '/family'],
  ]) {
    const noTeamDiagnostic = Object.hasOwn(
      Object.fromEntries(NO_TEAM_POLICY_DIAGNOSTICS), checkpoint,
    );
    assert.doesNotThrow(() => canonicalPhase9TerminalCertificate({
      ...diagnosticCertificate,
      diagnostic: {
        ...diagnosticCertificate.diagnostic,
        contextOrdinal: noTeamDiagnostic ? 8 : diagnosticCertificate.diagnostic.contextOrdinal,
        contextId: noTeamDiagnostic
          ? 'admission-route-qa-no-team-mobile'
          : diagnosticCertificate.diagnostic.contextId,
        checkpoint,
        reason,
      },
    }));
  }
  for (const [name, diagnostic] of [
    ['ordinal', { ...diagnosticCertificate.diagnostic, contextOrdinal: 40 }],
    ['context', { ...diagnosticCertificate.diagnostic, contextId: 'raw-context' }],
    ['checkpoint', { ...diagnosticCertificate.diagnostic, checkpoint: 'raw-checkpoint' }],
    ['retired coarse checkpoint', {
      ...diagnosticCertificate.diagnostic,
      checkpoint: 'landing-window-contract', reason: 'window-contract-invalid',
    }],
    ['non-route reason', {
      ...diagnosticCertificate.diagnostic,
      checkpoint: 'route-location', reason: '/login',
    }],
    ['reason', { ...diagnosticCertificate.diagnostic, reason: 'raw-reason' }],
    ['checkpoint/reason', { ...diagnosticCertificate.diagnostic, reason: 'action-failed' }],
  ]) assert.throws(
    () => canonicalPhase9TerminalCertificate({ ...diagnosticCertificate, diagnostic }),
    /terminal certificate/i,
    name,
  );
  let admittedCertificateContexts = 0;
  let rejectedNonRouteCertificateContexts = 0;
  for (const phaseRows of [
    buildCanonicalScenarioPlan().filter(row => row.startState !== 'pending_deletion'),
    buildCanonicalScenarioPlan().filter(row => row.startState === 'pending_deletion'),
  ]) {
    for (const [contextOrdinal, row] of phaseRows.entries()) {
      const contextualCertificate = {
        ...diagnosticCertificate,
        diagnostic: {
          ...diagnosticCertificate.diagnostic,
          contextOrdinal,
          contextId: row.contextId,
        },
      };
      assert.doesNotThrow(
        () => canonicalPhase9TerminalCertificate(contextualCertificate),
        `${row.contextId}:baseline`,
      );
      const routeCertificate = {
        ...contextualCertificate,
        diagnostic: { ...contextualCertificate.diagnostic, checkpoint: 'route-location', reason: '/admin' },
      };
      if (row.group === 'admission-route') {
        assert.doesNotThrow(
          () => canonicalPhase9TerminalCertificate(routeCertificate),
          `${row.contextId}:route`,
        );
        admittedCertificateContexts += 1;
      } else {
        assert.throws(
          () => canonicalPhase9TerminalCertificate(routeCertificate),
          /terminal certificate/i,
          `${row.contextId}:route`,
        );
        rejectedNonRouteCertificateContexts += 1;
      }
    }
  }
  assert.equal(admittedCertificateContexts, 18);
  assert.equal(rejectedNonRouteCertificateContexts, 26);
  assert.throws(() => canonicalPhase9TerminalCertificate({
    ...diagnosticCertificate,
    primaryStage: 'login',
  }), /terminal certificate/i);
  assert.throws(() => canonicalPhase9TerminalCertificate({
    ...base,
    primaryCategory: 'scenario-failed',
    primaryStage: 'release',
  }), /primary attribution is invalid/);
  assert.throws(() => canonicalPhase9TerminalCertificate({
    ...base,
    primaryCategory: 'command-failed',
    primaryStage: 'login',
  }), /primary attribution is invalid/);
  const recovery = {
    ...base,
    version: 3,
    primaryCategory: 'scenario-failed',
    primaryStage: 'inspected',
    recoveryDisposition: {
      phase: 'validated',
      credentialIdentity: 'a'.repeat(64),
      workspaceIdentity: 'b'.repeat(64),
      manifestSha256: 'c'.repeat(64),
      originalPathsAbsent: false,
      credentialZeroized: false,
      workspaceQuarantinedInPlace: false,
      workspaceRetained: true,
    },
  };
  assert.throws(() => canonicalPhase9TerminalCertificate(recovery), /terminal certificate/i);
  assert.doesNotThrow(() => canonicalPhase9TerminalRecoveryCertificate(recovery));
  for (const mutation of [
    { originalPathsAbsent: true },
    { credentialZeroized: true },
    { workspaceQuarantinedInPlace: true },
    { workspaceRetained: false },
    { credentialIdentity: '/private/tmp/raw-path' },
    { manifestSha256: 'not-a-commitment' },
  ]) {
    assert.throws(() => canonicalPhase9TerminalRecoveryCertificate({
      ...recovery,
      recoveryDisposition: { ...recovery.recoveryDisposition, ...mutation },
    }), /terminal certificate/i);
  }
});

test('phase 9 terminal recovery finalizer is a provider-free exported boundary', async () => {
  const recovery = await import('../scripts/qa-evidence/phase9/terminal-recovery-finalizer.mjs');
  assert.equal(typeof recovery.finalizePhase9TerminalRecovery, 'function');
  assert.equal(typeof recovery.executePhase9TerminalRecoveryDisposition, 'function');
  assert.deepEqual(recovery.PHASE9_TERMINAL_RECOVERY_COMMAND, Object.freeze({
    name: 'recover-terminal',
    providerOperations: 0,
    browserRows: 0,
  }));
});

function phase9LegacyRecoveryCertificate() {
  const legacy = task5TerminalCertificate('failed', { category: 'terminal-certificate-failed' });
  delete legacy.primaryCategory;
  delete legacy.primaryStage;
  return {
    ...legacy,
    version: 1,
    lifecycle: {
      ...legacy.lifecycle,
      state: 'inspected',
      history: task5Lifecycle.history.slice(0, 5),
      credentialRemoved: false,
      workspaceRemoved: false,
    },
  };
}

function phase9CleanedRecoveryManifest() {
  const runId = 'qa-phase7-20260828T043221Z-84d52a41117a';
  const expiresAt = '2026-08-28T06:32:18Z';
  const definition = buildFixtureDefinition({ runId, expiresAt, manifestVersion: 3 });
  return {
    version: 3,
    runId,
    projectId: 'the-squad-v2-staging',
    authUids: definition.identities.map(identity => identity.uid),
    firestorePaths: definition.documents.map(document => document.path),
    expectedAbsentFirestorePaths: definition.expectedAbsentDocuments.map(document => document.path),
    state: 'cleaned',
    transitions: Object.fromEntries(['qa-suspended', 'qa-removed-member', 'qa-pending-delete'].map(alias => [
      alias, { version: 1, state: 'active' },
    ])),
    createdAt: '2026-08-28T04:32:21.301Z',
    updatedAt: '2026-08-28T04:34:22.470Z',
    expiresAt,
  };
}

function phase9MemoryRecoveryWriter(initial, failure = () => false, revalidationFailure = () => false) {
  let document = structuredClone(initial);
  const writes = [];
  return {
    writes,
    get document() { return structuredClone(document); },
    factory: async () => ({
      get result() { return structuredClone(document); },
      async write(next) {
        if (failure(next, writes.length)) throw new Error('injected terminal promotion failure');
        document = structuredClone(next);
        writes.push(structuredClone(next));
      },
      async revalidate() {
        if (revalidationFailure(document)) throw new Error('injected result identity change');
        return structuredClone(document);
      },
      async close() {},
    }),
  };
}

function phase9RecoveryWorkspace() {
  const producerTempRoot = process.platform === 'darwin'
    ? realpathSync('/private/tmp')
    : realpathSync(process.env.TMPDIR || tmpdir());
  const workspacePath = realpathSync(mkdtempSync(join(producerTempRoot, 'phase9-core-identities.')));
  const resultParent = realpathSync(mkdtempSync(join(producerTempRoot, 'phase9-terminal-result.')));
  const resultPath = join(resultParent, 'result.json');
  const manifestPath = join(workspacePath, 'manifest.json');
  const credentialPath = join(workspacePath, 'credentials.json');
  writeFileSync(manifestPath, `${JSON.stringify(phase9CleanedRecoveryManifest())}\n`, { mode: 0o600 });
  writeFileSync(credentialPath, 'synthetic-test-credential-bytes\n', { mode: 0o600 });
  chmodSync(workspacePath, 0o700);
  chmodSync(resultParent, 0o700);
  const recoveryWorkspacePath = join('/private/tmp', basename(workspacePath));
  const recoveryResultParent = join('/private/tmp', basename(resultParent));
  const recoveryResultPath = join(recoveryResultParent, 'result.json');
  const recoveryManifestPath = join(recoveryWorkspacePath, 'manifest.json');
  const recoveryCredentialPath = join(recoveryWorkspacePath, 'credentials.json');
  const translate = path => {
    if (path === recoveryWorkspacePath || path.startsWith(`${recoveryWorkspacePath}/`)) {
      return `${workspacePath}${path.slice(recoveryWorkspacePath.length)}`;
    }
    if (path === recoveryResultParent || path.startsWith(`${recoveryResultParent}/`)) {
      return `${resultParent}${path.slice(recoveryResultParent.length)}`;
    }
    return path;
  };
  const filesystem = {
    async lstat(path) { return fsPromises.lstat(translate(path)); },
    async open(path, flags, mode) { return fsPromises.open(translate(path), flags, mode); },
    async readFile(path, ...args) { return fsPromises.readFile(translate(path), ...args); },
    async readdir(path, ...args) { return fsPromises.readdir(translate(path), ...args); },
    async realpath(path) {
      const translated = translate(path);
      const canonical = await fsPromises.realpath(translated);
      if (translated === workspacePath || translated.startsWith(`${workspacePath}/`)) {
        return `${recoveryWorkspacePath}${canonical.slice(workspacePath.length)}`;
      }
      if (translated === resultParent || translated.startsWith(`${resultParent}/`)) {
        return `${recoveryResultParent}${canonical.slice(resultParent.length)}`;
      }
      return canonical;
    },
  };
  return {
    workspacePath, manifestPath, credentialPath, resultParent, resultPath,
    recovery: {
      resultPath: recoveryResultPath,
      workspacePath: recoveryWorkspacePath,
      manifestPath: recoveryManifestPath,
      credentialPath: recoveryCredentialPath,
      filesystem,
    },
  };
}

const phase9RecoveryOptions = paths => ({ ...paths.recovery });

function mutatePhase9RecoveryManifestSameInode(path) {
  const before = lstatSync(path);
  const original = readFileSync(path, 'utf8');
  const manifest = JSON.parse(original);
  manifest.updatedAt = manifest.updatedAt === '2026-08-28T04:34:22.470Z'
    ? '2026-08-28T04:34:23.470Z'
    : '2026-08-28T04:34:22.470Z';
  const replacement = `${JSON.stringify(manifest)}\n`;
  assert.equal(Buffer.byteLength(replacement), Buffer.byteLength(original));
  writeFileSync(path, replacement, { flag: 'r+' });
  const after = lstatSync(path);
  assert.equal(after.dev, before.dev);
  assert.equal(after.ino, before.ino);
  assert.equal(after.size, before.size);
}

function cleanupPhase9RecoveryWorkspace(paths) {
  rmSync(paths.workspacePath, { recursive: true, force: true });
  rmSync(paths.resultParent, { recursive: true, force: true });
}

test('phase 9 terminal recovery finalizes exact local closure as failed with zero provider operations', async () => {
  const { finalizePhase9TerminalRecovery } = await import('../scripts/qa-evidence/phase9/terminal-recovery-finalizer.mjs');
  const paths = phase9RecoveryWorkspace();
  const writer = phase9MemoryRecoveryWriter(phase9LegacyRecoveryCertificate());
  try {
    const result = await finalizePhase9TerminalRecovery({
      ...phase9RecoveryOptions(paths),
      repositoryRoot: resolve(testDirectory, '..'),
      evidenceDirectory: resolve(testDirectory, '..', phase9EvidenceDirectorySuffix),
      writerFactory: writer.factory,
      dispositionExecutor: async request => {
        assert.equal(request.operation, 'zeroize-credential');
        await fsPromises.truncate(paths.credentialPath, 0);
        return true;
      },
    });
    assert.deepEqual(result, {
      ok: false, command: 'recover-terminal', status: 'failed',
      category: 'terminal-certificate-failed',
      primaryCategory: 'legacy-primary-unavailable', primaryStage: 'inspected',
      rows: 0, providerOperations: 0,
    });
    assert.equal(existsSync(paths.workspacePath), true);
    assert.equal(statSync(paths.credentialPath).size, 0);
    assert.equal(existsSync(paths.manifestPath), true);
    assert.deepEqual(writer.writes.map(item => [item.status, item.recoveryDisposition.phase]), [
      ['closure-pending', 'validated'], ['closure-pending', 'zeroized'], ['failed', 'zeroized'],
    ]);
    assert.equal(writer.document.lifecycle.credentialRemoved, false);
    assert.equal(writer.document.lifecycle.workspaceRemoved, false);
    assert.equal(writer.document.evidence.rows, 0);
    assert.equal(writer.document.evidence.written, false);
  } finally {
    cleanupPhase9RecoveryWorkspace(paths);
  }
});

test('phase 9 terminal recovery preserves resumable in-place state across zeroization and promotion failures', async () => {
  const { finalizePhase9TerminalRecovery } = await import('../scripts/qa-evidence/phase9/terminal-recovery-finalizer.mjs');
  const common = paths => ({
    ...phase9RecoveryOptions(paths),
    repositoryRoot: resolve(testDirectory, '..'),
    evidenceDirectory: resolve(testDirectory, '..', phase9EvidenceDirectorySuffix),
  });

  const credentialFailure = phase9RecoveryWorkspace();
  const credentialWriter = phase9MemoryRecoveryWriter(phase9LegacyRecoveryCertificate());
  try {
    await assert.rejects(finalizePhase9TerminalRecovery({
      ...common(credentialFailure), writerFactory: credentialWriter.factory,
      dispositionExecutor: async request => {
        assert.equal(request.operation, 'zeroize-credential');
        throw new Error('injected raw failure');
      },
    }), /terminal recovery failed/i);
    assert.equal(existsSync(credentialFailure.credentialPath), true);
    assert.equal(existsSync(credentialFailure.workspacePath), true);
    assert.equal(credentialWriter.document.status, 'closure-pending');
  } finally {
    cleanupPhase9RecoveryWorkspace(credentialFailure);
  }

  const zeroizedThenFailed = phase9RecoveryWorkspace();
  const zeroizedThenFailedWriter = phase9MemoryRecoveryWriter(phase9LegacyRecoveryCertificate());
  let zeroizationAttempts = 0;
  try {
    await assert.rejects(finalizePhase9TerminalRecovery({
      ...common(zeroizedThenFailed), writerFactory: zeroizedThenFailedWriter.factory,
      dispositionExecutor: async request => {
        assert.equal(request.operation, 'zeroize-credential');
        zeroizationAttempts += 1;
        await fsPromises.truncate(zeroizedThenFailed.credentialPath, 0);
        throw new Error('injected post-zeroization crash');
      },
    }), /terminal recovery failed/i);
    assert.equal(statSync(zeroizedThenFailed.credentialPath).size, 0);
    const resumedAfterZeroization = await finalizePhase9TerminalRecovery({
      ...common(zeroizedThenFailed), writerFactory: zeroizedThenFailedWriter.factory,
      dispositionExecutor: async request => {
        assert.equal(request.operation, 'zeroize-credential');
        assert.equal(statSync(zeroizedThenFailed.credentialPath).size, 0);
        zeroizationAttempts += 1;
        return true;
      },
    });
    assert.equal(resumedAfterZeroization.status, 'failed');
    assert.equal(zeroizationAttempts, 2);
    assert.equal(existsSync(zeroizedThenFailed.workspacePath), true);
  } finally {
    cleanupPhase9RecoveryWorkspace(zeroizedThenFailed);
  }

  const promotionFailure = phase9RecoveryWorkspace();
  const promotionWriter = phase9MemoryRecoveryWriter(
    phase9LegacyRecoveryCertificate(),
    next => next.status === 'failed',
  );
  await assert.rejects(finalizePhase9TerminalRecovery({
    ...common(promotionFailure), writerFactory: promotionWriter.factory,
    dispositionExecutor: async request => {
      assert.equal(request.operation, 'zeroize-credential');
      await fsPromises.truncate(promotionFailure.credentialPath, 0);
      return true;
    },
  }), /terminal recovery failed/i);
  assert.equal(existsSync(promotionFailure.workspacePath), true);
  assert.equal(promotionWriter.document.status, 'closure-pending');
  assert.equal(promotionWriter.document.recoveryDisposition.phase, 'zeroized');
  const resumedWriter = phase9MemoryRecoveryWriter(promotionWriter.document);
  const resumed = await finalizePhase9TerminalRecovery({
    ...common(promotionFailure), writerFactory: resumedWriter.factory,
    dispositionExecutor: async () => { throw new Error('must not repeat zeroization'); },
  });
  assert.equal(resumed.status, 'failed');
  assert.equal(resumedWriter.document.recoveryDisposition.phase, 'zeroized');
  const replayed = await finalizePhase9TerminalRecovery({
    ...common(promotionFailure), writerFactory: resumedWriter.factory,
    dispositionExecutor: async () => { throw new Error('must not mutate terminal result'); },
  });
  assert.deepEqual(replayed, resumed);
  writeFileSync(promotionFailure.credentialPath, 'foreign-after-zeroization\n', { mode: 0o600 });
  await assert.rejects(finalizePhase9TerminalRecovery({
    ...common(promotionFailure), writerFactory: resumedWriter.factory,
    dispositionExecutor: async () => { throw new Error('must not re-zeroize changed terminal state'); },
  }), /terminal recovery failed/i);
  truncateSync(promotionFailure.credentialPath, 0);
  const changedResultWriter = phase9MemoryRecoveryWriter(
    resumedWriter.document, () => false, () => true,
  );
  await assert.rejects(finalizePhase9TerminalRecovery({
    ...common(promotionFailure), writerFactory: changedResultWriter.factory,
    dispositionExecutor: async () => { throw new Error('must not mutate terminal replay'); },
  }), /terminal recovery failed/i);
  cleanupPhase9RecoveryWorkspace(promotionFailure);
});

test('phase 9 terminal recovery maps native path failures to one sanitized boundary error', async () => {
  const { finalizePhase9TerminalRecovery } = await import('../scripts/qa-evidence/phase9/terminal-recovery-finalizer.mjs');
  const paths = phase9RecoveryWorkspace();
  try {
    await assert.rejects(finalizePhase9TerminalRecovery({
      ...phase9RecoveryOptions(paths),
      repositoryRoot: resolve(testDirectory, '..'),
      evidenceDirectory: resolve(testDirectory, '..', phase9EvidenceDirectorySuffix),
      writerFactory: phase9MemoryRecoveryWriter(phase9LegacyRecoveryCertificate()).factory,
      filesystem: {
        ...paths.recovery.filesystem,
        async realpath() { throw new Error(`/private/raw-leak/${'secret'.repeat(10)}`); },
      },
    }), error => error instanceof Error && error.message === 'Terminal recovery failed.');
  } finally { cleanupPhase9RecoveryWorkspace(paths); }
});

test('phase 9 terminal recovery rejects dirty journals and foreign child paths before disposition', async () => {
  const { finalizePhase9TerminalRecovery } = await import('../scripts/qa-evidence/phase9/terminal-recovery-finalizer.mjs');
  const paths = phase9RecoveryWorkspace();
  const writer = phase9MemoryRecoveryWriter(phase9LegacyRecoveryCertificate());
  let dispositions = 0;
  const common = {
    ...phase9RecoveryOptions(paths),
    repositoryRoot: resolve(testDirectory, '..'),
    evidenceDirectory: resolve(testDirectory, '..', phase9EvidenceDirectorySuffix),
    writerFactory: writer.factory,
    dispositionExecutor: async () => { dispositions += 1; return true; },
  };
  try {
    await assert.rejects(finalizePhase9TerminalRecovery({
      ...common, credentialPath: join(dirname(common.workspacePath), 'foreign-credentials.json'),
    }), /terminal recovery failed/i);
    const manifest = phase9CleanedRecoveryManifest();
    manifest.state = 'seeded';
    writeFileSync(paths.manifestPath, `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
    await assert.rejects(finalizePhase9TerminalRecovery(common), /terminal recovery failed/i);
    manifest.state = 'cleaned';
    writeFileSync(paths.manifestPath, `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
    chmodSync(paths.credentialPath, 0o644);
    await assert.rejects(finalizePhase9TerminalRecovery(common), /terminal recovery failed/i);
    assert.equal(dispositions, 0);
    assert.equal(existsSync(paths.credentialPath), true);
  } finally { cleanupPhase9RecoveryWorkspace(paths); }
});

test('phase 9 terminal recovery rejects inconsistent post-operation retained identity proofs', async () => {
  const { finalizePhase9TerminalRecovery } = await import('../scripts/qa-evidence/phase9/terminal-recovery-finalizer.mjs');
  const common = (paths, writerFactory, filesystem, dispositionExecutor) => ({
    ...phase9RecoveryOptions(paths),
    repositoryRoot: resolve(testDirectory, '..'),
    evidenceDirectory: resolve(testDirectory, '..', phase9EvidenceDirectorySuffix),
    writerFactory,
    filesystem,
    dispositionExecutor,
  });

  const credentialSwap = phase9RecoveryWorkspace();
  const credentialWriter = phase9MemoryRecoveryWriter(phase9LegacyRecoveryCertificate());
  let credentialStats = 0;
  const credentialOperations = [];
  try {
    await assert.rejects(finalizePhase9TerminalRecovery(common(
      credentialSwap,
      credentialWriter.factory,
      {
        ...credentialSwap.recovery.filesystem,
        async lstat(path) {
          const metadata = await credentialSwap.recovery.filesystem.lstat(path);
          if (path === credentialSwap.recovery.credentialPath && ++credentialStats === 2) {
            return new Proxy(metadata, { get(target, key) { return key === 'ino' ? target.ino + 1 : target[key]; } });
          }
          return metadata;
        },
      },
      async request => {
        credentialOperations.push(request.operation);
        await fsPromises.truncate(credentialSwap.credentialPath, 0);
        return true;
      },
    )), /terminal recovery failed/i);
    assert.deepEqual(credentialOperations, []);
    assert.equal(existsSync(credentialSwap.credentialPath), true);
  } finally { cleanupPhase9RecoveryWorkspace(credentialSwap); }

  const workspaceSwap = phase9RecoveryWorkspace();
  const workspaceWriter = phase9MemoryRecoveryWriter(phase9LegacyRecoveryCertificate());
  let workspaceStats = 0;
  const workspaceOperations = [];
  try {
    await assert.rejects(finalizePhase9TerminalRecovery(common(
      workspaceSwap,
      workspaceWriter.factory,
      {
        ...workspaceSwap.recovery.filesystem,
        async lstat(path) {
          const metadata = await workspaceSwap.recovery.filesystem.lstat(path);
          if (path === workspaceSwap.recovery.workspacePath && ++workspaceStats === 3) {
            return new Proxy(metadata, { get(target, key) { return key === 'ino' ? target.ino + 1 : target[key]; } });
          }
          return metadata;
        },
      },
      async request => {
        workspaceOperations.push(request.operation);
        if (request.operation === 'zeroize-credential') await fsPromises.truncate(workspaceSwap.credentialPath, 0);
        return true;
      },
    )), /terminal recovery failed/i);
    assert.deepEqual(workspaceOperations, []);
    assert.equal(existsSync(workspaceSwap.workspacePath), true);
  } finally { cleanupPhase9RecoveryWorkspace(workspaceSwap); }

  for (const childName of ['credentials.json', 'manifest.json']) {
    const childSwap = phase9RecoveryWorkspace();
    const childWriter = phase9MemoryRecoveryWriter(phase9LegacyRecoveryCertificate());
    const childPath = join(childSwap.workspacePath, childName);
    const stolenPath = `${childPath}.stolen`;
    const originalBytes = readFileSync(childPath);
    try {
      await assert.rejects(finalizePhase9TerminalRecovery({
        ...phase9RecoveryOptions(childSwap),
        repositoryRoot: resolve(testDirectory, '..'),
        evidenceDirectory: resolve(testDirectory, '..', phase9EvidenceDirectorySuffix),
        writerFactory: childWriter.factory,
        dispositionExecutor: async request => {
          assert.equal(request.operation, 'zeroize-credential');
          await fsPromises.truncate(childSwap.credentialPath, 0);
          await fsPromises.rename(childPath, stolenPath);
          await fsPromises.writeFile(childPath, `foreign-${childName}\n`, { mode: 0o600, flag: 'wx' });
          return true;
        },
      }), /terminal recovery failed/i);
      assert.equal(readFileSync(childPath, 'utf8'), `foreign-${childName}\n`);
      if (childName === 'credentials.json') assert.equal(statSync(stolenPath).size, 0);
      else assert.deepEqual(readFileSync(stolenPath), originalBytes);
    } finally {
      cleanupPhase9RecoveryWorkspace(childSwap);
      rmSync(stolenPath, { force: true });
    }
  }

  for (const swapTiming of ['before-held-read', 'after-held-read']) {
    const manifestRace = phase9RecoveryWorkspace();
    const manifestWriter = phase9MemoryRecoveryWriter(phase9LegacyRecoveryCertificate());
    const stolenManifest = `${manifestRace.manifestPath}.${swapTiming}.stolen`;
    let swapped = false;
    try {
      await assert.rejects(finalizePhase9TerminalRecovery({
        ...phase9RecoveryOptions(manifestRace),
        repositoryRoot: resolve(testDirectory, '..'),
        evidenceDirectory: resolve(testDirectory, '..', phase9EvidenceDirectorySuffix),
        writerFactory: manifestWriter.factory,
        dispositionExecutor: async request => {
          assert.equal(request.operation, 'zeroize-credential');
          await fsPromises.truncate(manifestRace.credentialPath, 0);
          return true;
        },
        filesystem: {
          ...manifestRace.recovery.filesystem,
          async open(path, flags) {
            const handle = await manifestRace.recovery.filesystem.open(path, flags);
            if (path !== manifestRace.recovery.manifestPath) return handle;
            return new Proxy(handle, {
              get(target, key) {
                if (key === 'read') return async (...args) => {
                  const shouldSwap = !swapped && manifestWriter.writes.length === 2;
                  if (shouldSwap && swapTiming === 'before-held-read') {
                    renameSync(manifestRace.manifestPath, stolenManifest);
                    writeFileSync(manifestRace.manifestPath, 'foreign-manifest\n', { mode: 0o600, flag: 'wx' });
                    swapped = true;
                  }
                  const result = await target.read(...args);
                  if (shouldSwap && swapTiming === 'after-held-read') {
                    renameSync(manifestRace.manifestPath, stolenManifest);
                    writeFileSync(manifestRace.manifestPath, 'foreign-manifest\n', { mode: 0o600, flag: 'wx' });
                    swapped = true;
                  }
                  return result;
                };
                const value = target[key];
                return typeof value === 'function' ? value.bind(target) : value;
              },
            });
          },
        },
      }), /terminal recovery failed/i);
      assert.equal(swapped, true);
      assert.equal(readFileSync(manifestRace.manifestPath, 'utf8'), 'foreign-manifest\n');
      assert.equal(manifestWriter.document.status, 'closure-pending');
      assert.equal(manifestWriter.document.recoveryDisposition.phase, 'zeroized');
    } finally {
      cleanupPhase9RecoveryWorkspace(manifestRace);
      rmSync(stolenManifest, { force: true });
    }
  }
});

darwinRuntimeTest('phase 9 terminal recovery resumes durable sync after a helper crash immediately after truncate', async () => {
  const { finalizePhase9TerminalRecovery } = await import('../scripts/qa-evidence/phase9/terminal-recovery-finalizer.mjs');
  const paths = phase9RecoveryWorkspace();
  const writer = phase9MemoryRecoveryWriter(phase9LegacyRecoveryCertificate());
  const common = {
    ...paths,
    repositoryRoot: resolve(testDirectory, '..'),
    evidenceDirectory: resolve(testDirectory, '..', phase9EvidenceDirectorySuffix),
    writerFactory: writer.factory,
  };
  try {
    await assert.rejects(finalizePhase9TerminalRecovery({
      ...common,
      dispositionHelperEnvironment: { PHASE9_RECOVERY_TEST_FAIL_AFTER_CREDENTIAL_TRUNCATE: '1' },
    }), /terminal recovery failed/i);
    assert.equal(statSync(paths.credentialPath).size, 0);
    assert.equal(writer.document.status, 'closure-pending');
    assert.equal(writer.document.recoveryDisposition.phase, 'validated');
    const resumed = await finalizePhase9TerminalRecovery(common);
    assert.equal(resumed.status, 'failed');
    assert.equal(writer.document.recoveryDisposition.phase, 'zeroized');
    assert.equal(statSync(paths.credentialPath).size, 0);
  } finally {
    cleanupPhase9RecoveryWorkspace(paths);
  }
});

test('phase 9 terminal recovery binds every final manifest receipt to each checkpoint and replay', async () => {
  const { finalizePhase9TerminalRecovery } = await import('../scripts/qa-evidence/phase9/terminal-recovery-finalizer.mjs');
  const common = (paths, writerFactory, filesystem) => ({
    ...phase9RecoveryOptions(paths),
    repositoryRoot: resolve(testDirectory, '..'),
    evidenceDirectory: resolve(testDirectory, '..', phase9EvidenceDirectorySuffix),
    writerFactory,
    filesystem,
    dispositionExecutor: async request => {
      assert.equal(request.operation, 'zeroize-credential');
      await fsPromises.truncate(paths.credentialPath, 0);
      return true;
    },
  });
  const mutationCases = [
    { name: 'validated-checkpoint', triggerRead: 3, expectedWrites: 0 },
    { name: 'zeroized-checkpoint', triggerRead: 7, expectedWrites: 1 },
    { name: 'terminal-promotion', triggerRead: 9, expectedWrites: 2 },
  ];
  for (const mutationCase of mutationCases) {
    const paths = phase9RecoveryWorkspace();
    const writer = phase9MemoryRecoveryWriter(phase9LegacyRecoveryCertificate());
    let reads = 0;
    let mutated = false;
    const filesystem = {
      ...paths.recovery.filesystem,
      async open(path, flags) {
        const handle = await paths.recovery.filesystem.open(path, flags);
        if (path !== paths.recovery.manifestPath) return handle;
        return new Proxy(handle, {
          get(target, key) {
            if (key === 'read') return async (...args) => {
              reads += 1;
              if (!mutated && reads === mutationCase.triggerRead) {
                mutatePhase9RecoveryManifestSameInode(paths.manifestPath);
                mutated = true;
              }
              return target.read(...args);
            };
            const value = target[key];
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
      },
    };
    try {
      await assert.rejects(
        finalizePhase9TerminalRecovery(common(paths, writer.factory, filesystem)),
        /terminal recovery failed/i,
        mutationCase.name,
      );
      assert.equal(mutated, true, mutationCase.name);
      assert.equal(writer.writes.length, mutationCase.expectedWrites, mutationCase.name);
      assert.equal(lstatSync(paths.manifestPath).nlink, 1);
    } finally {
      cleanupPhase9RecoveryWorkspace(paths);
    }
  }

  const replayPaths = phase9RecoveryWorkspace();
  const initialWriter = phase9MemoryRecoveryWriter(phase9LegacyRecoveryCertificate());
  try {
    await finalizePhase9TerminalRecovery(common(
      replayPaths, initialWriter.factory, replayPaths.recovery.filesystem,
    ));
    const replayWriter = phase9MemoryRecoveryWriter(initialWriter.document);
    let replayReads = 0;
    let replayMutated = false;
    const replayFilesystem = {
      ...replayPaths.recovery.filesystem,
      async open(path, flags) {
        const handle = await replayPaths.recovery.filesystem.open(path, flags);
        if (path !== replayPaths.recovery.manifestPath) return handle;
        return new Proxy(handle, {
          get(target, key) {
            if (key === 'read') return async (...args) => {
              replayReads += 1;
              if (!replayMutated && replayReads === 5) {
                mutatePhase9RecoveryManifestSameInode(replayPaths.manifestPath);
                replayMutated = true;
              }
              return target.read(...args);
            };
            const value = target[key];
            return typeof value === 'function' ? value.bind(target) : value;
          },
        });
      },
    };
    await assert.rejects(finalizePhase9TerminalRecovery({
      ...common(replayPaths, replayWriter.factory, replayFilesystem),
      dispositionExecutor: async () => { throw new Error('terminal replay must not mutate'); },
    }), /terminal recovery failed/i);
    assert.equal(replayMutated, true);
    assert.equal(replayWriter.writes.length, 0);
  } finally {
    cleanupPhase9RecoveryWorkspace(replayPaths);
  }
});

darwinRuntimeTest('phase 9 terminal recovery leaves credential and workspace replacements untouched', async () => {
  const { executePhase9TerminalRecoveryDisposition } = await import('../scripts/qa-evidence/phase9/terminal-recovery-finalizer.mjs');
  const metadataIdentity = metadata => ({
    dev: metadata.dev, ino: metadata.ino, uid: metadata.uid, mode: metadata.mode & 0o777,
    nlink: metadata.nlink, size: metadata.size,
  });
  const credentialRace = phase9RecoveryWorkspace();
  const stolenCredential = `${credentialRace.workspacePath}.stolen-credential`;
  const credentialWorkspaceHandle = await fsPromises.open(credentialRace.workspacePath, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
  let credentialHandle;
  try {
    credentialHandle = await fsPromises.open(credentialRace.credentialPath, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW);
    const removing = assert.rejects(executePhase9TerminalRecoveryDisposition({
      operation: 'zeroize-credential', directoryHandle: credentialWorkspaceHandle,
      directoryIdentity: metadataIdentity(lstatSync(credentialRace.workspacePath)),
      credentialHandle, credentialIdentity: metadataIdentity(lstatSync(credentialRace.credentialPath)),
      name: 'credentials.json',
      helperEnvironment: { PHASE9_RECOVERY_TEST_BEFORE_CREDENTIAL_ZEROIZE_MS: '500' },
    }), /disposition helper/i);
    await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
    renameSync(credentialRace.credentialPath, stolenCredential);
    writeFileSync(credentialRace.credentialPath, 'foreign-replacement\n', { mode: 0o600, flag: 'wx' });
    await removing;
    assert.equal(readFileSync(credentialRace.credentialPath, 'utf8'), 'foreign-replacement\n');
    assert.equal(readFileSync(stolenCredential, 'utf8'), 'synthetic-test-credential-bytes\n');
  } finally {
    await credentialHandle?.close();
    await credentialWorkspaceHandle.close();
    cleanupPhase9RecoveryWorkspace(credentialRace);
    rmSync(stolenCredential, { force: true });
  }

  const workspaceRace = phase9RecoveryWorkspace();
  const stolenWorkspace = `${workspaceRace.workspacePath}.stolen-workspace`;
  const workspaceWriter = phase9MemoryRecoveryWriter(phase9LegacyRecoveryCertificate());
  const { finalizePhase9TerminalRecovery } = await import('../scripts/qa-evidence/phase9/terminal-recovery-finalizer.mjs');
  try {
    await assert.rejects(finalizePhase9TerminalRecovery({
      ...workspaceRace,
      repositoryRoot: resolve(testDirectory, '..'),
      evidenceDirectory: resolve(testDirectory, '..', phase9EvidenceDirectorySuffix),
      writerFactory: workspaceWriter.factory,
      dispositionExecutor: async request => {
        assert.equal(request.operation, 'zeroize-credential');
        await fsPromises.truncate(workspaceRace.credentialPath, 0);
        await fsPromises.rename(workspaceRace.workspacePath, stolenWorkspace);
        await fsPromises.mkdir(workspaceRace.workspacePath, { mode: 0o700 });
        await fsPromises.writeFile(join(workspaceRace.workspacePath, 'foreign.txt'), 'foreign-workspace\n', { mode: 0o600 });
        return true;
      },
    }), /terminal recovery failed/i);
    assert.equal(readFileSync(join(workspaceRace.workspacePath, 'foreign.txt'), 'utf8'), 'foreign-workspace\n');
    assert.deepEqual(readdirSync(stolenWorkspace), ['credentials.json', 'manifest.json']);
    assert.equal(statSync(join(stolenWorkspace, 'credentials.json')).size, 0);
  } finally {
    cleanupPhase9RecoveryWorkspace(workspaceRace);
    rmSync(stolenWorkspace, { recursive: true, force: true });
  }

  const exactRecovery = phase9RecoveryWorkspace();
  const canonicalize = value => (Array.isArray(value)
    ? value.map(canonicalize)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]))
      : value);
  writeFileSync(exactRecovery.resultPath, `${JSON.stringify(canonicalize(phase9LegacyRecoveryCertificate()))}\n`, { mode: 0o600 });
  try {
    const exactResult = await finalizePhase9TerminalRecovery({
      ...exactRecovery,
      repositoryRoot: resolve(testDirectory, '..'),
      evidenceDirectory: resolve(testDirectory, '..', phase9EvidenceDirectorySuffix),
    });
    assert.equal(exactResult.status, 'failed');
    assert.equal(existsSync(exactRecovery.workspacePath), true);
    assert.equal(statSync(exactRecovery.credentialPath).size, 0);
    assert.equal(readFileSync(exactRecovery.manifestPath, 'utf8'), `${JSON.stringify(phase9CleanedRecoveryManifest())}\n`);
    const exactDocument = JSON.parse(readFileSync(exactRecovery.resultPath, 'utf8'));
    assert.equal(exactDocument.lifecycle.credentialRemoved, false);
    assert.equal(exactDocument.lifecycle.workspaceRemoved, false);
    assert.equal(exactDocument.recoveryDisposition.phase, 'zeroized');
    assert.equal(exactDocument.recoveryDisposition.workspaceQuarantinedInPlace, true);
    assert.deepEqual(await finalizePhase9TerminalRecovery({
      ...exactRecovery,
      repositoryRoot: resolve(testDirectory, '..'),
      evidenceDirectory: resolve(testDirectory, '..', phase9EvidenceDirectorySuffix),
    }), exactResult);
  } finally {
    cleanupPhase9RecoveryWorkspace(exactRecovery);
  }
});

darwinRuntimeTest('phase 9 terminal certificate refuses a target swap without overwriting foreign bytes', async () => {
  const { createPhase9TerminalCertificateWriter } = await import('../scripts/qa-evidence/phase9/terminal-certificate-writer.mjs');
  const root = realpathSync(mkdtempSync('/tmp/phase9-terminal-certificate-swap.'));
  const parent = join(root, 'results');
  const workspace = join(root, 'workspace');
  mkdirSync(parent, { mode: 0o700 });
  mkdirSync(workspace, { mode: 0o700 });
  const resultPath = join(parent, 'hosted-result.json');
  let writer = null;
  try {
    const initial = await createPhase9TerminalCertificateWriter({
      resultPath, repositoryRoot: dirname(testDirectory), workspacePath: workspace,
      evidenceDirectory: join(dirname(testDirectory), phase9EvidenceDirectorySuffix),
    });
    await initial.write(task5TerminalCertificate('closure-pending'));
    await initial.close();
    writer = await createPhase9TerminalCertificateWriter({
      resultPath, repositoryRoot: dirname(testDirectory), workspacePath: workspace,
      evidenceDirectory: join(dirname(testDirectory), phase9EvidenceDirectorySuffix),
      helperEnvironment: { PHASE9_CERTIFICATE_TEST_BEFORE_PROMOTION_MS: '500' },
    });
    const writing = writer.write(task5TerminalCertificate('complete'));
    const deadline = Date.now() + 2_000;
    while (!readdirSync(parent).some(name => name.endsWith('.tmp'))) {
      assert.equal(Date.now() < deadline, true, 'certificate helper did not reach the promotion rendezvous');
      await new Promise(resolvePromise => setTimeout(resolvePromise, 5));
    }
    renameSync(resultPath, join(parent, 'stolen-checkpoint.json'));
    writeFileSync(resultPath, 'foreign\n', { mode: 0o600 });
    await assert.rejects(writing, /terminal certificate/i);
    assert.equal(readFileSync(resultPath, 'utf8'), 'foreign\n');
    assert.equal(JSON.parse(readFileSync(join(parent, 'stolen-checkpoint.json'), 'utf8')).status, 'closure-pending');
  } finally {
    await writer?.close();
    rmSync(root, { recursive: true, force: true });
  }
});

darwinRuntimeTest('phase 9 terminal certificate conditionally promotes only the held exact checkpoint identity', async () => {
  const { createPhase9TerminalCertificateWriter } = await import('../scripts/qa-evidence/phase9/terminal-certificate-writer.mjs');
  const root = realpathSync(mkdtempSync('/tmp/phase9-terminal-certificate-conditional-swap.'));
  const parent = join(root, 'results');
  const workspace = join(root, 'workspace');
  mkdirSync(parent, { mode: 0o700 });
  mkdirSync(workspace, { mode: 0o700 });
  const resultPath = join(parent, 'hosted-result.json');
  let writer = null;
  try {
    const initial = await createPhase9TerminalCertificateWriter({
      resultPath, repositoryRoot: dirname(testDirectory), workspacePath: workspace,
      evidenceDirectory: join(dirname(testDirectory), phase9EvidenceDirectorySuffix),
    });
    const checkpoint = task5TerminalCertificate('closure-pending', {
      primaryCategory: 'scenario-failed',
      primaryStage: 'scenario-action',
      diagnostic: {
        contextOrdinal: 0,
        contextId: 'admission-route-qa-parent-a-mobile',
        checkpoint: 'window-request-failure',
        reason: 'request-failure-invalid',
        requestFailure: { ...canonicalRequestFailureSummary },
      },
    });
    await initial.write(checkpoint);
    await initial.close();
    writer = await createPhase9TerminalCertificateWriter({
      resultPath, repositoryRoot: dirname(testDirectory), workspacePath: workspace,
      evidenceDirectory: join(dirname(testDirectory), phase9EvidenceDirectorySuffix),
      helperEnvironment: { PHASE9_CERTIFICATE_TEST_AFTER_CHECKPOINT_VALIDATION_MS: '500' },
    });
    const writing = writer.write(task5TerminalCertificate('complete'));
    const deadline = Date.now() + 2_000;
    while (!readdirSync(parent).includes('.hosted-result.json.checkpoint') || existsSync(resultPath)) {
      assert.equal(Date.now() < deadline, true, 'certificate helper did not reach the post-validation rendezvous');
      await new Promise(resolvePromise => setTimeout(resolvePromise, 5));
    }
    writeFileSync(resultPath, 'foreign\n', { mode: 0o600, flag: 'wx' });
    await assert.rejects(writing, /terminal certificate/i);
    assert.equal(readFileSync(resultPath, 'utf8'), 'foreign\n');
    const recoveryName = '.hosted-result.json.checkpoint';
    assert.deepEqual(JSON.parse(readFileSync(join(parent, recoveryName), 'utf8')), checkpoint);
    renameSync(resultPath, join(root, 'foreign-result.json'));
    await writer.close();
    writer = await createPhase9TerminalCertificateWriter({
      resultPath, repositoryRoot: dirname(testDirectory), workspacePath: workspace,
      evidenceDirectory: join(dirname(testDirectory), phase9EvidenceDirectorySuffix),
    });
    assert.deepEqual(writer.checkpoint, checkpoint);
    await writer.write(task5TerminalCertificate('complete'));
    assert.equal(JSON.parse(readFileSync(resultPath, 'utf8')).status, 'complete');
    assert.deepEqual(readdirSync(parent), ['hosted-result.json']);
  } finally {
    await writer?.close();
    rmSync(root, { recursive: true, force: true });
  }
});

darwinRuntimeTest('phase 9 terminal certificate never publishes a swapped recovery companion during rollback', async () => {
  const { createPhase9TerminalCertificateWriter } = await import('../scripts/qa-evidence/phase9/terminal-certificate-writer.mjs');
  const root = realpathSync(mkdtempSync('/tmp/phase9-terminal-certificate-recovery-swap.'));
  const parent = join(root, 'results');
  const workspace = join(root, 'workspace');
  mkdirSync(parent, { mode: 0o700 });
  mkdirSync(workspace, { mode: 0o700 });
  const resultPath = join(parent, 'hosted-result.json');
  const recoveryPath = join(parent, '.hosted-result.json.checkpoint');
  const stolenRecoveryPath = join(root, 'stolen-checkpoint.json');
  const checkpoint = task5TerminalCertificate('closure-pending');
  let writer = null;
  try {
    const initial = await createPhase9TerminalCertificateWriter({
      resultPath, repositoryRoot: dirname(testDirectory), workspacePath: workspace,
      evidenceDirectory: join(dirname(testDirectory), phase9EvidenceDirectorySuffix),
    });
    await initial.write(checkpoint);
    await initial.close();
    writer = await createPhase9TerminalCertificateWriter({
      resultPath, repositoryRoot: dirname(testDirectory), workspacePath: workspace,
      evidenceDirectory: join(dirname(testDirectory), phase9EvidenceDirectorySuffix),
      helperEnvironment: { PHASE9_CERTIFICATE_TEST_AFTER_CHECKPOINT_VALIDATION_MS: '500' },
    });
    const firstPromotion = writer.write(task5TerminalCertificate('complete'));
    const collisionDeadline = Date.now() + 2_000;
    while (!existsSync(recoveryPath) || existsSync(resultPath)) {
      assert.equal(Date.now() < collisionDeadline, true, 'certificate helper did not detach the checkpoint');
      await new Promise(resolvePromise => setTimeout(resolvePromise, 5));
    }
    writeFileSync(resultPath, 'first-foreign\n', { mode: 0o600, flag: 'wx' });
    await assert.rejects(firstPromotion, /terminal certificate/i);
    renameSync(resultPath, join(root, 'first-foreign.json'));
    await writer.close();

    writer = await createPhase9TerminalCertificateWriter({
      resultPath, repositoryRoot: dirname(testDirectory), workspacePath: workspace,
      evidenceDirectory: join(dirname(testDirectory), phase9EvidenceDirectorySuffix),
      helperEnvironment: { PHASE9_CERTIFICATE_TEST_AFTER_CHECKPOINT_VALIDATION_MS: '500' },
    });
    const resumedPromotion = writer.write(task5TerminalCertificate('complete'));
    const resumeDeadline = Date.now() + 2_000;
    while (!readdirSync(parent).some(name => name.endsWith('.tmp'))) {
      assert.equal(Date.now() < resumeDeadline, true, 'recovery helper did not reach its validation rendezvous');
      await new Promise(resolvePromise => setTimeout(resolvePromise, 5));
    }
    renameSync(recoveryPath, stolenRecoveryPath);
    writeFileSync(recoveryPath, 'recovery-foreign\n', { mode: 0o600, flag: 'wx' });
    await assert.rejects(resumedPromotion, /terminal certificate/i);
    assert.equal(existsSync(resultPath), false);
    assert.equal(readFileSync(recoveryPath, 'utf8'), 'recovery-foreign\n');
    assert.deepEqual(JSON.parse(readFileSync(stolenRecoveryPath, 'utf8')), checkpoint);
  } finally {
    await writer?.close();
    rmSync(root, { recursive: true, force: true });
  }
});

darwinRuntimeTest('phase 9 terminal certificate refuses an absent-target creation race without overwriting foreign bytes', async () => {
  const { createPhase9TerminalCertificateWriter } = await import('../scripts/qa-evidence/phase9/terminal-certificate-writer.mjs');
  const root = realpathSync(mkdtempSync('/tmp/phase9-terminal-certificate-absent-race.'));
  const parent = join(root, 'results');
  const workspace = join(root, 'workspace');
  mkdirSync(parent, { mode: 0o700 });
  mkdirSync(workspace, { mode: 0o700 });
  const resultPath = join(parent, 'hosted-result.json');
  let writer = null;
  try {
    writer = await createPhase9TerminalCertificateWriter({
      resultPath, repositoryRoot: dirname(testDirectory), workspacePath: workspace,
      evidenceDirectory: join(dirname(testDirectory), phase9EvidenceDirectorySuffix),
      helperEnvironment: { PHASE9_CERTIFICATE_TEST_BEFORE_PROMOTION_MS: '500' },
    });
    const writing = writer.write(task5TerminalCertificate('closure-pending'));
    const deadline = Date.now() + 2_000;
    while (!readdirSync(parent).some(name => name.endsWith('.tmp'))) {
      assert.equal(Date.now() < deadline, true, 'certificate helper did not reach the initial promotion rendezvous');
      await new Promise(resolvePromise => setTimeout(resolvePromise, 5));
    }
    writeFileSync(resultPath, 'foreign\n', { mode: 0o600, flag: 'wx' });
    await assert.rejects(writing, /terminal certificate/i);
    assert.equal(readFileSync(resultPath, 'utf8'), 'foreign\n');
  } finally {
    await writer?.close();
    rmSync(root, { recursive: true, force: true });
  }
});

darwinRuntimeTest('phase 9 terminal certificate admits only absent or exact resumable checkpoint targets', async () => {
  const { createPhase9TerminalCertificateWriter } = await import('../scripts/qa-evidence/phase9/terminal-certificate-writer.mjs');
  const root = realpathSync(mkdtempSync('/tmp/phase9-terminal-certificate-resume.'));
  const workspace = join(root, 'workspace');
  mkdirSync(workspace, { mode: 0o700 });
  const common = { repositoryRoot: dirname(testDirectory), workspacePath: workspace, evidenceDirectory: join(dirname(testDirectory), phase9EvidenceDirectorySuffix) };
  try {
    const symlinkParent = join(root, 'symlink-result'); mkdirSync(symlinkParent, { mode: 0o700 });
    const outside = join(root, 'outside'); writeFileSync(outside, 'foreign\n', { mode: 0o600 });
    symlinkSync(outside, join(symlinkParent, 'result.json'));
    await assert.rejects(createPhase9TerminalCertificateWriter({ ...common, resultPath: join(symlinkParent, 'result.json') }), /checkpoint/i);

    const oversizeParent = join(root, 'oversize-result'); mkdirSync(oversizeParent, { mode: 0o700 });
    writeFileSync(join(oversizeParent, 'result.json'), 'x'.repeat(32_769), { mode: 0o600 });
    await assert.rejects(createPhase9TerminalCertificateWriter({ ...common, resultPath: join(oversizeParent, 'result.json') }), /checkpoint/i);

    const terminalParent = join(root, 'terminal-result'); mkdirSync(terminalParent, { mode: 0o700 });
    const terminalPath = join(terminalParent, 'result.json');
    const writer = await createPhase9TerminalCertificateWriter({ ...common, resultPath: terminalPath });
    await writer.write(task5TerminalCertificate('closure-pending'));
    await writer.write(task5TerminalCertificate('complete'));
    await writer.close();
    await assert.rejects(createPhase9TerminalCertificateWriter({ ...common, resultPath: terminalPath }), /resumable/i);

    const legacyParent = join(root, 'legacy-result'); mkdirSync(legacyParent, { mode: 0o700 });
    const legacyPath = join(legacyParent, 'result.json');
    const canonicalize = value => (Array.isArray(value)
      ? value.map(canonicalize)
      : value && typeof value === 'object'
        ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]))
        : value);
    writeFileSync(legacyPath, `${JSON.stringify(canonicalize(phase9LegacyRecoveryCertificate()))}\n`, { mode: 0o600 });
    const legacyWriter = await createPhase9TerminalCertificateWriter({
      ...common, resultPath: legacyPath, allowLegacyFailedRecovery: true, allowTerminalReplay: true,
    });
    assert.equal(legacyWriter.result.version, 1);
    const migrated = {
      ...phase9LegacyRecoveryCertificate(),
      version: 2,
      status: 'closure-pending',
      category: 'pending',
      primaryCategory: 'legacy-primary-unavailable',
      primaryStage: 'inspected',
    };
    await legacyWriter.write(migrated);
    await legacyWriter.write({
      ...migrated,
      status: 'failed',
      category: 'terminal-certificate-failed',
      lifecycle: { ...migrated.lifecycle, credentialRemoved: true, workspaceRemoved: true },
    });
    await legacyWriter.close();
    const replayWriter = await createPhase9TerminalCertificateWriter({
      ...common, resultPath: legacyPath, allowLegacyFailedRecovery: true, allowTerminalReplay: true,
    });
    assert.equal(replayWriter.result.status, 'failed');
    assert.equal(replayWriter.result.primaryCategory, 'legacy-primary-unavailable');
    const replayBytes = readFileSync(legacyPath);
    renameSync(legacyPath, `${legacyPath}.stolen`);
    writeFileSync(legacyPath, replayBytes, { mode: 0o600, flag: 'wx' });
    await assert.rejects(replayWriter.revalidate(), /identity/i);
    await replayWriter.close();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

darwinRuntimeTest('phase 9 terminal certificate kills and joins a hung helper without creating output', async () => {
  const { createPhase9TerminalCertificateWriter } = await import('../scripts/qa-evidence/phase9/terminal-certificate-writer.mjs');
  const root = realpathSync(mkdtempSync('/tmp/phase9-terminal-certificate-hang.'));
  const parent = join(root, 'results');
  const workspace = join(root, 'workspace');
  mkdirSync(parent, { mode: 0o700 });
  mkdirSync(workspace, { mode: 0o700 });
  let writer = null;
  try {
    writer = await createPhase9TerminalCertificateWriter({
      resultPath: join(parent, 'result.json'), repositoryRoot: dirname(testDirectory), workspacePath: workspace,
      evidenceDirectory: join(dirname(testDirectory), phase9EvidenceDirectorySuffix),
      helperEnvironment: { PHASE9_CERTIFICATE_TEST_HANG: '1' }, helperTimeoutMs: 200,
    });
    await assert.rejects(writer.write(task5TerminalCertificate('closure-pending')), /timed out/i);
    assert.deepEqual(readdirSync(parent), []);
  } finally {
    await writer?.close();
    rmSync(root, { recursive: true, force: true });
  }
});

darwinRuntimeTest('phase 9 evidence writer atomically writes only the four approved sanitized Markdown files', async () => {
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

darwinRuntimeTest('phase 9 real Chrome applies both exact viewports and retains the same process set across attachment', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
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

darwinRuntimeTest('phase 9 real Chrome applies and reads back each exact viewport on every new tab before navigation', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
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
  assert.match(PHASE9_ARTIFACT_PINS.terminalHelper, /^[0-9a-f]{64}$/);
  assert.match(PHASE9_ARTIFACT_PINS.recoveryHelper, /^[0-9a-f]{64}$/);
  assert.match(PHASE9_ARTIFACT_PINS.playwrightCleanupHelper, /^[0-9a-f]{64}$/);
  assert.match(PHASE9_ARTIFACT_PINS.processInspector, /^[0-9a-f]{64}$/);
  assert.equal(
    sha256File(join(testDirectory, '..', 'scripts', 'qa-evidence', 'phase9', 'darwin-process-inspector.py')),
    PHASE9_ARTIFACT_PINS.processInspector,
  );
  assert.equal(
    sha256File(join(testDirectory, '..', 'scripts', 'qa-evidence', 'phase9', 'terminal-certificate-dirfd-helper.py')),
    PHASE9_ARTIFACT_PINS.terminalHelper,
  );
  assert.equal(
    sha256File(join(testDirectory, '..', 'scripts', 'qa-evidence', 'phase9', 'terminal-recovery-dirfd-helper.py')),
    PHASE9_ARTIFACT_PINS.recoveryHelper,
  );
  assert.equal(phase9PlaywrightTransport.version, '0.1.18');
  assert.equal(phase9PlaywrightTransport.coreVersion, '1.63.0-alpha-2026-08-05');
  assert.match(phase9PlaywrightTransport.artifactPath, /playwright-transport\.bundle\.json\.gz$/);
});

test('phase 9 child runner pins every deterministic build input to committed bytes', async () => {
  const { PHASE9_ARTIFACT_PINS } = await import('../scripts/qa-evidence/phase9/cli.mjs');
  const phase9Root = join(testDirectory, '..', 'scripts', 'qa-evidence', 'phase9');
  for (const [pin, name] of [
    ['child', 'child-runner.mjs'],
    ['childSource', 'child-runner-source.mjs'],
    ['childBuilder', 'build-child-runner.mjs'],
    ['playwrightClient', 'playwright-cli-client.mjs'],
    ['scenarioContracts', 'scenario-contracts.mjs'],
    ['scenarios', 'scenarios.mjs'],
  ]) {
    assert.equal(PHASE9_ARTIFACT_PINS[pin], sha256File(join(phase9Root, name)), pin);
  }
});

test('phase 9 child runner build transform preserves messages read by control flow', async () => {
  const { minimizeGeneratedErrorMessages } = await import(
    '../scripts/qa-evidence/phase9/build-child-runner.mjs'
  );
  const controlMessage = 'New tab viewport application failed and the browser was closed.';
  const source = Buffer.from(`
    export const retainsControlFlow = () => {
      try { throw new Error(${JSON.stringify(controlMessage)}); }
      catch (error) {
        if (error?.message === ${JSON.stringify(controlMessage)}) return true;
        throw error;
      }
    };
    export const discardedDebugMessage = () => new Error('generated-only private debug').message;
  `);
  const transformed = minimizeGeneratedErrorMessages(source);
  assert.equal(Buffer.isBuffer(transformed), true);
  assert.equal(transformed.includes(Buffer.from(controlMessage)), true);
  assert.equal(transformed.includes(Buffer.from('generated-only private debug')), false);
  const transformedModule = await import(`data:text/javascript;base64,${transformed.toString('base64')}`);
  assert.equal(transformedModule.retainsControlFlow(), true);
  assert.equal(transformedModule.discardedDebugMessage(), '');
  assert.throws(() => minimizeGeneratedErrorMessages(Buffer.from(`
    try { throw new Error('unlisted control message'); }
    catch (error) { if (error.message === 'unlisted control message') throw error; }
  `)), /control-flow error message/i);
});

const portableConfinedPlaywrightFilesystem = Object.freeze({
  ...fsPromises,
  removePlaywrightTree: ({ rootReceipt }) => fsPromises.rm(
    rootReceipt.path, { recursive: true, force: false },
  ),
});

test('phase 9 confined cleanup removes deterministic private Playwright CLI output', async () => {
  const { removeConfinedPlaywrightTree } = await import(
    '../scripts/qa-evidence/phase9/lifecycle-guardian.mjs'
  );
  assert.equal(typeof removeConfinedPlaywrightTree, 'function');
  const workspace = mkdtempSync('/tmp/phase9-core-identities.profile-output-');
  const profileRoot = join(workspace, 'playwright-tmp');
  try {
    mkdirSync(profileRoot, { mode: 0o700 });
    mkdirSync(join(profileRoot, 'pw-1234abcd'), { mode: 0o755 });
    mkdirSync(join(profileRoot, '.playwright-cli'), { mode: 0o700 });
    writeFileSync(
      join(profileRoot, '.playwright-cli', 'console-2026-08-29T00-16-08-874Z.log'),
      'synthetic console output\n', { mode: 0o600 },
    );
    writeFileSync(
      join(profileRoot, '.playwright-cli', 'page-2026-08-29T00-16-10-726Z.yml'),
      'synthetic page output\n', { mode: 0o600 },
    );
    await removeConfinedPlaywrightTree(portableConfinedPlaywrightFilesystem, profileRoot);
    assert.equal(existsSync(profileRoot), false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

const confinedPlaywrightFixture = () => {
  const workspace = mkdtempSync('/tmp/phase9-core-identities.profile-adversarial-');
  const profileRoot = join(workspace, 'playwright-tmp');
  const cliRoot = join(profileRoot, '.playwright-cli');
  const cliFile = join(cliRoot, 'page-2026-08-29T00-16-10-726Z.yml');
  mkdirSync(profileRoot, { mode: 0o700 });
  mkdirSync(join(profileRoot, 'pw-1234abcd'), { mode: 0o700 });
  mkdirSync(cliRoot, { mode: 0o700 });
  writeFileSync(cliFile, 'synthetic page output\n', { mode: 0o600 });
  return { workspace, profileRoot, cliRoot, cliFile };
};

test('phase 9 confined cleanup preserves every malformed private Playwright tree', async t => {
  const { removeConfinedPlaywrightTree } = await import(
    '../scripts/qa-evidence/phase9/lifecycle-guardian.mjs'
  );
  const cases = [
    ['symlink', fixture => symlinkSync('/private/tmp', join(fixture.cliRoot, 'page-2026-08-29T00-16-11-726Z.yml'))],
    ['foreign filename', fixture => writeFileSync(join(fixture.cliRoot, 'foreign.txt'), 'foreign\n', { mode: 0o600 })],
    ['file mode', fixture => chmodSync(fixture.cliFile, 0o640)],
    ['hard link', fixture => linkSync(fixture.cliFile, join(fixture.cliRoot, 'page-2026-08-29T00-16-11-726Z.yml'))],
    ['directory type', fixture => mkdirSync(join(fixture.cliRoot, 'page-2026-08-29T00-16-11-726Z.yml'), { mode: 0o700 })],
    ['oversize file', fixture => truncateSync(fixture.cliFile, 1_048_577)],
    ['excess file count', fixture => {
      for (let index = 0; index < 256; index += 1) writeFileSync(
        join(fixture.cliRoot, `page-2026-08-29T00-16-${String(index % 60).padStart(2, '0')}-${String(index).padStart(3, '0')}Z.yml`),
        '', { mode: 0o600 },
      );
    }],
  ];
  for (const [name, mutate] of cases) await t.test(name, async () => {
    const fixture = confinedPlaywrightFixture();
    try {
      mutate(fixture);
      await assert.rejects(
        removeConfinedPlaywrightTree(portableConfinedPlaywrightFilesystem, fixture.profileRoot),
        /scenario-closure-failed/,
      );
      assert.equal(existsSync(fixture.profileRoot), true);
    } finally {
      rmSync(fixture.workspace, { recursive: true, force: true });
    }
  });
  await t.test('owner', async () => {
    const fixture = confinedPlaywrightFixture();
    const filesystem = {
      ...portableConfinedPlaywrightFilesystem,
      async lstat(path) {
        const metadata = await fsPromises.lstat(path);
        if (path !== fixture.cliFile) return metadata;
        return {
          dev: metadata.dev, ino: metadata.ino, uid: process.getuid() + 1,
          mode: metadata.mode, nlink: metadata.nlink, size: metadata.size,
          mtimeMs: metadata.mtimeMs, ctimeMs: metadata.ctimeMs,
          isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false,
        };
      },
    };
    try {
      await assert.rejects(
        removeConfinedPlaywrightTree(filesystem, fixture.profileRoot),
        /scenario-closure-failed/,
      );
      assert.equal(existsSync(fixture.profileRoot), true);
    } finally {
      rmSync(fixture.workspace, { recursive: true, force: true });
    }
  });
});

test('phase 9 confined cleanup preserves same-inode and pathname replacements before removal', async t => {
  const { removeConfinedPlaywrightTree } = await import(
    '../scripts/qa-evidence/phase9/lifecycle-guardian.mjs'
  );
  await t.test('same-inode content replacement', async () => {
    const fixture = confinedPlaywrightFixture();
    let targetLstats = 0;
    let rmCalls = 0;
    const filesystem = {
      ...portableConfinedPlaywrightFilesystem,
      async lstat(path) {
        if (path === fixture.cliFile && ++targetLstats === 4) {
          writeFileSync(path, 'foreign page output!!\n', { mode: 0o600 });
        }
        return fsPromises.lstat(path);
      },
      async rm(...args) { rmCalls += 1; return fsPromises.rm(...args); },
    };
    try {
      await assert.rejects(
        removeConfinedPlaywrightTree(filesystem, fixture.profileRoot),
        /scenario-closure-failed/,
      );
      assert.equal(rmCalls, 0);
      assert.equal(existsSync(fixture.profileRoot), true);
    } finally {
      rmSync(fixture.workspace, { recursive: true, force: true });
    }
  });
  await t.test('child pathname replacement', async () => {
    const fixture = confinedPlaywrightFixture();
    const held = `${fixture.cliFile}.held`;
    let targetLstats = 0;
    let rmCalls = 0;
    const filesystem = {
      ...portableConfinedPlaywrightFilesystem,
      async lstat(path) {
        if (path === fixture.cliFile && ++targetLstats === 4) {
          renameSync(path, held);
          writeFileSync(path, 'foreign page output\n', { mode: 0o600 });
        }
        return fsPromises.lstat(path);
      },
      async rm(...args) { rmCalls += 1; return fsPromises.rm(...args); },
    };
    try {
      await assert.rejects(
        removeConfinedPlaywrightTree(filesystem, fixture.profileRoot),
        /scenario-closure-failed/,
      );
      assert.equal(rmCalls, 0);
      assert.equal(readFileSync(fixture.cliFile, 'utf8'), 'foreign page output\n');
      assert.equal(readFileSync(held, 'utf8'), 'synthetic page output\n');
    } finally {
      rmSync(fixture.workspace, { recursive: true, force: true });
    }
  });
  await t.test('parent pathname replacement', async () => {
    const fixture = confinedPlaywrightFixture();
    const heldWorkspace = `${fixture.workspace}.held`;
    let parentLstats = 0;
    let rmCalls = 0;
    const filesystem = {
      ...portableConfinedPlaywrightFilesystem,
      async lstat(path) {
        if (path === fixture.workspace && ++parentLstats === 3) {
          renameSync(path, heldWorkspace);
          mkdirSync(fixture.workspace, { mode: 0o700 });
          mkdirSync(fixture.profileRoot, { mode: 0o700 });
          writeFileSync(join(fixture.profileRoot, 'foreign.txt'), 'foreign\n', { mode: 0o600 });
        }
        return fsPromises.lstat(path);
      },
      async rm(...args) { rmCalls += 1; return fsPromises.rm(...args); },
    };
    try {
      await assert.rejects(
        removeConfinedPlaywrightTree(filesystem, fixture.profileRoot),
        /scenario-closure-failed/,
      );
      assert.equal(rmCalls, 0);
      assert.equal(readFileSync(join(fixture.profileRoot, 'foreign.txt'), 'utf8'), 'foreign\n');
      assert.equal(existsSync(join(heldWorkspace, 'playwright-tmp', '.playwright-cli')), true);
    } finally {
      rmSync(fixture.workspace, { recursive: true, force: true });
      rmSync(heldWorkspace, { recursive: true, force: true });
    }
  });
  await t.test('root replacement at the removal boundary', async () => {
    const fixture = confinedPlaywrightFixture();
    const heldRoot = `${fixture.profileRoot}.held`;
    const foreignFile = join(fixture.profileRoot, 'foreign.txt');
    const filesystem = {
      ...portableConfinedPlaywrightFilesystem,
      async removePlaywrightTree({ rootReceipt }) {
        renameSync(rootReceipt.path, heldRoot);
        mkdirSync(rootReceipt.path, { mode: 0o700 });
        writeFileSync(foreignFile, 'foreign\n', { mode: 0o600 });
        throw new Error('descriptor identity mismatch');
      },
    };
    try {
      await assert.rejects(
        removeConfinedPlaywrightTree(filesystem, fixture.profileRoot),
        /scenario-closure-failed/,
      );
      assert.equal(readFileSync(foreignFile, 'utf8'), 'foreign\n');
      assert.equal(existsSync(join(heldRoot, '.playwright-cli')), true);
    } finally {
      rmSync(fixture.workspace, { recursive: true, force: true });
      rmSync(heldRoot, { recursive: true, force: true });
    }
  });
  await t.test('partial helper failure remains uncertified and recoverable', async () => {
    const fixture = confinedPlaywrightFixture();
    const filesystem = {
      ...portableConfinedPlaywrightFilesystem,
      async removePlaywrightTree() {
        rmSync(fixture.cliFile);
        throw new Error('synthetic partial descriptor cleanup');
      },
    };
    try {
      await assert.rejects(
        removeConfinedPlaywrightTree(filesystem, fixture.profileRoot),
        /scenario-closure-failed/,
      );
      assert.equal(existsSync(fixture.profileRoot), true);
      assert.equal(existsSync(join(fixture.profileRoot, 'pw-1234abcd')), true);
      assert.equal(existsSync(fixture.cliRoot), true);
    } finally {
      rmSync(fixture.workspace, { recursive: true, force: true });
    }
  });
});

test('phase 9 offline profile cleanup preserves state when browser closure is uncertain', async () => {
  const { closeAndCleanOfflineProfile } = await import('../scripts/qa-evidence/phase9/cli.mjs');
  let cleanupCalls = 0;
  await assert.rejects(
    closeAndCleanOfflineProfile({
      client: {},
      closeBrowsers: async () => { throw new Error('synthetic closure uncertainty'); },
      cleanupProfile: async () => { cleanupCalls += 1; },
      profileRoot: '/tmp/phase9-core-identities.synthetic/playwright-tmp',
    }),
    /Offline smoke profile cleanup is incomplete/,
  );
  assert.equal(cleanupCalls, 0);
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
  const authorizationStage = source.indexOf("failureStage = 'authorization';", openStart);
  const privateInputRevalidation = source.indexOf('await privateInputs.revalidate();', openStart);
  const ownershipIntent = source.indexOf("type: 'ownership-intent', version: 4", openStart);
  const authorization = source.indexOf('await requireOwnershipAuthorization(session, ownershipSequence);', ownershipIntent);
  const acquired = source.indexOf('await acquireBlankBrowser(client, session);', authorization);
  const receipt = source.indexOf('const launchReceipt = await captureLaunchReceipt(session);', acquired);
  const ownershipAdd = source.indexOf("type: 'ownership-add', version: 4", receipt);
  const arm = source.indexOf('await armAcquiredSignalRecorder(client, session);', ownershipAdd);
  assert.ok(openStart >= 0 && openStart < authorizationStage
    && authorizationStage < privateInputRevalidation
    && privateInputRevalidation < ownershipIntent && ownershipIntent < authorization
    && authorization < acquired && acquired < receipt && receipt < ownershipAdd && ownershipAdd < arm);
  const logoutStart = source.indexOf("} else if (row.group === 'logout')");
  const freshOpen = source.indexOf('await openWithReceipt(freshSession);', logoutStart);
  const freshViewportStage = source.indexOf("failureStage = 'viewport';", freshOpen);
  const freshViewport = source.indexOf('await setAndVerifyViewport(client, freshSession, viewport)', freshOpen);
  const recorderStage = source.indexOf("failureStage = 'recorder';", freshViewport);
  const recorderInstall = source.indexOf('await installSignalRecorder(client, session);', freshViewport);
  assert.ok(logoutStart >= 0 && logoutStart < freshOpen && freshOpen < freshViewportStage
    && freshViewportStage < freshViewport && freshViewport < recorderStage
    && recorderStage < recorderInstall);
  const ownershipComplete = source.indexOf("type: 'ownership-complete', version: 4", recorderInstall);
  const finalization = source.indexOf('await closePrivateResources();', ownershipComplete);
  const completion = source.indexOf("type: 'completion', version: 4", ownershipComplete);
  assert.ok(ownershipComplete >= 0 && ownershipComplete < finalization && finalization < completion);
  const attachStart = source.indexOf('const confirmAttachedOwnership = session =>');
  const ownershipAttach = source.indexOf("type: 'ownership-attach', version: 4", attachStart);
  const attachAction = source.indexOf('await attachExistingSignalRecorder(client, session', ownershipAttach);
  assert.ok(attachStart >= 0 && attachStart < ownershipAttach && ownershipAttach < attachAction);
});

darwinRuntimeTest('phase 9 exact production child emits protocol-v4 ownership intent before browser acquisition', { timeout: 30_000 }, async () => {
  const repositoryRoot = join(testDirectory, '..');
  const workspace = mkdtempSync('/tmp/phase9-core-identities.child-startup-');
  const manifestPath = join(workspace, 'manifest.json');
  const credentialsPath = join(workspace, 'credentials.json');
  const profileRoot = join(workspace, 'playwright-tmp');
  const runId = 'qa-phase7-20260828T120000Z-childstartup';
  const definition = buildFixtureDefinition({
    runId,
    expiresAt: '2026-08-29T12:00:00.000Z',
    manifestVersion: 3,
  });
  chmodSync(workspace, 0o700);
  mkdirSync(profileRoot, { mode: 0o700 });
  writeFileSync(manifestPath, `${JSON.stringify({
    version: 3,
    projectId: 'the-squad-v2-staging',
    runId,
  })}\n`, { mode: 0o600 });
  writeFileSync(credentialsPath, `${JSON.stringify({
    version: 1,
    runId,
    identities: definition.identities.map(({ alias }, index) => ({
      alias,
      email: `phase9-child-${index}@example.invalid`,
      password: 'offline-only',
    })),
  })}\n`, { mode: 0o600 });
  const markerName = 'PHASE9_GUARDIAN_RUN_MARKER';
  const marker = 'a'.repeat(64);
  const child = spawn(process.execPath, [
    '--input-type=module',
    '--eval', readFileSync(join(repositoryRoot, 'scripts/qa-evidence/phase9/child-runner.mjs'), 'utf8'),
    '--',
    '--phase', 'before-transition',
    '--workspace', workspace,
    '--manifest', manifestPath,
    '--credentials', credentialsPath,
    '--guardian-marker-env', markerName,
    '--config-base64', readFileSync(
      join(repositoryRoot, 'scripts/qa-evidence/phase9/runner-config.json'),
    ).toString('base64'),
  ], {
    cwd: repositoryRoot,
    env: { ...process.env, TMPDIR: profileRoot, [markerName]: marker },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
  child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
  let startupTimeout;
  try {
    const firstLines = await Promise.race([
      new Promise((resolvePromise, reject) => {
        child.stdout.on('data', () => {
          const lines = stdout.split('\n').filter(Boolean);
          if (lines.length >= 2) resolvePromise(lines.slice(0, 2));
        });
        child.once('exit', code => reject(new Error(
          `exact child exited ${code} before ownership intent: ${/Error: ([a-z-]+)/.exec(stderr)?.[1] ?? 'no-fixed-category'}`,
        )));
      }),
      new Promise((_, reject) => {
        startupTimeout = setTimeout(() => reject(new Error('exact child startup timed out')), 10_000);
      }),
    ]);
    clearTimeout(startupTimeout);
    assert.deepEqual(firstLines.map(line => JSON.parse(line)), [{
      type: 'context-start',
      version: 4,
      phase: 'before-transition',
      contextOrdinal: 0,
      contextId: 'admission-route-qa-parent-a-mobile',
    }, {
      type: 'ownership-intent',
      version: 4,
      phase: 'before-transition',
      sequence: 0,
      session: 'p9-admission-route-qa-parent-a-mobile',
    }]);
  } finally {
    clearTimeout(startupTimeout);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await new Promise(resolvePromise => child.once('exit', resolvePromise));
    }
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('phase 9 production child private inputs reject every non-exact workspace spelling before filesystem access', async () => {
  const filesystem = new Proxy({}, {
    get() { throw new Error('filesystem-must-not-be-accessed'); },
  });
  for (const workspace of [
    '/tmp/phase9-core-identities.safe/../foreign',
    '/tmp/phase9-core-identities.safe/nested',
    '/tmp//phase9-core-identities.safe',
    '/tmp/phase9-core-identities.safe.',
  ]) {
    await assert.rejects(openBoundPrivateInputs({
      workspace,
      manifestPath: join(workspace, 'manifest.json'),
      credentialsPath: join(workspace, 'credentials.json'),
      profileRootPath: join(workspace, 'playwright-tmp'),
      filesystem,
    }), /runner-configuration-invalid/);
  }
});

const privateInputRaceFixture = () => {
  const workspace = mkdtempSync('/tmp/phase9-core-identities.private-input-');
  const manifestPath = join(workspace, 'manifest.json');
  const credentialsPath = join(workspace, 'credentials.json');
  const profileRootPath = join(workspace, 'playwright-tmp');
  chmodSync(workspace, 0o700);
  mkdirSync(profileRootPath, { mode: 0o700 });
  writeFileSync(manifestPath, '{"source":"held"}\n', { mode: 0o600 });
  writeFileSync(credentialsPath, '{"source":"synthetic"}\n', { mode: 0o600 });
  return { workspace, manifestPath, credentialsPath, profileRootPath };
};

darwinRuntimeTest('phase 9 bound private profile remains valid across real about-blank browser materialization', { timeout: 30_000 }, async () => {
  const fixture = privateInputRaceFixture();
  const inputs = await openBoundPrivateInputs(fixture);
  let cleanupClient;
  try {
    const client = createPhase9ProductionCliClient({
      sourceEnvironment: { ...process.env, TMPDIR: fixture.profileRootPath },
      temporaryDirectory: fixture.profileRootPath,
      profileDirectoryDescriptor: inputs.profileDescriptor,
      beforeCommand: inputs.revalidate,
    });
    cleanupClient = createPhase9ProductionCliClient({
      sourceEnvironment: { ...process.env, TMPDIR: fixture.profileRootPath },
      temporaryDirectory: fixture.profileRootPath,
      profileDirectoryDescriptor: inputs.profileDescriptor,
    });
    const session = 'phase9-bound-profile-about-blank';
    const beforeLinks = lstatSync(fixture.profileRootPath).nlink;
    await acquireBlankBrowser(client, session);
    const afterLinks = lstatSync(fixture.profileRootPath).nlink;
    assert.ok(afterLinks >= beforeLinks, 'browser materialization must retain a linked profile directory');
    await armAcquiredSignalRecorder(client, session);
    assert.equal(await setAndVerifyViewport(client, session, { width: 390, height: 844 }), '390x844');
    await closeAndVerifyBrowsers(cleanupClient);
  } finally {
    if (cleanupClient) await closeAndVerifyBrowsers(cleanupClient).catch(() => {});
    await inputs.close();
    rmSync(fixture.workspace, { recursive: true, force: true });
  }
});

darwinRuntimeTest('phase 9 confined cleanup removes real descriptor-rooted Playwright CLI output after browser closure', { timeout: 60_000 }, async () => {
  const { removeConfinedPlaywrightTree } = await import(
    '../scripts/qa-evidence/phase9/lifecycle-guardian.mjs'
  );
  const fixture = privateInputRaceFixture();
  const inputs = await openBoundPrivateInputs(fixture);
  let client;
  try {
    client = createPhase9ProductionCliClient({
      sourceEnvironment: { ...process.env, TMPDIR: fixture.profileRootPath },
      temporaryDirectory: fixture.profileRootPath,
      profileDirectoryDescriptor: inputs.profileDescriptor,
      beforeCommand: inputs.revalidate,
    });
    const session = 'phase9-confined-cleanup-about-blank';
    await acquireBlankBrowser(client, session);
    await armAcquiredSignalRecorder(client, session);
    assert.equal(await setAndVerifyViewport(client, session, { width: 390, height: 844 }), '390x844');
    await closeAndVerifyBrowsers(client);
    assert.equal(existsSync(join(fixture.profileRootPath, '.playwright-cli')), true);
    await inputs.close();
    await removeConfinedPlaywrightTree(fsPromises, fixture.profileRootPath);
    assert.equal(existsSync(fixture.profileRootPath), false);
  } finally {
    if (client) await closeAndVerifyBrowsers(client).catch(() => {});
    await inputs.close().catch(() => {});
    rmSync(fixture.workspace, { recursive: true, force: true });
  }
});

darwinRuntimeTest('phase 9 descriptor helper rejects root and nested replacement before deleting any admitted entry', async t => {
  const { removeConfinedPlaywrightTree, runPlaywrightCleanupHelper } = await import(
    '../scripts/qa-evidence/phase9/lifecycle-guardian.mjs'
  );
  await t.test('root handoff replacement', async () => {
    const fixture = confinedPlaywrightFixture();
    const heldRoot = `${fixture.profileRoot}.held`;
    const foreignFile = join(fixture.profileRoot, 'foreign.txt');
    try {
      await assert.rejects(removeConfinedPlaywrightTree({
        ...fsPromises,
        async removePlaywrightTree(receipts) {
          renameSync(fixture.profileRoot, heldRoot);
          mkdirSync(fixture.profileRoot, { mode: 0o700 });
          writeFileSync(foreignFile, 'foreign\n', { mode: 0o600 });
          return runPlaywrightCleanupHelper(receipts);
        },
      }, fixture.profileRoot), /scenario-closure-failed/);
      assert.equal(readFileSync(foreignFile, 'utf8'), 'foreign\n');
      assert.equal(existsSync(join(heldRoot, '.playwright-cli')), true);
    } finally {
      rmSync(fixture.workspace, { recursive: true, force: true });
      rmSync(heldRoot, { recursive: true, force: true });
    }
  });
  await t.test('nested handoff replacement', async () => {
    const fixture = confinedPlaywrightFixture();
    const heldFile = `${fixture.cliFile}.held`;
    try {
      await assert.rejects(removeConfinedPlaywrightTree({
        ...fsPromises,
        async removePlaywrightTree(receipts) {
          renameSync(fixture.cliFile, heldFile);
          writeFileSync(fixture.cliFile, 'foreign page output\n', { mode: 0o600 });
          return runPlaywrightCleanupHelper(receipts);
        },
      }, fixture.profileRoot), /scenario-closure-failed/);
      assert.equal(readFileSync(fixture.cliFile, 'utf8'), 'foreign page output\n');
      assert.equal(readFileSync(heldFile, 'utf8'), 'synthetic page output\n');
      assert.equal(existsSync(join(fixture.profileRoot, 'pw-1234abcd')), true);
    } finally {
      rmSync(fixture.workspace, { recursive: true, force: true });
    }
  });
  await t.test('file replacement at transactional delete', async () => {
    const fixture = confinedPlaywrightFixture();
    try {
      await assert.rejects(removeConfinedPlaywrightTree({
        ...fsPromises,
        removePlaywrightTree: receipts => runPlaywrightCleanupHelper({
          ...receipts, helperEnvironment: { PHASE9_CLEANUP_TEST_SWAP_FILE_AT_DELETE: '1' },
        }),
      }, fixture.profileRoot), /scenario-closure-failed/);
      assert.equal(readFileSync(fixture.cliFile, 'utf8'), 'foreign\n');
      assert.equal(readFileSync(`${fixture.cliFile}.phase9-test-held`, 'utf8'), 'synthetic page output\n');
      assert.equal(existsSync(join(fixture.profileRoot, 'pw-1234abcd')), true);
    } finally {
      rmSync(fixture.workspace, { recursive: true, force: true });
    }
  });
  await t.test('root replacement at transactional delete', async () => {
    const fixture = confinedPlaywrightFixture();
    try {
      await assert.rejects(removeConfinedPlaywrightTree({
        ...fsPromises,
        removePlaywrightTree: receipts => runPlaywrightCleanupHelper({
          ...receipts, helperEnvironment: { PHASE9_CLEANUP_TEST_SWAP_ROOT_AT_DELETE: '1' },
        }),
      }, fixture.profileRoot), /scenario-closure-failed/);
      assert.equal(existsSync(fixture.profileRoot), true);
      assert.equal(existsSync(`${fixture.profileRoot}.phase9-test-held`), true);
    } finally {
      rmSync(fixture.workspace, { recursive: true, force: true });
      rmSync(`${fixture.profileRoot}.phase9-test-held`, { recursive: true, force: true });
    }
  });
  await t.test('captured helper bytes survive helper pathname replacement and ignore Python startup injection', async () => {
    const fixture = confinedPlaywrightFixture();
    const helperCopy = join(fixture.workspace, 'cleanup-helper.py');
    const startupRoot = join(fixture.workspace, 'python-startup');
    const startupMarker = join(fixture.workspace, 'sitecustomize-ran');
    const reviewedHelper = join(testDirectory, '..', 'scripts', 'qa-evidence', 'phase9', 'playwright-cleanup-dirfd-helper.py');
    writeFileSync(helperCopy, readFileSync(reviewedHelper), { mode: 0o600 });
    mkdirSync(startupRoot, { mode: 0o700 });
    writeFileSync(join(startupRoot, 'sitecustomize.py'), `open(${JSON.stringify(startupMarker)}, 'w').write('ran')\n`, { mode: 0o600 });
    let replaced = false;
    const helperRuntime = {
      lstat: fsPromises.lstat,
      realpath: fsPromises.realpath,
      execFile: childProcess.execFile,
      async readFile(path) {
        const bytes = await fsPromises.readFile(path);
        if (path === helperCopy && !replaced) {
          replaced = true;
          writeFileSync(helperCopy, 'raise SystemExit(91)\n', { mode: 0o600 });
        }
        return bytes;
      },
    };
    const originalPythonPath = process.env.PYTHONPATH;
    process.env.PYTHONPATH = startupRoot;
    try {
      await removeConfinedPlaywrightTree({
        ...fsPromises,
        removePlaywrightTree: receipts => runPlaywrightCleanupHelper({
          ...receipts, helperPath: realpathSync(helperCopy), helperRuntime,
        }),
      }, fixture.profileRoot);
      assert.equal(existsSync(fixture.profileRoot), false);
      assert.equal(existsSync(startupMarker), false);
    } finally {
      if (originalPythonPath === undefined) delete process.env.PYTHONPATH;
      else process.env.PYTHONPATH = originalPythonPath;
      rmSync(fixture.workspace, { recursive: true, force: true });
    }
  });
  await t.test('Python runtime pin mismatch prevents cleanup', async () => {
    const fixture = confinedPlaywrightFixture();
    const helperRuntime = {
      lstat: fsPromises.lstat, realpath: fsPromises.realpath, execFile: childProcess.execFile,
      async readFile(path) {
        if (path === '/usr/bin/python3') return Buffer.from('foreign python');
        return fsPromises.readFile(path);
      },
    };
    try {
      await assert.rejects(removeConfinedPlaywrightTree({
        ...fsPromises,
        removePlaywrightTree: receipts => runPlaywrightCleanupHelper({ ...receipts, helperRuntime }),
      }, fixture.profileRoot), /scenario-closure-failed/);
      assert.equal(existsSync(fixture.profileRoot), true);
    } finally {
      rmSync(fixture.workspace, { recursive: true, force: true });
    }
  });
});

test('phase 9 production child rejects a private input replaced after descriptor open without reading foreign bytes', async () => {
  const fixture = privateInputRaceFixture();
  const stolen = `${fixture.manifestPath}.held`;
  let swapped = false;
  let manifestLstats = 0;
  try {
    await assert.rejects(openBoundPrivateInputs({
      ...fixture,
      filesystem: {
        ...fsPromises,
        async lstat(path) {
          if (path === fixture.manifestPath && ++manifestLstats === 2 && !swapped) {
            swapped = true;
            await fsPromises.rename(path, stolen);
            await fsPromises.writeFile(path, '{"source":"foreign"}\n', { mode: 0o600 });
          }
          return fsPromises.lstat(path);
        },
      },
    }), /runner-private-input-invalid/);
    assert.equal(readFileSync(fixture.manifestPath, 'utf8'), '{"source":"foreign"}\n');
    assert.equal(readFileSync(stolen, 'utf8'), '{"source":"held"}\n');
  } finally {
    rmSync(fixture.workspace, { recursive: true, force: true });
  }
});

test('phase 9 production child rejects a private input replaced immediately before no-follow open', async () => {
  const fixture = privateInputRaceFixture();
  const stolen = `${fixture.manifestPath}.held`;
  let swapped = false;
  try {
    await assert.rejects(openBoundPrivateInputs({
      ...fixture,
      filesystem: {
        ...fsPromises,
        async open(path, flags) {
          if (path === fixture.manifestPath && !swapped) {
            swapped = true;
            await fsPromises.rename(path, stolen);
            await fsPromises.writeFile(path, '{"source":"foreign"}\n', { mode: 0o600 });
          }
          return fsPromises.open(path, flags);
        },
      },
    }), /runner-private-input-invalid/);
    assert.equal(readFileSync(fixture.manifestPath, 'utf8'), '{"source":"foreign"}\n');
    assert.equal(readFileSync(stolen, 'utf8'), '{"source":"held"}\n');
  } finally {
    rmSync(fixture.workspace, { recursive: true, force: true });
  }
});

test('phase 9 production child rejects a private input name replaced during held-descriptor read', async () => {
  const fixture = privateInputRaceFixture();
  const stolen = `${fixture.manifestPath}.held`;
  let swapped = false;
  try {
    await assert.rejects(openBoundPrivateInputs({
      ...fixture,
      filesystem: {
        ...fsPromises,
        async open(path, flags) {
          const handle = await fsPromises.open(path, flags);
          if (path !== fixture.manifestPath) return handle;
          return {
            stat: (...args) => handle.stat(...args),
            close: () => handle.close(),
            async readFile(...args) {
              const bytes = await handle.readFile(...args);
              if (!swapped) {
                swapped = true;
                await fsPromises.rename(path, stolen);
                await fsPromises.writeFile(path, '{"source":"foreign"}\n', { mode: 0o600 });
              }
              return bytes;
            },
          };
        },
      },
    }), /runner-private-input-invalid/);
    assert.equal(readFileSync(fixture.manifestPath, 'utf8'), '{"source":"foreign"}\n');
    assert.equal(readFileSync(stolen, 'utf8'), '{"source":"held"}\n');
  } finally {
    rmSync(fixture.workspace, { recursive: true, force: true });
  }
});

test('phase 9 production child binds held workspace and profile identities before private input reads', async () => {
  const fixture = privateInputRaceFixture();
  const stolenWorkspace = `${fixture.workspace}.held`;
  let swapped = false;
  try {
    await assert.rejects(openBoundPrivateInputs({
      ...fixture,
      filesystem: {
        ...fsPromises,
        async open(path, flags) {
          const handle = await fsPromises.open(path, flags);
          if (path === fixture.profileRootPath && !swapped) {
            swapped = true;
            await fsPromises.rename(fixture.workspace, stolenWorkspace);
            await fsPromises.mkdir(fixture.workspace, { mode: 0o700 });
            await fsPromises.mkdir(fixture.profileRootPath, { mode: 0o700 });
            await fsPromises.writeFile(
              join(fixture.workspace, 'foreign.txt'), 'foreign-workspace\n', { mode: 0o600 },
            );
          }
          return handle;
        },
      },
    }), /runner-configuration-invalid/);
    assert.equal(readFileSync(join(fixture.workspace, 'foreign.txt'), 'utf8'), 'foreign-workspace\n');
    assert.equal(readFileSync(join(stolenWorkspace, 'manifest.json'), 'utf8'), '{"source":"held"}\n');
  } finally {
    rmSync(fixture.workspace, { recursive: true, force: true });
    rmSync(stolenWorkspace, { recursive: true, force: true });
  }
});

test('phase 9 production child rejects a workspace replaced immediately before no-follow directory open', async () => {
  const fixture = privateInputRaceFixture();
  const heldWorkspace = `${fixture.workspace}.held`;
  let swapped = false;
  try {
    await assert.rejects(openBoundPrivateInputs({
      ...fixture,
      filesystem: {
        ...fsPromises,
        async open(path, flags) {
          if (path === fixture.workspace && !swapped) {
            swapped = true;
            await fsPromises.rename(path, heldWorkspace);
            await fsPromises.mkdir(fixture.workspace, { mode: 0o700 });
            await fsPromises.mkdir(fixture.profileRootPath, { mode: 0o700 });
            await fsPromises.writeFile(
              join(fixture.workspace, 'foreign.txt'), 'foreign-workspace\n', { mode: 0o600 },
            );
          }
          return fsPromises.open(path, flags);
        },
      },
    }), /runner-configuration-invalid/);
    assert.equal(readFileSync(join(fixture.workspace, 'foreign.txt'), 'utf8'), 'foreign-workspace\n');
    assert.equal(readFileSync(join(heldWorkspace, 'manifest.json'), 'utf8'), '{"source":"held"}\n');
  } finally {
    rmSync(fixture.workspace, { recursive: true, force: true });
    rmSync(heldWorkspace, { recursive: true, force: true });
  }
});

test('phase 9 production child revalidates held workspace and profile identities before every transport command', async () => {
  const fixture = privateInputRaceFixture();
  const heldWorkspace = `${fixture.workspace}.held`;
  const inputs = await openBoundPrivateInputs(fixture);
  let executeCalls = 0;
  try {
    await fsPromises.rename(fixture.workspace, heldWorkspace);
    await fsPromises.mkdir(fixture.workspace, { mode: 0o700 });
    await fsPromises.mkdir(fixture.profileRootPath, { mode: 0o700 });
    await fsPromises.writeFile(
      join(fixture.workspace, 'foreign.txt'), 'foreign-workspace\n', { mode: 0o600 },
    );
    const client = createPlaywrightCliClient({
      wrapperPath: '/safe/playwright_cli.sh',
      beforeCommand: inputs.revalidate,
      execute: async () => {
        executeCalls += 1;
        return cliResult({ browsers: [] });
      },
    });
    await assert.rejects(client.listBrowsers(), /runner-configuration-invalid/);
    assert.equal(executeCalls, 0);
    assert.equal(readFileSync(join(fixture.workspace, 'foreign.txt'), 'utf8'), 'foreign-workspace\n');
    assert.equal(readFileSync(join(heldWorkspace, 'manifest.json'), 'utf8'), '{"source":"held"}\n');
  } finally {
    await inputs.close();
    rmSync(fixture.workspace, { recursive: true, force: true });
    rmSync(heldWorkspace, { recursive: true, force: true });
  }
});

darwinRuntimeTest('phase 9 production transport consumes the profile through its inherited descriptor after a pathname swap', { timeout: 30_000 }, async () => {
  const fixture = privateInputRaceFixture();
  const heldWorkspace = `${fixture.workspace}.held`;
  const inputs = await openBoundPrivateInputs(fixture);
  let swapped = false;
  let client;
  let cleanupClient;
  try {
    client = createPhase9ProductionCliClient({
      sourceEnvironment: { ...process.env, TMPDIR: fixture.profileRootPath },
      temporaryDirectory: fixture.profileRootPath,
      profileDirectoryDescriptor: inputs.profileDescriptor,
      beforeCommand: inputs.revalidate,
      executionHooks: {
        async beforeSpawn() {
          if (swapped) return;
          swapped = true;
          await fsPromises.rename(fixture.workspace, heldWorkspace);
          await fsPromises.mkdir(fixture.workspace, { mode: 0o700 });
          await fsPromises.mkdir(fixture.profileRootPath, { mode: 0o700 });
        },
      },
    });
    await assert.rejects(
      installSignalRecorder(client, 'phase9-descriptor-profile'),
      /Playwright CLI transport failed/,
      'the final named-identity check must fail before a descriptor-bound browser can start',
    );
    assert.deepEqual(readdirSync(fixture.profileRootPath), []);
    assert.deepEqual(readdirSync(join(heldWorkspace, 'playwright-tmp')), []);
    cleanupClient = createPhase9ProductionCliClient({
      sourceEnvironment: { ...process.env, TMPDIR: fixture.profileRootPath },
      temporaryDirectory: fixture.profileRootPath,
      profileDirectoryDescriptor: inputs.profileDescriptor,
    });
    await closeAndVerifyBrowsers(cleanupClient);
  } finally {
    if (cleanupClient) await closeAndVerifyBrowsers(cleanupClient).catch(() => {});
    await inputs.close();
    rmSync(fixture.workspace, { recursive: true, force: true });
    rmSync(heldWorkspace, { recursive: true, force: true });
  }
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

darwinRuntimeTest('phase 9 captured transport ignores later bundle-path and installed-transitive replacement', async () => {
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

darwinRuntimeTest('phase 9 transport closes its environment and controlled fetch audit observes exactly zero calls', async () => {
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

darwinRuntimeTest('phase 9 offline browser transport confines disposable profiles and creates no global producer prefix', async () => {
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

darwinRuntimeTest('phase 9 writer detects an ancestor identity swap and writes no bytes outside', async () => {
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

darwinRuntimeTest('phase 9 writer anchors temp creation to the held directory descriptor during an ancestor swap', async () => {
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

darwinRuntimeTest('phase 9 writer keeps promotion on the held directory descriptor after its ancestor is replaced', async () => {
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

darwinRuntimeTest('phase 9 writer rolls back every promoted file after a mid-transaction rename failure', async () => {
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

darwinRuntimeTest('phase 9 writer restores from held backup bytes when a backup pathname is replaced', async () => {
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

darwinRuntimeTest('phase 9 writer removes a stolen backup inode only after descriptor identity proof', async () => {
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

darwinRuntimeTest('phase 9 writer removes transaction-owned public output when rollback preparation or promotion fails', async () => {
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

darwinRuntimeTest('phase 9 writer never promotes a recovery pathname swapped immediately before rollback rename', async () => {
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

darwinRuntimeTest('phase 9 writer reports only the fixed uncertain result when bounded emergency inventory overflows', async () => {
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

darwinRuntimeTest('phase 9 writer removes a stolen promoted inode after restoring the original set', async () => {
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

darwinRuntimeTest('phase 9 writer executes captured helper bytes after the verified helper path is replaced', async () => {
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

darwinRuntimeTest('phase 9 writer rejects FIFO and hardlinked targets promptly without opening or modifying them', async () => {
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

darwinRuntimeTest('phase 9 writer rejects stale crash artifacts on the next run without writing anything', async () => {
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

darwinRuntimeTest('phase 9 writer detects a promoted path replacement and rolls back without changing an external inode', async () => {
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

darwinRuntimeTest('phase 9 writer terminates and joins a hanging helper without creating files', async () => {
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

darwinRuntimeTest('phase 9 evidence CLI dry-run builds the exact inert 44-row plan and pinned child descriptor', () => {
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

test('phase 9 evidence CLI help requires the external durable terminal result path for hosted operation', () => {
  const cliPath = join(testDirectory, '..', 'scripts', 'qa-evidence', 'phase9', 'cli.mjs');
  const result = spawnSync(process.execPath, [cliPath, 'help'], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--result <external-private-result\.json>/);
  assert.match(result.stdout, /mode-0700 directory outside the repository/i);
  assert.match(result.stdout, /recover-terminal --result/);
  assert.match(result.stdout, /--credentials <workspace-credentials>/);
});

test('phase 9 hosted entrypoint rejects non-Darwin before any runtime mutation', async () => {
  const { runPhase9Cli } = await import('../scripts/qa-evidence/phase9/cli.mjs');
  let writes = 0;
  await assert.rejects(
    runPhase9Cli({
      argv: ['hosted', '--staging'],
      env: {},
      platform: 'linux',
      stdout: { write: () => { writes += 1; } },
    }),
    error => error?.message === 'Phase 9 hosted runtime requires Darwin.',
  );
  assert.equal(writes, 0);
});

test('phase 9 terminal recovery entrypoint rejects non-Darwin before filesystem or provider construction', async () => {
  const { runPhase9Cli } = await import('../scripts/qa-evidence/phase9/cli.mjs');
  let writes = 0;
  await assert.rejects(
    runPhase9Cli({
      argv: ['recover-terminal'],
      env: {},
      platform: 'linux',
      stdout: { write: () => { writes += 1; } },
    }),
    error => error?.message === 'Phase 9 hosted runtime requires Darwin.',
  );
  assert.equal(writes, 0);
});

darwinRuntimeTest('phase 9 evidence CLI pins the reviewed self-contained child and one exact config artifact', async () => {
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

darwinRuntimeTest('phase 9 transport preserves only the exact guardian marker into a real descendant', { timeout: LOCAL_REAL_CHROME_TEST_TIMEOUT_MS }, async () => {
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

darwinRuntimeTest('phase 9 transport uses a fresh verified materialization for every explicit Node command', async () => {
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
});

darwinRuntimeTest('phase 9 runner config matches the exact pinned Darwin Node and Chrome runtime', () => {
  const configPath = join(testDirectory, '..', 'scripts', 'qa-evidence', 'phase9', 'runner-config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
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

test('phase 9 Darwin-only runtime test inventory is explicit unique and bounded', () => {
  assert.equal(DARWIN_RUNTIME_SKIP_REASON.startsWith('Darwin-only:'), true);
  assert.equal(darwinRuntimeTests.filter(name => name === 'phase 9 action window classifies real request failures').length, 1);
  assert.equal(darwinRuntimeTests.length, 76);
  assert.equal(new Set(darwinRuntimeTests).size, darwinRuntimeTests.length);
  assert.equal(darwinRuntimeTests.every(name => name.startsWith('phase 9 ')), true);
});
