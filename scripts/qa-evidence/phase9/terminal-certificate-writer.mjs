import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, readFile, readdir, realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { types as utilTypes } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildCanonicalScenarioPlan } from './scenarios.mjs';

const HELPER_PATH = fileURLToPath(new URL('./terminal-certificate-dirfd-helper.py', import.meta.url));
const PYTHON_RUNTIME = '/usr/bin/python3';
const HELPER_SHA256 = '7a133389f2d88c2e92169b0f6fd86732d8c1287825531e130586b6705763478b';
const PYTHON_SHA256 = 'b8763cf250e607a778bb4603cecb5b90338814d0a3dfcba0d57b1de242f610e9';
const MAX_CERTIFICATE_BYTES = 32_768;
const MAX_HELPER_OUTPUT = 4_096;
const STATES = Object.freeze([
  'uninitialized', 'guarded', 'preflighted', 'seeded', 'inspected', 'browsers-closed',
  'preclean-inspected', 'cleaned', 'clean-inspected', 'independently-absent',
  'credential-removed', 'workspace-removed', 'disarmed',
]);
const PRIMARY_STAGES = new Set([
  ...STATES,
  'authorization', 'acquisition', 'receipt', 'recorder', 'viewport', 'login',
  'scenario-action', 'row-emission', 'release',
]);
const DIAGNOSTIC_REASONS = Object.freeze({
  'runner-initialization': 'runner-invalid', 'context-start': 'context-invalid',
  'ownership-authorization': 'authorization-failed', 'browser-acquisition': 'acquisition-failed',
  'launch-receipt': 'receipt-invalid', 'recorder-arm': 'recorder-failed',
  'viewport-verify': 'viewport-mismatch', 'login-submit': 'login-failed',
  'observation-arm': 'observation-failed', 'scenario-action': 'action-failed',
  'terminal-wait': 'terminal-not-reached', 'terminal-location': 'location-mismatch',
  'terminal-observer': 'observer-mismatch', 'terminal-role': 'role-restricted',
  'terminal-loading': 'loading-stalled', 'terminal-runtime': 'runtime-error',
  'terminal-heading': 'heading-missing', 'observation-sample': 'observation-failed',
  'window-validation': 'expectation-mismatch',
  'window-sample-contract': 'sample-contract-invalid',
  'window-observation-contract': 'observation-contract-invalid',
  'window-visible-contract': 'visible-contract-invalid',
  'window-resource-contract': 'resource-contract-invalid',
  'window-render-contract': 'render-contract-invalid',
  'window-output-contract': 'output-contract-invalid',
  'window-schema': 'schema-invalid', 'window-location': 'location-invalid',
  'window-terminal': 'terminal-invalid', 'window-loading': 'loading-invalid',
  'window-page-error': 'page-error-invalid', 'window-console-error': 'console-error-invalid',
  'window-console-team-event': 'console-error-invalid',
  'window-console-team-game': 'console-error-invalid',
  'window-console-token': 'console-error-invalid',
  'window-console-invite': 'console-error-invalid',
  'window-console-firebase-sdk': 'console-error-invalid',
  'window-console-other-args': 'console-error-invalid',
  'window-console-other-plain': 'console-error-invalid',
  'window-request-failure': 'request-failure-invalid', 'window-overflow': 'overflow-invalid',
  'window-render-coherence': 'render-coherence-invalid', 'window-resource': 'resource-invalid',
  'window-policy': 'policy-invalid',
  'landing-expectation': 'landing-mismatch', 'landing-heading': 'heading-mismatch',
  'landing-session': 'session-missing', 'landing-render-history': 'render-history-invalid',
  'route-expectation': 'route-mismatch',
  'row-validation': 'row-invalid',
  'ownership-release': 'release-failed', 'row-emission': 'row-invalid',
  'private-finalization': 'finalization-failed',
});
const NETWORK_CONSOLE_DIAGNOSTIC_REASONS = new Set(
  [
    ...Array.from({ length: 200 }, (_, index) => String(400 + index)),
    'unrecognized',
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
const DIAGNOSTIC_STAGES = Object.freeze({
  'runner-initialization': 'authorization', 'context-start': 'authorization',
  'ownership-authorization': 'authorization', 'browser-acquisition': 'acquisition',
  'launch-receipt': 'receipt', 'recorder-arm': 'recorder', 'viewport-verify': 'viewport',
  'login-submit': 'login', 'observation-arm': 'scenario-action', 'scenario-action': 'scenario-action',
  'terminal-wait': 'scenario-action', 'terminal-location': 'scenario-action',
  'terminal-observer': 'scenario-action', 'terminal-role': 'scenario-action',
  'terminal-loading': 'scenario-action', 'terminal-runtime': 'scenario-action',
  'terminal-heading': 'scenario-action', 'observation-sample': 'scenario-action',
  'terminal-join-claim': 'scenario-action',
  'window-validation': 'scenario-action',
  'window-sample-contract': 'scenario-action', 'window-observation-contract': 'scenario-action',
  'window-visible-contract': 'scenario-action', 'window-resource-contract': 'scenario-action',
  'window-render-contract': 'scenario-action', 'window-output-contract': 'scenario-action',
  'landing-expectation': 'scenario-action',
  'window-schema': 'scenario-action', 'window-location': 'scenario-action',
  'window-terminal': 'scenario-action', 'window-loading': 'scenario-action',
  'window-page-error': 'scenario-action', 'window-console-error': 'scenario-action',
  'window-console-team-event': 'scenario-action',
  'window-console-team-game': 'scenario-action',
  'window-console-token': 'scenario-action',
  'window-console-invite': 'scenario-action',
  'window-console-firebase-sdk': 'scenario-action',
  'window-console-network': 'scenario-action',
  'window-console-other-args': 'scenario-action',
  'window-console-other-plain': 'scenario-action',
  'window-request-failure': 'scenario-action', 'window-overflow': 'scenario-action',
  'window-render-coherence': 'scenario-action', 'window-resource': 'scenario-action',
  'window-policy': 'scenario-action',
  'window-no-team-render': 'scenario-action',
  'window-no-team-selection': 'scenario-action',
  'window-no-team-request': 'scenario-action',
  'window-no-team-listener': 'scenario-action',
  'window-no-team-join-admin': 'scenario-action',
  'landing-heading': 'scenario-action', 'landing-session': 'scenario-action',
  'landing-render-history': 'scenario-action', 'route-expectation': 'scenario-action',
  'route-session': 'scenario-action', 'route-location': 'scenario-action',
  'route-heading': 'scenario-action', 'route-render': 'scenario-action',
  'route-attribution': 'scenario-action',
  'row-validation': 'scenario-action',
  'ownership-release': 'release', 'row-emission': 'row-emission',
  'private-finalization': 'row-emission',
});
const DIAGNOSTIC_CONTEXTS = Object.freeze({
  before: buildCanonicalScenarioPlan().filter(row => row.startState !== 'pending_deletion'),
  after: buildCanonicalScenarioPlan().filter(row => row.startState === 'pending_deletion'),
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
const CATEGORIES = new Set([
  'none', 'pending', 'operation-failed', 'terminal-certificate-failed', 'ledger-validation-failed',
  'evidence-write-failed', 'interrupted', 'reentry', 'configuration-invalid', 'guardian-registration-failed',
  'browser-precondition-failed', 'hosted-precondition-failed', 'workspace-creation-failed', 'command-failed',
  'invalid-result', 'manifest-uncertain', 'scenario-runner-invalid', 'scenario-failed',
  'scenario-closure-failed', 'browser-closure-failed', 'independent-probe-failed',
  'credential-removal-failed', 'workspace-removal-failed', 'state-order-invalid',
  'recovery-cleanup-failed', 'recovery-inspect-failed', 'recovery-inspect-uncertain',
  'browser-ownership-invalid', 'guardian-disarm-failed', 'removal-uncertain',
  'scenario-deadline-exceeded',
]);
const PRIMARY_CATEGORIES = new Set([...CATEGORIES, 'legacy-primary-unavailable']);
const DEFAULT_FILESYSTEM = Object.freeze({ lstat, open, readFile, readdir, realpath, stat });

function snapshotCertificateDataGraph(input) {
  const copies = new WeakMap();
  const active = new WeakSet();
  let nodes = 0;
  const capture = (value, depth = 0) => {
    if (value === null || ['string', 'number', 'boolean', 'undefined'].includes(typeof value)) return value;
    if (typeof value !== 'object' || utilTypes.isProxy(value) || depth > 64) {
      throw new Error('invalid certificate data graph');
    }
    if (active.has(value)) throw new Error('cyclic certificate data graph');
    if (copies.has(value)) return copies.get(value);
    const array = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    if ((array && prototype !== Array.prototype)
      || (!array && prototype !== Object.prototype && prototype !== null)) {
      throw new Error('invalid certificate prototype');
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some(key => typeof key !== 'string')) throw new Error('invalid certificate key');
    let copy;
    if (array) {
      const length = descriptors.length?.value;
      if (!Number.isSafeInteger(length) || length < 0 || length > 10_000
        || keys.length !== length + 1
        || descriptors.length.enumerable !== false
        || descriptors.length.configurable !== false) {
        throw new Error('invalid certificate array');
      }
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
          throw new Error('invalid certificate array item');
        }
      }
      copy = new Array(length);
    } else {
      if (keys.some(key => {
        const descriptor = descriptors[key];
        return !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true;
      })) throw new Error('invalid certificate property');
      copy = Object.create(prototype);
    }
    nodes += keys.length;
    if (nodes > 20_000) throw new Error('oversized certificate graph');
    copies.set(value, copy);
    active.add(value);
    const dataKeys = array ? keys.filter(key => key !== 'length') : keys;
    for (const key of dataKeys) Object.defineProperty(copy, key, {
      value: capture(descriptors[key].value, depth + 1),
      enumerable: true,
      configurable: true,
      writable: true,
    });
    active.delete(value);
    return copy;
  };
  try {
    return capture(input);
  } catch {
    throw new Error('Terminal certificate data graph is invalid.');
  }
}

function exactKeys(value, keys, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) {
    throw new Error(`Terminal certificate ${name} is invalid.`);
  }
  return value;
}

function validateRequestFailure(value) {
  exactKeys(value, REQUEST_FAILURE_KEYS, 'requestFailure');
  if (!REQUEST_FAILURE_CLASSES.includes(value.failureClass)
    || !REQUEST_FAILURE_TARGET_CLASSES.includes(value.targetClass)
    || !REQUEST_FAILURE_RESOURCE_TYPES.includes(value.resourceType)
    || !REQUEST_FAILURE_NAVIGATION_RELATIONSHIPS.includes(value.navigationRelationship)
    || !REQUEST_FAILURE_MULTIPLICITIES.includes(value.multiplicity)) {
    throw new Error('Terminal certificate requestFailure is invalid.');
  }
  return value;
}

function count(value, name) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000) {
    throw new Error(`Terminal certificate ${name} is invalid.`);
  }
  return value;
}

