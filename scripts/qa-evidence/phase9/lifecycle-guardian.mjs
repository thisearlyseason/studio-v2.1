import { chmod, lstat, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { removeCredentialFile } from '../../qa-fixtures/lifecycle.mjs';
import { buildFixtureDefinition } from '../../qa-fixtures/definition.mjs';
import { assertExactFixtureJournal, validateManifest } from '../../qa-fixtures/manifest.mjs';
import {
  FIXTURE_MANIFEST_VERSION,
  FIXTURE_RESOURCE_COUNTS,
  STAGING_ORIGIN,
  STAGING_PROJECT_ID,
  validateLifecycleResult,
} from './scenario-contracts.mjs';

const WORKSPACE_PREFIX = '/tmp/phase9-core-identities.';
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
    || (value.beforeTransition !== undefined && typeof value.beforeTransition !== 'function')
    || (value.afterTransition !== undefined && typeof value.afterTransition !== 'function')
  ) throw new GuardianFailure('configuration-invalid');
  return Object.freeze({
    projectId: value.projectId,
    origin: value.origin,
    expiresAt: value.expiresAt,
    deployedSha: value.deployedSha,
    stagingRunId: value.stagingRunId,
    pullRequestNumber: value.pullRequestNumber,
    beforeTransition: value.beforeTransition,
    afterTransition: value.afterTransition,
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

async function preservationState(filesystem, path) {
  if (!path) return 'verified-absent';
  try {
    await filesystem.lstat(path);
    return 'verified-present';
  } catch (error) {
    return isMissing(error) ? 'verified-absent' : 'uncertain';
  }
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
  filesystem = defaultFilesystem,
  processHooks = defaultProcessHooks,
  repositoryRoot = process.cwd(),
} = {}) {
  const dependencies = { fixtureCommand, browserClient, adapterFactory, preconditionVerifier, filesystem, processHooks };
  requireDependencies(dependencies);

  let state = 'uninitialized';
  const history = [state];
  let running = false;
  let interrupted = false;
  let emergencyPromise = null;
  let releaseAbortGate = null;
  const abortGate = new Promise(resolve => { releaseAbortGate = resolve; });
  let workspacePath = null;
  let manifestPath = null;
  let credentialPath = null;
  let manifest = null;
  let browserClosureCertified = false;
  let closureCertified = false;
  let acceptingBrowserOwnership = false;
  const ownedBrowserSessions = new Set();
  const handlers = new Map();
  let operationTail = Promise.resolve();

  const transition = next => {
    const expected = ORDERED_STATES[ORDERED_STATES.indexOf(state) + 1];
    if (next !== expected) throw new GuardianFailure('state-order-invalid');
    state = next;
    history.push(next);
  };

  const exclusive = operation => {
    const pending = operationTail.then(operation, operation);
    operationTail = pending.catch(() => {});
    return pending;
  };

  const checkInterrupted = () => {
    if (interrupted) throw new GuardianFailure('interrupted');
  };

  const runFixture = async (command, options, stage, { recovery = false } = {}) => exclusive(async () => {
    if (!recovery) checkInterrupted();
    let result;
    try {
      result = await fixtureCommand(commandArguments(command, options, { manifestPath, credentialPath }));
    } catch {
      throw new GuardianFailure('command-failed');
    }
    const parsed = parseCommandOutput(result);
    let validated;
    try {
      validated = validateLifecycleResult(command, parsed, stage);
    } catch {
      throw new GuardianFailure('invalid-result');
    }
    if (!recovery) checkInterrupted();
    return validated;
  });

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
      manifest = ensureManifestShape(validateManifest(JSON.parse(text)));
      if (
        expectedPendingState
        && manifest.transitions?.['qa-pending-delete']?.state !== expectedPendingState
      ) throw new GuardianFailure('manifest-uncertain');
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
        await closeOwnedBrowsers();
      } catch {
        removeHandlers();
        return failureSummary({
          category: 'browser-closure-failed', state, history, interrupted: isInterruption,
          browserClosureCertified: false, closureCertified: false,
          workspacePreservation: await preservationState(filesystem, workspacePath),
          manifestPreservation: await preservationState(filesystem, manifestPath),
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
            workspacePreservation: await preservationState(filesystem, workspacePath),
            manifestPreservation: await preservationState(filesystem, manifestPath),
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
          workspacePreservation: await preservationState(filesystem, workspacePath),
          manifestPreservation: await preservationState(filesystem, manifestPath),
        });
      }
      try {
        await runFixture('inspect', currentOptions, manifest.state === 'cleaned' ? 'cleaned-absent' : 'seeded-present', { recovery: true });
        if (manifest.state !== 'cleaned') await runFixture('cleanup', currentOptions, 'cleaned', { recovery: true });
        await runFixture('inspect', currentOptions, 'cleaned-absent', { recovery: true });
        await loadExactManifest();
        if (manifest.state !== 'cleaned') throw new GuardianFailure('manifest-uncertain');
        await exactIndependentProbe(adapterFactory, manifest);
        closureCertified = true;
      } catch {
        removeHandlers();
        return failureSummary({
          category, state, history, interrupted: isInterruption,
          browserClosureCertified: true, closureCertified: false,
          workspacePreservation: await preservationState(filesystem, workspacePath),
          manifestPreservation: await preservationState(filesystem, manifestPath),
        });
      }
      try {
        await filesystem.removeCredentialFile(credentialPath, repositoryRoot);
        if (!(await proveAbsent(filesystem, credentialPath))) throw new GuardianFailure('credential-removal-failed');
      } catch {
        removeHandlers();
        return failureSummary({
          category: 'credential-removal-failed', state, history, interrupted: isInterruption,
          browserClosureCertified: true, closureCertified: true,
          workspacePreservation: await preservationState(filesystem, workspacePath),
          manifestPreservation: await preservationState(filesystem, manifestPath),
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
          workspacePreservation: await preservationState(filesystem, workspacePath),
          manifestPreservation: await preservationState(filesystem, manifestPath),
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

  const ownBrowserSession = session => {
    if (
      !acceptingBrowserOwnership
      || typeof session !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(session)
      || ownedBrowserSessions.has(session)
    ) throw new GuardianFailure('browser-ownership-invalid');
    ownedBrowserSessions.add(session);
    return session;
  };

  const runScenarioPhase = async (callback, privateContext) => {
    if (typeof callback !== 'function') return;
    acceptingBrowserOwnership = true;
    const callbackPromise = Promise.resolve().then(() => callback(privateContext));
    void callbackPromise.catch(() => {});
    try {
      await Promise.race([
        callbackPromise,
        abortGate.then(() => { throw new GuardianFailure('interrupted'); }),
      ]);
    } finally {
      acceptingBrowserOwnership = false;
    }
  };

  let currentOptions = null;
  const run = async rawOptions => {
    if (running || state !== 'uninitialized') {
      return failureSummary({
        category: 'reentry', state, history, browserClosureCertified, closureCertified,
        workspacePreservation: await preservationState(filesystem, workspacePath),
        manifestPreservation: await preservationState(filesystem, manifestPath),
      });
    }
    running = true;
    try {
      currentOptions = exactOptions(rawOptions);
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
        runId: manifest.runId,
        ownBrowserSession,
      });
      await runScenarioPhase(currentOptions.beforeTransition, privateContext);
      checkInterrupted();
      await runFixture('transition', currentOptions, 'pending-deletion');
      checkInterrupted();
      await loadExactManifest('pending_deletion');
      checkInterrupted();
      await runScenarioPhase(currentOptions.afterTransition, privateContext);
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
        const removed = await filesystem.removeCredentialFile(credentialPath, repositoryRoot);
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
