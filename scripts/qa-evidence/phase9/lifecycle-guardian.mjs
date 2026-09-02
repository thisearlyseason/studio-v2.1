import { execFile, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual, types as utilTypes } from 'node:util';

import { removeCredentialFile } from '../../qa-fixtures/lifecycle.mjs';
import { buildFixtureDefinition } from '../../qa-fixtures/definition.mjs';
import { assertExactFixtureJournal, validateManifest } from '../../qa-fixtures/manifest.mjs';
import {
  FIXTURE_MANIFEST_VERSION,
  FIXTURE_RESOURCE_COUNTS,
  REQUIRED_LEDGER_COLUMNS,
  SCENARIO_GROUP_COUNTS,
  SCENARIO_TOTALS,
  STAGING_ORIGIN,
  STAGING_PROJECT_ID,
  validateLedger,
  validateLedgerRow,
  validateLifecycleResult,
} from './scenario-contracts.mjs';

const INTRINSIC_PROMISE = Promise;
const INTRINSIC_PROMISE_ALL = Promise.all;
const INTRINSIC_PROMISE_PROTOTYPE = Promise.prototype;
const INTRINSIC_PROMISE_THEN = Promise.prototype.then;
const INTRINSIC_PROMISE_CONSTRUCTOR_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  Promise.prototype, 'constructor',
);
const INTRINSIC_PROMISE_SPECIES_DESCRIPTOR = Object.getOwnPropertyDescriptor(
  Promise, Symbol.species,
);
const INTRINSIC_REFLECT_APPLY = Reflect.apply;
const INTRINSIC_OBJECT_GET_PROTOTYPE_OF = Object.getPrototypeOf;
const INTRINSIC_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR = Object.getOwnPropertyDescriptor;
const INTRINSIC_SET_TIMEOUT = globalThis.setTimeout;
const INTRINSIC_CLEAR_TIMEOUT = globalThis.clearTimeout;
const INTRINSIC_GLOBAL_THIS = globalThis;
const INTRINSIC_IS_PROMISE = utilTypes.isPromise;
const INTRINSIC_IS_PROXY = utilTypes.isProxy;
const INTRINSIC_CHILD_SPAWN = spawn;
const INTRINSIC_CHILD_EXEC_FILE = execFile;
const INTRINSIC_RANDOM_BYTES = randomBytes;
const INTRINSIC_ABORT_CONTROLLER = AbortController;
const INTRINSIC_EVENT_TARGET_ADD = EventTarget.prototype.addEventListener;
const INTRINSIC_EVENT_TARGET_REMOVE = EventTarget.prototype.removeEventListener;
const INTRINSIC_PROCESS_KILL = process.kill.bind(process);
const INTRINSIC_PROCESS_EXEC_PATH = process.execPath;
const INTRINSIC_PROCESS_PLATFORM = process.platform;
const INTRINSIC_PROCESS_UID = process.getuid?.();
const INTRINSIC_CHILD_ENV = Object.freeze(Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !new Set(['NODE_OPTIONS', 'NODE_PATH']).has(name)),
));

const WORKSPACE_PREFIX = '/tmp/phase9-core-identities.';
const PLAYWRIGHT_TMP_NAME = 'playwright-tmp';
const PLAYWRIGHT_PROFILE_PREFIX = 'playwright_chromiumdev_profile-';
const PLAYWRIGHT_CLI_OUTPUT_NAME = '.playwright-cli';
const PLAYWRIGHT_CLI_FILE_LIMIT = 256;
const PLAYWRIGHT_CLI_FILE_BYTES_LIMIT = 1_048_576;
const PLAYWRIGHT_CLI_TOTAL_BYTES_LIMIT = 16_777_216;
const PLAYWRIGHT_CLEANUP_HELPER = fileURLToPath(new URL('./playwright-cleanup-dirfd-helper.py', import.meta.url));
const PLAYWRIGHT_CLEANUP_HELPER_SHA256 = '8383ee70c605cd00b4d9916bd20d9e2a4fe509968693c3bedaf63da0ad129bd7';
const PLAYWRIGHT_CLEANUP_PYTHON = '/usr/bin/python3';
const PLAYWRIGHT_CLEANUP_PYTHON_SHA256 = 'b8763cf250e607a778bb4603cecb5b90338814d0a3dfcba0d57b1de242f610e9';
const RUNNER_STDOUT_LIMIT = 65_536;
const RUNNER_STDERR_LIMIT = 16_384;
const RUNNER_LINE_LIMIT = 8_192;
const RUNNER_SESSION_LIMIT = 100;
const RUNNER_ENTRYPOINT_LIMIT = 131_072;
const RUNNER_CONFIG_LIMIT = 65_536;
const RUNNER_CONFIG_TOTAL_LIMIT = 131_072;
const RUNNER_FAILURE_CATEGORIES = new Set(['scenario-runner-invalid', 'scenario-failed']);
const RUNNER_FAILURE_STAGES = new Set([
  'authorization', 'acquisition', 'receipt', 'recorder', 'viewport', 'login',
  'scenario-action', 'row-emission', 'release',
]);
const RUNNER_DIAGNOSTICS = Object.freeze({
  'runner-initialization': 'runner-invalid',
  'context-start': 'context-invalid',
  'ownership-authorization': 'authorization-failed',
  'browser-acquisition': 'acquisition-failed',
  'launch-receipt': 'receipt-invalid',
  'recorder-arm': 'recorder-failed',
  'viewport-verify': 'viewport-mismatch',
  'login-submit': 'login-failed',
  'observation-arm': 'observation-failed',
  'scenario-action': 'action-failed',
  'terminal-wait': 'terminal-not-reached',
  'terminal-location': 'location-mismatch',
  'terminal-observer': 'observer-mismatch',
  'terminal-role': 'role-restricted',
  'terminal-loading': 'loading-stalled',
  'terminal-runtime': 'runtime-error',
  'terminal-heading': 'heading-missing',
  'observation-sample': 'observation-failed',
  'window-validation': 'expectation-mismatch',
  'window-sample-contract': 'sample-contract-invalid',
  'window-observation-contract': 'observation-contract-invalid',
  'window-visible-contract': 'visible-contract-invalid',
  'window-resource-contract': 'resource-contract-invalid',
  'window-render-contract': 'render-contract-invalid',
  'window-output-contract': 'output-contract-invalid',
  'window-schema': 'schema-invalid',
  'window-location': 'location-invalid',
  'window-terminal': 'terminal-invalid',
  'window-loading': 'loading-invalid',
  'window-page-error': 'page-error-invalid',
  'window-console-error': 'console-error-invalid',
  'window-console-team-event': 'console-error-invalid',
  'window-console-team-game': 'console-error-invalid',
  'window-console-token': 'console-error-invalid',
  'window-console-invite': 'console-error-invalid',
  'window-console-firebase-sdk': 'console-error-invalid',
  'window-console-other-args': 'console-error-invalid',
  'window-console-other-plain': 'console-error-invalid',
  'window-request-failure': 'request-failure-invalid',
  'window-overflow': 'overflow-invalid',
  'window-render-coherence': 'render-coherence-invalid',
  'window-resource': 'resource-invalid',
  'window-policy': 'policy-invalid',
  'landing-expectation': 'landing-mismatch',
  'landing-heading': 'heading-mismatch',
  'landing-session': 'session-missing',
  'landing-render-history': 'render-history-invalid',
  'route-expectation': 'route-mismatch',
  'row-validation': 'row-invalid',
  'ownership-release': 'release-failed',
  'row-emission': 'row-invalid',
  'private-finalization': 'finalization-failed',
});
const NETWORK_CONSOLE_DIAGNOSTIC_REASONS = new Set(
  [
    ...Array.from({ length: 200 }, (_, index) => String(400 + index)),
    'unrecognized-browser', 'unrecognized-application',
    ...['aborted', 'timeout', 'name-resolution', 'connection', 'tls', 'policy-blocked', 'other']
      .map(value => `failure-${value}`),
  ].flatMap(status => (
    ['protected-api', 'firestore', 'staging-other', 'external', 'invalid']
      .map(target => `${status}-${target}`)
  )).concat(['request-failure-prior-window']),
);
const ROUTE_DIAGNOSTIC_CHECKPOINTS = new Set([
  'route-session', 'route-location', 'route-heading', 'route-render', 'route-attribution',
]);
const ROUTE_DIAGNOSTIC_REASONS = new Set([
  '/admin', '/club', '/competition', '/dashboard/billing', '/coaches-corner', '/family',
]);
const NO_TEAM_DIAGNOSTIC_REASONS = Object.freeze({
  'terminal-join-claim': new Set(['claim-missing', 'claim-pending', 'claim-invalid']),
  'window-no-team-render': new Set(['protected-render']),
  'window-no-team-selection': new Set(['team-a', 'team-b', 'other']),
  'window-no-team-request': new Set([
    'team-a', 'team-b', 'league', 'other', 'foreign', 'unscoped-firestore-document',
    'unscoped-firestore-run-query', 'unscoped-firestore-listen', 'unscoped-firestore-protected',
    'unscoped-staging-protected-api',
  ]),
  'window-no-team-listener': new Set([
    'team-a', 'team-b', 'league', 'other', 'foreign', 'unscoped-firestore-document',
    'unscoped-firestore-run-query', 'unscoped-firestore-listen', 'unscoped-firestore-protected',
    'unscoped-staging-join-admin-api',
    'unscoped-staging-protected-api',
  ]),
  'window-no-team-join-admin': new Set(
    'url|method|resource-type|body|frame|header-schema|authorization|cookie|identifier|recorder'.split('|'),
  ),
});
const isNoTeamDiagnostic = (checkpoint, reason) => (
  Object.hasOwn(NO_TEAM_DIAGNOSTIC_REASONS, checkpoint)
  && NO_TEAM_DIAGNOSTIC_REASONS[checkpoint].has(reason)
);
const RUNNER_DIAGNOSTIC_STAGES = Object.freeze({
  'runner-initialization': 'authorization',
  'context-start': 'authorization',
  'ownership-authorization': 'authorization',
  'browser-acquisition': 'acquisition',
  'launch-receipt': 'receipt',
  'recorder-arm': 'recorder',
  'viewport-verify': 'viewport',
  'login-submit': 'login',
  'observation-arm': 'scenario-action',
  'scenario-action': 'scenario-action',
  'terminal-wait': 'scenario-action',
  'terminal-location': 'scenario-action',
  'terminal-observer': 'scenario-action',
  'terminal-role': 'scenario-action',
  'terminal-loading': 'scenario-action',
  'terminal-runtime': 'scenario-action',
  'terminal-heading': 'scenario-action',
  'terminal-join-claim': 'scenario-action',
  'observation-sample': 'scenario-action',
  'window-validation': 'scenario-action',
  'window-sample-contract': 'scenario-action',
  'window-observation-contract': 'scenario-action',
  'window-visible-contract': 'scenario-action',
  'window-resource-contract': 'scenario-action',
  'window-render-contract': 'scenario-action',
  'window-output-contract': 'scenario-action',
  'window-schema': 'scenario-action',
  'window-location': 'scenario-action',
  'window-terminal': 'scenario-action',
  'window-loading': 'scenario-action',
  'window-page-error': 'scenario-action',
  'window-console-error': 'scenario-action',
  'window-console-team-event': 'scenario-action',
  'window-console-team-game': 'scenario-action',
  'window-console-token': 'scenario-action',
  'window-console-invite': 'scenario-action',
  'window-console-firebase-sdk': 'scenario-action',
  'window-console-network': 'scenario-action',
  'window-console-other-args': 'scenario-action',
  'window-console-other-plain': 'scenario-action',
  'window-request-failure': 'scenario-action',
  'window-overflow': 'scenario-action',
  'window-render-coherence': 'scenario-action',
  'window-resource': 'scenario-action',
  'window-policy': 'scenario-action',
  'window-no-team-render': 'scenario-action',
  'window-no-team-selection': 'scenario-action',
  'window-no-team-request': 'scenario-action',
  'window-no-team-listener': 'scenario-action',
  'window-no-team-join-admin': 'scenario-action',
  'landing-expectation': 'scenario-action',
  'landing-heading': 'scenario-action',
  'landing-session': 'scenario-action',
  'landing-render-history': 'scenario-action',
  'route-expectation': 'scenario-action',
  'route-session': 'scenario-action',
  'route-location': 'scenario-action',
  'route-heading': 'scenario-action',
  'route-render': 'scenario-action',
  'route-attribution': 'scenario-action',
  'row-validation': 'scenario-action',
  'ownership-release': 'release',
  'row-emission': 'row-emission',
  'private-finalization': 'row-emission',
});
const REQUEST_FAILURE_KEYS = Object.freeze([
  'failureClass', 'targetClass', 'resourceType', 'navigationRelationship', 'multiplicity',
]);
const REQUEST_FAILURE_CLASSES = Object.freeze([
  'aborted', 'timeout', 'name-resolution', 'connection', 'tls', 'policy-blocked', 'other',
]);
const REQUEST_FAILURE_TARGET_CLASSES = Object.freeze([
  'document', 'public-api', 'protected-api', 'firestore', 'identity', 'static', 'other',
]);
const REQUEST_FAILURE_RESOURCE_TYPES = Object.freeze(['fetch', 'xhr', 'other']);
const REQUEST_FAILURE_NAVIGATION_RELATIONSHIPS = Object.freeze([
  'current-document', 'prior-document', 'subresource', 'unknown',
]);
const REQUEST_FAILURE_MULTIPLICITIES = Object.freeze(['single', 'multiple']);
const PROCESS_AUDIT_OUTPUT_LIMIT = 16_777_216;
const PROCESS_INSPECTOR_PATH = fileURLToPath(new URL('./darwin-process-inspector.py', import.meta.url));
const PROCESS_INSPECTOR_SHA256 = '62d94b58d9c2f09b92d16b643f69388084f72082c0b189c4005195410c0f5463';
const PROCESS_INSPECTOR_LIMIT = 65_536;
const PROCESS_INSPECTOR_RUNTIME = '/usr/bin/python3';
const PROCESS_INSPECTOR_RUNTIME_SHA256 = 'b8763cf250e607a778bb4603cecb5b90338814d0a3dfcba0d57b1de242f610e9';
const PROCESS_INSPECTOR_RUNTIME_LIMIT = 4_194_304;
const EXECUTABLE_MAX_BYTES = 536_870_912;
const EXECUTABLE_HASH_CHUNK_BYTES = 1_048_576;
const EXECUTABLE_HASH_TIMEOUT_MS = 30_000;
const EXECUTABLE_CLOSE_TIMEOUT_MS = 1_000;
const BEFORE_TRANSITION_DEADLINE_MAX_MS = 2_700_000;
const AFTER_TRANSITION_DEADLINE_MAX_MS = 900_000;
const RUN_MARKER_ENV = 'PHASE9_GUARDIAN_RUN_MARKER';
const PLAYWRIGHT_TRANSPORT_ROOT_PATTERN = '/private/tmp/phase9-playwright-transport.';
const PLAYWRIGHT_DAEMON_SUFFIX = '/node_modules/playwright-core/lib/entry/cliDaemon.js';
const SYSTEM_CODESIGN = '/usr/bin/codesign';
const CHROME_MAIN_DISABLE_FEATURES = 'AvoidUnnecessaryBeforeUnloadCheckSync,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,BlockOriginHeaderModificationOnRedirect,Translate,AutoDeElevate,OptimizationHints,msForceBrowserSignIn,msEdgeUpdateLaunchServicesPreferredVersion';
const CHROME_HELPER_DISABLE_FEATURES = 'AutoDeElevate,AvoidUnnecessaryBeforeUnloadCheckSync,BlockOriginHeaderModificationOnRedirect,BoundaryEventDispatchTracksNodeRemoval,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,OptimizationHints,PaintHolding,ThirdPartyStoragePartitioning,Translate,msEdgeUpdateLaunchServicesPreferredVersion,msForceBrowserSignIn';
const CHROME_ENABLE_FEATURES = 'CDPScreenshotNewSurface';
const CHROME_BLINK_SETTINGS = 'primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4';
const CHROME_GPU_PREFERENCES = 'WAAAAAAAAAAgAAAEAAAAAAAAAAAAAGAAQAAAAAAAAAADAAAAAAAAADgAAAAAAAAAAAAAAAAAAAACAAAAAAAAAAAAAAAAAAAAKAAAAAAAAAAoAAAAAAAAAAgAAAAAAAAADAAAAAEAAAAAAAAAAAAAAAgAAAAAAAAACAAAAAAAAAA=';
const PROCESS_INSTANCE_IDENTITY_KEYS = Object.freeze([
  'pid', 'ppid', 'pgid', 'startSec', 'startUsec', 'argv', 'executable', 'executableDev',
  'executableIno', 'executableSize', 'executableMtimeNs', 'executableCtimeNs',
  'executableMode', 'executableUid', 'executableNlink', 'executableSha256',
  'codesignIdentifier', 'teamIdentifier',
]);
const PROCESS_EVENTS = Object.freeze(['SIGINT', 'SIGTERM', 'uncaughtException', 'unhandledRejection']);
const ORDERED_STATES = Object.freeze([
  'uninitialized',
  'guarded',
  'preflighted',
  'seeded',
  'inspected',
  'browsers-closed',
  'preclean-inspected',
  'cleaned',
  'clean-inspected',
  'independently-absent',
  'credential-removed',
  'workspace-removed',
  'disarmed',
]);

const ADMISSION_ALIASES = Object.freeze([
  'qa-parent-a', 'qa-adult-player-a', 'qa-youth-active', 'qa-league-creator', 'qa-school-admin',
  'qa-superadmin', 'qa-fake-superadmin', 'qa-missing-profile', 'qa-no-team',
]);
const ISOLATION_ALIASES = Object.freeze([
  'qa-parent-a', 'qa-adult-player-a', 'qa-youth-active', 'qa-parent-b', 'qa-adult-player-b',
]);
const LOGOUT_ALIASES = Object.freeze([
  'qa-parent-a', 'qa-adult-player-a', 'qa-league-creator', 'qa-school-admin', 'qa-superadmin',
]);
const VIEWPORT_CONTEXTS = Object.freeze([
  Object.freeze({ name: 'mobile', value: '390x844' }),
  Object.freeze({ name: 'desktop', value: '1440x900' }),
]);

function buildCanonicalRowContracts() {
  const all = [];
  const before = [];
  const after = [];
  const add = (phase, contract) => {
    const frozen = Object.freeze({ phase, ...contract });
    all.push(frozen);
    (phase === 'before-transition' ? before : after).push(frozen);
  };
  for (const viewport of VIEWPORT_CONTEXTS) {
    for (const alias of ADMISSION_ALIASES) add('before-transition', {
      contextId: `admission-route-${alias}-${viewport.name}`,
      group: 'admission-route', alias, viewport: viewport.value, startState: 'fresh-context',
    });
    for (const alias of ISOLATION_ALIASES) add('before-transition', {
      contextId: `isolation-${alias}-${viewport.name}`,
      group: 'isolation', alias, viewport: viewport.value, startState: 'authenticated',
    });
    for (const alias of LOGOUT_ALIASES) add('before-transition', {
      contextId: `logout-${alias}-${viewport.name}`,
      group: 'logout', alias, viewport: viewport.value, startState: 'authenticated-two-tab',
    });
    add('before-transition', {
      contextId: `pending-deletion-active-baseline-${viewport.name}`,
      group: 'pending-deletion', alias: 'qa-pending-delete', viewport: viewport.value, startState: 'active',
    });
    for (const scenario of ['stale-session', 'fresh-login']) add('after-transition', {
      contextId: `pending-deletion-${scenario}-${viewport.name}`,
      group: 'pending-deletion', alias: 'qa-pending-delete', viewport: viewport.value,
      startState: 'pending_deletion',
    });
  }
  return Object.freeze({
    all: Object.freeze(all),
    'before-transition': Object.freeze(before),
    'after-transition': Object.freeze(after),
  });
}

const CANONICAL_ROW_CONTRACTS = buildCanonicalRowContracts();