function boolean(value, name) {
  if (typeof value !== 'boolean') throw new Error(`Terminal certificate ${name} is invalid.`);
  return value;
}

function nullableSummary(value, keys, name) {
  if (value === null) return null;
  exactKeys(value, keys, name);
  for (const key of keys) count(value[key], `${name}.${key}`);
  return value;
}

function requireExactSummary(value, expected, name) {
  if (value === null || Object.keys(expected).some(key => value[key] !== expected[key])) {
    throw new Error(`Terminal certificate ${name} is not certified.`);
  }
}

function validateLifecycle(value, status) {
  exactKeys(value, [
    'state', 'history', 'preflight', 'seed', 'initialInspect', 'precleanInspect', 'cleanup',
    'cleanInspect', 'independentProbe', 'browserClosureCertified', 'processClosureCertified',
    'profileClosureCertified', 'fixtureClosureCertified', 'credentialRemoved', 'workspaceRemoved',
  ], 'lifecycle');
  if (typeof value.state !== 'string' || !STATES.includes(value.state)
    || !Array.isArray(value.history) || value.history.length < 1 || value.history.length > STATES.length
    || value.history.some((state, index) => state !== STATES[index])
    || value.state !== value.history.at(-1)) throw new Error('Terminal certificate lifecycle history is invalid.');
  nullableSummary(value.preflight, ['plannedAliases', 'plannedTeams'], 'preflight');
  nullableSummary(value.seed, ['auth', 'firestore'], 'seed');
  for (const name of ['initialInspect', 'precleanInspect', 'cleanInspect']) {
    nullableSummary(value[name], ['expectedAuth', 'expectedFirestore', 'actualAuth', 'actualFirestore'], name);
  }
  nullableSummary(value.cleanup, [
    'deletedAuth', 'deletedFirestore', 'retainedAuth', 'retainedFirestore', 'failedAuth', 'failedFirestore',
  ], 'cleanup');
  nullableSummary(value.independentProbe, [
    'checkedAuth', 'checkedFirestore', 'checkedExpectedAbsent', 'authPresent', 'firestorePresent',
    'expectedAbsentPresent',
  ], 'independentProbe');
  for (const key of [
    'browserClosureCertified', 'processClosureCertified', 'profileClosureCertified',
    'fixtureClosureCertified', 'credentialRemoved', 'workspaceRemoved',
  ]) boolean(value[key], key);
  if (status === 'closure-pending' || status === 'complete') {
    const requiredHistoryLength = status === 'complete' ? STATES.length : null;
    const removalRequired = status === 'complete';
    const validPendingRemoval = status !== 'closure-pending'
      || (value.workspaceRemoved === false
        && new Set([false, true]).has(value.credentialRemoved));
    if ((requiredHistoryLength !== null && value.history.length !== requiredHistoryLength)
      || (status === 'closure-pending' && value.history.length > 10)
      || !value.browserClosureCertified || !value.processClosureCertified || !value.profileClosureCertified
      || !value.fixtureClosureCertified || !validPendingRemoval
      || (status === 'complete' && (value.credentialRemoved !== removalRequired || value.workspaceRemoved !== removalRequired))) {
      throw new Error('Terminal certificate certified lifecycle is invalid.');
    }
    requireExactSummary(value.preflight, { plannedAliases: 20, plannedTeams: 3 }, 'preflight');
    requireExactSummary(value.seed, { auth: 20, firestore: 82 }, 'seed');
    const presentInspect = { expectedAuth: 20, expectedFirestore: 82, actualAuth: 20, actualFirestore: 82 };
    requireExactSummary(value.initialInspect, presentInspect, 'initialInspect');
    requireExactSummary(value.precleanInspect, presentInspect, 'precleanInspect');
    requireExactSummary(value.cleanup, {
      deletedAuth: 20, deletedFirestore: 82, retainedAuth: 0, retainedFirestore: 0,
      failedAuth: 0, failedFirestore: 0,
    }, 'cleanup');
    requireExactSummary(value.cleanInspect, {
      expectedAuth: 20, expectedFirestore: 82, actualAuth: 0, actualFirestore: 0,
    }, 'cleanInspect');
    requireExactSummary(value.independentProbe, {
      checkedAuth: 20, checkedFirestore: 82, checkedExpectedAbsent: 1,
      authPresent: 0, firestorePresent: 0, expectedAbsentPresent: 0,
    }, 'independentProbe');
  }
  return value;
}

