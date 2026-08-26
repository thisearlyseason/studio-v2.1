import { execFile, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { chmod, lstat, mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
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
const INTRINSIC_PROCESS_KILL = process.kill.bind(process);
const INTRINSIC_PROCESS_EXEC_PATH = process.execPath;
const INTRINSIC_PROCESS_PLATFORM = process.platform;
const INTRINSIC_CHILD_ENV = Object.freeze(Object.fromEntries(
  Object.entries(process.env).filter(([name]) => !new Set(['NODE_OPTIONS', 'NODE_PATH']).has(name)),
));

const WORKSPACE_PREFIX = '/tmp/phase9-core-identities.';
const RUNNER_STDOUT_LIMIT = 65_536;
const RUNNER_STDERR_LIMIT = 16_384;
const RUNNER_LINE_LIMIT = 8_192;
const RUNNER_SESSION_LIMIT = 100;
const RUNNER_ENTRYPOINT_LIMIT = 131_072;
const RUNNER_CONFIG_LIMIT = 65_536;
const RUNNER_CONFIG_TOTAL_LIMIT = 131_072;
const PROCESS_AUDIT_OUTPUT_LIMIT = 16_777_216;
const RUN_MARKER_ENV = 'PHASE9_GUARDIAN_RUN_MARKER';
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

class GuardianFailure extends Error {
  constructor(category) {
    super(category);
    this.category = category;
  }
}

const defaultFilesystem = Object.freeze({
  mkdtemp,
  chmod,
  stat,
  lstat,
  readFile,
  removeCredentialFile: (path, repositoryRoot) => removeCredentialFile(path, repositoryRoot),
  rm: (path, options) => rm(path, options),
});

const defaultProcessHooks = Object.freeze({
  on: (name, handler) => process.on(name, handler),
  off: (name, handler) => process.off(name, handler),
});

function requireDependencies(value) {
  if (!value || typeof value !== 'object') throw new GuardianFailure('configuration-invalid');
  for (const name of ['fixtureCommand', 'adapterFactory', 'preconditionVerifier']) {
    if (typeof value[name] !== 'function') throw new GuardianFailure('configuration-invalid');
  }
  if (!value.runnerCommand || typeof value.runnerCommand !== 'object') {
    throw new GuardianFailure('configuration-invalid');
  }
  for (const name of ['closeBrowser', 'listBrowsers']) {
    if (typeof value.browserClient?.[name] !== 'function') throw new GuardianFailure('configuration-invalid');
  }
  for (const name of ['mkdtemp', 'chmod', 'stat', 'lstat', 'readFile', 'removeCredentialFile', 'rm']) {
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

function failureSummary({
  category,
  state,
  history,
  interrupted = false,
  browserClosureCertified = false,
  closureCertified = false,
  workspacePreservation = 'verified-absent',
  manifestPreservation = 'verified-absent',
}) {
  return Object.freeze({
    ok: false,
    category,
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
  const sessions = snapshotSessionIds(value, 'scenario-runner-invalid');
  if (sessions.length > RUNNER_SESSION_LIMIT) throw new GuardianFailure('scenario-runner-invalid');
  if (sessions.some((session, index) => index > 0 && sessions[index - 1].localeCompare(session) >= 0)) {
    throw new GuardianFailure('scenario-runner-invalid');
  }
  return sessions;
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

function auditMarkedProcesses(runMarker) {
  const category = 'scenario-closure-failed';
  if (typeof runMarker !== 'string' || !/^[0-9a-f]{64}$/.test(runMarker)) {
    return new INTRINSIC_PROMISE((_resolve, reject) => reject(new GuardianFailure(category)));
  }
  const token = `${RUN_MARKER_ENV}=${runMarker}`;
  const args = INTRINSIC_PROCESS_PLATFORM === 'linux'
    ? ['eww', '-eo', 'pid=,args=']
    : ['eww', '-axo', 'pid=,command='];
  return new INTRINSIC_PROMISE((resolveAudit, rejectAudit) => {
    INTRINSIC_CHILD_EXEC_FILE('/bin/ps', args, {
      encoding: 'utf8',
      env: { LC_ALL: 'C', PATH: '/usr/bin:/bin' },
      maxBuffer: PROCESS_AUDIT_OUTPUT_LIMIT,
      timeout: 5_000,
      windowsHide: true,
    }, (error, stdout) => {
      if (error || typeof stdout !== 'string') {
        rejectAudit(new GuardianFailure(category));
        return;
      }
      const pids = [];
      for (const line of stdout.split('\n')) {
        const words = line.split(/\s+/);
        if (!words.includes(token) && !words.includes(`--${token}`)) continue;
        const match = /^\s*([1-9][0-9]*)\s/.exec(line);
        const pid = Number(match?.[1]);
        if (!Number.isSafeInteger(pid) || pid <= 0 || pid === process.pid) {
          rejectAudit(new GuardianFailure(category));
          return;
        }
        pids.push(pid);
      }
      const unique = [...new Set(pids)].sort((left, right) => left - right);
      resolveAudit(Object.freeze(unique));
    });
  });
}

function signalMarkedProcesses(runMarker, signal) {
  return new INTRINSIC_PROMISE((resolveSignal, rejectSignal) => {
    consumeNativePromise(
      auditMarkedProcesses(runMarker),
      pids => {
        let ok = true;
        for (const pid of pids) {
          try {
            INTRINSIC_PROCESS_KILL(pid, signal);
          } catch (error) {
            if (error?.code !== 'ESRCH') ok = false;
          }
        }
        resolveSignal(Object.freeze({ ok, pids }));
      },
      () => rejectSignal(new GuardianFailure('scenario-closure-failed')),
      'scenario-closure-failed',
    );
  });
}

function waitForMarkedProcessesGone(runMarker, timeoutMs) {
  return new INTRINSIC_PROMISE(resolveWait => {
    const startedAt = Date.now();
    const inspect = () => {
      consumeNativePromise(
        auditMarkedProcesses(runMarker),
        pids => {
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
        () => resolveWait(false),
        'scenario-closure-failed',
      );
    };
    inspect();
  });
}

async function terminateMarkedProcesses(runMarker, timeoutMs) {
  let initial;
  try {
    initial = await auditMarkedProcesses(runMarker);
  } catch {
    return Object.freeze({ cleared: false, discovered: false });
  }
  if (initial.length === 0) return Object.freeze({ cleared: true, discovered: false });
  const soft = await signalMarkedProcesses(runMarker, 'SIGTERM');
  if (!soft.ok) return Object.freeze({ cleared: false, discovered: true });
  if (await waitForMarkedProcessesGone(runMarker, timeoutMs)) {
    return Object.freeze({ cleared: true, discovered: true });
  }
  const hard = await signalMarkedProcesses(runMarker, 'SIGKILL');
  if (!hard.ok) return Object.freeze({ cleared: false, discovered: true });
  return Object.freeze({
    cleared: await waitForMarkedProcessesGone(runMarker, timeoutMs),
    discovered: true,
  });
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

function spawnRunnerChild({ commandSnapshot, phase, privateContext, repositoryRoot, runMarker, onOwnership }) {
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
      env: { ...INTRINSIC_CHILD_ENV, [RUN_MARKER_ENV]: runMarker },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch {
    throw new GuardianFailure('scenario-runner-invalid');
  }
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0 || !child.stdout || !child.stderr) {
    try { child.kill('SIGKILL'); } catch {}
    throw new GuardianFailure('scenario-runner-invalid');
  }

  let stdoutBytes = 0;
  let stderrBytes = 0;
  let stdoutBuffer = '';
  let ownership = null;
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
    protocolFailure = error instanceof GuardianFailure
      ? error
      : new GuardianFailure('scenario-runner-invalid');
    rejectCompletion(protocolFailure);
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
    if (message?.type === 'ownership') {
      requireRunnerMessage(message, ['browserSessions', 'phase', 'type', 'version']);
      if (ownership || terminal || message.version !== 1 || message.phase !== phase) {
        throw new GuardianFailure('scenario-runner-invalid');
      }
      ownership = Object.freeze(requireRunnerSessions(message.browserSessions));
      onOwnership(ownership);
      return;
    }
    if (message?.type === 'row') {
      requireRunnerMessage(message, ['index', 'phase', 'row', 'type', 'version']);
      if (
        !ownership
        || terminal
        || message.version !== 1
        || message.phase !== phase
        || message.index !== phaseRows.length
      ) throw new GuardianFailure('scenario-runner-invalid');
      phaseRows.push(requirePhaseRow(message.row, phase, message.index));
      return;
    }
    if (message?.type === 'completion') {
      requireRunnerMessage(message, ['browserSessions', 'ok', 'phase', 'rowCount', 'type', 'version']);
      const expectedRows = CANONICAL_ROW_CONTRACTS[phase];
      if (
        !ownership
        || terminal
        || message.version !== 1
        || message.phase !== phase
        || typeof message.ok !== 'boolean'
        || !Number.isSafeInteger(message.rowCount)
        || message.rowCount !== expectedRows.length
        || phaseRows.length !== expectedRows.length
      ) throw new GuardianFailure('scenario-runner-invalid');
      const sessions = requireRunnerSessions(message.browserSessions);
      if (!isDeepStrictEqual(sessions, ownership)) throw new GuardianFailure('scenario-runner-invalid');
      terminal = Object.freeze({
        ok: message.ok,
        browserSessions: Object.freeze(sessions),
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
  return validateLifecycleResult('probe', {
    projectId: STAGING_PROJECT_ID,
    checkedAuth: manifest.authUids.length,
    checkedFirestore: manifest.firestorePaths.length,
    checkedExpectedAbsent: manifest.expectedAbsentFirestorePaths.length,
    authPresent,
    firestorePresent,
    expectedAbsentPresent,
  }, 'independently-absent');
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
  filesystem = defaultFilesystem,
  processHooks = defaultProcessHooks,
  repositoryRoot = process.cwd(),
} = {}) {
  if (scenarioRunner !== undefined || injectedSpawn !== undefined) {
    throw new GuardianFailure('configuration-invalid');
  }
  const dependencies = {
    fixtureCommand, browserClient, adapterFactory, preconditionVerifier, runnerCommand, filesystem, processHooks,
  };
  requireDependencies(dependencies);
  const ownedRunnerCommand = snapshotRunnerCommand(runnerCommand);
  if (!Number.isSafeInteger(scenarioJoinTimeoutMs) || scenarioJoinTimeoutMs < 1 || scenarioJoinTimeoutMs > 60_000) {
    throw new GuardianFailure('configuration-invalid');
  }
  if (typeof repositoryRoot !== 'string' || !isAbsolute(repositoryRoot) || resolve(repositoryRoot) !== repositoryRoot) {
    throw new GuardianFailure('configuration-invalid');
  }

  let state = 'uninitialized';
  const history = [state];
  let running = false;
  let interrupted = false;
  let emergencyPromise = null;
  let releaseAbortGate = null;
  const abortGate = new INTRINSIC_PROMISE(resolve => { releaseAbortGate = resolve; });
  let workspacePath = null;
  let manifestPath = null;
  let credentialPath = null;
  let manifest = null;
  let manifestPin = null;
  let lastManifestSnapshot = null;
  let pendingTransitionAuthorized = false;
  let browserClosureCertified = false;
  let closureCertified = false;
  const ownedBrowserSessions = new Set();
  let activeScenario = null;
  let startupGeneration = null;
  let nextStartupGeneration = 0;
  let verifiedRepositoryRoot = null;
  let verifiedRunnerSnapshot = null;
  const rowsByContext = new Map();
  let validatedRows = null;
  const handlers = new Map();
  let operationTail = new INTRINSIC_PROMISE(resolveOperation => resolveOperation());

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

  const closeOwnedBrowsers = async () => exclusive(async () => {
    let closeFailed = false;
    for (const session of [...ownedBrowserSessions].sort()) {
      try {
        await browserClient.closeBrowser(session);
      } catch {
        closeFailed = true;
      }
    }
    let names;
    try {
      names = browserSessionNames(await browserClient.listBrowsers());
    } catch {
      browserClosureCertified = false;
      throw new GuardianFailure('browser-closure-failed');
    }
    const ownedRemain = names.some(name => ownedBrowserSessions.has(name));
    if (closeFailed || ownedRemain || names.length !== 0) {
      browserClosureCertified = false;
      throw new GuardianFailure('browser-closure-failed');
    }
    ownedBrowserSessions.clear();
    validateLifecycleResult('browser-sessions', { sessions: [] }, 'browsers-closed');
    browserClosureCertified = true;
  });

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
      return false;
    }
    if (
      outcome.status !== 'fulfilled'
      || outcome.value.code !== 0
      || outcome.value.signal !== null
      || handle.protocolFailure
      || !handle.terminal
    ) return false;
    if (!(await waitForGroupGone(handle))) return false;
    const marked = await terminateMarkedProcesses(
      handle.runMarker, Math.max(scenarioJoinTimeoutMs, 500),
    );
    return marked.cleared && !marked.discovered;
  };

  const requestScenarioTermination = async (handle, force) => {
    if (!signalProcessGroup(handle, force ? 'SIGKILL' : 'SIGTERM')) return false;
    let outcome;
    try { outcome = await bounded(handle.closed); } catch { return false; }
    if (outcome.status !== 'fulfilled' || !(await waitForGroupGone(handle))) return false;
    const marked = await terminateMarkedProcesses(
      handle.runMarker, Math.max(scenarioJoinTimeoutMs, 500),
    );
    return marked.cleared;
  };

  const beginStartupGeneration = phase => {
    if (startupGeneration) throw new GuardianFailure('scenario-runner-invalid');
    let settle;
    const settled = new INTRINSIC_PROMISE(resolveSettled => { settle = resolveSettled; });
    const generation = {
      cancelled: false,
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
    emergencyPromise = (async () => {
      try {
        await stopActiveScenario();
      } catch {
        removeHandlers();
        return failureSummary({
          category: 'scenario-closure-failed', state, history, interrupted: isInterruption,
          browserClosureCertified: false, closureCertified: false,
          ...await currentPreservationStates(),
        });
      }
      try {
        await closeOwnedBrowsers();
      } catch {
        removeHandlers();
        return failureSummary({
          category: 'browser-closure-failed', state, history, interrupted: isInterruption,
          browserClosureCertified: false, closureCertified: false,
          ...await currentPreservationStates(),
        });
      }
      if (!workspacePath) {
        removeHandlers();
        return failureSummary({ category, state, history, interrupted: isInterruption, browserClosureCertified: true });
      }
      if (closureCertified && state === 'credential-removed') {
        try {
          await requirePrivateDirectory(filesystem, workspacePath, 'workspace-removal-failed');
          await filesystem.rm(workspacePath, { recursive: true, force: false });
          if (!(await proveAbsent(filesystem, workspacePath))) throw new GuardianFailure('workspace-removal-failed');
        } catch {
          removeHandlers();
          return failureSummary({
            category: 'workspace-removal-failed', state, history, interrupted: isInterruption,
            browserClosureCertified: true, closureCertified: true,
            ...await currentPreservationStates(),
          });
        }
        removeHandlers();
        return failureSummary({
          category, state, history, interrupted: isInterruption,
          browserClosureCertified: true, closureCertified: true,
        });
      }
      try {
        await loadExactManifest();
      } catch {
        removeHandlers();
        return failureSummary({
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
          const recoveryCleanup = await runFixtureRaw('cleanup', currentOptions, { recovery: true });
          validateRecoveryCleanup(recoveryCleanup, expectedDeleted);
        }
        await runFixture('inspect', currentOptions, 'cleaned-absent', { recovery: true });
        await loadExactManifest();
        if (manifest.state !== 'cleaned') throw new GuardianFailure('manifest-uncertain');
        await exactIndependentProbe(adapterFactory, manifest);
        closureCertified = true;
      } catch (error) {
        removeHandlers();
        return failureSummary({
          category: error instanceof GuardianFailure ? error.category : category,
          state, history, interrupted: isInterruption,
          browserClosureCertified: true, closureCertified: false,
          ...await currentPreservationStates(),
        });
      }
      try {
        await filesystem.removeCredentialFile(credentialPath, verifiedRepositoryRoot);
        if (!(await proveAbsent(filesystem, credentialPath))) throw new GuardianFailure('credential-removal-failed');
      } catch {
        removeHandlers();
        return failureSummary({
          category: 'credential-removal-failed', state, history, interrupted: isInterruption,
          browserClosureCertified: true, closureCertified: true,
          ...await currentPreservationStates(),
        });
      }
      try {
        await requirePrivateDirectory(filesystem, workspacePath, 'workspace-removal-failed');
        await filesystem.rm(workspacePath, { recursive: true, force: false });
        if (!(await proveAbsent(filesystem, workspacePath))) throw new GuardianFailure('workspace-removal-failed');
      } catch {
        removeHandlers();
        return failureSummary({
          category: 'workspace-removal-failed', state, history, interrupted: isInterruption,
          browserClosureCertified: true, closureCertified: true,
          ...await currentPreservationStates(),
        });
      }
      removeHandlers();
      return failureSummary({
        category, state, history, interrupted: isInterruption,
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
      const collisions = await auditMarkedProcesses(runMarker);
      if (collisions.length !== 0) throw new GuardianFailure('scenario-runner-invalid');
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
        onOwnership(sessions) {
          for (const session of sessions) {
            if (ownedBrowserSessions.has(session)) {
              throw new GuardianFailure('browser-ownership-invalid');
            }
          }
          for (const session of sessions) ownedBrowserSessions.add(session);
        },
      });
    } catch (error) {
      if (error instanceof GuardianFailure) throw error;
      throw new GuardianFailure('scenario-runner-invalid');
    } finally {
      finishStartupGeneration(generation);
    }
    activeScenario = handle;
    const completed = await new INTRINSIC_PROMISE((resolveCompletion, rejectCompletion) => {
      try {
        consumeNativePromise(
          handle.completion,
          resolveCompletion,
          rejectCompletion,
          'scenario-runner-invalid',
        );
        consumeNativePromise(
          abortGate,
          () => rejectCompletion(new GuardianFailure('interrupted')),
          rejectCompletion,
          'scenario-runner-invalid',
        );
      } catch (error) {
        rejectCompletion(error);
      }
    });
    if (!completed) throw new GuardianFailure('scenario-failed');
    if (!(await joinScenario(handle))) throw new GuardianFailure('scenario-closure-failed');
    activeScenario = null;
    if (completed.ok !== true) throw new GuardianFailure('scenario-failed');
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
        initialBrowserNames = browserSessionNames(await browserClient.listBrowsers());
      } catch {
        removeHandlers();
        return failureSummary({ category: 'browser-precondition-failed', state, history });
      }
      if (initialBrowserNames.length !== 0) {
        removeHandlers();
        return failureSummary({ category: 'browser-precondition-failed', state, history });
      }
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
        await exactIndependentProbe(adapterFactory, manifest);
      } catch {
        throw new GuardianFailure('independent-probe-failed');
      }
      checkInterrupted();
      transition('independently-absent');
      closureCertified = true;

      try {
        const removed = await filesystem.removeCredentialFile(credentialPath, verifiedRepositoryRoot);
        if (removed !== true || !(await proveAbsent(filesystem, credentialPath))) throw new GuardianFailure('credential-removal-failed');
      } catch {
        throw new GuardianFailure('credential-removal-failed');
      }
      checkInterrupted();
      transition('credential-removed');
      try {
        await requirePrivateDirectory(filesystem, workspacePath, 'workspace-removal-failed');
        await filesystem.rm(workspacePath, { recursive: true, force: false });
        if (!(await proveAbsent(filesystem, workspacePath))) throw new GuardianFailure('workspace-removal-failed');
      } catch {
        throw new GuardianFailure('workspace-removal-failed');
      }
      transition('workspace-removed');
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