const runnerSessionName = value => `p9-${value}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 64);
const runnerFreshSessionName = value => `${runnerSessionName(value).slice(0, 58)}-fresh`;

export function canonicalBrowserSessionsForRow(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new GuardianFailure('scenario-runner-invalid');
  }
  const expected = CANONICAL_ROW_CONTRACTS.all.find(item => item.contextId === row.contextId);
  if (!expected || expected.group !== row.group || expected.viewport !== row.viewport
    || expected.startState !== row.startState) {
    throw new GuardianFailure('scenario-runner-invalid');
  }
  const viewportName = row.viewport === '390x844' ? 'mobile' : 'desktop';
  const primary = row.contextId.startsWith('pending-deletion-stale-session-')
    ? runnerSessionName(`pending-deletion-active-baseline-${viewportName}`)
    : runnerSessionName(row.contextId);
  return Object.freeze((row.group === 'logout'
    ? [primary, runnerFreshSessionName(row.contextId)]
    : [primary]).sort());
}

class GuardianFailure extends Error {
  constructor(category) {
    super(category);
    this.category = category;
  }
}

const defaultFilesystem = Object.freeze({
  mkdtemp,
  mkdir,
  chmod,
  stat,
  lstat,
  open,
  readFile,
  readdir,
  removeCredentialFile: (path, repositoryRoot) => removeCredentialFile(path, repositoryRoot),
  rm: (path, options) => rm(path, options),
});

const defaultProcessHooks = Object.freeze({
  on: (name, handler) => process.on(name, handler),
  off: (name, handler) => process.off(name, handler),
});

function requireDependencies(value) {
  if (!value || typeof value !== 'object') throw new GuardianFailure('configuration-invalid');
  for (const name of ['fixtureCommand', 'adapterFactory', 'preconditionVerifier', 'terminalCertificateWriter']) {
    if (typeof value[name] !== 'function') throw new GuardianFailure('configuration-invalid');
  }
  if (!value.runnerCommand || typeof value.runnerCommand !== 'object') {
    throw new GuardianFailure('configuration-invalid');
  }
  for (const name of ['closeBrowser', 'listBrowsers']) {
    if (typeof value.browserClient?.[name] !== 'function') throw new GuardianFailure('configuration-invalid');
  }
  for (const name of ['mkdtemp', 'mkdir', 'chmod', 'stat', 'lstat', 'open', 'readFile', 'readdir', 'removeCredentialFile', 'rm']) {
    if (typeof value.filesystem?.[name] !== 'function') throw new GuardianFailure('configuration-invalid');
  }
  for (const name of ['on', 'off']) {
    if (typeof value.processHooks?.[name] !== 'function') throw new GuardianFailure('configuration-invalid');
  }
}

function exactOptions(value) {
  if (
    !value
    || typeof value !== 'object'
    || value.projectId !== STAGING_PROJECT_ID
    || value.origin !== STAGING_ORIGIN
    || typeof value.expiresAt !== 'string'
    || Number.isNaN(Date.parse(value.expiresAt))
    || typeof value.deployedSha !== 'string'
    || !/^[0-9a-f]{40}$/.test(value.deployedSha)
    || typeof value.stagingRunId !== 'string'
    || !/^[1-9][0-9]{5,20}$/.test(value.stagingRunId)
    || !Number.isSafeInteger(value.pullRequestNumber)
    || value.pullRequestNumber <= 0
    || value.beforeTransition !== undefined
    || value.afterTransition !== undefined
  ) throw new GuardianFailure('configuration-invalid');
  return Object.freeze({
    projectId: value.projectId,
    origin: value.origin,
    expiresAt: value.expiresAt,
    deployedSha: value.deployedSha,
    stagingRunId: value.stagingRunId,
    pullRequestNumber: value.pullRequestNumber,
  });
}

function commandArguments(command, options, paths) {
  const argv = [
    command,
    '--project', STAGING_PROJECT_ID,
    '--confirm-project', STAGING_PROJECT_ID,
  ];
  if (command === 'preflight') return [...argv, '--origin', STAGING_ORIGIN];
  argv.push('--manifest', paths.manifestPath);
  if (command === 'seed') argv.push('--credentials', paths.credentialPath, '--expires-at', options.expiresAt);
  if (command === 'transition') argv.push('--alias', 'qa-pending-delete');
  return argv;
}

function parseCommandOutput(result) {
  if (
    !result
    || typeof result !== 'object'
    || !Number.isInteger(result.exitCode)
    || typeof result.stdout !== 'string'
    || result.stdout.length > 262_144
  ) throw new GuardianFailure('invalid-result');
  if (result.exitCode !== 0) throw new GuardianFailure('command-failed');
  const trimmed = result.stdout.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) throw new GuardianFailure('invalid-result');
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new GuardianFailure('invalid-result');
  }
}

function ensureManifestShape(manifest) {
  if (
    manifest.version !== FIXTURE_MANIFEST_VERSION
    || manifest.projectId !== STAGING_PROJECT_ID
    || manifest.authUids.length !== FIXTURE_RESOURCE_COUNTS.auth
    || manifest.firestorePaths.length !== FIXTURE_RESOURCE_COUNTS.firestore
    || manifest.expectedAbsentFirestorePaths.length !== FIXTURE_RESOURCE_COUNTS.expectedAbsent
  ) throw new GuardianFailure('manifest-uncertain');
  let definition;
  try {
    definition = buildFixtureDefinition({
      runId: manifest.runId,
      expiresAt: manifest.expiresAt,
      manifestVersion: FIXTURE_MANIFEST_VERSION,
    });
    return assertExactFixtureJournal(manifest, definition);
  } catch {
    throw new GuardianFailure('manifest-uncertain');
  }
}

const MANIFEST_STATE_RANK = Object.freeze({ planned: 0, partial: 1, seeded: 2, cleaned: 3 });
const PINNED_TRANSITION_ALIASES = Object.freeze(['qa-suspended', 'qa-removed-member']);
const PENDING_TRANSITION_ALIAS = 'qa-pending-delete';
const PENDING_CHECKPOINT_FIELDS = Object.freeze([
  'startedAt', 'firestoreUpdatedAt', 'revokedAt', 'completedAt',
]);

function manifestIdentity(manifest, options) {
  if (
    !options
    || manifest.expiresAt !== options.expiresAt
    || typeof manifest.createdAt !== 'string'
    || typeof manifest.updatedAt !== 'string'
  ) throw new GuardianFailure('manifest-uncertain');
  const definition = buildFixtureDefinition({
    runId: manifest.runId,
    expiresAt: manifest.expiresAt,
    manifestVersion: manifest.version,
  });
  if (
    definition.identities.length !== FIXTURE_RESOURCE_COUNTS.aliases
    || definition.teams.length !== FIXTURE_RESOURCE_COUNTS.teams
    || manifest.authUids.length !== FIXTURE_RESOURCE_COUNTS.auth
    || manifest.firestorePaths.length !== FIXTURE_RESOURCE_COUNTS.firestore
    || manifest.expectedAbsentFirestorePaths.length !== FIXTURE_RESOURCE_COUNTS.expectedAbsent
  ) throw new GuardianFailure('manifest-uncertain');
  const pairs = (items, fields) => items
    .map(item => fields.map(field => item[field]).join('\u0000'))
    .sort();
  return Object.freeze({
    runId: manifest.runId,
    manifestVersion: manifest.version,
    definitionVersion: definition.manifestVersion,
    projectId: manifest.projectId,
    origin: options.origin,
    configuredExpiresAt: options.expiresAt,
    createdAt: manifest.createdAt,
    authOwnership: pairs(definition.identities, ['alias', 'uid']),
    firestoreOwnership: pairs(definition.documents, ['alias', 'path']),
    expectedAbsenceOwnership: pairs(definition.expectedAbsentDocuments, ['alias', 'path']),
    teamOwnership: pairs(definition.teams, ['alias', 'id']),
    authJournal: [...manifest.authUids].sort(),
    firestoreJournal: [...manifest.firestorePaths].sort(),
    expectedAbsenceJournal: [...manifest.expectedAbsentFirestorePaths].sort(),
    counts: Object.freeze({
      aliases: definition.identities.length,
      teams: definition.teams.length,
      auth: manifest.authUids.length,
      firestore: manifest.firestorePaths.length,
      expectedAbsent: manifest.expectedAbsentFirestorePaths.length,
    }),
  });
}

function assertManifestIdentity(manifest, options, pin) {
  if (!isDeepStrictEqual(manifestIdentity(manifest, options), pin)) {
    throw new GuardianFailure('manifest-uncertain');
  }
}

function assertInitialManifestBaseline(manifest) {
  if (requireManifestTime(manifest.updatedAt) < requireManifestTime(manifest.createdAt)) {
    throw new GuardianFailure('manifest-uncertain');
  }
  const active = { version: 1, state: 'active' };
  for (const alias of [...PINNED_TRANSITION_ALIASES, PENDING_TRANSITION_ALIAS]) {
    if (!isDeepStrictEqual(manifest.transitions[alias], active)) {
      throw new GuardianFailure('manifest-uncertain');
    }
  }
}

function requireManifestTime(value) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new GuardianFailure('manifest-uncertain');
  return parsed;
}

function requireExactPendingTransitionShape(transition) {
  const checkpointCount = PENDING_CHECKPOINT_FIELDS
    .findIndex(field => transition[field] === undefined);
  const presentCount = checkpointCount === -1 ? PENDING_CHECKPOINT_FIELDS.length : checkpointCount;
  if (PENDING_CHECKPOINT_FIELDS.slice(presentCount).some(field => transition[field] !== undefined)) {
    throw new GuardianFailure('manifest-uncertain');
  }
  const expectedCheckpointCount = {
    active: 0,
    applying: presentCount,
    pending_deletion: PENDING_CHECKPOINT_FIELDS.length,
  }[transition.state];
  if (
    expectedCheckpointCount === undefined
    || presentCount !== expectedCheckpointCount
    || (transition.state === 'applying' && presentCount < 1)
  ) throw new GuardianFailure('manifest-uncertain');
  const expectedKeys = ['version', 'state', ...PENDING_CHECKPOINT_FIELDS.slice(0, presentCount)];
  if (!isDeepStrictEqual(Object.keys(transition), expectedKeys)) {
    throw new GuardianFailure('manifest-uncertain');
  }
}

function assertPendingTransitionAdvance(previous, next, before, after, authorized) {
  requireExactPendingTransitionShape(before);
  requireExactPendingTransitionShape(after);
  if (isDeepStrictEqual(after, before)) return;
  if (!authorized) throw new GuardianFailure('manifest-uncertain');
  const ranks = { active: 0, applying: 1, pending_deletion: 2 };
  if (ranks[after.state] < ranks[before.state]) throw new GuardianFailure('manifest-uncertain');
  for (const field of ['version', ...PENDING_CHECKPOINT_FIELDS]) {
    if (before[field] !== undefined && after[field] !== before[field]) {
      throw new GuardianFailure('manifest-uncertain');
    }
  }
  const priorUpdatedAt = requireManifestTime(previous.updatedAt);
  const createdAt = requireManifestTime(next.createdAt);
  const nextUpdatedAt = requireManifestTime(next.updatedAt);
  const lowerBound = Math.max(priorUpdatedAt, createdAt);
  if (nextUpdatedAt < lowerBound) throw new GuardianFailure('manifest-uncertain');
  let priorCheckpoint = null;
  for (const field of PENDING_CHECKPOINT_FIELDS) {
    const timestamp = after[field];
    if (timestamp === undefined) continue;
    const parsed = requireManifestTime(timestamp);
    if (priorCheckpoint !== null && parsed < priorCheckpoint) {
      throw new GuardianFailure('manifest-uncertain');
    }
    if (before[field] === undefined && (parsed < lowerBound || parsed > nextUpdatedAt)) {
      throw new GuardianFailure('manifest-uncertain');
    }
    priorCheckpoint = parsed;
  }
}

function assertLifecycleAdvance(previous, next, { pendingTransitionAuthorized = false } = {}) {
  if (!previous) return;
  if (
    MANIFEST_STATE_RANK[next.state] < MANIFEST_STATE_RANK[previous.state]
    || Date.parse(next.updatedAt) < Date.parse(previous.updatedAt)
  ) throw new GuardianFailure('manifest-uncertain');
  if (requireManifestTime(next.updatedAt) < requireManifestTime(next.createdAt)) {
    throw new GuardianFailure('manifest-uncertain');
  }
  for (const alias of PINNED_TRANSITION_ALIASES) {
    if (!isDeepStrictEqual(next.transitions[alias], previous.transitions[alias])) {
      throw new GuardianFailure('manifest-uncertain');
    }
  }
  assertPendingTransitionAdvance(
    previous,
    next,
    previous.transitions[PENDING_TRANSITION_ALIAS],
    next.transitions[PENDING_TRANSITION_ALIAS],
    pendingTransitionAuthorized,
  );
}

function isMissing(error) {
  return error?.code === 'ENOENT';
}

async function proveAbsent(filesystem, path) {
  try {
    await filesystem.lstat(path);
    return false;
  } catch (error) {
    if (isMissing(error)) return true;
    throw new GuardianFailure('removal-uncertain');
  }
}

function exactWorkspacePath(path) {
  return typeof path === 'string'
    && resolve(path) === path
    && /^\/tmp\/phase9-core-identities\.[A-Za-z0-9_-]+$/.test(path);
}

async function workspacePreservationState(filesystem, path) {
  if (!path) return 'verified-absent';
  try {
    if (!exactWorkspacePath(path)) return 'uncertain';
    const metadata = await filesystem.lstat(path);
    if (
      !metadata?.isDirectory?.()
      || metadata.isSymbolicLink?.()
      || (metadata.mode & 0o777) !== 0o700
    ) return 'uncertain';
    return 'verified-present';
  } catch (error) {
    return isMissing(error) ? 'verified-absent' : 'uncertain';
  }
}

async function manifestPreservationState(
  filesystem,
  workspacePath,
  manifestPath,
  { pin, priorManifest, options, pendingTransitionAuthorized },
) {
  if (!manifestPath) return 'verified-absent';
  try {
    if (
      !exactWorkspacePath(workspacePath)
      || manifestPath !== join(workspacePath, 'manifest.json')
    ) return 'uncertain';
    const metadata = await filesystem.lstat(manifestPath);
    if (await workspacePreservationState(filesystem, workspacePath) !== 'verified-present') return 'uncertain';
    if (
      !metadata?.isFile?.()
      || metadata.isSymbolicLink?.()
      || (metadata.mode & 0o777) !== 0o600
    ) return 'uncertain';
    const text = await filesystem.readFile(manifestPath, 'utf8');
    if (typeof text !== 'string' || text.length > 262_144) return 'uncertain';
    const candidate = ensureManifestShape(validateManifest(JSON.parse(text)));
    if (!pin) return 'uncertain';
    assertManifestIdentity(candidate, options, pin);
    assertLifecycleAdvance(priorManifest, candidate, { pendingTransitionAuthorized });
    return 'verified-present';
  } catch (error) {
    return isMissing(error) ? 'verified-absent' : 'uncertain';
  }
}

async function preservationStates(filesystem, workspacePath, manifestPath, manifestState) {
  return {
    workspacePreservation: await workspacePreservationState(filesystem, workspacePath),
    manifestPreservation: await manifestPreservationState(
      filesystem, workspacePath, manifestPath, manifestState,
    ),
  };
}

async function requirePrivateRegularFile(filesystem, path, category) {
  let metadata;
  try {
    metadata = await filesystem.lstat(path);
  } catch {
    throw new GuardianFailure(category);
  }
  if (
    !metadata?.isFile?.()
    || metadata.isSymbolicLink?.()
    || (metadata.mode & 0o777) !== 0o600
  ) throw new GuardianFailure(category);
}

async function requirePrivateDirectory(filesystem, path, category) {
  let metadata;
  try {
    metadata = await filesystem.lstat(path);
  } catch {
    throw new GuardianFailure(category);
  }
  if (
    !metadata?.isDirectory?.()
    || metadata.isSymbolicLink?.()
    || (metadata.mode & 0o777) !== 0o700
  ) throw new GuardianFailure(category);
}

async function producerProfileInventory(filesystem, tempRoot) {
  const category = 'scenario-closure-failed';
  if (typeof tempRoot !== 'string' || !isAbsolute(tempRoot)) throw new GuardianFailure(category);
  const root = resolve(tempRoot);
  let names;
  try {
    await requirePrivateDirectory(filesystem, root, category);
    names = await filesystem.readdir(root);
  } catch {
    throw new GuardianFailure(category);
  }
  if (!Array.isArray(names) || names.length > 100_000
    || names.some(name => typeof name !== 'string' || name.length > 255)) {
    throw new GuardianFailure(category);
  }
  const profiles = [];
  for (const name of names) {
    if (!name.startsWith(PLAYWRIGHT_PROFILE_PREFIX)) continue;
    if (!/^playwright_chromiumdev_profile-[A-Za-z0-9_-]{1,80}$/.test(name)) {
      throw new GuardianFailure(category);
    }
    const path = join(root, name);
    const metadata = await filesystem.lstat(path).catch(() => null);
    if (!metadata?.isDirectory?.() || metadata.isSymbolicLink?.()
      || (metadata.mode & 0o777) !== 0o700
      || (Number.isSafeInteger(INTRINSIC_PROCESS_UID) && metadata.uid !== INTRINSIC_PROCESS_UID)) {
      throw new GuardianFailure(category);
    }
    profiles.push(name);
  }
  return Object.freeze(profiles.sort());
}

function confinedEntryKind(metadata) {
  if (metadata?.isDirectory?.() && !metadata.isSymbolicLink?.()) return 'directory';
  if (metadata?.isFile?.() && !metadata.isSymbolicLink?.()) return 'file';
  return null;
}

function confinedEntryIdentity(metadata) {
  return Object.freeze({
    kind: confinedEntryKind(metadata),
    dev: metadata?.dev,
    ino: metadata?.ino,
    uid: metadata?.uid,
    mode: metadata?.mode & 0o777,
    nlink: metadata?.nlink,
    size: metadata?.size,
    mtimeMs: metadata?.mtimeMs,
    ctimeMs: metadata?.ctimeMs,
  });
}

function confinedEntryMatches(metadata, expected) {
  const actual = confinedEntryIdentity(metadata);
  return expected.kind !== null && Object.keys(expected).every(key => actual[key] === expected[key]);
}

function playwrightCliFileNameIsExact(name) {
  const timestamp = '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}-[0-9]{3}Z';
  return new RegExp(`^(?:console-${timestamp}\\.log|page-${timestamp}\\.yml)$`).test(name);
}

function cleanupHelperIdentity(identity) {
  return Object.freeze({
    dev: identity.dev, ino: identity.ino, uid: identity.uid, mode: identity.mode,
  });
}

export async function runPlaywrightCleanupHelper({
  parentReceipt,
  rootReceipt,
  receipts,
  helperPath = PLAYWRIGHT_CLEANUP_HELPER,
  helperRuntime = Object.freeze({ lstat, realpath, readFile, execFile }),
  helperEnvironment = Object.freeze({}),
}) {
  if (process.platform !== 'darwin') throw new GuardianFailure('scenario-closure-failed');
  if (!helperRuntime || ['lstat', 'realpath', 'readFile', 'execFile'].some(
    name => typeof helperRuntime[name] !== 'function',
  ) || !helperEnvironment || typeof helperEnvironment !== 'object' || Array.isArray(helperEnvironment)
    || Object.keys(helperEnvironment).some(key => !new Set([
      'PHASE9_CLEANUP_TEST_SWAP_FILE_AT_DELETE', 'PHASE9_CLEANUP_TEST_SWAP_ROOT_AT_DELETE',
    ]).has(key) || helperEnvironment[key] !== '1')) {
    throw new GuardianFailure('scenario-closure-failed');
  }
  const [metadata, canonicalHelper, bytes, pythonMetadata, canonicalPython, pythonBytes] = await Promise.all([
    helperRuntime.lstat(helperPath).catch(() => null),
    helperRuntime.realpath(helperPath).catch(() => null),
    helperRuntime.readFile(helperPath).catch(() => null),
    helperRuntime.lstat(PLAYWRIGHT_CLEANUP_PYTHON).catch(() => null),
    helperRuntime.realpath(PLAYWRIGHT_CLEANUP_PYTHON).catch(() => null),
    helperRuntime.readFile(PLAYWRIGHT_CLEANUP_PYTHON).catch(() => null),
  ]);
  if (!metadata?.isFile?.() || metadata.isSymbolicLink?.()
    || metadata.uid !== INTRINSIC_PROCESS_UID || (metadata.mode & 0o022) !== 0
    || canonicalHelper !== helperPath
    || !bytes || createHash('sha256').update(bytes).digest('hex') !== PLAYWRIGHT_CLEANUP_HELPER_SHA256
    || !pythonMetadata?.isFile?.() || pythonMetadata.isSymbolicLink?.() || pythonMetadata.uid !== 0
    || (pythonMetadata.mode & 0o022) !== 0 || canonicalPython !== PLAYWRIGHT_CLEANUP_PYTHON
    || !pythonBytes || createHash('sha256').update(pythonBytes).digest('hex') !== PLAYWRIGHT_CLEANUP_PYTHON_SHA256) {
    throw new GuardianFailure('scenario-closure-failed');
  }
  await new Promise((resolvePromise, rejectPromise) => {
    helperRuntime.execFile('/usr/bin/codesign', [
      '--verify', '--deep',
      '-R=identifier "com.apple.dt.xcode_select.tool-shim-public" and anchor apple',
      PLAYWRIGHT_CLEANUP_PYTHON,
    ], { cwd: '/', env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' }, timeout: 30_000, maxBuffer: 65_536 }, error => {
      if (error) rejectPromise(new GuardianFailure('scenario-closure-failed')); else resolvePromise();
    });
  });
  const request = JSON.stringify({
    version: 1,
    operation: 'remove-playwright-tree',
    name: PLAYWRIGHT_TMP_NAME,
    parent: cleanupHelperIdentity(parentReceipt.identity),
    root: cleanupHelperIdentity(rootReceipt.identity),
    entries: receipts
      .filter(receipt => receipt !== parentReceipt && receipt !== rootReceipt)
      .map(receipt => Object.freeze({
        path: relative(rootReceipt.path, receipt.path),
        identity: receipt.identity,
      }))
      .sort((left, right) => left.path.localeCompare(right.path)),
  });
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(PLAYWRIGHT_CLEANUP_PYTHON, ['-I', '-c', bytes.toString('utf8')], {
      cwd: '/',
      env: {
        PATH: '/usr/bin:/bin:/usr/sbin:/sbin', LANG: 'C', LC_ALL: 'C', PYTHONHASHSEED: '0',
        PYTHONDONTWRITEBYTECODE: '1', PYTHONNOUSERSITE: '1', ...helperEnvironment,
      },
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe', parentReceipt.handle.fd, rootReceipt.handle.fd],
    });
    let stdout = '';
    let stderrBytes = 0;
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) rejectPromise(new GuardianFailure('scenario-closure-failed'));
      else resolvePromise();
    };
    const timer = setTimeout(() => {
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    }, 30_000);
    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8');
      if (Buffer.byteLength(stdout, 'utf8') > 1_024) child.kill('SIGKILL');
    });
    child.stderr.on('data', chunk => {
      stderrBytes += chunk.length;
      if (stderrBytes > 1_024) child.kill('SIGKILL');
    });
    child.on('error', finish);
    child.stdin.on('error', () => {});
    child.on('close', (code, signal) => {
      let parsed;
      try { parsed = JSON.parse(stdout.trim()); } catch {}
      finish(code === 0 && signal === null && parsed?.ok === true && parsed?.status === 'removed'
        ? null : new Error('failed'));
    });
    child.stdin.end(request);
  });
}

export async function removeConfinedPlaywrightTree(filesystem, root) {
  if (!filesystem || ['open', 'lstat', 'readdir', 'rm'].some(name => typeof filesystem[name] !== 'function')
    || basename(root) !== PLAYWRIGHT_TMP_NAME) throw new GuardianFailure('scenario-closure-failed');
  const parent = dirname(root);
  const handles = [];
  const receipts = [];
  const openBound = async (path, expectedKind) => {
    const before = await filesystem.lstat(path).catch(() => null);
    const expected = confinedEntryIdentity(before);
    if (expected.kind !== expectedKind) throw new GuardianFailure('scenario-closure-failed');
    const flags = fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW
      | (expectedKind === 'directory' ? fsConstants.O_DIRECTORY : 0);
    const handle = await filesystem.open(path, flags).catch(() => null);
    if (!handle || typeof handle.stat !== 'function' || typeof handle.close !== 'function') {
      throw new GuardianFailure('scenario-closure-failed');
    }
    handles.push(handle);
    const [held, after] = await Promise.all([
      handle.stat().catch(() => null), filesystem.lstat(path).catch(() => null),
    ]);
    if (!confinedEntryMatches(held, expected) || !confinedEntryMatches(after, expected)) {
      throw new GuardianFailure('scenario-closure-failed');
    }
    const receipt = Object.freeze({ path, handle, identity: expected });
    receipts.push(receipt);
    return receipt;
  };
  try {
    const parentReceipt = await openBound(parent, 'directory');
    if (parentReceipt.identity.uid !== INTRINSIC_PROCESS_UID || parentReceipt.identity.mode !== 0o700) {
      throw new GuardianFailure('scenario-closure-failed');
    }
    const rootReceipt = await openBound(root, 'directory');
    if (rootReceipt.identity.uid !== INTRINSIC_PROCESS_UID || rootReceipt.identity.mode !== 0o700) {
      throw new GuardianFailure('scenario-closure-failed');
    }
    const stack = [{ path: root, depth: 0, scope: 'root' }];
    let entriesSeen = 0;
    let bytesSeen = 0;
    let cliFiles = 0;
    let cliBytes = 0;
    while (stack.length > 0) {
      const current = stack.pop();
      const names = await filesystem.readdir(current.path).catch(() => null);
      if (!Array.isArray(names) || names.length > 4_096) {
        throw new GuardianFailure('scenario-closure-failed');
      }
      for (const name of names) {
        entriesSeen += 1;
        if (entriesSeen > 8_192 || typeof name !== 'string' || name.length < 1 || name.length > 255
          || name.includes('/') || name === '.' || name === '..') {
          throw new GuardianFailure('scenario-closure-failed');
        }
        let childScope = current.scope;
        let allowedTopModes = null;
        if (current.depth === 0) {
          if (name === PLAYWRIGHT_CLI_OUTPUT_NAME) {
            childScope = 'cli';
            allowedTopModes = new Set([0o700]);
          } else if (/^playwright_chromiumdev_profile-[A-Za-z0-9_-]{1,80}$/.test(name)) {
            childScope = 'profile';
            allowedTopModes = new Set([0o700]);
          } else if (/^pw-[0-9a-f]{8}$/.test(name)) {
            childScope = 'profile';
            allowedTopModes = new Set([0o700, 0o755]);
          } else throw new GuardianFailure('scenario-closure-failed');
        } else if (current.scope === 'cli' && !playwrightCliFileNameIsExact(name)) {
          throw new GuardianFailure('scenario-closure-failed');
        }
        const path = join(current.path, name);
        const metadata = await filesystem.lstat(path).catch(() => null);
        const kind = confinedEntryKind(metadata);
        if (!kind || metadata.uid !== INTRINSIC_PROCESS_UID || (metadata.mode & 0o022) !== 0) {
          throw new GuardianFailure('scenario-closure-failed');
        }
        if (current.scope === 'cli' && (kind !== 'file' || (metadata.mode & 0o777) !== 0o600)) {
          throw new GuardianFailure('scenario-closure-failed');
        }
        if (current.depth === 0 && (kind !== 'directory'
          || !allowedTopModes.has(metadata.mode & 0o777))) {
          throw new GuardianFailure('scenario-closure-failed');
        }
        const receipt = await openBound(path, kind);
        if (kind === 'directory') {
          if (current.depth >= 8) throw new GuardianFailure('scenario-closure-failed');
          stack.push({ path, depth: current.depth + 1, scope: childScope });
        } else {
          if (receipt.identity.nlink !== 1 || !Number.isSafeInteger(receipt.identity.size)
            || receipt.identity.size < 0) {
            throw new GuardianFailure('scenario-closure-failed');
          }
          bytesSeen += receipt.identity.size;
          if (bytesSeen > 536_870_912) throw new GuardianFailure('scenario-closure-failed');
          if (current.scope === 'cli') {
            cliFiles += 1;
            cliBytes += receipt.identity.size;
            if (cliFiles > PLAYWRIGHT_CLI_FILE_LIMIT
              || receipt.identity.size > PLAYWRIGHT_CLI_FILE_BYTES_LIMIT
              || cliBytes > PLAYWRIGHT_CLI_TOTAL_BYTES_LIMIT) {
              throw new GuardianFailure('scenario-closure-failed');
            }
          }
        }
      }
    }
    for (const receipt of receipts) {
      const [held, named] = await Promise.all([
        receipt.handle.stat().catch(() => null), filesystem.lstat(receipt.path).catch(() => null),
      ]);
      if (!confinedEntryMatches(held, receipt.identity)
        || !confinedEntryMatches(named, receipt.identity)) {
        throw new GuardianFailure('scenario-closure-failed');
      }
    }
    await (filesystem.removePlaywrightTree ?? runPlaywrightCleanupHelper)({
      parentReceipt, rootReceipt, receipts,
    });
    try {
      await filesystem.lstat(root);
      throw new GuardianFailure('scenario-closure-failed');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  } catch (error) {
    if (error instanceof GuardianFailure) throw error;
    throw new GuardianFailure('scenario-closure-failed');
  } finally {
    await Promise.all(handles.map(handle => handle.close().catch(() => {})));
  }
}

function failureSummary({
  category,
  state,
  history,
  primaryCategory = category,
  primaryStage = state,
  diagnostic = null,
  interrupted = false,
  browserClosureCertified = false,
  closureCertified = false,
  workspacePreservation = 'verified-absent',
  manifestPreservation = 'verified-absent',
}) {
  return Object.freeze({
    ok: false,
    category,
    primaryCategory,
    primaryStage,
    ...(diagnostic ? { diagnostic } : {}),
    state,
    history: [...history],
    interrupted,
    browserClosureCertified,
    closureCertified,
    workspacePreservation,
    manifestPreservation,
    recovery: new Set([workspacePreservation, manifestPreservation]).has('verified-present')
      || new Set([workspacePreservation, manifestPreservation]).has('uncertain')
      ? 'recovery-required'
      : 'no-recovery-artifact',
  });
}

function validateHostedPreconditions(value, options) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new GuardianFailure('hosted-precondition-failed');
  }
  const expectedKeys = [
    'deployedSha', 'stagingRunId', 'runStatus', 'runConclusion', 'runSha',
    'pullRequestNumber', 'pullRequestState', 'pullRequestMerged', 'pullRequestHeadSha',
  ].sort();
  const keys = Object.keys(value).sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    throw new GuardianFailure('hosted-precondition-failed');
  }
  if (
    value.deployedSha !== options.deployedSha
    || value.stagingRunId !== options.stagingRunId
    || value.runStatus !== 'completed'
    || value.runConclusion !== 'success'
    || value.runSha !== options.deployedSha
    || value.pullRequestNumber !== options.pullRequestNumber
    || value.pullRequestState !== 'OPEN'
    || value.pullRequestMerged !== false
    || value.pullRequestHeadSha !== options.deployedSha
  ) throw new GuardianFailure('hosted-precondition-failed');
}

function browserSessionNames(result) {
  if (!result || typeof result !== 'object' || !Array.isArray(result.browsers)) {
    throw new GuardianFailure('browser-closure-failed');
  }
  const names = result.browsers.map(item => {
    const name = typeof item === 'string' ? item : item?.name;
    if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(name)) {
      throw new GuardianFailure('browser-closure-failed');
    }
    return name;
  });
  if (new Set(names).size !== names.length) throw new GuardianFailure('browser-closure-failed');
  return names;
}

function requireExactObject(value, keys, category) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new GuardianFailure(category);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new GuardianFailure(category);
  }
  return value;
}

function requireCount(value, maximum, category) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new GuardianFailure(category);
  return value;
}

function requireExactStringSet(value, allowed, category, { complete = false } = {}) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new GuardianFailure(category);
  if (new Set(value).size !== value.length || value.some(item => !allowed.has(item))) throw new GuardianFailure(category);
  if (complete && (value.length !== allowed.size || value.some(item => !allowed.has(item)))) {
    throw new GuardianFailure(category);
  }
  if (value.some((item, index) => index > 0 && value[index - 1].localeCompare(item) >= 0)) {
    throw new GuardianFailure(category);
  }
  return value;
}

function validateRecoveryInspect(value, exactManifest) {
  const category = 'recovery-inspect-uncertain';
  requireExactObject(value, ['command', 'ok', 'aliases', 'counts', 'states', 'drift', 'uidSuffixes'], category);
  if (value.command !== 'inspect' || typeof value.ok !== 'boolean') throw new GuardianFailure(category);
  const definition = buildFixtureDefinition({
    runId: exactManifest.runId,
    expiresAt: exactManifest.expiresAt,
    manifestVersion: FIXTURE_MANIFEST_VERSION,
  });
  const aliases = new Set(definition.identities.map(identity => identity.alias));
  const driftAliases = new Set([...aliases, ...definition.documents.map(document => document.alias)]);
  requireExactStringSet(value.aliases, aliases, category);
  const uidSuffixes = new Set(exactManifest.authUids.map(uid => uid.slice(`${exactManifest.runId}-`.length)));
  requireExactStringSet(value.uidSuffixes, uidSuffixes, category, { complete: true });
  const counts = requireExactObject(value.counts, ['expected', 'actualPresent'], category);
  const expected = requireExactObject(counts.expected, ['auth', 'firestore'], category);
  const actual = requireExactObject(counts.actualPresent, ['auth', 'firestore'], category);
  if (expected.auth !== exactManifest.authUids.length || expected.firestore !== exactManifest.firestorePaths.length) {
    throw new GuardianFailure(category);
  }
  requireCount(actual.auth, exactManifest.authUids.length, category);
  requireCount(actual.firestore, exactManifest.firestorePaths.length, category);
  const states = requireExactObject(value.states, ['manifest', 'problems'], category);
  if (states.manifest !== exactManifest.state) throw new GuardianFailure(category);
  if (!Array.isArray(value.drift) || value.drift.length > FIXTURE_RESOURCE_COUNTS.auth + FIXTURE_RESOURCE_COUNTS.firestore) {
    throw new GuardianFailure(category);
  }
  requireCount(states.problems, value.drift.length, category);
  if (states.problems !== value.drift.length || value.ok !== (value.drift.length === 0)) throw new GuardianFailure(category);
  for (const entry of value.drift) {
    requireExactObject(entry, ['kind', 'alias', 'field', 'reason'], category);
    if (
      !new Set(['auth', 'firestore']).has(entry.kind)
      || !driftAliases.has(entry.alias)
      || entry.field !== 'presence'
      || entry.reason !== 'missing'
    ) throw new GuardianFailure(category);
  }
  const authMaximum = new Map(definition.identities.map(identity => [identity.alias, 1]));
  const firestoreMaximum = new Map();
  for (const document of definition.documents) {
    firestoreMaximum.set(document.alias, (firestoreMaximum.get(document.alias) ?? 0) + 1);
  }
  const observedMissing = { auth: new Map(), firestore: new Map() };
  for (const entry of value.drift) {
    const countsForKind = observedMissing[entry.kind];
    countsForKind.set(entry.alias, (countsForKind.get(entry.alias) ?? 0) + 1);
  }
  for (const [kind, maximum] of [['auth', authMaximum], ['firestore', firestoreMaximum]]) {
    for (const [alias, count] of observedMissing[kind]) {
      if (count > (maximum.get(alias) ?? 0)) throw new GuardianFailure(category);
    }
  }
  const missingAuth = value.drift.filter(entry => entry.kind === 'auth').length;
  const missingFirestore = value.drift.filter(entry => entry.kind === 'firestore').length;
  if (
    missingAuth !== exactManifest.authUids.length - actual.auth
    || missingFirestore !== exactManifest.firestorePaths.length - actual.firestore
  ) throw new GuardianFailure(category);
  return Object.freeze({ auth: actual.auth, firestore: actual.firestore });
}

function validateRecoveryCleanup(value, expectedDeleted) {
  const category = 'recovery-cleanup-failed';
  requireExactObject(value, ['command', 'ok', 'retained', 'deleted', 'followUp'], category);
  if (value.command !== 'cleanup' || value.ok !== true || !Array.isArray(value.retained) || value.retained.length !== 0) {
    throw new GuardianFailure(category);
  }
  const deleted = requireExactObject(value.deleted, ['auth', 'firestore'], category);
  if (deleted.auth !== expectedDeleted.auth || deleted.firestore !== expectedDeleted.firestore) {
    throw new GuardianFailure(category);
  }
  const followUp = requireExactObject(value.followUp, ['retained', 'failures'], category);
  for (const name of ['retained', 'failures']) {
    const group = requireExactObject(followUp[name], ['auth', 'firestore'], category);
    for (const resource of ['auth', 'firestore']) {
      const summary = requireExactObject(group[resource], ['count', 'aliases'], category);
      if (summary.count !== 0 || !Array.isArray(summary.aliases) || summary.aliases.length !== 0) {
        throw new GuardianFailure(category);
      }
    }
  }
  return value;
}

function closedDataDescriptors(value, expectedKeys, category) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || utilTypes.isProxy(value)) {
    throw new GuardianFailure(category);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new GuardianFailure(category);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some(key => typeof key !== 'string')) throw new GuardianFailure(category);
  const expected = [...expectedKeys].sort();
  const actual = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new GuardianFailure(category);
  }
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
      throw new GuardianFailure(category);
    }
  }
  return descriptors;
}

function requireRequestFailure(value) {
  const category = 'scenario-runner-invalid';
  const descriptors = closedDataDescriptors(value, REQUEST_FAILURE_KEYS, category);
  const requestFailure = Object.fromEntries(REQUEST_FAILURE_KEYS.map(key => [key, descriptors[key].value]));
  if (!REQUEST_FAILURE_CLASSES.includes(requestFailure.failureClass)
    || !REQUEST_FAILURE_TARGET_CLASSES.includes(requestFailure.targetClass)
    || !REQUEST_FAILURE_RESOURCE_TYPES.includes(requestFailure.resourceType)
    || !REQUEST_FAILURE_NAVIGATION_RELATIONSHIPS.includes(requestFailure.navigationRelationship)
    || !REQUEST_FAILURE_MULTIPLICITIES.includes(requestFailure.multiplicity)) {
    throw new GuardianFailure(category);
  }
  return Object.freeze(requestFailure);
}

function snapshotArrayValues(value, maximum, category) {
  if (!Array.isArray(value) || utilTypes.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new GuardianFailure(category);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  const lengthDescriptor = descriptors.length;
  if (
    keys.some(key => typeof key !== 'string')
    || !lengthDescriptor
    || !Object.hasOwn(lengthDescriptor, 'value')
    || !Number.isSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
    || lengthDescriptor.value > maximum
    || lengthDescriptor.enumerable !== false
    || lengthDescriptor.configurable !== false
    || typeof lengthDescriptor.writable !== 'boolean'
    || keys.length !== lengthDescriptor.value + 1
  ) throw new GuardianFailure(category);
  const values = [];
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      !descriptor
      || !Object.hasOwn(descriptor, 'value')
      || descriptor.enumerable !== true
    ) throw new GuardianFailure(category);
    values[index] = descriptor.value;
  }
  return values;
}

function snapshotSessionIds(value, category) {
  const sessions = snapshotArrayValues(value, RUNNER_SESSION_LIMIT, category);
  if (sessions.some(session => typeof session !== 'string')) throw new GuardianFailure(category);
  return browserSessionNames({ browsers: sessions });
}

function snapshotRunnerCommand(value) {
  const category = 'scenario-runner-invalid';
  const descriptors = closedDataDescriptors(value, [
    'configFiles', 'entrypoint', 'entrypointSha256',
  ], category);
  const entrypoint = descriptors.entrypoint.value;
  const entrypointSha256 = descriptors.entrypointSha256.value;
  if (
    typeof entrypoint !== 'string'
    || !isAbsolute(entrypoint)
    || resolve(entrypoint) !== entrypoint
    || !entrypoint.endsWith('.mjs')
    || typeof entrypointSha256 !== 'string'
    || !/^[0-9a-f]{64}$/.test(entrypointSha256)
  ) throw new GuardianFailure(category);
  const configFiles = snapshotArrayValues(descriptors.configFiles.value, 8, category);
  if (configFiles.length < 1) throw new GuardianFailure(category);
  const configs = configFiles.map(config => {
    const configDescriptors = closedDataDescriptors(config, ['path', 'sha256'], category);
    const path = configDescriptors.path.value;
    const sha256 = configDescriptors.sha256.value;
    if (
      typeof path !== 'string'
      || !isAbsolute(path)
      || resolve(path) !== path
      || !path.endsWith('.json')
      || typeof sha256 !== 'string'
      || !/^[0-9a-f]{64}$/.test(sha256)
    ) throw new GuardianFailure(category);
    return Object.freeze({ path, sha256 });
  });
  if (new Set(configs.map(config => config.path)).size !== configs.length) {
    throw new GuardianFailure(category);
  }
  return Object.freeze({
    entrypoint,
    entrypointSha256,
    configFiles: Object.freeze(configs),
  });
}

function exactStringPolicy(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])
    || keys.some(key => typeof value[key] !== 'string' || value[key].length === 0)) return null;
  return Object.freeze(Object.fromEntries(keys.map(key => [key, value[key]])));
}

function processPolicyFromVerifiedConfigs(configFiles) {
  const candidates = configFiles.flatMap(config => {
    let parsed;
    try { parsed = JSON.parse(Buffer.from(config.contentsBase64, 'base64').toString('utf8')); } catch { return []; }
    const runtime = exactStringPolicy(parsed?.nodeRuntime, [
      'path', 'sha256', 'codesignIdentifier', 'teamIdentifier',
    ]);
    const chrome = exactStringPolicy(parsed?.chrome, [
      'appPath', 'binaryPath', 'binarySha256', 'codesignIdentifier', 'teamIdentifier',
    ]);
    if (!runtime || !chrome || runtime.path !== INTRINSIC_PROCESS_EXEC_PATH
      || !isAbsolute(runtime.path) || resolve(runtime.path) !== runtime.path
      || !/^[0-9a-f]{64}$/.test(runtime.sha256)
      || !isAbsolute(chrome.appPath) || resolve(chrome.appPath) !== chrome.appPath
      || !isAbsolute(chrome.binaryPath) || resolve(chrome.binaryPath) !== chrome.binaryPath
      || !chrome.binaryPath.startsWith(`${chrome.appPath}${sep}`)
      || !/^[0-9a-f]{64}$/.test(chrome.binarySha256)) return [];
    return [Object.freeze({ runtime, chrome })];
  });
  if (candidates.length > 1) throw new GuardianFailure('scenario-runner-invalid');
  return candidates[0] ?? null;
}

function pathInside(root, candidate) {
  const candidateRelative = relative(root, candidate);
  return candidateRelative !== ''
    && candidateRelative !== '..'
    && !candidateRelative.startsWith(`..${sep}`)
    && !isAbsolute(candidateRelative);
}

function exactUtf8(contents, category) {
  const text = contents.toString('utf8');
  if (text.includes('\u0000') || !Buffer.from(text, 'utf8').equals(contents)) {
    throw new GuardianFailure(category);
  }
  return text;
}

async function verifyRepositoryFile(root, file, expectedSha256, maximumBytes) {
  const category = 'scenario-runner-invalid';
  if (!pathInside(root, file)) throw new GuardianFailure(category);
  let metadata;
  let canonical;
  let contents;
  try {
    metadata = await lstat(file);
    canonical = await realpath(file);
    contents = await readFile(file);
  } catch {
    throw new GuardianFailure(category);
  }
  const actualSha256 = createHash('sha256').update(contents).digest('hex');
  if (
    canonical !== file
    || !pathInside(root, canonical)
    || !metadata.isFile()
    || metadata.isSymbolicLink()
    || (metadata.mode & 0o022) !== 0
    || !Number.isSafeInteger(metadata.size)
    || metadata.size < 1
    || metadata.size > maximumBytes
    || !Buffer.isBuffer(contents)
    || contents.length !== metadata.size
    || actualSha256 !== expectedSha256
  ) throw new GuardianFailure(category);
  return Object.freeze({
    sha256: actualSha256,
    byteLength: contents.length,
    text: exactUtf8(contents, category),
  });
}

async function verifyRunnerCommand(command, repositoryRoot) {
  const category = 'scenario-runner-invalid';
  let root;
  try {
    root = await realpath(repositoryRoot);
  } catch {
    throw new GuardianFailure(category);
  }
  if (!isAbsolute(repositoryRoot) || root !== repositoryRoot) throw new GuardianFailure(category);
  const entrypoint = await verifyRepositoryFile(
    root, command.entrypoint, command.entrypointSha256, RUNNER_ENTRYPOINT_LIMIT,
  );
  if (entrypoint.text.includes(RUN_MARKER_ENV)) throw new GuardianFailure(category);
  const configFiles = [];
  let configBytes = 0;
  for (const config of command.configFiles) {
    const verified = await verifyRepositoryFile(root, config.path, config.sha256, RUNNER_CONFIG_LIMIT);
    if (verified.text.includes(RUN_MARKER_ENV)) throw new GuardianFailure(category);
    configBytes += verified.byteLength;
    if (configBytes > RUNNER_CONFIG_TOTAL_LIMIT) throw new GuardianFailure(category);
    configFiles.push(Object.freeze({
      contentsBase64: Buffer.from(verified.text, 'utf8').toString('base64'),
      sha256: verified.sha256,
    }));
  }
  return Object.freeze({
    repositoryRoot: root,
    entrypointSource: entrypoint.text,
    entrypointSha256: entrypoint.sha256,
    configFiles: Object.freeze(configFiles),
    processPolicy: processPolicyFromVerifiedConfigs(configFiles),
  });
}

function verifyRunnerSnapshot(snapshot) {
  const category = 'scenario-runner-invalid';
  if (
    createHash('sha256').update(snapshot.entrypointSource, 'utf8').digest('hex') !== snapshot.entrypointSha256
    || snapshot.configFiles.some(config => (
      createHash('sha256').update(Buffer.from(config.contentsBase64, 'base64')).digest('hex') !== config.sha256
    ))
  ) throw new GuardianFailure(category);
  return snapshot;
}

function requireRunnerMessage(value, expectedKeys) {
  const category = 'scenario-runner-invalid';
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new GuardianFailure(category);
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new GuardianFailure(category);
  }
  return value;
}

function requireRunnerSessions(value) {
  let sessions;
  try {
    sessions = snapshotSessionIds(value, 'scenario-runner-invalid');
  } catch {
    throw new GuardianFailure('scenario-runner-invalid');
  }
  if (sessions.length > RUNNER_SESSION_LIMIT) throw new GuardianFailure('scenario-runner-invalid');
  if (sessions.some((session, index) => index > 0 && sessions[index - 1].localeCompare(session) >= 0)) {
    throw new GuardianFailure('scenario-runner-invalid');
  }
  return sessions;
}

function requireLaunchReceipts(value, browserSessions) {
  const receipts = snapshotArrayValues(value, RUNNER_SESSION_LIMIT, 'scenario-runner-invalid').map(item => {
    const descriptors = closedDataDescriptors(
      item, ['chromeMainPid', 'daemonPid', 'session'], 'scenario-runner-invalid',
    );
    const session = descriptors.session.value;
    const daemonPid = descriptors.daemonPid.value;
    const chromeMainPid = descriptors.chromeMainPid.value;
    if (typeof session !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(session)
      || !Number.isSafeInteger(daemonPid) || daemonPid <= 1
      || !Number.isSafeInteger(chromeMainPid) || chromeMainPid <= 1
      || daemonPid === chromeMainPid) throw new GuardianFailure('scenario-runner-invalid');
    return Object.freeze({ session, daemonPid, chromeMainPid });
  });
  receipts.sort((left, right) => left.session.localeCompare(right.session));
  if (!isDeepStrictEqual(receipts.map(receipt => receipt.session), browserSessions)
    || new Set(receipts.map(receipt => receipt.daemonPid)).size !== receipts.length
    || new Set(receipts.map(receipt => receipt.chromeMainPid)).size !== receipts.length
    || new Set(receipts.flatMap(receipt => [receipt.daemonPid, receipt.chromeMainPid])).size !== receipts.length * 2) {
    throw new GuardianFailure('scenario-runner-invalid');
  }
  return Object.freeze(receipts);
}

function requireOwnershipPayload(message) {
  const browserSessions = Object.freeze(requireRunnerSessions(message.browserSessions));
  const attachedBrowserSessions = Object.freeze(requireRunnerSessions(message.attachedBrowserSessions));
  if (attachedBrowserSessions.some(session => browserSessions.includes(session))) {
    throw new GuardianFailure('scenario-runner-invalid');
  }
  const launchReceipts = requireLaunchReceipts(message.launchReceipts, browserSessions);
  return Object.freeze({ browserSessions, attachedBrowserSessions, launchReceipts });
}

export function validateRunnerFailureTerminal(message, accepted) {
  const hasRequestFailure = Object.hasOwn(message ?? {}, 'requestFailure');
  requireRunnerMessage(message, [
    'attachedBrowserSessions', 'browserSessions', 'category', 'checkpoint', 'contextId', 'contextOrdinal', 'launchReceipts',
    'pendingBrowserSession', 'phase', 'releasedBrowserSessions', 'sequence', 'stage', 'type', 'version',
    'reason',
    ...(hasRequestFailure ? ['requestFailure'] : []),
  ]);
  if (!accepted || typeof accepted !== 'object' || Array.isArray(accepted)
    || message.type !== 'failure' || message.version !== 4
    || message.phase !== accepted.phase || message.sequence !== accepted.ownershipSequence
    || !RUNNER_FAILURE_CATEGORIES.has(message.category) || !RUNNER_FAILURE_STAGES.has(message.stage)
    || (new Set(['login', 'scenario-action']).has(message.stage)
      ? message.category !== 'scenario-failed'
      : message.category !== 'scenario-runner-invalid')
    || (accepted.ownershipComplete === true && message.stage !== 'row-emission')
    || accepted.terminal) throw new GuardianFailure('scenario-runner-invalid');
  const phaseContracts = CANONICAL_ROW_CONTRACTS[message.phase];
  if (!Number.isSafeInteger(message.contextOrdinal) || message.contextOrdinal < 0
    || message.contextOrdinal >= phaseContracts.length
    || typeof message.contextId !== 'string'
    || message.contextId !== phaseContracts[message.contextOrdinal].contextId
    || !(Object.hasOwn(RUNNER_DIAGNOSTICS, message.checkpoint)
      ? message.reason === RUNNER_DIAGNOSTICS[message.checkpoint]
      : ROUTE_DIAGNOSTIC_CHECKPOINTS.has(message.checkpoint)
        ? ROUTE_DIAGNOSTIC_REASONS.has(message.reason)
        : message.checkpoint === 'window-console-network'
          ? NETWORK_CONSOLE_DIAGNOSTIC_REASONS.has(message.reason)
        : isNoTeamDiagnostic(message.checkpoint, message.reason))
    || (ROUTE_DIAGNOSTIC_CHECKPOINTS.has(message.checkpoint)
      && phaseContracts[message.contextOrdinal].group !== 'admission-route')
    || (Object.hasOwn(NO_TEAM_DIAGNOSTIC_REASONS, message.checkpoint)
      && phaseContracts[message.contextOrdinal].alias !== 'qa-no-team')
    || message.stage !== RUNNER_DIAGNOSTIC_STAGES[message.checkpoint]) {
    throw new GuardianFailure('scenario-runner-invalid');
  }
  const requestFailure = hasRequestFailure ? requireRequestFailure(message.requestFailure) : null;
  const requestFailureDiagnostic = message.checkpoint === 'window-request-failure'
    && message.reason === 'request-failure-invalid';
  const priorWindowFailureDiagnostic = message.checkpoint === 'window-console-network'
    && message.reason === 'request-failure-prior-window';
  if (hasRequestFailure && (!(requestFailureDiagnostic || priorWindowFailureDiagnostic)
    || message.stage !== 'scenario-action')) {
    throw new GuardianFailure('scenario-runner-invalid');
  }
  const diagnosticContext = Object.freeze({
    contextOrdinal: message.contextOrdinal, contextId: message.contextId,
  });
  if ((message.checkpoint === 'runner-initialization' && accepted.currentContext !== null)
    || (message.checkpoint === 'runner-initialization'
      ? message.contextOrdinal !== 0
      : accepted.currentContext === null
        || !isDeepStrictEqual(diagnosticContext, accepted.currentContext))) {
    throw new GuardianFailure('scenario-runner-invalid');
  }
  const expectedPending = accepted.pendingOwnershipIntent?.session ?? null;
  const activeCount = accepted.activeAnnouncedSessions.size + accepted.attachedSessions.size;
  if ((message.stage === 'acquisition' && expectedPending === null)
    || (expectedPending !== null
      && !new Set(['authorization', 'acquisition', 'receipt']).has(message.stage))
    || (new Set(['recorder', 'viewport', 'login', 'scenario-action', 'release']).has(message.stage)
      && activeCount === 0)
    || (message.stage === 'row-emission' && accepted.ownershipComplete !== true)) {
    throw new GuardianFailure('scenario-runner-invalid');
  }
  if ((message.pendingBrowserSession !== null
      && (typeof message.pendingBrowserSession !== 'string'
        || requireRunnerSessions([message.pendingBrowserSession]).length !== 1))
    || message.pendingBrowserSession !== expectedPending) {
    throw new GuardianFailure('scenario-runner-invalid');
  }
  const actual = Object.freeze({
    browserSessions: Object.freeze(requireRunnerSessions(message.browserSessions)),
    attachedBrowserSessions: Object.freeze(requireRunnerSessions(message.attachedBrowserSessions)),
    releasedBrowserSessions: Object.freeze(requireRunnerSessions(message.releasedBrowserSessions)),
  });
  const withReceipts = Object.freeze({
    ...actual,
    launchReceipts: requireLaunchReceipts(message.launchReceipts, actual.browserSessions),
  });
  const expected = Object.freeze({
    browserSessions: Object.freeze([...accepted.activeAnnouncedSessions].sort()),
    attachedBrowserSessions: Object.freeze([...accepted.attachedSessions].sort()),
    releasedBrowserSessions: Object.freeze([...accepted.releasedSessions].sort()),
    launchReceipts: Object.freeze([...accepted.activeAnnouncedReceipts.values()].sort((left, right) => (
      left.session.localeCompare(right.session)
    ))),
  });
  if (!isDeepStrictEqual(withReceipts, expected)) throw new GuardianFailure('scenario-runner-invalid');
  const currentSessions = canonicalBrowserSessionsForRow(phaseContracts[message.contextOrdinal]);
  const acceptedSessions = new Set([
    ...expected.browserSessions, ...expected.attachedBrowserSessions, ...expected.releasedBrowserSessions,
    ...(expectedPending ? [expectedPending] : []),
  ]);
  if (!new Set(['runner-initialization', 'context-start']).has(message.checkpoint)
    && currentSessions.some(session => !acceptedSessions.has(session))) {
    throw new GuardianFailure('scenario-runner-invalid');
  }
  return Object.freeze({
    ok: false, category: message.category, stage: message.stage,
    diagnostic: Object.freeze({
      ...diagnosticContext,
      checkpoint: message.checkpoint, reason: message.reason,
      ...(requestFailure ? { requestFailure } : {}),
    }),
    pendingBrowserSession: message.pendingBrowserSession,
    ...withReceipts,
    rows: Object.freeze([]),
  });
}

function requirePhaseRow(value, phase, index) {
  const expected = CANONICAL_ROW_CONTRACTS[phase]?.[index];
  if (!expected) throw new GuardianFailure('scenario-runner-invalid');
  let row;
  try {
    row = validateLedgerRow(value);
  } catch {
    throw new GuardianFailure('scenario-runner-invalid');
  }
  for (const field of ['contextId', 'group', 'alias', 'viewport', 'startState']) {
    if (row[field] !== expected[field]) throw new GuardianFailure('scenario-runner-invalid');
  }
  return row;
}

function validateCompleteRows(rowsByContext) {
  if (rowsByContext.size !== SCENARIO_TOTALS.total) {
    throw new GuardianFailure('scenario-runner-invalid');
  }
  const rows = CANONICAL_ROW_CONTRACTS.all.map(contract => rowsByContext.get(contract.contextId));
  if (rows.some(row => !row)) throw new GuardianFailure('scenario-runner-invalid');
  try {
    validateLedger(rows, { groupCounts: SCENARIO_GROUP_COUNTS, totals: SCENARIO_TOTALS });
  } catch {
    throw new GuardianFailure('scenario-runner-invalid');
  }
  return Object.freeze(rows.map(row => Object.freeze(
    Object.fromEntries(REQUIRED_LEDGER_COLUMNS.map(column => [column, row[column]])),
  )));
}

function executeProcessAudit(command, args, maxBuffer = PROCESS_AUDIT_OUTPUT_LIMIT, signal) {
  return new INTRINSIC_PROMISE((resolveAudit, rejectAudit) => {
    INTRINSIC_CHILD_EXEC_FILE(command, args, {
      encoding: 'utf8', env: { LC_ALL: 'C', PATH: '/usr/bin:/bin' }, maxBuffer,
      timeout: 30_000, windowsHide: true,
      ...(signal ? { signal } : {}),
    }, (error, stdout, stderr) => {
      if (error || typeof stdout !== 'string' || typeof stderr !== 'string') {
        rejectAudit(new GuardianFailure('scenario-closure-failed'));
        return;
      }
      resolveAudit(Object.freeze({ stdout, stderr }));
    });
  });
}

function processSnapshotsMatch(left, right) {
  return left?.pid === right?.pid && left?.ppid === right?.ppid && left?.pgid === right?.pgid
    && left?.startSec === right?.startSec && left?.startUsec === right?.startUsec
    && left?.executable === right?.executable && left?.markerPresent === true
    && right?.markerPresent === true
    && left?.markerArgumentPresent === right?.markerArgumentPresent
    && left?.inspectionError === right?.inspectionError
    && left?.inspectionErrorKind === right?.inspectionErrorKind
    && isDeepStrictEqual(left?.argv, right?.argv);
}

function fileMetadataSnapshot(metadata) {
  if (!metadata?.isFile?.() || metadata.isSymbolicLink?.()) return null;
  const bigint = typeof metadata.dev === 'bigint';
  const value = name => bigint ? metadata[name] : BigInt(metadata[name]);
  const size = value('size');
  if (size < 0n || size > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const mtimeNs = bigint && typeof metadata.mtimeNs === 'bigint'
    ? metadata.mtimeNs : BigInt(Math.round(metadata.mtimeMs * 1_000_000));
  const ctimeNs = bigint && typeof metadata.ctimeNs === 'bigint'
    ? metadata.ctimeNs : BigInt(Math.round(metadata.ctimeMs * 1_000_000));
  return Object.freeze({
    dev: String(value('dev')), ino: String(value('ino')), size: Number(size),
    mtimeNs: String(mtimeNs), ctimeNs: String(ctimeNs),
    mode: Number(value('mode') & 0o777n), uid: Number(value('uid')),
    nlink: Number(value('nlink')),
  });
}

function executableMetadataStillMatches(left, right) {
  const snapshot = right?.isFile ? fileMetadataSnapshot(right) : right;
  return left && snapshot && isDeepStrictEqual(left, snapshot);
}

function requireAuditSignal(signal) {
  if (signal === undefined) return undefined;
  if (!signal || typeof signal !== 'object' || typeof signal.aborted !== 'boolean'
    || typeof signal.addEventListener !== 'function') {
    throw new GuardianFailure('scenario-closure-failed');
  }
  return signal;
}

function requireAuditActive(signal) {
  if (signal?.aborted) throw new GuardianFailure('scenario-closure-failed');
}

function requireAuditDeadline(deadline) {
  if (!Number.isFinite(deadline) || Date.now() >= deadline) {
    throw new GuardianFailure('scenario-closure-failed');
  }
}

function boundedAuditOperation(candidate, deadline, signal, cancel) {
  return new INTRINSIC_PROMISE((resolveOperation, rejectOperation) => {
    let settled = false;
    let timer = null;
    const abort = () => settle(rejectOperation, new GuardianFailure('scenario-closure-failed'), true);
    const settle = (handler, value, shouldCancel = false) => {
      if (settled) return;
      settled = true;
      if (timer !== null) {
        INTRINSIC_REFLECT_APPLY(INTRINSIC_CLEAR_TIMEOUT, INTRINSIC_GLOBAL_THIS, [timer]);
      }
      if (signal) {
        INTRINSIC_REFLECT_APPLY(INTRINSIC_EVENT_TARGET_REMOVE, signal, ['abort', abort]);
      }
      if (shouldCancel) {
        try { cancel?.(); } catch {}
      }
      handler(value);
    };
    const remaining = deadline - Date.now();
    if (remaining <= 0 || signal?.aborted) {
      abort();
      return;
    }
    timer = INTRINSIC_REFLECT_APPLY(INTRINSIC_SET_TIMEOUT, INTRINSIC_GLOBAL_THIS, [
      abort, remaining,
    ]);
    if (signal) {
      INTRINSIC_REFLECT_APPLY(INTRINSIC_EVENT_TARGET_ADD, signal, ['abort', abort, { once: true }]);
    }
    try {
      consumeNativePromise(
        candidate,
        value => settle(resolveOperation, value),
        () => settle(rejectOperation, new GuardianFailure('scenario-closure-failed')),
        'scenario-closure-failed',
      );
    } catch {
      settle(rejectOperation, new GuardianFailure('scenario-closure-failed'));
    }
  });
}

async function hashHeldRegularFile(
  path, maximumBytes, timeoutMs, { captureBytes = false, signal } = {},
) {
  signal = requireAuditSignal(signal);
  requireAuditActive(signal);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > EXECUTABLE_HASH_TIMEOUT_MS) {
    throw new GuardianFailure('scenario-closure-failed');
  }
  let handle;
  try {
    handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  } catch {
    throw new GuardianFailure('scenario-closure-failed');
  }
  let stream = null;
  let failed = false;
  const deadline = Date.now() + timeoutMs;
  const readController = new INTRINSIC_ABORT_CONTROLLER();
  const cancelRead = () => {
    if (!readController.signal.aborted) readController.abort();
    try { stream?.destroy?.(); } catch {}
  };
  try {
    const beforeRaw = await boundedAuditOperation(
      handle.stat({ bigint: true }), deadline, signal, cancelRead,
    );
    requireAuditActive(signal);
    requireAuditDeadline(deadline);
    const before = fileMetadataSnapshot(beforeRaw);
    if (!before || before.size < 1 || before.size > maximumBytes) {
      throw new GuardianFailure('scenario-closure-failed');
    }
    const hash = createHash('sha256');
    const chunks = captureBytes ? [] : null;
    stream = handle.createReadStream({
      start: 0,
      end: before.size - 1,
      highWaterMark: EXECUTABLE_HASH_CHUNK_BYTES,
      autoClose: false,
      emitClose: false,
      signal: readController.signal,
    });
    const iterator = stream[Symbol.asyncIterator]();
    let position = 0;
    while (true) {
      requireAuditActive(signal);
      requireAuditDeadline(deadline);
      const next = await boundedAuditOperation(iterator.next(), deadline, signal, cancelRead);
      requireAuditActive(signal);
      requireAuditDeadline(deadline);
      if (next.done) break;
      const chunk = next.value;
      if (!Buffer.isBuffer(chunk) || chunk.length < 1
        || chunk.length > EXECUTABLE_HASH_CHUNK_BYTES
        || position + chunk.length > before.size) {
        throw new GuardianFailure('scenario-closure-failed');
      }
      hash.update(chunk);
      if (chunks) chunks.push(Buffer.from(chunk));
      position += chunk.length;
    }
    if (position !== before.size) throw new GuardianFailure('scenario-closure-failed');
    requireAuditActive(signal);
    requireAuditDeadline(deadline);
    const afterRaw = await boundedAuditOperation(
      handle.stat({ bigint: true }), deadline, signal, cancelRead,
    );
    requireAuditActive(signal);
    requireAuditDeadline(deadline);
    const after = fileMetadataSnapshot(afterRaw);
    if (!executableMetadataStillMatches(before, after)) {
      throw new GuardianFailure('scenario-closure-failed');
    }
    const sha256 = hash.digest('hex');
    requireAuditActive(signal);
    requireAuditDeadline(deadline);
    const result = Object.freeze({
      metadata: before,
      sha256,
      ...(chunks ? { bytes: Buffer.concat(chunks, before.size) } : {}),
    });
    requireAuditDeadline(deadline);
    return result;
  } catch (error) {
    failed = true;
    if (error instanceof GuardianFailure) throw error;
    throw new GuardianFailure('scenario-closure-failed');
  } finally {
    cancelRead();
    const closeDeadline = failed ? Date.now() + EXECUTABLE_CLOSE_TIMEOUT_MS : deadline;
    try {
      await boundedAuditOperation(handle.close(), closeDeadline, undefined, cancelRead);
      if (!failed) requireAuditDeadline(deadline);
    } catch {
      if (!failed) throw new GuardianFailure('scenario-closure-failed');
    }
  }
}

async function executableIdentity(path, signal, timeoutMs = EXECUTABLE_HASH_TIMEOUT_MS) {
  requireAuditActive(signal);
  let canonical;
  try { canonical = await realpath(path); } catch {
    throw new GuardianFailure('scenario-closure-failed');
  }
  if (canonical !== path) throw new GuardianFailure('scenario-closure-failed');
  const { metadata: before, sha256 } = await hashHeldRegularFile(
    path, EXECUTABLE_MAX_BYTES, timeoutMs, { signal },
  );
  requireAuditActive(signal);
  if ((before.mode & 0o111) === 0) throw new GuardianFailure('scenario-closure-failed');
  const after = await lstat(path, { bigint: true }).catch(() => null);
  if (!executableMetadataStillMatches(before, after)) throw new GuardianFailure('scenario-closure-failed');
  return Object.freeze({
    executableDev: before.dev,
    executableIno: before.ino,
    executableSize: before.size,
    executableMtimeNs: before.mtimeNs,
    executableCtimeNs: before.ctimeNs,
    executableMode: before.mode,
    executableUid: before.uid,
    executableNlink: before.nlink,
    executableSha256: sha256,
  });
}

let capturedProcessInspectorPromise = null;

async function captureProcessInspector() {
  const source = await hashHeldRegularFile(
    PROCESS_INSPECTOR_PATH, PROCESS_INSPECTOR_LIMIT, EXECUTABLE_HASH_TIMEOUT_MS,
    { captureBytes: true },
  );
  const sourceBytes = source.bytes;
  if (source.sha256 !== PROCESS_INSPECTOR_SHA256 || sourceBytes.length !== source.metadata.size
    || createHash('sha256').update(sourceBytes).digest('hex') !== PROCESS_INSPECTOR_SHA256
    || sourceBytes.includes(0) || !Buffer.from(sourceBytes.toString('utf8'), 'utf8').equals(sourceBytes)) {
    throw new GuardianFailure('scenario-closure-failed');
  }
  const runtime = await executableIdentity(PROCESS_INSPECTOR_RUNTIME);
  if (runtime.executableSha256 !== PROCESS_INSPECTOR_RUNTIME_SHA256
    || runtime.executableUid !== 0 || (runtime.executableMode & 0o022) !== 0
    || runtime.executableSize > PROCESS_INSPECTOR_RUNTIME_LIMIT) {
    throw new GuardianFailure('scenario-closure-failed');
  }
  return Object.freeze({ source: sourceBytes.toString('utf8'), runtime });
}

function capturedProcessInspector() {
  capturedProcessInspectorPromise ??= captureProcessInspector();
  return capturedProcessInspectorPromise;
}

function requireInspectorRecord(value, expectedPids) {
  const keys = Object.keys(value ?? {}).sort();
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || !isDeepStrictEqual(keys, [
      'argv', 'executable', 'inspectionError', 'inspectionErrorKind', 'markerArgumentPresent',
      'markerPresent', 'pgid', 'pid', 'ppid', 'startSec', 'startUsec',
    ])) throw new GuardianFailure('scenario-closure-failed');
  if (![value.pid, value.ppid, value.pgid, value.startSec, value.startUsec]
    .every(item => Number.isSafeInteger(item) && item >= 0)
    || value.pid <= 0 || value.pid === process.pid || value.pgid <= 0
    || value.startSec <= 0 || value.startUsec > 999_999 || value.markerPresent !== true
    || typeof value.markerArgumentPresent !== 'boolean'
    || typeof value.inspectionError !== 'boolean'
    || !new Set(['', 'argv0Ambiguous', 'inspectionUnavailable', 'parseFailure', 'unsafeExecutablePath'])
      .has(value.inspectionErrorKind)
    || !Array.isArray(value.argv) || value.argv.length > 256
    || Object.keys(value.argv).length !== value.argv.length
    || value.argv.some(argument => typeof argument !== 'string' || argument.length > 16_384)
    || value.argv.reduce((total, argument) => total + Buffer.byteLength(argument), 0) > 262_144
    || (expectedPids && !expectedPids.has(value.pid))) {
    throw new GuardianFailure('scenario-closure-failed');
  }
  if (value.inspectionError) {
    if (value.argv.length !== 0 || value.executable !== '' || value.inspectionErrorKind === '') {
      throw new GuardianFailure('scenario-closure-failed');
    }
  } else if (value.argv.length < 1 || typeof value.executable !== 'string'
    || !isAbsolute(value.executable) || value.inspectionErrorKind !== '') {
    throw new GuardianFailure('scenario-closure-failed');
  }
  return Object.freeze({
    pid: value.pid, ppid: value.ppid, pgid: value.pgid,
    startSec: value.startSec, startUsec: value.startUsec,
    argv: Object.freeze([...value.argv]), executable: value.executable,
    markerPresent: true, markerArgumentPresent: value.markerArgumentPresent,
    inspectionError: value.inspectionError, inspectionErrorKind: value.inspectionErrorKind,
  });
}

export function parseDarwinProcessInspectorOutput(
  stdout, pids, { allowInspectionErrors = false } = {},
) {
  const category = 'scenario-closure-failed';
  const expectedPids = pids === undefined ? null : new Set(pids);
  if (pids !== undefined && (!Array.isArray(pids) || expectedPids.size !== pids.length
    || pids.length > 65_536 || pids.some(pid => !Number.isSafeInteger(pid) || pid <= 0))) {
    throw new GuardianFailure(category);
  }
  let parsed;
  try { parsed = JSON.parse(stdout); } catch { throw new GuardianFailure(category); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
    || !isDeepStrictEqual(Object.keys(parsed).sort(), ['records', 'status', 'version'])
    || parsed.version !== 2 || parsed.status !== 'ok' || !Array.isArray(parsed.records)
    || parsed.records.length > 256 || Object.keys(parsed.records).length !== parsed.records.length) {
    throw new GuardianFailure(category);
  }
  const records = parsed.records.map(value => requireInspectorRecord(value, expectedPids));
  if (records.some((record, index) => index > 0 && records[index - 1].pid >= record.pid)) {
    throw new GuardianFailure(category);
  }
  if (!allowInspectionErrors && records.some(record => record.inspectionError)) {
    throw new GuardianFailure(category);
  }
  return Object.freeze(records);
}

async function runDarwinProcessInspector(
  runMarker, pids, { signal, allowInspectionErrors = false } = {},
) {
  const category = 'scenario-closure-failed';
  signal = requireAuditSignal(signal);
  requireAuditActive(signal);
  if (typeof runMarker !== 'string' || !/^[0-9a-f]{64}$/.test(runMarker)) {
    throw new GuardianFailure(category);
  }
  const expectedPids = pids === undefined ? null : new Set(pids);
  if (pids !== undefined && (!Array.isArray(pids) || expectedPids.size !== pids.length
    || pids.length > 65_536 || pids.some(pid => !Number.isSafeInteger(pid) || pid <= 0))) {
    throw new GuardianFailure(category);
  }
  if (INTRINSIC_PROCESS_PLATFORM !== 'darwin') throw new GuardianFailure(category);
  const inspector = await capturedProcessInspector();
  const args = [
    '-c', inspector.source,
    '--marker-name', RUN_MARKER_ENV,
    '--marker-value', runMarker,
    ...(pids === undefined ? [] : ['--pids', [...expectedPids].sort((a, b) => a - b).join(',')]),
  ];
  const result = await executeProcessAudit(
    PROCESS_INSPECTOR_RUNTIME, args, PROCESS_AUDIT_OUTPUT_LIMIT, signal,
  );
  requireAuditActive(signal);
  const runtimeAfter = await lstat(PROCESS_INSPECTOR_RUNTIME, { bigint: true }).catch(() => null);
  if (!executableRecordStillMatches(inspector.runtime, runtimeAfter)) throw new GuardianFailure(category);
  return parseDarwinProcessInspectorOutput(result.stdout, pids, { allowInspectionErrors });
}

export function inspectDarwinMarkedProcesses(runMarker, pids, { signal } = {}) {
  return runDarwinProcessInspector(runMarker, pids, { signal });
}

export function inspectDarwinMarkedProcessesForTermination(runMarker, pids, { signal } = {}) {
  return runDarwinProcessInspector(runMarker, pids, { signal, allowInspectionErrors: true });
}

export async function auditMarkedProcesses(
  runMarker, {
    signal, executableHashTimeoutMs = EXECUTABLE_HASH_TIMEOUT_MS, onInspectionError,
  } = {},
) {
  signal = requireAuditSignal(signal);
  requireAuditActive(signal);
  if (!Number.isSafeInteger(executableHashTimeoutMs) || executableHashTimeoutMs < 1
    || executableHashTimeoutMs > EXECUTABLE_HASH_TIMEOUT_MS) {
    throw new GuardianFailure('scenario-closure-failed');
  }
  try {
    const inspect = async pids => {
      const records = await inspectDarwinMarkedProcessesForTermination(runMarker, pids, { signal });
      if (records.some(record => record.inspectionError)) {
        throw new GuardianFailure('scenario-closure-failed');
      }
      return records;
    };
    const first = await inspect(undefined);
    if (first.length === 0) return Object.freeze([]);
    const executableIdentities = new Map();
    for (const path of [...new Set(first.map(record => record.executable))].sort()) {
      executableIdentities.set(path, await executableIdentity(path, signal, executableHashTimeoutMs));
    }
    requireAuditActive(signal);
    const second = await inspect(first.map(record => record.pid));
    if (second.length !== first.length) throw new GuardianFailure('scenario-closure-failed');
    return Object.freeze(second.map((record, index) => {
      if (!processSnapshotsMatch(first[index], record)) throw new GuardianFailure('scenario-closure-failed');
      const identity = executableIdentities.get(record.executable);
      if (!identity) throw new GuardianFailure('scenario-closure-failed');
      return Object.freeze({ ...record, ...identity });
    }));
  } catch (error) {
    if (!signal?.aborted) onInspectionError?.();
    throw error;
  }
}

function signalMarkedProcesses(runMarker, signal, onInspectionError) {
  return new INTRINSIC_PROMISE((resolveSignal, rejectSignal) => {
    try {
      consumeNativePromise(
        inspectDarwinMarkedProcessesForTermination(runMarker),
        processes => {
          if (processes.some(record => record.inspectionError)) onInspectionError?.();
          let ok = true;
          for (const { pid } of processes) {
            try {
              INTRINSIC_PROCESS_KILL(pid, signal);
            } catch (error) {
              if (error?.code !== 'ESRCH') ok = false;
            }
          }
          resolveSignal(Object.freeze({ ok, pids: processes.map(item => item.pid) }));
        },
        () => {
          onInspectionError?.();
          rejectSignal(new GuardianFailure('scenario-closure-failed'));
        },
        'scenario-closure-failed',
      );
    } catch {
      onInspectionError?.();
      rejectSignal(new GuardianFailure('scenario-closure-failed'));
    }
  });
}

function waitForMarkedProcessesGone(runMarker, timeoutMs, onInspectionError) {
  return new INTRINSIC_PROMISE(resolveWait => {
    const startedAt = Date.now();
    const inspect = () => {
      try {
        consumeNativePromise(
          inspectDarwinMarkedProcessesForTermination(runMarker),
          pids => {
            if (pids.some(record => record.inspectionError)) onInspectionError?.();
            if (pids.length === 0) {
              resolveWait(true);
              return;
            }
            if (Date.now() - startedAt >= timeoutMs) {
              resolveWait(false);
              return;
            }
            INTRINSIC_REFLECT_APPLY(INTRINSIC_SET_TIMEOUT, INTRINSIC_GLOBAL_THIS, [inspect, 10]);
          },
          () => {
            onInspectionError?.();
            resolveWait(false);
          },
          'scenario-closure-failed',
        );
      } catch {
        onInspectionError?.();
        resolveWait(false);
      }
    };
    inspect();
  });
}

export async function terminateMarkedProcesses(runMarker, timeoutMs, { onInspectionError } = {}) {
  const uncertainResult = result => {
    onInspectionError?.();
    return Object.freeze(result);
  };
  let initial;
  try {
    initial = await inspectDarwinMarkedProcessesForTermination(runMarker);
  } catch {
    return uncertainResult({ cleared: false, discovered: false });
  }
  if (initial.some(record => record.inspectionError)) onInspectionError?.();
  if (initial.length === 0) return Object.freeze({ cleared: true, discovered: false });
  onInspectionError?.();
  const soft = await signalMarkedProcesses(runMarker, 'SIGTERM', onInspectionError);
  if (!soft.ok) return uncertainResult({ cleared: false, discovered: true });
  if (await waitForMarkedProcessesGone(runMarker, timeoutMs, onInspectionError)) {
    return Object.freeze({ cleared: true, discovered: true });
  }
  onInspectionError?.();
  const hard = await signalMarkedProcesses(runMarker, 'SIGKILL', onInspectionError);
  if (!hard.ok) return uncertainResult({ cleared: false, discovered: true });
  const cleared = await waitForMarkedProcessesGone(runMarker, timeoutMs, onInspectionError);
  if (!cleared) return uncertainResult({ cleared: false, discovered: true });
  return Object.freeze({ cleared: true, discovered: true });
}

async function verifySignedPath(path, policy) {
  const codesign = await lstat(SYSTEM_CODESIGN);
  if (!codesign.isFile() || codesign.isSymbolicLink() || await realpath(SYSTEM_CODESIGN) !== SYSTEM_CODESIGN
    || codesign.uid !== 0 || (codesign.mode & 0o022) !== 0) {
    throw new GuardianFailure('scenario-closure-failed');
  }
  await executeProcessAudit(SYSTEM_CODESIGN, [
    '--verify', '--deep',
    `-R=identifier "${policy.codesignIdentifier}" and anchor apple generic and certificate leaf[subject.OU] = "${policy.teamIdentifier}"`,
    path,
  ], 65_536);
}

function executableRecordStillMatches(record, metadata) {
  const snapshot = fileMetadataSnapshot(metadata);
  return snapshot
    && snapshot.dev === record.executableDev && snapshot.ino === record.executableIno
    && snapshot.size === record.executableSize && snapshot.mtimeNs === record.executableMtimeNs
    && snapshot.ctimeNs === record.executableCtimeNs && snapshot.mode === record.executableMode
    && snapshot.uid === record.executableUid && snapshot.nlink === record.executableNlink;
}

async function verifyPinnedExecutable(record, path, sha256, policy, {
  rootOwned = false, signedPath = path,
} = {}) {
  let canonical;
  try { canonical = await realpath(path); } catch {
    throw new GuardianFailure('scenario-closure-failed');
  }
  if (record.executable !== path || canonical !== path || record.executableSha256 !== sha256
    || (record.executableMode & 0o111) === 0 || (rootOwned && record.executableUid !== 0)
    || (rootOwned && (record.executableMode & 0o022) !== 0)) {
    throw new GuardianFailure('scenario-closure-failed');
  }
  await verifySignedPath(signedPath, policy);
  const after = await lstat(path, { bigint: true });
  if (!executableRecordStillMatches(record, after)) {
    throw new GuardianFailure('scenario-closure-failed');
  }
}

function validProcessInstanceIdentity(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...PROCESS_INSTANCE_IDENTITY_KEYS].sort().join(',')
    && [
      value.pid, value.ppid, value.pgid, value.startSec, value.startUsec,
      value.executableSize, value.executableMode, value.executableUid, value.executableNlink,
    ]
      .every(item => Number.isSafeInteger(item) && item >= 0)
    && [value.executableDev, value.executableIno, value.executableMtimeNs, value.executableCtimeNs]
      .every(item => typeof item === 'string' && /^(?:0|[1-9][0-9]*)$/.test(item))
    && value.pid > 0 && value.pgid > 0
    && value.startSec > 0 && value.startUsec <= 999_999
    && Array.isArray(value.argv) && value.argv.length > 0 && value.argv.length <= 256
    && Object.keys(value.argv).length === value.argv.length
    && value.argv.every(argument => typeof argument === 'string' && argument.length > 0)
    && typeof value.executable === 'string' && isAbsolute(value.executable)
    && /^[0-9a-f]{64}$/.test(value.executableSha256)
    && typeof value.codesignIdentifier === 'string' && value.codesignIdentifier.length > 0
    && typeof value.teamIdentifier === 'string' && value.teamIdentifier.length > 0;
}

export function processInstanceIdentityMatches(expected, actual) {
  return validProcessInstanceIdentity(expected) && validProcessInstanceIdentity(actual)
    && PROCESS_INSTANCE_IDENTITY_KEYS.every(key => key === 'argv'
      ? isDeepStrictEqual(expected.argv, actual.argv)
      : expected[key] === actual[key]);
}

function processInstanceIdentity(record, policy) {
  return Object.freeze({
    pid: record.pid, ppid: record.ppid, pgid: record.pgid,
    startSec: record.startSec, startUsec: record.startUsec,
    argv: Object.freeze([...record.argv]), executable: record.executable,
    executableDev: record.executableDev, executableIno: record.executableIno,
    executableSize: record.executableSize, executableMtimeNs: record.executableMtimeNs,
    executableCtimeNs: record.executableCtimeNs, executableMode: record.executableMode,
    executableUid: record.executableUid, executableNlink: record.executableNlink,
    executableSha256: record.executableSha256,
    codesignIdentifier: policy.codesignIdentifier, teamIdentifier: policy.teamIdentifier,
  });
}

function daemonCommandIsExact(record, receipt, runtimePath) {
  if (record.executable !== runtimePath || record.pgid !== record.pid
    || !Array.isArray(record.argv) || record.argv.length !== 4
    || record.argv[0] !== runtimePath || record.argv[2] !== receipt.session
    || record.argv[3] !== '--browser=chrome') return false;
  return new RegExp(
    `^${PLAYWRIGHT_TRANSPORT_ROOT_PATTERN.replaceAll('.', '\\.')}[0-9a-f]{48}`
      + `${PLAYWRIGHT_DAEMON_SUFFIX.replaceAll('.', '\\.')}$`,
  ).test(record.argv[1]);
}

function parseChromeSwitches(tokens) {
  const switches = new Map();
  const ordered = [];
  for (const token of tokens) {
    if (!token.startsWith('--')) return null;
    const separator = token.indexOf('=', 2);
    const name = separator === -1 ? token.slice(2) : token.slice(2, separator);
    const value = separator === -1 ? null : token.slice(separator + 1);
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name) || value === '') return null;
    if (!switches.has(name)) switches.set(name, []);
    switches.get(name).push(value);
    ordered.push(Object.freeze({ name, value }));
  }
  return Object.freeze({ switches, ordered: Object.freeze(ordered) });
}

const flagSwitch = (min = 1, max = 1) => Object.freeze({
  min, max, validate: value => value === null,
});
const exactValueSwitch = (expected, min = 1, max = 1) => Object.freeze({
  min, max, validate: value => value === expected,
});
const patternValueSwitch = (pattern, min = 1, max = 1) => Object.freeze({
  min, max, validate: value => typeof value === 'string' && pattern.test(value),
});

function switchSchemaIsExact(parsed, entries) {
  const schema = new Map(entries);
  for (const [name, values] of parsed.switches) {
    const rule = schema.get(name);
    if (!rule || values.length < rule.min || values.length > rule.max
      || values.some(value => !rule.validate(value))) return false;
  }
  for (const [name, rule] of schema) {
    const count = parsed.switches.get(name)?.length ?? 0;
    if (count < rule.min || count > rule.max) return false;
  }
  return true;
}

function chromeProfilePathIsExact(value, profileRoot, profileMode) {
  if (typeof value !== 'string' || typeof profileRoot !== 'string') return false;
  const name = profileMode === 'descriptor-relative' ? value
    : profileMode === 'absolute' && value.startsWith(`${profileRoot}/`)
      ? value.slice(profileRoot.length + 1) : null;
  if (name === null) return false;
  return /^playwright_chromiumdev_profile-[A-Za-z0-9_-]{1,80}$/.test(name);
}

function mainChromeSchema(profileRoot, profileMode) {
  const flags = [
    'disable-field-trial-config', 'disable-background-networking',
    'disable-background-timer-throttling', 'disable-backgrounding-occluded-windows',
    'disable-back-forward-cache', 'disable-breakpad', 'disable-client-side-phishing-detection',
    'disable-component-extensions-with-background-pages', 'disable-component-update',
    'no-default-browser-check', 'disable-default-apps', 'disable-dev-shm-usage',
    'disable-edgeupdater', 'disable-extensions', 'allow-pre-commit-input',
    'disable-hang-monitor', 'disable-ipc-flooding-protection', 'disable-popup-blocking',
    'disable-prompt-on-repost', 'disable-renderer-backgrounding', 'disable-updater-scheduler',
    'metrics-recording-only', 'no-first-run', 'use-mock-keychain', 'no-service-autorun',
    'export-tagged-pdf', 'unsafely-disable-devtools-self-xss-warnings',
    'edge-skip-compat-layer-relaunch', 'disable-infobars', 'disable-sync',
    'enable-unsafe-swiftshader', 'headless', 'hide-scrollbars', 'mute-audio',
    'remote-debugging-pipe', 'no-startup-window',
  ];
  return [
    ...flags.map(name => [name, flagSwitch()]),
    ['disable-search-engine-choice-screen', flagSwitch(2, 2)],
    ['disable-features', exactValueSwitch(CHROME_MAIN_DISABLE_FEATURES)],
    ['enable-features', exactValueSwitch(CHROME_ENABLE_FEATURES)],
    ['force-color-profile', exactValueSwitch('srgb')],
    ['password-store', exactValueSwitch('basic')],
    ['blink-settings', exactValueSwitch(CHROME_BLINK_SETTINGS)],
    ['disable-blink-features', exactValueSwitch('AutomationControlled')],
    ['user-data-dir', Object.freeze({ min: 1, max: 1, validate: value => chromeProfilePathIsExact(value, profileRoot, profileMode) })],
  ];
}

const helperSharedSchema = (profileRoot, profileMode) => [
  ['noerrdialogs', flagSwitch()],
  ['user-data-dir', Object.freeze({ min: 1, max: 1, validate: value => chromeProfilePathIsExact(value, profileRoot, profileMode) })],
  ['shared-files', flagSwitch()],
  ['field-trial-handle', patternValueSwitch(/^[0-9]+,r,[0-9]+,[0-9]+,262144$/)],
  ['enable-features', exactValueSwitch(CHROME_ENABLE_FEATURES)],
  ['disable-features', exactValueSwitch(CHROME_HELPER_DISABLE_FEATURES)],
  ['variations-seed-version', flagSwitch()],
  ['pseudonymization-salt-handle', patternValueSwitch(/^[0-9]+,r,[0-9]+,[0-9]+,4$/)],
  ['trace-process-track-uuid', patternValueSwitch(/^[0-9]+$/)],
  ['seatbelt-client', patternValueSwitch(/^[0-9]+$/)],
];

function helperChromeSchema(type, profileRoot, profileMode) {
  if (type === 'gpu-process') return [
    ['type', exactValueSwitch(type)], ['disable-breakpad', flagSwitch()], ['headless', flagSwitch()],
    ['enable-unsafe-swiftshader', flagSwitch()],
    ['gpu-preferences', exactValueSwitch(CHROME_GPU_PREFERENCES)],
    ...helperSharedSchema(profileRoot, profileMode),
  ];
  if (type === 'renderer') return [
    ['type', exactValueSwitch(type)], ['top-chrome-webui', flagSwitch(0, 1)],
    ['disable-back-forward-cache', flagSwitch()], ['disable-background-timer-throttling', flagSwitch()],
    ['disable-breakpad', flagSwitch()], ['force-color-profile', exactValueSwitch('srgb')],
    ['remote-debugging-pipe', flagSwitch()], ['allow-pre-commit-input', flagSwitch()],
    ['blink-settings', exactValueSwitch(CHROME_BLINK_SETTINGS)],
    ['disable-blink-features', exactValueSwitch('AutomationControlled')],
    ['lang', exactValueSwitch('en-US')], ['num-raster-threads', exactValueSwitch('4')],
    ['enable-zero-copy', flagSwitch()], ['enable-gpu-memory-buffer-compositor-resources', flagSwitch()],
    ['enable-main-frame-before-activation', flagSwitch()],
    ['renderer-client-id', patternValueSwitch(/^[1-9][0-9]*$/)],
    ['time-ticks-at-unix-epoch', patternValueSwitch(/^-[0-9]+$/)],
    ['launch-time-ticks', patternValueSwitch(/^[0-9]+$/)],
    ...helperSharedSchema(profileRoot, profileMode),
  ];
  if (type === 'utility') return [
    ['type', exactValueSwitch(type)],
    ['utility-sub-type', Object.freeze({
      min: 1, max: 1,
      validate: value => new Set(['network.mojom.NetworkService', 'storage.mojom.StorageService']).has(value),
    })],
    ['lang', exactValueSwitch('en-US')],
    ['service-sandbox-type', Object.freeze({
      min: 1, max: 1, validate: value => new Set(['network', 'service']).has(value),
    })],
    ['mute-audio', flagSwitch()],
    ...helperSharedSchema(profileRoot, profileMode),
  ];
  return null;
}

function chromeHelperTypeForExecutable(executable, appPath) {
  const root = `${appPath}/Contents/Frameworks/Google Chrome Framework.framework/Versions/`;
  if (!executable.startsWith(root)) return null;
  const relativePath = executable.slice(root.length);
  const match = /^[0-9]+(?:\.[0-9]+){3}\/Helpers\/(Google Chrome Helper(?: \((GPU|Renderer)\))?)\.app\/Contents\/MacOS\/\1$/.exec(relativePath);
  if (!match) return null;
  if (match[2] === 'GPU') return 'gpu-process';
  if (match[2] === 'Renderer') return 'renderer';
  return 'utility';
}

function chromeProcessDetails(record, {
  marker, policy, profilePath, profileRoot, profileMode,
} = {}) {
  if (!record || typeof record !== 'object' || !policy || typeof policy !== 'object'
    || typeof policy.appPath !== 'string' || typeof policy.binaryPath !== 'string') return null;
  const parsed = Array.isArray(record.argv) && record.argv[0] === record.executable
    ? parseChromeSwitches(record.argv.slice(1)) : null;
  if (!parsed) return null;
  if (record.executable === policy.binaryPath) {
    if (!/^[0-9a-f]{64}$/.test(marker ?? '') || record.markerPresent !== true
      || record.markerArgumentPresent !== true
      || !switchSchemaIsExact(parsed, mainChromeSchema(profileRoot, profileMode))) return null;
    const selectedProfile = parsed.switches.get('user-data-dir')?.[0];
    if (!chromeProfilePathIsExact(selectedProfile, profileRoot, profileMode)) return null;
    return Object.freeze({ kind: 'main', profilePath: selectedProfile });
  }
  const type = chromeHelperTypeForExecutable(record.executable, policy.appPath);
  const schema = helperChromeSchema(type, profileRoot, profileMode);
  if (!schema || !chromeProfilePathIsExact(profilePath, profileRoot, profileMode)
    || !switchSchemaIsExact(parsed, schema)
    || parsed.switches.get('user-data-dir')?.[0] !== profilePath) return null;
  if (type === 'utility') {
    const subtype = parsed.switches.get('utility-sub-type')?.[0];
    const sandbox = parsed.switches.get('service-sandbox-type')?.[0];
    if ((subtype === 'network.mojom.NetworkService' && sandbox !== 'network')
      || (subtype === 'storage.mojom.StorageService' && sandbox !== 'service')) return null;
  }
  return Object.freeze({ kind: type, profilePath });
}

export function chromeProcessCommandIsExact(record, options) {
  try { return chromeProcessDetails(record, options) !== null; } catch { return false; }
}

async function chromeHelperIsExact(
  record, mainProfiles, processByPid, policy, profileRoot, profileMode,
) {
  let ancestor = record.ppid;
  const visited = new Set([record.pid]);
  while (!mainProfiles.has(ancestor)) {
    if (visited.has(ancestor)) return false;
    visited.add(ancestor);
    const parent = processByPid.get(ancestor);
    if (!parent) return false;
    ancestor = parent.ppid;
  }
  const commandDetails = chromeProcessDetails(record, {
    policy, profilePath: mainProfiles.get(ancestor), profileRoot, profileMode,
  });
  if (record.pgid !== ancestor || !commandDetails) return false;
  let metadata;
  let canonical;
  let currentFrameworkRoot;
  try {
    [metadata, canonical, currentFrameworkRoot] = await INTRINSIC_REFLECT_APPLY(
      INTRINSIC_PROMISE_ALL, INTRINSIC_PROMISE, [[
        lstat(record.executable, { bigint: true }), realpath(record.executable),
        realpath(`${policy.appPath}/Contents/Frameworks/Google Chrome Framework.framework/Versions/Current`),
      ]],
    );
  } catch {
    throw new GuardianFailure('scenario-closure-failed');
  }
  if (!record.executable.startsWith(`${currentFrameworkRoot}/Helpers/`)
    || canonical !== record.executable || (record.executableMode & 0o111) === 0) return false;
  if (!executableRecordStillMatches(record, metadata)) {
    throw new GuardianFailure('scenario-closure-failed');
  }
  const display = await executeProcessAudit(
    SYSTEM_CODESIGN, ['-dv', '--verbose=4', record.executable], 65_536,
  );
  const details = `${display.stdout}\n${display.stderr}`;
  const identifier = /^Identifier=(com\.google\.Chrome[^\r\n]*)$/m.exec(details)?.[1];
  const team = /^TeamIdentifier=([^\r\n]+)$/m.exec(details)?.[1];
  const expectedIdentifier = commandDetails.kind === 'renderer'
    ? 'com.google.Chrome.helper.renderer' : 'com.google.Chrome.helper';
  if (identifier !== expectedIdentifier || team !== policy.teamIdentifier) return false;
  await verifySignedPath(record.executable, {
    codesignIdentifier: identifier, teamIdentifier: policy.teamIdentifier,
  });
  const after = await lstat(record.executable, { bigint: true });
  if (!executableRecordStillMatches(record, after)) {
    throw new GuardianFailure('scenario-closure-failed');
  }
  return true;
}

async function retainedBrowserProcessesAreExact(
  processes, browserSessions, receipts, processPolicy, profileRoot, onInspectionError,
) {
  const rejectIdentity = () => {
    onInspectionError?.();
    return null;
  };
  if (!Array.isArray(processes) || processes.length < 2 || browserSessions.length === 0
    || !processPolicy || receipts.length !== browserSessions.length) return rejectIdentity();
  const processByPid = new Map(processes.map(item => [item.pid, item]));
  if (processByPid.size !== processes.length) return rejectIdentity();
  const classified = new Set();
  const mainProfiles = new Map();
  const profiles = new Set();
  const identities = [];
  try {
    for (const receipt of receipts) {
      if (receipt.profileMode !== 'descriptor-relative') return rejectIdentity();
      const daemon = processByPid.get(receipt.daemonPid);
      const main = processByPid.get(receipt.chromeMainPid);
      const mainDetails = main && chromeProcessDetails(main, {
        marker: receipt.marker, policy: processPolicy.chrome, profileRoot,
        profileMode: receipt.profileMode,
      });
      if (!daemon || !main || daemon.marker !== receipt.marker || main.marker !== receipt.marker
        || !daemonCommandIsExact(daemon, receipt, processPolicy.runtime.path)
        || main.ppid !== daemon.pid || main.pgid !== main.pid || mainDetails?.kind !== 'main'
        || profiles.has(mainDetails.profilePath)) return rejectIdentity();
      const directMains = processes.filter(record => record.ppid === daemon.pid
        && record.executable === processPolicy.chrome.binaryPath
        && chromeProcessDetails(record, {
          marker: receipt.marker, policy: processPolicy.chrome, profileRoot,
          profileMode: receipt.profileMode,
        })?.kind === 'main');
      if (directMains.length !== 1 || directMains[0].pid !== main.pid) return rejectIdentity();
      await verifyPinnedExecutable(
        daemon, processPolicy.runtime.path, processPolicy.runtime.sha256,
        processPolicy.runtime, { rootOwned: true },
      );
      await verifyPinnedExecutable(
        main, processPolicy.chrome.binaryPath, processPolicy.chrome.binarySha256,
        processPolicy.chrome, { signedPath: processPolicy.chrome.appPath },
      );
      classified.add(daemon.pid);
      classified.add(main.pid);
      mainProfiles.set(main.pid, mainDetails.profilePath);
      profiles.add(mainDetails.profilePath);
      identities.push(Object.freeze({
        session: receipt.session,
        daemon: processInstanceIdentity(daemon, processPolicy.runtime),
        chromeMain: processInstanceIdentity(main, processPolicy.chrome),
      }));
    }
    for (const record of processes) {
      if (classified.has(record.pid)) continue;
      if (!(await chromeHelperIsExact(
        record, mainProfiles, processByPid, processPolicy.chrome, profileRoot,
        'descriptor-relative',
      ))) return rejectIdentity();
      classified.add(record.pid);
    }
    if (classified.size !== processes.length) return rejectIdentity();
    const markerGroups = new Map();
    for (const record of processes) {
      if (!markerGroups.has(record.marker)) markerGroups.set(record.marker, []);
      markerGroups.get(record.marker).push(record);
    }
    for (const [marker, records] of markerGroups) {
      const finalSnapshot = await inspectDarwinMarkedProcessesForTermination(
        marker, records.map(record => record.pid),
      );
      if (finalSnapshot.some(record => record.inspectionError)) {
        return rejectIdentity();
      }
      if (finalSnapshot.length !== records.length
        || records.some((record, index) => !processSnapshotsMatch(record, finalSnapshot[index]))) {
        return rejectIdentity();
      }
    }
  } catch {
    return rejectIdentity();
  }
  return Object.freeze({ identities: Object.freeze(identities) });
}

function processGroupAlive(handle) {
  const target = handle.detached ? -handle.pid : handle.pid;
  try {
    INTRINSIC_PROCESS_KILL(target, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    if (error?.code === 'EPERM') return true;
    throw new GuardianFailure('scenario-closure-failed');
  }
}

function signalProcessGroup(handle, signal) {
  const target = handle.detached ? -handle.pid : handle.pid;
  try {
    INTRINSIC_PROCESS_KILL(target, signal);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return true;
    return false;
  }
}

function spawnRunnerChild({
  commandSnapshot, phase, privateContext, repositoryRoot, runMarker,
  onOwnershipIntent, onOwnershipAdd, onOwnershipRelease, onOwnershipAttach, onInspectionError,
}) {
  const detached = INTRINSIC_PROCESS_PLATFORM !== 'win32';
  const argv = [
    '--input-type=module',
    '--eval', commandSnapshot.entrypointSource,
    '--',
    '--phase', phase,
    '--workspace', privateContext.workspacePath,
    '--manifest', privateContext.manifestPath,
    '--credentials', privateContext.credentialPath,
    '--guardian-marker-env', RUN_MARKER_ENV,
    ...commandSnapshot.configFiles.flatMap(config => ['--config-base64', config.contentsBase64]),
  ];
  let child;
  try {
    child = INTRINSIC_CHILD_SPAWN(INTRINSIC_PROCESS_EXEC_PATH, argv, {
      cwd: repositoryRoot,
      detached,
      env: {
        ...INTRINSIC_CHILD_ENV,
        TMPDIR: privateContext.profileRootPath,
        [RUN_MARKER_ENV]: runMarker,
      },
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch {
    throw new GuardianFailure('scenario-runner-invalid');
  }
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0 || !child.stdin
    || !child.stdout || !child.stderr) {
    try { child.kill('SIGKILL'); } catch {}
    throw new GuardianFailure('scenario-runner-invalid');
  }

  let stdoutBytes = 0;
  let stderrBytes = 0;
  let stdoutBuffer = '';
  let ownership = null;
  let ownershipSequence = 0;
  let currentContext = null;
  let currentContextAcceptedSessions = new Set();
  let pendingOwnershipIntent = null;
  const announcedSessions = new Set();
  const activeAnnouncedSessions = new Set();
  const attachedSessions = new Set();
  const activeAnnouncedReceipts = new Map();
  const releasedSessions = new Set();
  let terminal = null;
  const phaseRows = [];
  let protocolFailure = null;
  let settleCompletion;
  let rejectCompletion;
  const completion = new INTRINSIC_PROMISE((resolveCompletion, reject) => {
    settleCompletion = resolveCompletion;
    rejectCompletion = reject;
  });
  let settleClosed;
  const closed = new INTRINSIC_PROMISE(resolveClosed => { settleClosed = resolveClosed; });

  const failProtocol = error => {
    if (protocolFailure) return;
    if (pendingOwnershipIntent) onInspectionError?.();
    protocolFailure = error instanceof GuardianFailure
      ? error
      : new GuardianFailure('scenario-runner-invalid');
    rejectCompletion(protocolFailure);
  };

  const requireProcessOwnership = message => {
    try {
      return requireOwnershipPayload(message);
    } catch (error) {
      onInspectionError?.();
      throw error;
    }
  };
  const rejectOwnershipProtocol = () => {
    onInspectionError?.();
    throw new GuardianFailure('scenario-runner-invalid');
  };
  const requireCurrentOwnershipContext = session => {
    if (currentContext === null) rejectOwnershipProtocol();
    const matches = CANONICAL_ROW_CONTRACTS[phase].map((row, contextOrdinal) => ({
      contextOrdinal, contextId: row.contextId,
      sessions: canonicalBrowserSessionsForRow(row),
    })).filter(candidate => candidate.sessions.includes(session));
    if (matches.length !== 1) rejectOwnershipProtocol();
    const next = Object.freeze({
      contextOrdinal: matches[0].contextOrdinal,
      contextId: matches[0].contextId,
    });
    if (currentContext !== null && !isDeepStrictEqual(next, currentContext)) rejectOwnershipProtocol();
  };
  const currentContextLifecycleComplete = () => {
    if (currentContext === null || pendingOwnershipIntent !== null) return false;
    const row = CANONICAL_ROW_CONTRACTS[phase][currentContext.contextOrdinal];
    const required = canonicalBrowserSessionsForRow(row);
    if (required.some(session => !currentContextAcceptedSessions.has(session))) return false;
    const retainedBoundary = phase === 'before-transition'
      && row.contextId.startsWith('pending-deletion-active-baseline-');
    return retainedBoundary
      ? required.every(session => (
        activeAnnouncedSessions.has(session) || releasedSessions.has(session)
      ))
      : required.every(session => releasedSessions.has(session));
  };

  const acceptLine = line => {
    if (line.length < 2 || line.length > RUNNER_LINE_LIMIT || /[^\x20-\x7e]/.test(line)) {
      throw new GuardianFailure('scenario-runner-invalid');
    }
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      throw new GuardianFailure('scenario-runner-invalid');
    }
    if (message?.type === 'context-start') {
      requireRunnerMessage(message, [
        'contextId', 'contextOrdinal', 'phase', 'type', 'version',
      ]);
      const nextOrdinal = currentContext === null ? 0 : currentContext.contextOrdinal + 1;
      const expected = CANONICAL_ROW_CONTRACTS[phase][nextOrdinal];
      if (ownership || terminal || pendingOwnershipIntent || message.version !== 4
        || message.phase !== phase || !expected
        || (currentContext !== null && !currentContextLifecycleComplete())
        || message.contextOrdinal !== nextOrdinal || message.contextId !== expected.contextId) {
        throw new GuardianFailure('scenario-runner-invalid');
      }
      currentContext = Object.freeze({
        contextOrdinal: message.contextOrdinal, contextId: message.contextId,
      });
      currentContextAcceptedSessions = new Set();
      return;
    }
    if (message?.type === 'ownership-intent') {
      requireRunnerMessage(message, ['phase', 'sequence', 'session', 'type', 'version']);
      if (ownership || terminal || pendingOwnershipIntent || message.version !== 4
        || message.phase !== phase || message.sequence !== ownershipSequence
        || announcedSessions.has(message.session) || attachedSessions.has(message.session)
        || requireRunnerSessions([message.session]).length !== 1) {
        rejectOwnershipProtocol();
      }
      requireCurrentOwnershipContext(message.session);
      currentContextAcceptedSessions.add(message.session);
      pendingOwnershipIntent = Object.freeze({
        sequence: message.sequence, session: message.session,
      });
      onOwnershipIntent({ session: message.session });
      try {
        child.stdin.write(`${JSON.stringify({
          type: 'ownership-authorized', version: 4, phase,
          sequence: message.sequence, session: message.session,
        })}\n`, error => { if (error) failProtocol(new GuardianFailure('scenario-runner-invalid')); });
      } catch {
        rejectOwnershipProtocol();
      }
      return;
    }
    if (message?.type === 'ownership-add') {
      requireRunnerMessage(message, [
        'launchReceipt', 'phase', 'sequence', 'session', 'type', 'version',
      ]);
      if (ownership || terminal || message.version !== 4 || message.phase !== phase
        || !pendingOwnershipIntent
        || message.sequence !== pendingOwnershipIntent.sequence
        || message.session !== pendingOwnershipIntent.session
        || message.sequence !== ownershipSequence || announcedSessions.has(message.session)
        || attachedSessions.has(message.session)) {
        rejectOwnershipProtocol();
      }
      requireCurrentOwnershipContext(message.session);
      const [launchReceipt] = requireLaunchReceipts([message.launchReceipt], [message.session]);
      announcedSessions.add(message.session);
      activeAnnouncedSessions.add(message.session);
      activeAnnouncedReceipts.set(message.session, launchReceipt);
      pendingOwnershipIntent = null;
      ownershipSequence += 1;
      onOwnershipAdd({ session: message.session, launchReceipt });
      return;
    }
    if (message?.type === 'ownership-release') {
      requireRunnerMessage(message, ['phase', 'sequence', 'session', 'type', 'version']);
      if (ownership || terminal || pendingOwnershipIntent || message.version !== 4
        || message.phase !== phase || message.sequence !== ownershipSequence
        || (!activeAnnouncedSessions.has(message.session) && !attachedSessions.has(message.session))
        || releasedSessions.has(message.session)) {
        rejectOwnershipProtocol();
      }
      requireCurrentOwnershipContext(message.session);
      activeAnnouncedSessions.delete(message.session);
      activeAnnouncedReceipts.delete(message.session);
      releasedSessions.add(message.session);
      ownershipSequence += 1;
      onOwnershipRelease({ session: message.session });
      return;
    }
    if (message?.type === 'ownership-attach') {
      requireRunnerMessage(message, ['phase', 'sequence', 'session', 'type', 'version']);
      if (ownership || terminal || pendingOwnershipIntent || message.version !== 4 || message.phase !== phase
        || message.sequence !== ownershipSequence || announcedSessions.has(message.session)
        || attachedSessions.has(message.session)
        || requireRunnerSessions([message.session]).length !== 1) {
        rejectOwnershipProtocol();
      }
      requireCurrentOwnershipContext(message.session);
      currentContextAcceptedSessions.add(message.session);
      attachedSessions.add(message.session);
      ownershipSequence += 1;
      onOwnershipAttach({ session: message.session });
      return;
    }
    if (message?.type === 'ownership-complete') {
      requireRunnerMessage(message, [
        'attachedBrowserSessions', 'browserSessions', 'launchReceipts', 'releasedBrowserSessions',
        'phase', 'sequence', 'type', 'version',
      ]);
      if (ownership || terminal || pendingOwnershipIntent || message.version !== 4 || message.phase !== phase
        || message.sequence !== ownershipSequence
        || currentContext?.contextOrdinal !== CANONICAL_ROW_CONTRACTS[phase].length - 1
        || !currentContextLifecycleComplete()) {
        rejectOwnershipProtocol();
      }
      const completedOwnership = requireProcessOwnership(message);
      const streamedOwnership = Object.freeze({
        browserSessions: Object.freeze([...activeAnnouncedSessions].sort()),
        attachedBrowserSessions: Object.freeze([...attachedSessions].sort()),
        launchReceipts: Object.freeze([...activeAnnouncedReceipts.values()].sort((left, right) => (
          left.session.localeCompare(right.session)
        ))),
        releasedBrowserSessions: Object.freeze([...releasedSessions].sort()),
      });
      const completedReleased = Object.freeze(requireRunnerSessions(message.releasedBrowserSessions));
      const completedStream = Object.freeze({ ...completedOwnership, releasedBrowserSessions: completedReleased });
      if (!isDeepStrictEqual(completedStream, streamedOwnership)) {
        onInspectionError?.();
        throw new GuardianFailure('scenario-runner-invalid');
      }
      ownership = streamedOwnership;
      return;
    }
    if (message?.type === 'failure') {
      terminal = validateRunnerFailureTerminal(message, {
        phase,
        ownershipSequence,
        pendingOwnershipIntent,
        activeAnnouncedSessions,
        attachedSessions,
        activeAnnouncedReceipts,
        releasedSessions,
        currentContext,
        ownershipComplete: ownership !== null,
        terminal,
      });
      settleCompletion(terminal);
      return;
    }
    if (message?.type === 'row') {
      requireRunnerMessage(message, [
        'index', 'phase', 'row', 'sessions', 'type', 'version',
      ]);
      const rowSessions = requireRunnerSessions(message.sessions);
      if (
        !ownership
        || terminal
        || currentContext?.contextOrdinal !== CANONICAL_ROW_CONTRACTS[phase].length - 1
        || message.version !== 2
        || message.phase !== phase
        || message.index !== phaseRows.length
        || rowSessions.length === 0
        || rowSessions.some(session => (
          !announcedSessions.has(session) && !attachedSessions.has(session)
        ))
      ) throw new GuardianFailure('scenario-runner-invalid');
      const row = requirePhaseRow(message.row, phase, message.index);
      if (!isDeepStrictEqual(rowSessions, canonicalBrowserSessionsForRow(row))) {
        throw new GuardianFailure('scenario-runner-invalid');
      }
      phaseRows.push(row);
      return;
    }
    if (message?.type === 'completion') {
      requireRunnerMessage(message, [
        'attachedBrowserSessions', 'browserSessions', 'launchReceipts', 'ok', 'releasedBrowserSessions',
        'phase', 'rowCount', 'type', 'version',
      ]);
      const expectedRows = CANONICAL_ROW_CONTRACTS[phase];
      if (
        !ownership
        || terminal
        || currentContext?.contextOrdinal !== CANONICAL_ROW_CONTRACTS[phase].length - 1
        || message.version !== 4
        || message.phase !== phase
        || typeof message.ok !== 'boolean'
        || !Number.isSafeInteger(message.rowCount)
        || message.rowCount !== expectedRows.length
        || phaseRows.length !== expectedRows.length
      ) throw new GuardianFailure('scenario-runner-invalid');
      const completedOwnership = requireProcessOwnership(message);
      const completedStream = Object.freeze({
        ...completedOwnership,
        releasedBrowserSessions: Object.freeze(requireRunnerSessions(message.releasedBrowserSessions)),
      });
      if (!isDeepStrictEqual(completedStream, ownership)) {
        onInspectionError?.();
        throw new GuardianFailure('scenario-runner-invalid');
      }
      terminal = Object.freeze({
        ok: message.ok,
        ...ownership,
        rows: Object.freeze([...phaseRows]),
      });
      settleCompletion(terminal);
      return;
    }
    throw new GuardianFailure('scenario-runner-invalid');
  };

  child.stdout.on('data', chunk => {
    if (!Buffer.isBuffer(chunk)) return failProtocol(new GuardianFailure('scenario-runner-invalid'));
    stdoutBytes += chunk.length;
    if (stdoutBytes > RUNNER_STDOUT_LIMIT) return failProtocol(new GuardianFailure('scenario-runner-invalid'));
    stdoutBuffer += chunk.toString('utf8');
    let newline = stdoutBuffer.indexOf('\n');
    while (newline !== -1) {
      const line = stdoutBuffer.slice(0, newline);
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      try {
        acceptLine(line);
      } catch (error) {
        failProtocol(error);
        return;
      }
      newline = stdoutBuffer.indexOf('\n');
    }
    if (Buffer.byteLength(stdoutBuffer, 'utf8') > RUNNER_LINE_LIMIT) {
      failProtocol(new GuardianFailure('scenario-runner-invalid'));
    }
  });
  child.stderr.on('data', chunk => {
    stderrBytes += Buffer.isBuffer(chunk) ? chunk.length : RUNNER_STDERR_LIMIT + 1;
    if (stderrBytes > RUNNER_STDERR_LIMIT) failProtocol(new GuardianFailure('scenario-runner-invalid'));
  });
  child.once('error', () => failProtocol(new GuardianFailure('scenario-runner-invalid')));
  child.once('close', (code, signal) => {
    if (stdoutBuffer.length !== 0) failProtocol(new GuardianFailure('scenario-runner-invalid'));
    if (!terminal) failProtocol(new GuardianFailure('scenario-runner-invalid'));
    settleClosed(Object.freeze({ code, signal }));
  });

  return Object.freeze({
    child,
    closed,
    completion,
    detached,
    get ownership() { return ownership; },
    get protocolFailure() { return protocolFailure; },
    get terminal() { return terminal; },
    phase,
    pid: child.pid,
    runMarker,
  });
}

function exactDescriptor(actual, expected) {
  return actual
    && expected
    && actual.value === expected.value
    && actual.get === expected.get
    && actual.set === expected.set
    && actual.writable === expected.writable
    && actual.enumerable === expected.enumerable
    && actual.configurable === expected.configurable;
}

function requireNativePromise(value, category) {
  if (
    INTRINSIC_IS_PROXY(value)
    || !INTRINSIC_IS_PROMISE(value)
    || INTRINSIC_OBJECT_GET_PROTOTYPE_OF(value) !== INTRINSIC_PROMISE_PROTOTYPE
    || INTRINSIC_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(value, 'constructor') !== undefined
    || !exactDescriptor(
      INTRINSIC_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(INTRINSIC_PROMISE_PROTOTYPE, 'constructor'),
      INTRINSIC_PROMISE_CONSTRUCTOR_DESCRIPTOR,
    )
    || !exactDescriptor(
      INTRINSIC_OBJECT_GET_OWN_PROPERTY_DESCRIPTOR(INTRINSIC_PROMISE, Symbol.species),
      INTRINSIC_PROMISE_SPECIES_DESCRIPTOR,
    )
  ) throw new GuardianFailure(category);
  return value;
}

function consumeNativePromise(value, onFulfilled, onRejected, category) {
  const promise = requireNativePromise(value, category);
  try {
    INTRINSIC_REFLECT_APPLY(INTRINSIC_PROMISE_THEN, promise, [onFulfilled, onRejected]);
  } catch {
    throw new GuardianFailure(category);
  }
}

async function exactIndependentProbe(adapterFactory, manifest) {
  let adapter;
  try {
    adapter = await adapterFactory({ purpose: 'independent-absence-probe' });
  } catch {
    throw new GuardianFailure('independent-probe-failed');
  }
  if (!adapter || adapter.projectId !== STAGING_PROJECT_ID) throw new GuardianFailure('independent-probe-failed');
  const connected = typeof adapter.connect === 'function' ? adapter.connect() : adapter;
  if (typeof connected?.auth?.getUser !== 'function' || typeof connected?.firestore?.get !== 'function') {
    throw new GuardianFailure('independent-probe-failed');
  }
  let authPresent = 0;
  let firestorePresent = 0;
  let expectedAbsentPresent = 0;
  for (const uid of manifest.authUids) {
    try {
      await connected.auth.getUser(uid);
      authPresent += 1;
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw new GuardianFailure('independent-probe-failed');
    }
  }
  const probePath = async (path, expectedAbsence) => {
    let snapshot;
    try {
      snapshot = await connected.firestore.get(path);
    } catch {
      throw new GuardianFailure('independent-probe-failed');
    }
    if (!snapshot || typeof snapshot.exists !== 'boolean') throw new GuardianFailure('independent-probe-failed');
    if (snapshot.exists) {
      if (expectedAbsence) expectedAbsentPresent += 1;
      else firestorePresent += 1;
    }
  };
  for (const path of manifest.firestorePaths) await probePath(path, false);
  for (const path of manifest.expectedAbsentFirestorePaths) await probePath(path, true);
  const summary = Object.freeze({
    checkedAuth: manifest.authUids.length,
    checkedFirestore: manifest.firestorePaths.length,
    checkedExpectedAbsent: manifest.expectedAbsentFirestorePaths.length,
    authPresent,
    firestorePresent,
    expectedAbsentPresent,
  });
  validateLifecycleResult('probe', {
    projectId: STAGING_PROJECT_ID,
    ...summary,
  }, 'independently-absent');
  return summary;
}

export function createLifecycleGuardian({
  fixtureCommand,
  browserClient,
  adapterFactory,
  preconditionVerifier,
  runnerCommand,
  scenarioRunner,
  spawn: injectedSpawn,
  scenarioJoinTimeoutMs = 5_000,
  beforeTransitionDeadlineMs = BEFORE_TRANSITION_DEADLINE_MAX_MS,
  afterTransitionDeadlineMs = AFTER_TRANSITION_DEADLINE_MAX_MS,
  filesystem = defaultFilesystem,
  processHooks = defaultProcessHooks,
  repositoryRoot = process.cwd(),
  producerTempRoot = INTRINSIC_CHILD_ENV.TMPDIR,
  processAuditor = auditMarkedProcesses,
  processTerminator = terminateMarkedProcesses,
  terminalCertificateWriter,
} = {}) {
  if (scenarioRunner !== undefined || injectedSpawn !== undefined) {
    throw new GuardianFailure('configuration-invalid');
  }
  const dependencies = {
    fixtureCommand, browserClient, adapterFactory, preconditionVerifier, runnerCommand, filesystem, processHooks,
    terminalCertificateWriter,
  };
  requireDependencies(dependencies);
  const ownedRunnerCommand = snapshotRunnerCommand(runnerCommand);
  if (!Number.isSafeInteger(scenarioJoinTimeoutMs) || scenarioJoinTimeoutMs < 1 || scenarioJoinTimeoutMs > 60_000) {
    throw new GuardianFailure('configuration-invalid');
  }
  if (!Number.isSafeInteger(beforeTransitionDeadlineMs) || beforeTransitionDeadlineMs < 1
    || beforeTransitionDeadlineMs > BEFORE_TRANSITION_DEADLINE_MAX_MS
    || !Number.isSafeInteger(afterTransitionDeadlineMs) || afterTransitionDeadlineMs < 1
    || afterTransitionDeadlineMs > AFTER_TRANSITION_DEADLINE_MAX_MS) {
    throw new GuardianFailure('configuration-invalid');
  }
  if (typeof repositoryRoot !== 'string' || !isAbsolute(repositoryRoot) || resolve(repositoryRoot) !== repositoryRoot) {
    throw new GuardianFailure('configuration-invalid');
  }
  if (typeof producerTempRoot !== 'string' || !isAbsolute(producerTempRoot)) {
    throw new GuardianFailure('configuration-invalid');
  }
  if (typeof processAuditor !== 'function' || typeof processTerminator !== 'function') {
    throw new GuardianFailure('configuration-invalid');
  }
  const producerProfileTempRoot = resolve(producerTempRoot);

  let state = 'uninitialized';
  const history = [state];
  let running = false;
  let interrupted = false;
  let scenarioFailureAttribution = null;
  let emergencyPromise = null;
  let releaseAbortGate = null;
  const abortGate = new INTRINSIC_PROMISE(resolve => { releaseAbortGate = resolve; });
  let workspacePath = null;
  let manifestPath = null;
  let credentialPath = null;
  let profileRootPath = null;
  let profileRootRemoved = false;
  let globalProfileBaseline = null;
  let inspectionUncertain = false;
  let profileInventoryUncertain = false;
  let manifest = null;
  let manifestPin = null;
  let lastManifestSnapshot = null;
  let pendingTransitionAuthorized = false;
  let browserClosureCertified = false;
  let closureCertified = false;
  let credentialRemoved = false;
  let workspaceRemoved = false;
  const lifecycleStages = {
    preflight: null,
    seed: null,
    initialInspect: null,
    precleanInspect: null,
    cleanup: null,
    cleanInspect: null,
    independentProbe: null,
  };
  const ownedBrowserSessions = new Set();
  const ownedBrowserReceipts = new Map();
  const provisionallyReleasedBrowserSessions = new Set();
  const provisionallyReleasedBrowserReceipts = new Map();
  const ownedProcessIdentities = new Map();
  let activeScenario = null;
  const phaseMarkers = new Map();
  let startupGeneration = null;
  let nextStartupGeneration = 0;
  let verifiedRepositoryRoot = null;
  let verifiedRunnerSnapshot = null;
  const rowsByContext = new Map();
  let validatedRows = null;
  const handlers = new Map();
  let operationTail = new INTRINSIC_PROMISE(resolveOperation => resolveOperation());

  const markInspectionUncertain = () => { inspectionUncertain = true; };
  const rejectInspectionIdentity = category => {
    markInspectionUncertain();
    throw new GuardianFailure(category);
  };
  const requireInspectionIdentity = (result, category = 'scenario-closure-failed') => {
    if (!result) rejectInspectionIdentity(category);
    return result;
  };
  const inspectionIdentityMatches = (expected, actual) => {
    const matches = processInstanceIdentityMatches(expected, actual);
    if (!matches) markInspectionUncertain();
    return matches;
  };
  const stickyInspectionOperation = async (operation, { intentionalCancellation } = {}) => {
    try {
      return await operation();
    } catch (error) {
      if (!intentionalCancellation?.()) markInspectionUncertain();
      throw error;
    }
  };
  const auditMarkedProcessesSticky = (marker, options = {}) => stickyInspectionOperation(
    () => processAuditor(marker, { ...options, onInspectionError: markInspectionUncertain }),
    { intentionalCancellation: () => options.signal?.aborted === true },
  );
  const terminateMarkedProcessesSticky = (marker, timeoutMs) => stickyInspectionOperation(
    () => processTerminator(marker, timeoutMs, { onInspectionError: markInspectionUncertain }),
  );
  const producerProfileInventorySticky = async tempRoot => {
    try {
      return await producerProfileInventory(filesystem, tempRoot);
    } catch (error) {
      profileInventoryUncertain = true;
      throw error;
    }
  };

  const currentPreservationStates = () => preservationStates(
    filesystem,
    workspacePath,
    manifestPath,
    {
      pin: manifestPin,
      priorManifest: lastManifestSnapshot,
      options: currentOptions,
      pendingTransitionAuthorized,
    },
  );

  const transition = next => {
    const expected = ORDERED_STATES[ORDERED_STATES.indexOf(state) + 1];
    if (next !== expected) throw new GuardianFailure('state-order-invalid');
    state = next;
    history.push(next);
  };

  const lifecycleCertificateSnapshot = () => Object.freeze({
    state,
    history: Object.freeze([...history]),
    preflight: lifecycleStages.preflight,
    seed: lifecycleStages.seed,
    initialInspect: lifecycleStages.initialInspect,
    precleanInspect: lifecycleStages.precleanInspect,
    cleanup: lifecycleStages.cleanup,
    cleanInspect: lifecycleStages.cleanInspect,
    independentProbe: lifecycleStages.independentProbe,
    browserClosureCertified,
    processClosureCertified: !inspectionUncertain && phaseMarkers.size === 0 && !activeScenario,
    profileClosureCertified: !profileInventoryUncertain && profileRootPath === null,
    fixtureClosureCertified: closureCertified,
    credentialRemoved,
    workspaceRemoved,
  });

  const persistCertificatePhase = async (phase, attribution = {
    primaryCategory: 'none',
    primaryStage: state,
  }) => {
    try {
      await terminalCertificateWriter(Object.freeze({
        phase,
        lifecycle: lifecycleCertificateSnapshot(),
        primaryCategory: attribution.primaryCategory,
        primaryStage: attribution.primaryStage,
        diagnostic: attribution.diagnostic ?? null,
      }));
    } catch {
      throw new GuardianFailure('terminal-certificate-failed');
    }
  };

  const exclusive = operation => {
    const pending = new INTRINSIC_PROMISE((resolveOperation, rejectOperation) => {
      const invoke = () => {
        let result;
        try {
          result = operation();
          consumeNativePromise(result, resolveOperation, rejectOperation, 'operation-failed');
        } catch (error) {
          rejectOperation(error);
        }
      };
      try {
        consumeNativePromise(operationTail, invoke, invoke, 'operation-failed');
      } catch (error) {
        rejectOperation(error);
      }
    });
    operationTail = new INTRINSIC_PROMISE(resolveTail => {
      consumeNativePromise(pending, resolveTail, resolveTail, 'operation-failed');
    });
    return pending;
  };

  const checkInterrupted = () => {
    if (interrupted) throw new GuardianFailure('interrupted');
  };

  const runFixtureRaw = async (command, options, { recovery = false } = {}) => exclusive(async () => {
    if (!recovery) checkInterrupted();
    let result;
    try {
      result = await fixtureCommand(commandArguments(command, options, { manifestPath, credentialPath }));
    } catch {
      throw new GuardianFailure('command-failed');
    }
    const parsed = parseCommandOutput(result);
    if (!recovery) checkInterrupted();
    return parsed;
  });

  const runFixture = async (command, options, stage, { recovery = false } = {}) => {
    const parsed = await runFixtureRaw(command, options, { recovery });
    let validated;
    try {
      validated = validateLifecycleResult(command, parsed, stage);
    } catch {
      throw new GuardianFailure('invalid-result');
    }
    if (command === 'preflight') lifecycleStages.preflight = Object.freeze({
        plannedAliases: parsed.plannedAliases, plannedTeams: parsed.plannedTeams,
    });
    if (command === 'seed') lifecycleStages.seed = Object.freeze({
        auth: parsed.counts.auth, firestore: parsed.counts.firestore,
    });
    if (command === 'inspect') {
      const summary = Object.freeze({
        expectedAuth: parsed.counts.expected.auth,
        expectedFirestore: parsed.counts.expected.firestore,
        actualAuth: parsed.counts.actualPresent.auth,
        actualFirestore: parsed.counts.actualPresent.firestore,
      });
      if (stage === 'cleaned-absent') lifecycleStages.cleanInspect = summary;
      else if (lifecycleStages.initialInspect === null) lifecycleStages.initialInspect = summary;
      else lifecycleStages.precleanInspect = summary;
    }
    if (command === 'cleanup') lifecycleStages.cleanup = Object.freeze({
      deletedAuth: parsed.deleted.auth,
      deletedFirestore: parsed.deleted.firestore,
      retainedAuth: parsed.followUp.retained.auth.count,
      retainedFirestore: parsed.followUp.retained.firestore.count,
      failedAuth: parsed.followUp.failures.auth.count,
      failedFirestore: parsed.followUp.failures.firestore.count,
    });
    if (!recovery) await persistCertificatePhase('progress');
    return validated;
  };

  const loadExactManifest = async expectedPendingState => {
    if (!manifestPath) throw new GuardianFailure('manifest-uncertain');
    let text;
    try {
      await requirePrivateRegularFile(filesystem, manifestPath, 'manifest-uncertain');
      text = await filesystem.readFile(manifestPath, 'utf8');
    } catch {
      throw new GuardianFailure('manifest-uncertain');
    }
    try {
      if (typeof text !== 'string' || text.length > 262_144) throw new GuardianFailure('manifest-uncertain');
      const candidate = ensureManifestShape(validateManifest(JSON.parse(text)));
      if (
        expectedPendingState
        && candidate.transitions?.['qa-pending-delete']?.state !== expectedPendingState
      ) throw new GuardianFailure('manifest-uncertain');
      if (!manifestPin) {
        if (!new Set(['planned', 'partial', 'seeded']).has(candidate.state)) {
          throw new GuardianFailure('manifest-uncertain');
        }
        assertInitialManifestBaseline(candidate);
        manifestPin = manifestIdentity(candidate, currentOptions);
      } else {
        assertManifestIdentity(candidate, currentOptions, manifestPin);
        assertLifecycleAdvance(lastManifestSnapshot, candidate, { pendingTransitionAuthorized });
      }
      manifest = candidate;
      lastManifestSnapshot = candidate;
      return manifest;
    } catch {
      throw new GuardianFailure('manifest-uncertain');
    }
  };

  const browserInventorySticky = async (context, category) => {
    try {
      return browserSessionNames(await browserClient.listBrowsers(context));
    } catch {
      markInspectionUncertain();
      throw new GuardianFailure(category);
    }
  };

  const closeOwnedBrowsers = async () => exclusive(async () => {
    if (profileRootRemoved) {
      if (browserClosureCertified && ownedBrowserSessions.size === 0
        && ownedBrowserReceipts.size === 0 && provisionallyReleasedBrowserSessions.size === 0
        && provisionallyReleasedBrowserReceipts.size === 0
        && phaseMarkers.size === 0 && !activeScenario) return;
      throw new GuardianFailure('browser-closure-failed');
    }
    if (!profileRootPath) {
      if (ownedBrowserSessions.size === 0 && ownedBrowserReceipts.size === 0
        && provisionallyReleasedBrowserSessions.size === 0
        && provisionallyReleasedBrowserReceipts.size === 0
        && phaseMarkers.size === 0 && !activeScenario) {
        browserClosureCertified = true;
        return;
      }
      throw new GuardianFailure('browser-closure-failed');
    }
    const browserContext = Object.freeze({ temporaryDirectory: profileRootPath });
    let closeFailed = false;
    const sessionsToClose = [...new Set([
      ...ownedBrowserSessions, ...provisionallyReleasedBrowserSessions,
    ])].sort();
    for (const session of sessionsToClose) {
      try {
        await browserClient.closeBrowser(session, browserContext);
      } catch {
        closeFailed = true;
      }
    }
    let names;
    try {
      names = await browserInventorySticky(browserContext, 'browser-closure-failed');
    } catch {
      browserClosureCertified = false;
      throw new GuardianFailure('browser-closure-failed');
    }
    const ownedRemain = names.some(name => ownedBrowserSessions.has(name));
    if (closeFailed || ownedRemain || names.length !== 0) {
      if (ownedRemain || names.length !== 0) markInspectionUncertain();
      browserClosureCertified = false;
      throw new GuardianFailure('browser-closure-failed');
    }
    ownedBrowserSessions.clear();
    ownedBrowserReceipts.clear();
    provisionallyReleasedBrowserSessions.clear();
    provisionallyReleasedBrowserReceipts.clear();
    validateLifecycleResult('browser-sessions', { sessions: [] }, 'browsers-closed');
    browserClosureCertified = true;
  });

  const exactBrowserInventory = async () => {
    if (!profileRootPath || profileRootRemoved) throw new GuardianFailure('browser-ownership-invalid');
    const names = (await browserInventorySticky({
      temporaryDirectory: profileRootPath,
    }, 'browser-ownership-invalid')).sort();
    const expected = [...ownedBrowserSessions].sort();
    if (!isDeepStrictEqual(names, expected)) rejectInspectionIdentity('browser-ownership-invalid');
    return names;
  };

  const validateRetainedBrowserBoundary = async () => {
    const names = await exactBrowserInventory();
    const markedByPhase = [];
    for (const [marker, phase] of phaseMarkers) {
      let processes;
      try { processes = await auditMarkedProcessesSticky(marker); } catch {
        throw new GuardianFailure('scenario-closure-failed');
      }
      markedByPhase.push(Object.freeze({
        marker, phase,
        processes: processes.map(processRecord => Object.freeze({ ...processRecord, marker })),
      }));
    }
    const processes = markedByPhase.flatMap(item => item.processes);
    if (names.length === 0) {
      if (processes.length !== 0 || ownedBrowserReceipts.size !== 0) {
        rejectInspectionIdentity('scenario-closure-failed');
      }
      provisionallyReleasedBrowserSessions.clear();
      provisionallyReleasedBrowserReceipts.clear();
      return;
    }
    const receipts = [...ownedBrowserReceipts.values()].sort((left, right) => (
      left.session.localeCompare(right.session)
    ));
    if (!isDeepStrictEqual(receipts.map(receipt => receipt.session), names)) {
      rejectInspectionIdentity('scenario-closure-failed');
    }
    const audit = requireInspectionIdentity(
      await stickyInspectionOperation(() => retainedBrowserProcessesAreExact(
        processes, names, receipts, verifiedRunnerSnapshot.processPolicy, profileRootPath,
        markInspectionUncertain,
      )),
    );
    for (const identityReceipt of audit.identities) {
      const prior = ownedProcessIdentities.get(identityReceipt.session);
      if (prior && (!inspectionIdentityMatches(prior.daemon, identityReceipt.daemon)
        || !inspectionIdentityMatches(prior.chromeMain, identityReceipt.chromeMain))) {
        throw new GuardianFailure('scenario-closure-failed');
      }
    }
    provisionallyReleasedBrowserSessions.clear();
    provisionallyReleasedBrowserReceipts.clear();
    for (const identityReceipt of audit.identities) {
      if (!ownedProcessIdentities.has(identityReceipt.session)) {
        ownedProcessIdentities.set(identityReceipt.session, identityReceipt);
      }
    }
  };

  const certifyReceiptProcessesAbsent = async () => {
    for (const [marker] of phaseMarkers) {
      const processes = await auditMarkedProcessesSticky(marker);
      for (const receipt of ownedBrowserReceipts.values()) {
        if (receipt.marker !== marker) continue;
        const identities = ownedProcessIdentities.get(receipt.session);
        if (!identities) continue;
        const daemon = processes.find(item => item.pid === identities.daemon.pid);
        const main = processes.find(item => item.pid === identities.chromeMain.pid);
        const daemonMatches = daemon && inspectionIdentityMatches(
          identities.daemon, processInstanceIdentity(daemon, identities.daemon),
        );
        const mainMatches = main && inspectionIdentityMatches(
          identities.chromeMain, processInstanceIdentity(main, identities.chromeMain),
        );
        if (daemonMatches || mainMatches) {
          markInspectionUncertain();
          throw new GuardianFailure('scenario-closure-failed');
        }
      }
    }
  };

  const terminateStoredPhaseMarkers = async () => {
    let cleared = true;
    for (const marker of phaseMarkers.keys()) {
      const result = await terminateMarkedProcessesSticky(
        marker, Math.max(scenarioJoinTimeoutMs, 500),
      );
      if (!result.cleared) {
        markInspectionUncertain();
        cleared = false;
      }
    }
    if (!cleared) throw new GuardianFailure('scenario-closure-failed');
    for (const marker of phaseMarkers.keys()) {
      const remaining = await auditMarkedProcessesSticky(marker);
      if (remaining.length !== 0) rejectInspectionIdentity('scenario-closure-failed');
    }
    phaseMarkers.clear();
  };

  const removeOwnedProfileRoot = async () => {
    if (!profileRootPath) return;
    if (!profileRootRemoved) {
      await requirePrivateDirectory(filesystem, profileRootPath, 'scenario-closure-failed');
      await removeConfinedPlaywrightTree(filesystem, profileRootPath);
      profileRootRemoved = true;
    }
    let current;
    try {
      current = await producerProfileInventorySticky(producerProfileTempRoot);
      if (!isDeepStrictEqual(current, globalProfileBaseline)) {
        throw new GuardianFailure('scenario-closure-failed');
      }
    } catch (error) {
      profileInventoryUncertain = true;
      throw error;
    }
    profileRootPath = null;
    profileRootRemoved = false;
  };

  const certifyEmptyBrowserInventory = async () => {
    if (profileRootRemoved) {
      if (browserClosureCertified && ownedBrowserSessions.size === 0
        && ownedBrowserReceipts.size === 0 && provisionallyReleasedBrowserSessions.size === 0
        && provisionallyReleasedBrowserReceipts.size === 0
        && phaseMarkers.size === 0 && !activeScenario) return;
      throw new GuardianFailure('browser-closure-failed');
    }
    if (!profileRootPath) {
      if (browserClosureCertified && ownedBrowserSessions.size === 0
        && ownedBrowserReceipts.size === 0 && provisionallyReleasedBrowserSessions.size === 0
        && provisionallyReleasedBrowserReceipts.size === 0
        && phaseMarkers.size === 0 && !activeScenario) return;
      throw new GuardianFailure('browser-closure-failed');
    }
    const names = await browserInventorySticky({
      temporaryDirectory: profileRootPath,
    }, 'browser-closure-failed');
    if (names.length !== 0) rejectInspectionIdentity('browser-closure-failed');
    ownedBrowserSessions.clear();
    ownedBrowserReceipts.clear();
    provisionallyReleasedBrowserSessions.clear();
    provisionallyReleasedBrowserReceipts.clear();
    ownedProcessIdentities.clear();
    validateLifecycleResult('browser-sessions', { sessions: [] }, 'browsers-closed');
    browserClosureCertified = true;
  };

  const bounded = candidate => new INTRINSIC_PROMISE((resolvePromise, rejectPromise) => {
    let settled = false;
    const timer = INTRINSIC_REFLECT_APPLY(INTRINSIC_SET_TIMEOUT, INTRINSIC_GLOBAL_THIS, [() => {
      if (!settled) {
        settled = true;
        resolvePromise({ status: 'timeout' });
      }
    }, scenarioJoinTimeoutMs]);
    try {
      consumeNativePromise(
        candidate,
        value => {
          if (settled) return;
          settled = true;
          INTRINSIC_REFLECT_APPLY(INTRINSIC_CLEAR_TIMEOUT, INTRINSIC_GLOBAL_THIS, [timer]);
          resolvePromise({ status: 'fulfilled', value });
        },
        () => {
          if (settled) return;
          settled = true;
          INTRINSIC_REFLECT_APPLY(INTRINSIC_CLEAR_TIMEOUT, INTRINSIC_GLOBAL_THIS, [timer]);
          resolvePromise({ status: 'rejected' });
        },
        'scenario-closure-failed',
      );
    } catch (error) {
      settled = true;
      INTRINSIC_REFLECT_APPLY(INTRINSIC_CLEAR_TIMEOUT, INTRINSIC_GLOBAL_THIS, [timer]);
      rejectPromise(error);
    }
  });

  const waitForGroupGone = handle => new INTRINSIC_PROMISE(resolveWait => {
    const startedAt = Date.now();
    const inspect = () => {
      let alive;
      try {
        alive = processGroupAlive(handle);
      } catch {
        resolveWait(false);
        return;
      }
      if (!alive) {
        resolveWait(true);
        return;
      }
      if (Date.now() - startedAt >= scenarioJoinTimeoutMs) {
        resolveWait(false);
        return;
      }
      INTRINSIC_REFLECT_APPLY(INTRINSIC_SET_TIMEOUT, INTRINSIC_GLOBAL_THIS, [
        inspect, Math.min(10, scenarioJoinTimeoutMs),
      ]);
    };
    inspect();
  });

  const joinScenario = async handle => {
    let outcome;
    try {
      outcome = await bounded(handle.closed);
    } catch {
      return Object.freeze({ clean: false, streamClosed: false });
    }
    if (outcome.status !== 'fulfilled') {
      return Object.freeze({ clean: false, streamClosed: false });
    }
    const groupGone = await waitForGroupGone(handle);
    return Object.freeze({
      clean: outcome.value.code === 0
        && outcome.value.signal === null
        && !handle.protocolFailure
        && Boolean(handle.terminal)
        && groupGone,
      streamClosed: true,
    });
  };

  const requestScenarioTermination = async (handle, force) => {
    if (!signalProcessGroup(handle, force ? 'SIGKILL' : 'SIGTERM')) {
      let alreadyClosed;
      try { alreadyClosed = await bounded(handle.closed); } catch { return false; }
      return alreadyClosed.status === 'fulfilled' && waitForGroupGone(handle);
    }
    let outcome;
    try { outcome = await bounded(handle.closed); } catch { return false; }
    return outcome.status === 'fulfilled' && waitForGroupGone(handle);
  };

  const beginStartupGeneration = phase => {
    if (startupGeneration) throw new GuardianFailure('scenario-runner-invalid');
    let settle;
    const settled = new INTRINSIC_PROMISE(resolveSettled => { settle = resolveSettled; });
    const generation = {
      cancelled: false,
      controller: new INTRINSIC_ABORT_CONTROLLER(),
      id: ++nextStartupGeneration,
      phase,
      settle,
      settled,
    };
    startupGeneration = generation;
    return generation;
  };

  const finishStartupGeneration = generation => {
    generation.settle();
    if (startupGeneration === generation) startupGeneration = null;
  };

  const cancelStartupGeneration = async () => {
    const generation = startupGeneration;
    if (!generation) return true;
    generation.cancelled = true;
    generation.controller.abort();
    let outcome;
    try { outcome = await bounded(generation.settled); } catch { return false; }
    return outcome.status === 'fulfilled';
  };

  const stopActiveScenario = async () => {
    if (!(await cancelStartupGeneration())) {
      throw new GuardianFailure('scenario-closure-failed');
    }
    const handle = activeScenario;
    if (!handle) return;
    if (await requestScenarioTermination(handle, false)) {
      activeScenario = null;
      return;
    }
    if (!(await requestScenarioTermination(handle, true))) {
      throw new GuardianFailure('scenario-closure-failed');
    }
    activeScenario = null;
  };

  const removeHandlers = () => {
    const remaining = [];
    for (const [name, handler] of handlers) {
      try {
        processHooks.off(name, handler);
      } catch {
        remaining.push([name, handler]);
      }
    }
    handlers.clear();
    for (const [name, handler] of remaining) handlers.set(name, handler);
    return remaining.length === 0;
  };

  const recover = (category, isInterruption = false) => {
    if (emergencyPromise) return emergencyPromise;
    interrupted ||= isInterruption;
    const primaryCategory = scenarioFailureAttribution?.category ?? category;
    const primaryStage = scenarioFailureAttribution?.stage ?? state;
    const diagnostic = scenarioFailureAttribution?.diagnostic ?? null;
    const recoveryFailureSummary = values => failureSummary({
      primaryCategory,
      primaryStage,
      diagnostic,
      ...values,
    });
    emergencyPromise = (async () => {
      let recoveryCategory = category;
      try {
        await stopActiveScenario();
      } catch {
        recoveryCategory = 'scenario-closure-failed';
      }
      let browserFailure = false;
      try {
        await closeOwnedBrowsers();
      } catch {
        browserFailure = true;
      }
      let receiptFailure = false;
      try {
        await certifyReceiptProcessesAbsent();
      } catch {
        receiptFailure = true;
      }
      let markerFailure = false;
      try {
        await terminateStoredPhaseMarkers();
      } catch {
        markerFailure = true;
      }
      let emptyBrowserFailure = false;
      try {
        await certifyEmptyBrowserInventory();
      } catch {
        emptyBrowserFailure = true;
      }
      if (!browserFailure && !receiptFailure && !markerFailure && !emptyBrowserFailure) {
        try {
          await removeOwnedProfileRoot();
        } catch {
          markerFailure = true;
        }
      }
      if (inspectionUncertain || profileInventoryUncertain) markerFailure = true;
      if (browserFailure || emptyBrowserFailure) {
        removeHandlers();
        return recoveryFailureSummary({
          category: 'browser-closure-failed', state, history, interrupted: isInterruption,
          browserClosureCertified: false, closureCertified: false,
          ...await currentPreservationStates(),
        });
      }
      if (receiptFailure || markerFailure) {
        removeHandlers();
        return recoveryFailureSummary({
          category: 'scenario-closure-failed', state, history, interrupted: isInterruption,
          browserClosureCertified: false, closureCertified: false,
          ...await currentPreservationStates(),
        });
      }
      if (recoveryCategory === 'terminal-certificate-failed' && workspacePath) {
        removeHandlers();
        return recoveryFailureSummary({
          category: recoveryCategory, state, history, interrupted: isInterruption,
          browserClosureCertified: true, closureCertified,
          ...await currentPreservationStates(),
        });
      }
      if (!workspacePath) {
        removeHandlers();
        return recoveryFailureSummary({
          category: recoveryCategory, state, history, interrupted: isInterruption,
          browserClosureCertified: true, closureCertified,
        });
      }
      if (closureCertified && state === 'credential-removed') {
        try {
          await requirePrivateDirectory(filesystem, workspacePath, 'workspace-removal-failed');
          await filesystem.rm(workspacePath, { recursive: true, force: false });
          if (!(await proveAbsent(filesystem, workspacePath))) throw new GuardianFailure('workspace-removal-failed');
        } catch {
          removeHandlers();
          return recoveryFailureSummary({
            category: 'workspace-removal-failed', state, history, interrupted: isInterruption,
            browserClosureCertified: true, closureCertified: true,
            ...await currentPreservationStates(),
          });
        }
        workspaceRemoved = true;
        workspacePath = null;
        manifestPath = null;
        credentialPath = null;
        removeHandlers();
        return recoveryFailureSummary({
          category: recoveryCategory, state, history, interrupted: isInterruption,
          browserClosureCertified: true, closureCertified: true,
        });
      }
      try {
        await loadExactManifest();
      } catch {
        removeHandlers();
        return recoveryFailureSummary({
          category: 'manifest-uncertain', state, history, interrupted: isInterruption,
          browserClosureCertified: true,
          ...await currentPreservationStates(),
        });
      }
      try {
        if (manifest.state === 'cleaned') {
          await runFixture('inspect', currentOptions, 'cleaned-absent', { recovery: true });
        } else {
          const recoveryInspect = await runFixtureRaw('inspect', currentOptions, { recovery: true });
          const expectedDeleted = validateRecoveryInspect(recoveryInspect, manifest);
          lifecycleStages.precleanInspect = Object.freeze({
            expectedAuth: recoveryInspect.counts.expected.auth,
            expectedFirestore: recoveryInspect.counts.expected.firestore,
            actualAuth: recoveryInspect.counts.actualPresent.auth,
            actualFirestore: recoveryInspect.counts.actualPresent.firestore,
          });
          const recoveryCleanup = await runFixtureRaw('cleanup', currentOptions, { recovery: true });
          validateRecoveryCleanup(recoveryCleanup, expectedDeleted);
          lifecycleStages.cleanup = Object.freeze({
            deletedAuth: recoveryCleanup.deleted.auth,
            deletedFirestore: recoveryCleanup.deleted.firestore,
            retainedAuth: recoveryCleanup.followUp.retained.auth.count,
            retainedFirestore: recoveryCleanup.followUp.retained.firestore.count,
            failedAuth: recoveryCleanup.followUp.failures.auth.count,
            failedFirestore: recoveryCleanup.followUp.failures.firestore.count,
          });
        }
        await runFixture('inspect', currentOptions, 'cleaned-absent', { recovery: true });
        await loadExactManifest();
        if (manifest.state !== 'cleaned') throw new GuardianFailure('manifest-uncertain');
        lifecycleStages.independentProbe = await exactIndependentProbe(adapterFactory, manifest);
        closureCertified = true;
      } catch (error) {
        removeHandlers();
        return recoveryFailureSummary({
          category: error instanceof GuardianFailure ? error.category : category,
          state, history, interrupted: isInterruption,
          browserClosureCertified: true, closureCertified: false,
          ...await currentPreservationStates(),
        });
      }
      try {
        await persistCertificatePhase('closure-pending', {
          primaryCategory,
          primaryStage,
          diagnostic,
        });
      } catch {
        removeHandlers();
        return recoveryFailureSummary({
          category: 'terminal-certificate-failed', state, history, interrupted: isInterruption,
          browserClosureCertified: true, closureCertified: true,
          ...await currentPreservationStates(),
        });
      }
      try {
        await filesystem.removeCredentialFile(credentialPath, verifiedRepositoryRoot);
        if (!(await proveAbsent(filesystem, credentialPath))) throw new GuardianFailure('credential-removal-failed');
      } catch {
        removeHandlers();
        return recoveryFailureSummary({
          category: 'credential-removal-failed', state, history, interrupted: isInterruption,
          browserClosureCertified: true, closureCertified: true,
          ...await currentPreservationStates(),
        });
      }
      credentialRemoved = true;
      try {
        await requirePrivateDirectory(filesystem, workspacePath, 'workspace-removal-failed');
        await filesystem.rm(workspacePath, { recursive: true, force: false });
        if (!(await proveAbsent(filesystem, workspacePath))) throw new GuardianFailure('workspace-removal-failed');
      } catch {
        removeHandlers();
        return recoveryFailureSummary({
          category: 'workspace-removal-failed', state, history, interrupted: isInterruption,
          browserClosureCertified: true, closureCertified: true,
          ...await currentPreservationStates(),
        });
      }
      workspaceRemoved = true;
      workspacePath = null;
      manifestPath = null;
      credentialPath = null;
      removeHandlers();
      return recoveryFailureSummary({
        category: recoveryCategory, state, history, interrupted: isInterruption,
        browserClosureCertified: true, closureCertified: true,
      });
    })();
    return emergencyPromise;
  };

  const registerHandlers = () => {
    for (const name of PROCESS_EVENTS) {
      const handler = () => {
        interrupted = true;
        const recovery = recover('interrupted', true);
        releaseAbortGate();
        return recovery;
      };
      handlers.set(name, handler);
      try {
        processHooks.on(name, handler);
      } catch {
        removeHandlers();
        throw new GuardianFailure('guardian-registration-failed');
      }
    }
  };

  const runScenarioPhase = async (phase, privateContext) => {
    if (activeScenario || startupGeneration || !verifiedRunnerSnapshot) {
      throw new GuardianFailure('scenario-runner-invalid');
    }
    const generation = beginStartupGeneration(phase);
    let handle;
    try {
      const runMarker = INTRINSIC_RANDOM_BYTES(32).toString('hex');
      const collisions = await auditMarkedProcessesSticky(
        runMarker, { signal: generation.controller.signal },
      );
      if (collisions.length !== 0) throw new GuardianFailure('scenario-runner-invalid');
      phaseMarkers.set(runMarker, phase);
      verifyRunnerSnapshot(verifiedRunnerSnapshot);
      if (
        interrupted
        || generation.cancelled
        || startupGeneration !== generation
      ) throw new GuardianFailure('interrupted');
      handle = spawnRunnerChild({
        commandSnapshot: verifiedRunnerSnapshot,
        phase,
        privateContext,
        repositoryRoot: verifiedRepositoryRoot,
        runMarker,
        onInspectionError: markInspectionUncertain,
        onOwnershipIntent({ session }) {
          if (ownedBrowserSessions.has(session) || ownedBrowserReceipts.has(session)) {
            rejectInspectionIdentity('browser-ownership-invalid');
          }
          ownedBrowserSessions.add(session);
          browserClosureCertified = false;
        },
        onOwnershipAdd({ session, launchReceipt }) {
          if (!ownedBrowserSessions.has(session) || ownedBrowserReceipts.has(session)
            || launchReceipt.session !== session) {
            rejectInspectionIdentity('browser-ownership-invalid');
          }
          ownedBrowserReceipts.set(session, Object.freeze({
            ...launchReceipt, marker: runMarker, phase, profileMode: 'descriptor-relative',
          }));
        },
        onOwnershipRelease({ session }) {
          const receipt = ownedBrowserReceipts.get(session);
          if (!ownedBrowserSessions.has(session) || !receipt) {
            rejectInspectionIdentity('browser-ownership-invalid');
          }
          ownedBrowserSessions.delete(session);
          ownedBrowserReceipts.delete(session);
          provisionallyReleasedBrowserSessions.add(session);
          provisionallyReleasedBrowserReceipts.set(session, receipt);
        },
        onOwnershipAttach({ session }) {
          if (!ownedBrowserSessions.has(session) || !ownedBrowserReceipts.has(session)) {
            rejectInspectionIdentity('browser-ownership-invalid');
          }
        },
      });
    } catch (error) {
      if (error instanceof GuardianFailure) throw error;
      throw new GuardianFailure('scenario-runner-invalid');
    } finally {
      finishStartupGeneration(generation);
    }
    activeScenario = handle;
    const phaseDeadlineMs = phase === 'before-transition'
      ? beforeTransitionDeadlineMs : afterTransitionDeadlineMs;
    const completed = await new INTRINSIC_PROMISE((resolveCompletion, rejectCompletion) => {
      let settled = false;
      const settle = (handler, value) => {
        if (settled) return;
        settled = true;
        INTRINSIC_REFLECT_APPLY(INTRINSIC_CLEAR_TIMEOUT, INTRINSIC_GLOBAL_THIS, [timer]);
        handler(value);
      };
      const timer = INTRINSIC_REFLECT_APPLY(INTRINSIC_SET_TIMEOUT, INTRINSIC_GLOBAL_THIS, [
        () => settle(rejectCompletion, new GuardianFailure('scenario-deadline-exceeded')),
        phaseDeadlineMs,
      ]);
      try {
        consumeNativePromise(
          handle.completion,
          value => settle(resolveCompletion, value),
          error => settle(rejectCompletion, error),
          'scenario-runner-invalid',
        );
        consumeNativePromise(
          abortGate,
          () => settle(rejectCompletion, new GuardianFailure('interrupted')),
          error => settle(rejectCompletion, error),
          'scenario-runner-invalid',
        );
      } catch (error) {
        settle(rejectCompletion, error);
      }
    });
    const scenarioFailureCandidate = completed?.ok === false
      && RUNNER_FAILURE_CATEGORIES.has(completed.category)
      && RUNNER_FAILURE_STAGES.has(completed.stage)
      ? Object.freeze({
        category: completed.category,
        stage: completed.stage,
        diagnostic: completed.diagnostic,
      }) : null;
    if (!completed) throw new GuardianFailure('scenario-failed');
    let joinResult = await joinScenario(handle);
    if (!joinResult.clean) {
      if (!joinResult.streamClosed) {
        await requestScenarioTermination(handle, false);
        joinResult = await joinScenario(handle);
      }
      if (scenarioFailureCandidate && joinResult.streamClosed && !handle.protocolFailure) {
        scenarioFailureAttribution = scenarioFailureCandidate;
      }
      if (handle.protocolFailure) throw handle.protocolFailure;
      throw new GuardianFailure('scenario-closure-failed');
    }
    scenarioFailureAttribution = scenarioFailureCandidate;
    activeScenario = null;
    if (completed.ok !== true) throw new GuardianFailure(completed.category ?? 'scenario-failed');
    await validateRetainedBrowserBoundary();
    return completed.rows;
  };

  let currentOptions = null;
  const run = async rawOptions => {
    if (running || state !== 'uninitialized') {
      return failureSummary({
        category: 'reentry', state, history, browserClosureCertified, closureCertified,
        ...await currentPreservationStates(),
      });
    }
    running = true;
    try {
      currentOptions = exactOptions(rawOptions);
      verifiedRunnerSnapshot = await verifyRunnerCommand(ownedRunnerCommand, repositoryRoot);
      verifiedRepositoryRoot = verifiedRunnerSnapshot.repositoryRoot;
      registerHandlers();
      transition('guarded');

      let initialBrowserNames;
      try {
        initialBrowserNames = await browserInventorySticky(undefined, 'browser-precondition-failed');
      } catch {
        removeHandlers();
        return failureSummary({
          category: 'browser-precondition-failed', state, history,
          browserClosureCertified: false, closureCertified: false,
        });
      }
      if (initialBrowserNames.length !== 0) {
        markInspectionUncertain();
        removeHandlers();
        return failureSummary({ category: 'browser-precondition-failed', state, history });
      }
      browserClosureCertified = true;
      globalProfileBaseline = await producerProfileInventorySticky(producerProfileTempRoot);
      try {
        const verified = await preconditionVerifier({
          deployedSha: currentOptions.deployedSha,
          stagingRunId: currentOptions.stagingRunId,
          pullRequestNumber: currentOptions.pullRequestNumber,
        });
        validateHostedPreconditions(verified, currentOptions);
      } catch {
        removeHandlers();
        return failureSummary({ category: 'hosted-precondition-failed', state, history });
      }
      await runFixture('preflight', currentOptions, 'preflight');
      transition('preflighted');

      workspacePath = await filesystem.mkdtemp(WORKSPACE_PREFIX);
      if (
        typeof workspacePath !== 'string'
        || resolve(workspacePath) !== workspacePath
        || !/^\/tmp\/phase9-core-identities\.[A-Za-z0-9_-]+$/.test(workspacePath)
      ) {
        throw new GuardianFailure('workspace-creation-failed');
      }
      manifestPath = join(workspacePath, 'manifest.json');
      credentialPath = join(workspacePath, 'credentials.json');
      await filesystem.chmod(workspacePath, 0o700);
      const workspaceStats = await filesystem.stat(workspacePath);
      if (!workspaceStats?.isDirectory?.() || (workspaceStats.mode & 0o777) !== 0o700) {
        throw new GuardianFailure('workspace-creation-failed');
      }
      await requirePrivateDirectory(filesystem, workspacePath, 'workspace-creation-failed');
      if (!(await proveAbsent(filesystem, manifestPath)) || !(await proveAbsent(filesystem, credentialPath))) {
        throw new GuardianFailure('workspace-creation-failed');
      }
      const candidateProfileRootPath = join(workspacePath, PLAYWRIGHT_TMP_NAME);
      await filesystem.mkdir(candidateProfileRootPath, { mode: 0o700 });
      profileRootPath = candidateProfileRootPath;
      await filesystem.chmod(profileRootPath, 0o700);
      await requirePrivateDirectory(filesystem, profileRootPath, 'workspace-creation-failed');

      await runFixture('seed', currentOptions, 'seeded');
      await loadExactManifest('active');
      checkInterrupted();
      await requirePrivateRegularFile(filesystem, credentialPath, 'credential-uncertain');
      checkInterrupted();
      if (manifest.state !== 'seeded') throw new GuardianFailure('manifest-uncertain');
      transition('seeded');

      await runFixture('inspect', currentOptions, 'seeded-present');
      transition('inspected');
      checkInterrupted();
      const privateContext = Object.freeze({
        workspacePath,
        manifestPath,
        credentialPath,
        profileRootPath,
      });
      const beforeRows = await runScenarioPhase('before-transition', privateContext);
      for (const row of beforeRows) {
        if (rowsByContext.has(row.contextId)) throw new GuardianFailure('scenario-runner-invalid');
        rowsByContext.set(row.contextId, row);
      }
      checkInterrupted();
      pendingTransitionAuthorized = true;
      await runFixture('transition', currentOptions, 'pending-deletion');
      checkInterrupted();
      await loadExactManifest('pending_deletion');
      checkInterrupted();
      const afterRows = await runScenarioPhase('after-transition', privateContext);
      for (const row of afterRows) {
        if (rowsByContext.has(row.contextId)) throw new GuardianFailure('scenario-runner-invalid');
        rowsByContext.set(row.contextId, row);
      }
      validatedRows = validateCompleteRows(rowsByContext);
      checkInterrupted();

      await closeOwnedBrowsers();
      await certifyReceiptProcessesAbsent();
      await terminateStoredPhaseMarkers();
      if (inspectionUncertain || profileInventoryUncertain) {
        throw new GuardianFailure('scenario-closure-failed');
      }
      await certifyEmptyBrowserInventory();
      await removeOwnedProfileRoot();
      checkInterrupted();
      transition('browsers-closed');
      await loadExactManifest('pending_deletion');
      checkInterrupted();
      await runFixture('inspect', currentOptions, 'seeded-present');
      transition('preclean-inspected');
      await runFixture('cleanup', currentOptions, 'cleaned');
      transition('cleaned');
      await runFixture('inspect', currentOptions, 'cleaned-absent');
      transition('clean-inspected');
      await loadExactManifest('pending_deletion');
      if (manifest.state !== 'cleaned') throw new GuardianFailure('manifest-uncertain');
      checkInterrupted();
      try {
        lifecycleStages.independentProbe = await exactIndependentProbe(adapterFactory, manifest);
      } catch {
        throw new GuardianFailure('independent-probe-failed');
      }
      checkInterrupted();
      transition('independently-absent');
      closureCertified = true;
      await persistCertificatePhase('closure-pending');

      try {
        const removed = await filesystem.removeCredentialFile(credentialPath, verifiedRepositoryRoot);
        if (removed !== true || !(await proveAbsent(filesystem, credentialPath))) throw new GuardianFailure('credential-removal-failed');
      } catch {
        throw new GuardianFailure('credential-removal-failed');
      }
      checkInterrupted();
      transition('credential-removed');
      credentialRemoved = true;
      try {
        await requirePrivateDirectory(filesystem, workspacePath, 'workspace-removal-failed');
        await filesystem.rm(workspacePath, { recursive: true, force: false });
        if (!(await proveAbsent(filesystem, workspacePath))) throw new GuardianFailure('workspace-removal-failed');
      } catch {
        throw new GuardianFailure('workspace-removal-failed');
      }
      transition('workspace-removed');
      workspaceRemoved = true;
      workspacePath = null;
      manifestPath = null;
      credentialPath = null;
      if (!removeHandlers()) throw new GuardianFailure('guardian-disarm-failed');
      transition('disarmed');
      const result = Object.freeze({
        ok: true,
        state,
        history: [...history],
        browserClosureCertified: true,
        closureCertified: true,
        rows: validatedRows,
      });
      return result;
    } catch (error) {
      const category = error instanceof GuardianFailure ? error.category : 'operation-failed';
      const result = await recover(category, interrupted);
      return result;
    } finally {
      running = false;
    }
  };

  return Object.freeze({ run });
}

export async function runGuardedLifecycle({ options, ...dependencies } = {}) {
  return createLifecycleGuardian(dependencies).run(options);
}

export { ORDERED_STATES };