function validateCertificate(input, {
  allowVersion1 = false, allowLegacyPrimary = false, allowRecoveryDisposition = false,
} = {}) {
  const value = snapshotCertificateDataGraph(input);
  const version1 = value?.version === 1;
  const version3 = value?.version === 3;
  exactKeys(value, version1
    ? ['version', 'command', 'status', 'exitCode', 'category', 'deployment', 'lifecycle', 'evidence']
    : ['version', 'command', 'status', 'exitCode', 'category', 'primaryCategory', 'primaryStage', 'deployment', 'lifecycle', 'evidence',
      ...(Object.hasOwn(value ?? {}, 'diagnostic') ? ['diagnostic'] : []),
      ...(version3 ? ['recoveryDisposition'] : [])], 'document');
  if ((!version1 && value.version !== 2 && value.version !== 3) || (version1 && !allowVersion1)
    || (version3 && !allowRecoveryDisposition) || value.command !== 'hosted'
    || !new Set(['closure-pending', 'complete', 'failed']).has(value.status)
    || !Number.isSafeInteger(value.exitCode) || !new Set([0, 1]).has(value.exitCode)
    || typeof value.category !== 'string' || !CATEGORIES.has(value.category)) {
    throw new Error('Terminal certificate status or category is invalid.');
  }
  if (!version1 && (
    typeof value.primaryCategory !== 'string' || !PRIMARY_CATEGORIES.has(value.primaryCategory)
    || typeof value.primaryStage !== 'string' || !PRIMARY_STAGES.has(value.primaryStage)
    || (value.primaryCategory === 'legacy-primary-unavailable' && !allowLegacyPrimary)
  )) throw new Error('Terminal certificate primary attribution is invalid.');
  if (!version1 && !STATES.includes(value.primaryStage)) {
    const expectedCategory = new Set(['login', 'scenario-action']).has(value.primaryStage)
      ? 'scenario-failed' : 'scenario-runner-invalid';
    if (value.primaryCategory !== expectedCategory) {
      throw new Error('Terminal certificate primary attribution is invalid.');
    }
  }
  if (!version1 && (!STATES.includes(value.primaryStage)) !== Object.hasOwn(value, 'diagnostic')) {
    throw new Error('Terminal certificate diagnostic presence is invalid.');
  }
  if (!version1 && Object.hasOwn(value, 'diagnostic')) {
    const hasRequestFailure = Object.hasOwn(value.diagnostic ?? {}, 'requestFailure');
    exactKeys(value.diagnostic, [
      'checkpoint', 'contextId', 'contextOrdinal', 'reason',
      ...(hasRequestFailure ? ['requestFailure'] : []),
    ], 'diagnostic');
    if (!Number.isSafeInteger(value.diagnostic.contextOrdinal) || value.diagnostic.contextOrdinal < 0
      || value.diagnostic.contextOrdinal >= 40
      || typeof value.diagnostic.contextId !== 'string'
      || ![DIAGNOSTIC_CONTEXTS.before, DIAGNOSTIC_CONTEXTS.after].some(contexts => (
        contexts[value.diagnostic.contextOrdinal]?.contextId === value.diagnostic.contextId
      ))
      || !(Object.hasOwn(DIAGNOSTIC_REASONS, value.diagnostic.checkpoint)
        ? value.diagnostic.reason === DIAGNOSTIC_REASONS[value.diagnostic.checkpoint]
        : ROUTE_DIAGNOSTIC_CHECKPOINTS.has(value.diagnostic.checkpoint)
          ? ROUTE_DIAGNOSTIC_REASONS.has(value.diagnostic.reason)
          : value.diagnostic.checkpoint === 'window-console-network'
            ? NETWORK_CONSOLE_DIAGNOSTIC_REASONS.has(value.diagnostic.reason)
          : isNoTeamDiagnostic(value.diagnostic.checkpoint, value.diagnostic.reason))
      || (ROUTE_DIAGNOSTIC_CHECKPOINTS.has(value.diagnostic.checkpoint)
        && ![DIAGNOSTIC_CONTEXTS.before, DIAGNOSTIC_CONTEXTS.after].some(contexts => (
          contexts[value.diagnostic.contextOrdinal]?.contextId === value.diagnostic.contextId
          && contexts[value.diagnostic.contextOrdinal]?.group === 'admission-route'
        )))
      || (Object.hasOwn(NO_TEAM_DIAGNOSTIC_REASONS, value.diagnostic.checkpoint)
        && ![DIAGNOSTIC_CONTEXTS.before, DIAGNOSTIC_CONTEXTS.after].some(contexts => (
          contexts[value.diagnostic.contextOrdinal]?.contextId === value.diagnostic.contextId
          && contexts[value.diagnostic.contextOrdinal]?.alias === 'qa-no-team'
        )))
      || value.primaryStage !== DIAGNOSTIC_STAGES[value.diagnostic.checkpoint]) {
      throw new Error('Terminal certificate diagnostic is invalid.');
    }
    if (hasRequestFailure) {
      validateRequestFailure(value.diagnostic.requestFailure);
      const requestFailureDiagnostic = value.diagnostic.checkpoint === 'window-request-failure'
        && value.diagnostic.reason === 'request-failure-invalid';
      const priorWindowFailureDiagnostic = value.diagnostic.checkpoint === 'window-console-network'
        && value.diagnostic.reason === 'request-failure-prior-window';
      if (!(requestFailureDiagnostic || priorWindowFailureDiagnostic)
        || value.primaryStage !== 'scenario-action') {
        throw new Error('Terminal certificate requestFailure attribution is invalid.');
      }
    }
  }
  if (version3) {
    exactKeys(value.recoveryDisposition, [
      'phase', 'credentialIdentity', 'workspaceIdentity', 'manifestSha256',
      'originalPathsAbsent', 'credentialZeroized', 'workspaceQuarantinedInPlace', 'workspaceRetained',
    ], 'recoveryDisposition');
    if (!new Set(['validated', 'zeroized']).has(value.recoveryDisposition.phase)
      || ['credentialIdentity', 'workspaceIdentity', 'manifestSha256'].some(key => (
        typeof value.recoveryDisposition[key] !== 'string' || !/^[a-f0-9]{64}$/.test(value.recoveryDisposition[key])
      ))
      || ['originalPathsAbsent', 'credentialZeroized', 'workspaceQuarantinedInPlace', 'workspaceRetained'].some(key => (
        typeof value.recoveryDisposition[key] !== 'boolean'
      ))) throw new Error('Terminal certificate recovery disposition is invalid.');
    const expected = value.recoveryDisposition.phase === 'validated'
      ? [false, false, false, true]
      : [false, true, true, true];
    if (['originalPathsAbsent', 'credentialZeroized', 'workspaceQuarantinedInPlace', 'workspaceRetained']
      .some((key, index) => value.recoveryDisposition[key] !== expected[index])
      || value.lifecycle.credentialRemoved !== false || value.lifecycle.workspaceRemoved !== false
      || value.evidence.rows !== 0 || value.evidence.written !== false) {
      throw new Error('Terminal certificate recovery disposition arithmetic is invalid.');
    }
  }
  if ((value.status === 'complete') !== (value.exitCode === 0) || (value.status === 'complete') !== (value.category === 'none')) {
    throw new Error('Terminal certificate exit/category arithmetic is invalid.');
  }
  if (value.status === 'closure-pending' && value.category !== 'pending') {
    throw new Error('Terminal certificate checkpoint category is invalid.');
  }
  if (value.status === 'failed' && new Set(['none', 'pending']).has(value.category)) {
    throw new Error('Terminal certificate failure category is invalid.');
  }
  exactKeys(value.deployment, ['deployedSha', 'stagingRunId', 'pullRequestNumber'], 'deployment');
  if (typeof value.deployment.deployedSha !== 'string' || !/^[a-f0-9]{40}$/.test(value.deployment.deployedSha)
    || typeof value.deployment.stagingRunId !== 'string' || !/^[1-9][0-9]{5,20}$/.test(value.deployment.stagingRunId)
    || !Number.isSafeInteger(value.deployment.pullRequestNumber) || value.deployment.pullRequestNumber < 1) {
    throw new Error('Terminal certificate deployment is invalid.');
  }
  validateLifecycle(value.lifecycle, value.status);
  if (value.status === 'closure-pending' && value.lifecycle.credentialRemoved === true
    && new Set(['none', 'pending']).has(value.primaryCategory)) {
    throw new Error('Terminal certificate checkpoint removal state is invalid.');
  }
  exactKeys(value.evidence, ['rows', 'written'], 'evidence');
  count(value.evidence.rows, 'evidence.rows');
  boolean(value.evidence.written, 'evidence.written');
  if (value.status === 'complete' && (value.evidence.rows !== 44 || value.evidence.written !== true)) {
    throw new Error('Terminal certificate complete evidence is invalid.');
  }
  if (value.status === 'closure-pending' && (value.evidence.rows !== 0 || value.evidence.written !== false)) {
    throw new Error('Terminal certificate checkpoint evidence is invalid.');
  }
  return Object.freeze(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
}

function canonicalDocument(value, validationOptions) {
  const document = `${JSON.stringify(canonicalize(validateCertificate(value, validationOptions)))}\n`;
  if (Buffer.byteLength(document) > MAX_CERTIFICATE_BYTES) throw new Error('Terminal certificate is oversized.');
  return document;
}

function isWithin(path, boundary) {
  const child = relative(boundary, path);
  return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child));
}

