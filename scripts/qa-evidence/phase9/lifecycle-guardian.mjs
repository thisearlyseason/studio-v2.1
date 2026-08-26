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
import { closeAndVerifyBrowsers } from './playwright-cli-client.mjs';

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
  for (const name of ['fixtureCommand', 'adapterFactory']) {
    if (typeof value[name] !== 'function') throw new GuardianFailure('configuration-invalid');
  }
  for (const name of ['closeAllBrowsers', 'listBrowsers']) {
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
    || (value.beforeTransition !== undefined && typeof value.beforeTransition !== 'function')
    || (value.afterTransition !== undefined && typeof value.afterTransition !== 'function')
  ) throw new GuardianFailure('configuration-invalid');
  return Object.freeze({
    projectId: value.projectId,
    origin: value.origin,
    expiresAt: value.expiresAt,
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

async function pathExists(filesystem, path) {
  if (!path) return false;
  try {
    await filesystem.lstat(path);
    return true;
  } catch (error) {
    return !isMissing(error);
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

function failureSummary({ category, state, history, interrupted = false, browserClosureCertified = false, closureCertified = false, workspacePreserved = false, manifestPreserved = false }) {
  return Object.freeze({
    ok: false,
    category,
    state,
    history: [...history],
    interrupted,
    browserClosureCertified,
    closureCertified,
    workspacePreserved,
    manifestPreserved,
    recovery: workspacePreserved ? 'recovery-required' : 'no-recovery-artifact',
  });
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
  filesystem = defaultFilesystem,
  processHooks = defaultProcessHooks,
  repositoryRoot = process.cwd(),
} = {}) {
  const dependencies = { fixtureCommand, browserClient, adapterFactory, filesystem, processHooks };
  requireDependencies(dependencies);

  let state = 'uninitialized';
  const history = [state];
  let running = false;
  let interrupted = false;
  let emergencyPromise = null;
  let interruptWaitPromise = null;
  let resolveInterruptWait = null;
  let workspacePath = null;
  let manifestPath = null;
  let credentialPath = null;
  let manifest = null;
  let browserClosureCertified = false;
  let closureCertified = false;
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

  const closeBrowsers = async () => exclusive(async () => {
    try {
      const closed = await closeAndVerifyBrowsers(browserClient);
      validateLifecycleResult('browser-sessions', { sessions: closed.browsers }, 'browsers-closed');
      browserClosureCertified = true;
    } catch {
      browserClosureCertified = false;
      throw new GuardianFailure('browser-closure-failed');
    }
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

  const recover = async (category, isInterruption = false) => {
    if (emergencyPromise) return emergencyPromise;
    interrupted ||= isInterruption;
    emergencyPromise = (async () => {
      try {
        await closeBrowsers();
      } catch {
        removeHandlers();
        return failureSummary({
          category: 'browser-closure-failed', state, history, interrupted: isInterruption,
          browserClosureCertified: false, closureCertified: false,
          workspacePreserved: Boolean(workspacePath), manifestPreserved: await pathExists(filesystem, manifestPath),
        });
      }
      if (!workspacePath) {
        removeHandlers();
        return failureSummary({ category, state, history, interrupted: isInterruption, browserClosureCertified: true });
      }
      try {
        await loadExactManifest();
      } catch {
        removeHandlers();
        return failureSummary({
          category: 'manifest-uncertain', state, history, interrupted: isInterruption,
          browserClosureCertified: true, workspacePreserved: true,
          manifestPreserved: await pathExists(filesystem, manifestPath),
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
          workspacePreserved: true, manifestPreserved: true,
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
          workspacePreserved: true, manifestPreserved: true,
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
          workspacePreserved: true, manifestPreserved: true,
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
        if (!interruptWaitPromise) {
          interruptWaitPromise = new Promise(resolve => { resolveInterruptWait = resolve; });
        }
        return interruptWaitPromise;
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

  let currentOptions = null;
  const run = async rawOptions => {
    if (running || state !== 'uninitialized') {
      return failureSummary({ category: 'reentry', state, history, browserClosureCertified, closureCertified });
    }
    running = true;
    try {
      currentOptions = exactOptions(rawOptions);
      registerHandlers();
      transition('guarded');

      let initialBrowsers;
      try {
        initialBrowsers = await browserClient.listBrowsers();
        validateLifecycleResult('browser-sessions', { sessions: initialBrowsers?.browsers }, 'browsers-closed');
      } catch {
        throw new GuardianFailure('browser-closure-failed');
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
      const privateContext = Object.freeze({ workspacePath, manifestPath, credentialPath, runId: manifest.runId });
      await currentOptions.beforeTransition?.(privateContext);
      checkInterrupted();
      await runFixture('transition', currentOptions, 'pending-deletion');
      checkInterrupted();
      await currentOptions.afterTransition?.(privateContext);
      checkInterrupted();

      await closeBrowsers();
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
      resolveInterruptWait?.(result);
      return result;
    } catch (error) {
      const category = error instanceof GuardianFailure ? error.category : 'operation-failed';
      const result = await recover(category, interrupted);
      resolveInterruptWait?.(result);
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
