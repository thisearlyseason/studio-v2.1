import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildFixtureDefinition } from '../../qa-fixtures/definition.mjs';
import { assertExactFixtureJournal } from '../../qa-fixtures/manifest.mjs';
import { createPhase9TerminalCertificateWriter } from './terminal-certificate-writer.mjs';

const MAX_MANIFEST_BYTES = 32_768;
const DEFAULT_FILESYSTEM = Object.freeze({ lstat, open, readFile, readdir, realpath, rm });
const RECOVERY_HELPER_PATH = fileURLToPath(new URL('./terminal-recovery-dirfd-helper.py', import.meta.url));
const RECOVERY_HELPER_SHA256 = 'b9e09fa61d3b874202e9cde3bd23047d103f160c97487e41face121aeb38c917';
const PYTHON_RUNTIME = '/usr/bin/python3';
const PYTHON_SHA256 = 'b8763cf250e607a778bb4603cecb5b90338814d0a3dfcba0d57b1de242f610e9';
const MAX_HELPER_OUTPUT = 1_024;

export const PHASE9_TERMINAL_RECOVERY_COMMAND = Object.freeze({
  name: 'recover-terminal',
  providerOperations: 0,
  browserRows: 0,
});

export async function executePhase9TerminalRecoveryRemoval({
  operation, directoryHandle, directoryIdentity, workspaceHandle, workspaceIdentity,
  name, expectedIdentity, manifestIdentity, helperEnvironment = {}, helperTimeoutMs = 10_000,
} = {}) {
  if (process.platform !== 'darwin'
    || !new Set(['remove-credential', 'remove-workspace']).has(operation)
    || !directoryHandle || !directoryIdentity || typeof name !== 'string'
    || typeof helperEnvironment !== 'object' || helperEnvironment === null || Array.isArray(helperEnvironment)
    || Object.keys(helperEnvironment).some(key => !new Set([
      'PHASE9_RECOVERY_TEST_BEFORE_CREDENTIAL_UNLINK_MS',
      'PHASE9_RECOVERY_TEST_BEFORE_WORKSPACE_RMDIR_MS',
    ]).has(key))
    || !Number.isSafeInteger(helperTimeoutMs) || helperTimeoutMs < 100 || helperTimeoutMs > 30_000) {
    throw new Error('Terminal recovery removal helper configuration is invalid.');
  }
  const [helperMetadata, helperCanonical, helperSource, pythonMetadata, pythonCanonical, pythonBytes] = await Promise.all([
    lstat(RECOVERY_HELPER_PATH), realpath(RECOVERY_HELPER_PATH), readFile(RECOVERY_HELPER_PATH, 'utf8'),
    lstat(PYTHON_RUNTIME), realpath(PYTHON_RUNTIME), readFile(PYTHON_RUNTIME),
  ]);
  if (!helperMetadata.isFile() || helperMetadata.isSymbolicLink() || helperCanonical !== RECOVERY_HELPER_PATH
    || (helperMetadata.mode & 0o022) !== 0
    || createHash('sha256').update(helperSource).digest('hex') !== RECOVERY_HELPER_SHA256
    || !pythonMetadata.isFile() || pythonMetadata.isSymbolicLink() || pythonCanonical !== PYTHON_RUNTIME
    || (pythonMetadata.mode & 0o022) !== 0
    || createHash('sha256').update(pythonBytes).digest('hex') !== PYTHON_SHA256) {
    throw new Error('Terminal recovery removal helper runtime is invalid.');
  }
  const request = operation === 'remove-credential' ? {
    version: 1, operation, directory: directoryIdentity, name, expected: expectedIdentity,
  } : {
    version: 1, operation, directory: directoryIdentity, name,
    workspace: workspaceIdentity, manifestName: 'manifest.json', manifest: manifestIdentity,
  };
  return new Promise((resolvePromise, rejectPromise) => {
    const stdio = operation === 'remove-workspace'
      ? ['pipe', 'pipe', 'pipe', directoryHandle.fd, workspaceHandle.fd]
      : ['pipe', 'pipe', 'pipe', directoryHandle.fd];
    const child = spawn(PYTHON_RUNTIME, ['-I', '-c', helperSource], {
      env: { LANG: 'C', LC_ALL: 'C', PYTHONHASHSEED: '0', PYTHONNOUSERSITE: '1', ...helperEnvironment },
      detached: true, stdio,
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
    child.once('error', () => finish(new Error('Terminal recovery removal helper failed.')));
    child.once('close', code => {
      if (timedOut) return finish(new Error('Terminal recovery removal helper timed out.'));
      let result;
      try { result = JSON.parse(stdout); } catch { result = null; }
      if (code !== 0 || !result || Object.keys(result).sort().join(',') !== 'ok,status'
        || result.ok !== true || result.status !== 'removed') {
        finish(new Error('Terminal recovery removal helper failed.'));
      } else finish(null, true);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(request));
  });
}

function exactAbsolutePath(value, name) {
  if (typeof value !== 'string' || !isAbsolute(value) || resolve(value) !== value) {
    throw new Error(`Terminal recovery ${name} path is invalid.`);
  }
  return value;
}

function identity(metadata) {
  return Object.freeze({
    dev: metadata.dev,
    ino: metadata.ino,
    uid: metadata.uid,
    mode: metadata.mode & 0o777,
    nlink: metadata.nlink,
    size: metadata.size,
  });
}

function matches(metadata, expected, type) {
  return Boolean(metadata)
    && (type === 'directory' ? metadata.isDirectory?.() : metadata.isFile?.())
    && !metadata.isSymbolicLink?.()
    && metadata.dev === expected.dev
    && metadata.ino === expected.ino
    && metadata.uid === expected.uid
    && (metadata.mode & 0o777) === expected.mode
    && (type === 'directory' || (metadata.nlink === expected.nlink && metadata.size === expected.size));
}

async function absent(filesystem, path) {
  try {
    await filesystem.lstat(path);
    return false;
  } catch (error) {
    if (error?.code === 'ENOENT') return true;
    throw new Error('Terminal recovery absence proof failed.');
  }
}

function migratedCheckpoint(document) {
  const legacy = document.version === 1;
  return Object.freeze({
    version: 2,
    command: 'hosted',
    status: 'closure-pending',
    exitCode: 1,
    category: 'pending',
    primaryCategory: legacy ? 'legacy-primary-unavailable' : document.primaryCategory,
    primaryStage: legacy ? document.lifecycle.state : document.primaryStage,
    deployment: document.deployment,
    lifecycle: { ...document.lifecycle },
    evidence: { rows: 0, written: false },
  });
}

function terminalFailure(checkpoint) {
  return Object.freeze({
    ...checkpoint,
    status: 'failed',
    category: 'terminal-certificate-failed',
    lifecycle: {
      ...checkpoint.lifecycle,
      credentialRemoved: true,
      workspaceRemoved: true,
    },
  });
}

function summary(document) {
  return Object.freeze({
    ok: false,
    command: 'recover-terminal',
    status: 'failed',
    category: document.category,
    primaryCategory: document.primaryCategory,
    primaryStage: document.primaryStage,
    rows: 0,
    providerOperations: 0,
  });
}

async function readManifestThroughHandle(handle, expected) {
  const before = await handle.stat();
  if (!matches(before, expected, 'file') || before.size < 1 || before.size > MAX_MANIFEST_BYTES) {
    throw new Error('Terminal recovery manifest identity is invalid.');
  }
  const text = await handle.readFile('utf8');
  const after = await handle.stat();
  if (!matches(after, expected, 'file') || text.length < 1) {
    throw new Error('Terminal recovery manifest identity changed.');
  }
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('Terminal recovery manifest is invalid.'); }
  const definition = buildFixtureDefinition({
    runId: parsed.runId,
    expiresAt: parsed.expiresAt,
    manifestVersion: parsed.version,
  });
  const manifest = assertExactFixtureJournal(parsed, definition);
  if (manifest.version !== 3 || manifest.state !== 'cleaned'
    || manifest.authUids.length !== 20 || manifest.firestorePaths.length !== 82
    || manifest.expectedAbsentFirestorePaths.length !== 1) {
    throw new Error('Terminal recovery manifest is not the exact cleaned Phase 9 journal.');
  }
  return manifest;
}

function assertCertificateManifestConsistency(document, manifest) {
  const lifecycle = document.lifecycle;
  if (document.command !== 'hosted' || document.evidence.rows !== 0 || document.evidence.written !== false
    || lifecycle.preflight?.plannedAliases !== manifest.authUids.length
    || lifecycle.seed?.auth !== manifest.authUids.length
    || lifecycle.seed?.firestore !== manifest.firestorePaths.length
    || lifecycle.independentProbe?.checkedAuth !== manifest.authUids.length
    || lifecycle.independentProbe?.checkedFirestore !== manifest.firestorePaths.length
    || lifecycle.independentProbe?.checkedExpectedAbsent !== manifest.expectedAbsentFirestorePaths.length
    || lifecycle.independentProbe?.authPresent !== 0
    || lifecycle.independentProbe?.firestorePresent !== 0
    || lifecycle.independentProbe?.expectedAbsentPresent !== 0
    || lifecycle.fixtureClosureCertified !== true
    || lifecycle.browserClosureCertified !== true
    || lifecycle.processClosureCertified !== true
    || lifecycle.profileClosureCertified !== true) {
    throw new Error('Terminal recovery checkpoint and manifest are inconsistent.');
  }
}

async function finalizePhase9TerminalRecoveryUnsafe({
  resultPath,
  workspacePath,
  manifestPath,
  credentialPath,
  repositoryRoot,
  evidenceDirectory,
  filesystem = DEFAULT_FILESYSTEM,
  writerFactory = createPhase9TerminalCertificateWriter,
  removalExecutor,
  removeCredentialFile,
  removalHelperEnvironment = {},
  platform = process.platform,
} = {}) {
  for (const [value, name] of [
    [resultPath, 'result'], [workspacePath, 'workspace'], [manifestPath, 'manifest'],
    [credentialPath, 'credential'], [repositoryRoot, 'repository'], [evidenceDirectory, 'evidence'],
  ]) exactAbsolutePath(value, name);
  if (!/^\/private\/tmp\/phase9-core-identities\.[A-Za-z0-9_-]+$/.test(workspacePath)
    || manifestPath !== join(workspacePath, 'manifest.json')
    || credentialPath !== join(workspacePath, 'credentials.json')) {
    throw new Error('Terminal recovery workspace children are invalid.');
  }

  const workspaceMissing = await absent(filesystem, workspacePath);
  const writer = await writerFactory({
    resultPath,
    repositoryRoot,
    workspacePath,
    evidenceDirectory,
    platform,
    allowLegacyFailedRecovery: true,
    allowTerminalReplay: true,
    allowAbsentWorkspaceRecovery: workspaceMissing,
  });
  try {
    const admitted = writer.result;
    if (!admitted) throw new Error('Terminal recovery requires an exact retained checkpoint.');
    if (admitted.version === 2 && admitted.status === 'failed'
      && admitted.lifecycle.credentialRemoved === true && admitted.lifecycle.workspaceRemoved === true) {
      if (!workspaceMissing || !(await absent(filesystem, credentialPath))) {
        throw new Error('Terminal recovery terminal replay conflicts with retained resources.');
      }
      return summary(admitted);
    }

    let checkpoint = migratedCheckpoint(admitted);
    if (workspaceMissing) {
      if (checkpoint.lifecycle.workspaceRemoved !== false || checkpoint.lifecycle.credentialRemoved !== true
        || !(await absent(filesystem, credentialPath))) {
        throw new Error('Terminal recovery workspace is absent without a resumable removal checkpoint.');
      }
      const terminal = terminalFailure(checkpoint);
      try { await writer.write(terminal); } catch { throw new Error('Terminal recovery final promotion failed.'); }
      return summary(terminal);
    }

    const canonicalWorkspace = await filesystem.realpath(workspacePath);
    if (canonicalWorkspace !== workspacePath) throw new Error('Terminal recovery workspace must be canonical.');
    const workspaceMetadata = await filesystem.lstat(workspacePath);
    if (!workspaceMetadata.isDirectory?.() || workspaceMetadata.isSymbolicLink?.()
      || workspaceMetadata.uid !== process.getuid() || (workspaceMetadata.mode & 0o777) !== 0o700) {
      throw new Error('Terminal recovery workspace identity is invalid.');
    }
    const workspaceIdentity = identity(workspaceMetadata);
    const entries = (await filesystem.readdir(workspacePath)).sort();
    if (entries.join(',') !== 'credentials.json,manifest.json'
      && entries.join(',') !== 'manifest.json') {
      throw new Error('Terminal recovery workspace entries are invalid.');
    }
    const [manifestMetadata, credentialMetadata] = await Promise.all([
      filesystem.lstat(manifestPath), filesystem.lstat(credentialPath).catch(error => {
        if (error?.code === 'ENOENT') return null;
        throw error;
      }),
    ]);
    const manifestIdentity = identity(manifestMetadata);
    if (!matches(manifestMetadata, manifestIdentity, 'file') || manifestIdentity.uid !== process.getuid()
      || manifestIdentity.mode !== 0o600 || manifestIdentity.nlink !== 1) {
      throw new Error('Terminal recovery manifest metadata is invalid.');
    }
    let credentialIdentity = null;
    if (credentialMetadata) {
      credentialIdentity = identity(credentialMetadata);
      if (!matches(credentialMetadata, credentialIdentity, 'file') || credentialIdentity.uid !== process.getuid()
        || credentialIdentity.mode !== 0o600 || credentialIdentity.nlink !== 1) {
        throw new Error('Terminal recovery credential metadata is invalid.');
      }
    }
    if (admitted.lifecycle.credentialRemoved === true && credentialMetadata) {
      throw new Error('Terminal recovery credential checkpoint conflicts with retained resources.');
    }
    const manifestHandle = await filesystem.open(manifestPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const workspaceHandle = await filesystem.open(workspacePath, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
    const parentPath = dirname(workspacePath);
    const parentMetadata = await filesystem.lstat(parentPath);
    const parentIdentity = identity(parentMetadata);
    if (!matches(parentMetadata, parentIdentity, 'directory') || parentIdentity.uid !== 0
      || parentIdentity.mode !== 0o777) throw new Error('Terminal recovery parent identity is invalid.');
    const parentHandle = await filesystem.open(parentPath, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
    const executeRemoval = removalExecutor ?? (removeCredentialFile ? async request => {
      if (request.operation === 'remove-credential') {
        return removeCredentialFile(credentialPath, repositoryRoot, credentialIdentity);
      }
      await filesystem.rm(workspacePath, { recursive: true, force: false });
      return true;
    } : executePhase9TerminalRecoveryRemoval);
    let credentialHandle = null;
    try {
      if (credentialIdentity) credentialHandle = await filesystem.open(credentialPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
      const manifest = await readManifestThroughHandle(manifestHandle, manifestIdentity);
      assertCertificateManifestConsistency(checkpoint, manifest);
      const heldWorkspace = await workspaceHandle.stat();
      if (!matches(heldWorkspace, workspaceIdentity, 'directory')) throw new Error('Terminal recovery workspace identity changed.');
      if (credentialHandle && !matches(await credentialHandle.stat(), credentialIdentity, 'file')) {
        throw new Error('Terminal recovery credential identity changed.');
      }

      if (admitted.version === 1) {
        try { await writer.write(checkpoint); } catch { throw new Error('Terminal recovery checkpoint publication failed.'); }
      }
      if (credentialIdentity) {
        await credentialHandle.close();
        credentialHandle = null;
        if (!matches(await filesystem.lstat(credentialPath), credentialIdentity, 'file')) {
          throw new Error('Terminal recovery credential pathname changed.');
        }
        let removed;
        try { removed = await executeRemoval({
          operation: 'remove-credential', directoryHandle: workspaceHandle,
          directoryIdentity: workspaceIdentity, name: basename(credentialPath),
          expectedIdentity: credentialIdentity, helperEnvironment: removalHelperEnvironment,
        }); } catch { throw new Error('Terminal recovery credential removal failed.'); }
        if (removed !== true || !(await absent(filesystem, credentialPath))) {
          throw new Error('Terminal recovery credential removal failed.');
        }
      } else if (!(await absent(filesystem, credentialPath))) {
        throw new Error('Terminal recovery credential absence is uncertain.');
      }

      checkpoint = Object.freeze({
        ...checkpoint,
        lifecycle: { ...checkpoint.lifecycle, credentialRemoved: true, workspaceRemoved: false },
      });
      try { await writer.write(checkpoint); } catch { throw new Error('Terminal recovery removal checkpoint failed.'); }
      await manifestHandle.close();
      const namedWorkspace = await filesystem.lstat(workspacePath);
      if (!matches(namedWorkspace, workspaceIdentity, 'directory')) {
        throw new Error('Terminal recovery workspace pathname changed.');
      }
      const remaining = await filesystem.readdir(workspacePath);
      if (remaining.length !== 1 || remaining[0] !== basename(manifestPath)) {
        throw new Error('Terminal recovery workspace retained unexpected entries.');
      }
      try { await executeRemoval({
        operation: 'remove-workspace', directoryHandle: parentHandle, directoryIdentity: parentIdentity,
        workspaceHandle, workspaceIdentity, name: basename(workspacePath), manifestIdentity,
        helperEnvironment: removalHelperEnvironment,
      }); } catch { throw new Error('Terminal recovery workspace removal failed.'); }
      if (!(await absent(filesystem, workspacePath))) throw new Error('Terminal recovery workspace removal failed.');
      const terminal = terminalFailure(checkpoint);
      try { await writer.write(terminal); } catch { throw new Error('Terminal recovery final promotion failed.'); }
      return summary(terminal);
    } finally {
      await credentialHandle?.close().catch(() => {});
      await manifestHandle.close().catch(() => {});
      await workspaceHandle.close().catch(() => {});
      await parentHandle.close().catch(() => {});
    }
  } finally {
    await writer.close();
  }
}

export async function finalizePhase9TerminalRecovery(options = {}) {
  try {
    return await finalizePhase9TerminalRecoveryUnsafe(options);
  } catch {
    throw new Error('Terminal recovery failed.');
  }
}