export function assertPhase9TerminalResultConfinement({
  resultPath, parentPath, canonicalParent, canonicalRepository, canonicalWorkspace, canonicalEvidence,
} = {}) {
  const canonicalResultPath = join(canonicalParent, basename(resultPath));
  if (canonicalParent !== parentPath || isWithin(canonicalResultPath, canonicalRepository)
    || isWithin(canonicalResultPath, canonicalWorkspace) || isWithin(canonicalResultPath, canonicalEvidence)) {
    throw new Error('Terminal certificate path must be canonical and external.');
  }
}

function validateRecoveryClosure(document, removalRequired) {
  if (document.category !== 'terminal-certificate-failed'
    || document.evidence.rows !== 0 || document.evidence.written !== false
    || document.lifecycle.credentialRemoved !== removalRequired
    || document.lifecycle.workspaceRemoved !== removalRequired) {
    throw new Error('Terminal certificate recovery state is invalid.');
  }
  validateLifecycle({
    ...document.lifecycle,
    credentialRemoved: false,
    workspaceRemoved: false,
  }, 'closure-pending');
}

async function readCheckpoint(filesystem, path, location = 'result', {
  allowLegacyFailedRecovery = false,
  allowTerminalReplay = false,
} = {}) {
  const metadata = await filesystem.lstat(path);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.uid !== process.getuid()
    || metadata.nlink !== 1 || (metadata.mode & 0o777) !== 0o600
    || metadata.size < 1 || metadata.size > MAX_CERTIFICATE_BYTES) {
    throw new Error('Terminal certificate checkpoint is invalid.');
  }
  const handle = await filesystem.open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const held = await handle.stat();
    if (held.dev !== metadata.dev || held.ino !== metadata.ino || held.size !== metadata.size) {
      throw new Error('Terminal certificate checkpoint identity changed.');
    }
    const text = await handle.readFile('utf8');
    const parsed = validateCertificate(JSON.parse(text), {
      allowVersion1: allowLegacyFailedRecovery,
      allowLegacyPrimary: allowLegacyFailedRecovery,
      allowRecoveryDisposition: allowLegacyFailedRecovery,
    });
    const isCheckpoint = parsed.status === 'closure-pending';
    const isLegacyRecovery = allowLegacyFailedRecovery && parsed.version === 1 && parsed.status === 'failed';
    const isTerminalReplay = allowTerminalReplay && parsed.status === 'failed' && (
      (parsed.version === 2 && parsed.lifecycle.credentialRemoved === true && parsed.lifecycle.workspaceRemoved === true)
      || (parsed.version === 3 && parsed.recoveryDisposition.phase === 'zeroized')
    );
    if (!isCheckpoint && !isLegacyRecovery && !isTerminalReplay) {
      throw new Error('Terminal certificate checkpoint is not resumable.');
    }
    if (isLegacyRecovery) validateRecoveryClosure(parsed, false);
    if (isTerminalReplay && parsed.version === 2) validateRecoveryClosure(parsed, true);
    if (isTerminalReplay && parsed.version === 3) validateRecoveryClosure(parsed, false);
    if (canonicalDocument(parsed, {
      allowVersion1: true,
      allowLegacyPrimary: allowLegacyFailedRecovery && parsed.primaryCategory === 'legacy-primary-unavailable',
      allowRecoveryDisposition: allowLegacyFailedRecovery,
    }) !== text) throw new Error('Terminal certificate checkpoint is not canonical.');
    const [afterHeld, named] = await Promise.all([handle.stat(), filesystem.lstat(path)]);
    for (const current of [afterHeld, named]) {
      if (!current.isFile() || current.isSymbolicLink() || current.dev !== metadata.dev
        || current.ino !== metadata.ino || current.uid !== metadata.uid
        || current.nlink !== metadata.nlink || (current.mode & 0o777) !== (metadata.mode & 0o777)
        || current.size !== metadata.size) {
        throw new Error('Terminal certificate checkpoint identity changed.');
      }
    }
    return Object.freeze({
      state: isTerminalReplay ? 'terminal' : 'checkpoint', location, size: Buffer.byteLength(text),
      sha256: createHash('sha256').update(text).digest('hex'),
      dev: metadata.dev, ino: metadata.ino, uid: metadata.uid,
      mode: metadata.mode & 0o777, nlink: metadata.nlink,
      document: parsed,
    });
  } finally { await handle.close(); }
}

function metadataMatchesReceipt(metadata, receipt) {
  return metadata.isFile() && !metadata.isSymbolicLink() && metadata.uid === receipt.uid
    && metadata.dev === receipt.dev && metadata.ino === receipt.ino
    && metadata.nlink === receipt.nlink && (metadata.mode & 0o777) === receipt.mode
    && metadata.size === receipt.size;
}

async function readCommittedResult({
  filesystem, path, receipt, document, validated, revalidateParent,
}) {
  await revalidateParent();
  let handle;
  try {
    handle = await filesystem.open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const before = await handle.stat();
    if (!metadataMatchesReceipt(before, receipt)) {
      throw new Error('Terminal certificate committed identity changed.');
    }
    const buffer = Buffer.alloc(receipt.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset !== receipt.size) throw new Error('Terminal certificate committed size changed.');
    const text = buffer.subarray(0, offset).toString('utf8');
    const after = await handle.stat();
    if (!metadataMatchesReceipt(after, receipt)
      || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs
      || text !== document || createHash('sha256').update(text).digest('hex') !== receipt.sha256) {
      throw new Error('Terminal certificate committed bytes changed.');
    }
    const parsed = validateCertificate(JSON.parse(text), {
      allowLegacyPrimary: validated.primaryCategory === 'legacy-primary-unavailable',
      allowRecoveryDisposition: validated.version === 3,
    });
    if (parsed.status !== validated.status
      || canonicalDocument(parsed, {
        allowLegacyPrimary: validated.primaryCategory === 'legacy-primary-unavailable',
        allowRecoveryDisposition: validated.version === 3,
      }) !== text) {
      throw new Error('Terminal certificate committed document changed.');
    }
    await revalidateParent();
    const named = await filesystem.lstat(path);
    const finalHeld = await handle.stat();
    if (!metadataMatchesReceipt(named, receipt) || !metadataMatchesReceipt(finalHeld, receipt)
      || finalHeld.mtimeMs !== before.mtimeMs || finalHeld.ctimeMs !== before.ctimeMs) {
      throw new Error('Terminal certificate committed pathname changed.');
    }
    return Object.freeze({
      state: validated.status === 'closure-pending' ? 'checkpoint' : 'terminal',
      location: 'result', size: receipt.size, sha256: receipt.sha256,
      dev: receipt.dev, ino: receipt.ino, uid: receipt.uid, mode: receipt.mode, nlink: receipt.nlink,
      document: parsed,
    });
  } catch {
    throw new Error('Terminal certificate committed result is invalid.');
  } finally {
    await handle?.close().catch(() => {});
  }
}

async function invokeHelper({ parentHandle, directoryIdentity, name, expected, document, helperEnvironment, helperTimeoutMs, helperSource }) {
  const request = JSON.stringify({
    version: 1, operation: 'write',
    transaction: `${process.pid}-${Date.now()}-${randomBytes(8).toString('hex')}`,
    directory: directoryIdentity, name,
    expected: expected.state === 'absent'
      ? { state: 'absent' }
      : { state: 'checkpoint', location: expected.location, size: expected.size, sha256: expected.sha256 },
    document,
  });
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(PYTHON_RUNTIME, ['-I', '-c', helperSource], {
      env: {
        LANG: 'C', LC_ALL: 'C', PYTHONHASHSEED: '0', PYTHONNOUSERSITE: '1',
        ...helperEnvironment,
      }, detached: true,
      stdio: ['pipe', 'pipe', 'pipe', parentHandle.fd],
    });
    let stdout = '';
    let stderrBytes = 0;
    let settled = false;
    let timedOut = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) rejectPromise(error); else resolvePromise(value);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    }, helperTimeoutMs);
    child.stdout.on('data', chunk => {
      stdout += chunk.toString('utf8');
      if (Buffer.byteLength(stdout) > MAX_HELPER_OUTPUT) try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    });
    child.stderr.on('data', chunk => {
      stderrBytes += chunk.length;
      if (stderrBytes > MAX_HELPER_OUTPUT) try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    });
    child.once('error', () => finish(new Error('Terminal certificate helper failed.')));
    child.once('close', code => {
      if (timedOut) {
        finish(new Error('Terminal certificate helper timed out.'));
        return;
      }
      let result;
      try { result = JSON.parse(stdout); } catch { result = null; }
      if (code !== 0 || !result || Object.keys(result).sort().join(',') !== [
        'dev', 'ino', 'mode', 'nlink', 'ok', 'sha256', 'size', 'status', 'uid',
      ].sort().join(',')
        || result.ok !== true || result.status !== 'committed'
        || !Number.isSafeInteger(result.dev) || result.dev < 0
        || !Number.isSafeInteger(result.ino) || result.ino < 1
        || result.uid !== process.getuid() || result.mode !== 0o600 || result.nlink !== 1
        || result.size !== Buffer.byteLength(document)
        || result.sha256 !== createHash('sha256').update(document).digest('hex')) {
        finish(new Error('Terminal certificate was not written atomically.'));
      } else finish(null, result);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(request);
  });
}

export async function createPhase9TerminalCertificateWriter({
  resultPath, repositoryRoot, workspacePath, evidenceDirectory,
  filesystem = DEFAULT_FILESYSTEM, helperEnvironment = {}, helperTimeoutMs = 10_000,
  platform = process.platform,
  allowLegacyFailedRecovery = false,
  allowTerminalReplay = false,
  allowAbsentWorkspaceRecovery = false,
} = {}) {
  if (platform !== 'darwin') throw new Error('Phase 9 terminal certificate writer requires Darwin.');
  if (typeof resultPath !== 'string' || !isAbsolute(resultPath) || resolve(resultPath) !== resultPath
    || typeof repositoryRoot !== 'string' || !isAbsolute(repositoryRoot) || resolve(repositoryRoot) !== repositoryRoot
    || typeof workspacePath !== 'string' || !isAbsolute(workspacePath) || resolve(workspacePath) !== workspacePath
    || typeof evidenceDirectory !== 'string' || !isAbsolute(evidenceDirectory) || resolve(evidenceDirectory) !== evidenceDirectory
    || !helperEnvironment || typeof helperEnvironment !== 'object' || Array.isArray(helperEnvironment)
    || Object.keys(helperEnvironment).some(key => !new Set([
      'PHASE9_CERTIFICATE_TEST_FAIL_PROMOTION', 'PHASE9_CERTIFICATE_TEST_BEFORE_PROMOTION_MS',
      'PHASE9_CERTIFICATE_TEST_AFTER_CHECKPOINT_VALIDATION_MS', 'PHASE9_CERTIFICATE_TEST_HANG',
    ]).has(key))
    || !Number.isSafeInteger(helperTimeoutMs) || helperTimeoutMs < 100 || helperTimeoutMs > 30_000
    || typeof allowLegacyFailedRecovery !== 'boolean' || typeof allowTerminalReplay !== 'boolean'
    || typeof allowAbsentWorkspaceRecovery !== 'boolean') {
    throw new Error('Terminal certificate configuration is invalid.');
  }
  const name = basename(resultPath);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,126}\.json$/.test(name)) throw new Error('Terminal certificate filename is invalid.');
  const parentPath = dirname(resultPath);
  const recoveryName = `.${name}.checkpoint`;
  const recoveryPath = join(parentPath, recoveryName);
  const canonicalWorkspacePromise = filesystem.realpath(workspacePath).catch(async error => {
    if (!allowAbsentWorkspaceRecovery || error?.code !== 'ENOENT') throw error;
    return join(await filesystem.realpath(dirname(workspacePath)), basename(workspacePath));
  });
  const [canonicalParent, canonicalRepository, canonicalWorkspace, canonicalEvidence, helperMetadata, helperCanonical, helperSource, pythonMetadata, pythonCanonical, pythonBytes] = await Promise.all([
    filesystem.realpath(parentPath), filesystem.realpath(repositoryRoot), canonicalWorkspacePromise,
    filesystem.realpath(evidenceDirectory),
    filesystem.lstat(HELPER_PATH), filesystem.realpath(HELPER_PATH), filesystem.readFile(HELPER_PATH, 'utf8'),
    filesystem.lstat(PYTHON_RUNTIME), filesystem.realpath(PYTHON_RUNTIME), filesystem.readFile(PYTHON_RUNTIME),
  ]);
  if (!helperMetadata.isFile() || helperMetadata.isSymbolicLink() || helperCanonical !== HELPER_PATH
    || (helperMetadata.mode & 0o022) !== 0
    || createHash('sha256').update(helperSource).digest('hex') !== HELPER_SHA256
    || !pythonMetadata.isFile() || pythonMetadata.isSymbolicLink() || pythonCanonical !== PYTHON_RUNTIME
    || (pythonMetadata.mode & 0o022) !== 0
    || createHash('sha256').update(pythonBytes).digest('hex') !== PYTHON_SHA256) {
    throw new Error('Terminal certificate helper runtime is invalid.');
  }
  assertPhase9TerminalResultConfinement({
    resultPath, parentPath, canonicalParent, canonicalRepository, canonicalWorkspace, canonicalEvidence,
  });
  const parentMetadata = await filesystem.lstat(parentPath);
  if (!parentMetadata.isDirectory() || parentMetadata.isSymbolicLink() || parentMetadata.uid !== process.getuid()
    || (parentMetadata.mode & 0o777) !== 0o700) {
    throw new Error('Terminal certificate parent must be a private mode-0700 directory.');
  }
  const names = await filesystem.readdir(parentPath);
  if (names.some(entry => entry !== name && entry !== recoveryName)
    || (names.includes(name) && names.includes(recoveryName))) {
    throw new Error('Terminal certificate parent contains unexpected entries or a result collision.');
  }
  let expected;
  const recoveryAdmission = { allowLegacyFailedRecovery, allowTerminalReplay };
  if (names.includes(name)) expected = await readCheckpoint(filesystem, resultPath, 'result', recoveryAdmission);
  else if (names.includes(recoveryName)) expected = await readCheckpoint(filesystem, recoveryPath, 'recovery', recoveryAdmission);
  else expected = Object.freeze({ state: 'absent' });
  const parentHandle = await filesystem.open(parentPath, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
  const heldParent = await parentHandle.stat();
  if (heldParent.dev !== parentMetadata.dev || heldParent.ino !== parentMetadata.ino
    || heldParent.uid !== process.getuid() || (heldParent.mode & 0o777) !== 0o700) {
    await parentHandle.close();
    throw new Error('Terminal certificate parent identity changed.');
  }
  const directoryIdentity = Object.freeze({
    dev: heldParent.dev, ino: heldParent.ino, mode: heldParent.mode & 0o777, uid: heldParent.uid,
  });
  let closed = false;
  const revalidateParent = async () => {
    const [pathMetadata, heldMetadata, canonical] = await Promise.all([
      filesystem.lstat(parentPath), parentHandle.stat(), filesystem.realpath(parentPath),
    ]);
    if (canonical !== parentPath || pathMetadata.isSymbolicLink() || !pathMetadata.isDirectory()
      || pathMetadata.dev !== directoryIdentity.dev || pathMetadata.ino !== directoryIdentity.ino
      || heldMetadata.dev !== directoryIdentity.dev || heldMetadata.ino !== directoryIdentity.ino
      || pathMetadata.uid !== directoryIdentity.uid || (pathMetadata.mode & 0o777) !== 0o700) {
      throw new Error('Terminal certificate parent identity changed.');
    }
  };
  return Object.freeze({
    get checkpoint() { return expected.state === 'checkpoint' ? expected.document : null; },
    get result() { return expected.document ?? null; },
    async revalidate() {
      await revalidateParent();
      const currentPath = expected.location === 'recovery' ? recoveryPath : resultPath;
      const current = await readCheckpoint(filesystem, currentPath, expected.location, recoveryAdmission);
      if (current.state !== expected.state || current.sha256 !== expected.sha256
        || current.size !== expected.size || current.dev !== expected.dev || current.ino !== expected.ino
        || current.uid !== expected.uid || current.mode !== expected.mode || current.nlink !== expected.nlink) {
        throw new Error('Terminal certificate replay identity changed.');
      }
      return current.document;
    },
    async write(certificate) {
      if (closed) throw new Error('Terminal certificate writer is closed.');
      if (expected.state === 'terminal') throw new Error('Terminal certificate is already terminal.');
      const allowLegacyPrimary = expected.state === 'checkpoint'
        && (expected.document.version === 1 || expected.document.primaryCategory === 'legacy-primary-unavailable');
      const validated = validateCertificate(certificate, {
        allowLegacyPrimary, allowRecoveryDisposition: allowLegacyFailedRecovery,
      });
      if (expected.state === 'absent' && validated.status === 'complete') {
        throw new Error('Terminal certificate completion requires a checkpoint.');
      }
      await revalidateParent();
      const document = canonicalDocument(validated, {
        allowLegacyPrimary, allowRecoveryDisposition: allowLegacyFailedRecovery,
      });
      const prior = expected;
      const receipt = await invokeHelper({
        parentHandle, directoryIdentity, name, expected: prior, document, helperEnvironment, helperTimeoutMs,
        helperSource,
      });
      const committed = await readCommittedResult({
        filesystem, path: resultPath, receipt, document, validated, revalidateParent,
      });
      expected = committed;
      return validated;
    },
    async close() {
      if (closed) return;
      closed = true;
      await parentHandle.close();
    },
  });
}

export function canonicalPhase9TerminalCertificate(value) {
  return canonicalDocument(value);
}

export function canonicalPhase9TerminalRecoveryCertificate(value) {
  return canonicalDocument(value, { allowRecoveryDisposition: true });
}
