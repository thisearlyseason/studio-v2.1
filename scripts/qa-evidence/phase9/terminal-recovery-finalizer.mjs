import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, readFile, readdir, realpath } from 'node:fs/promises';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildFixtureDefinition } from '../../qa-fixtures/definition.mjs';
import { assertExactFixtureJournal } from '../../qa-fixtures/manifest.mjs';
import { createPhase9TerminalCertificateWriter } from './terminal-certificate-writer.mjs';

const MAX_MANIFEST_BYTES = 32_768;
const DEFAULT_FILESYSTEM = Object.freeze({ lstat, open, readFile, readdir, realpath });
const RECOVERY_HELPER_PATH = fileURLToPath(new URL('./terminal-recovery-dirfd-helper.py', import.meta.url));
const RECOVERY_HELPER_SHA256 = 'ba47ea4c3ec1c3642134bc6a0647ead7ed44f4a0a2ef2452717f392911ebdb3a';
const PYTHON_RUNTIME = '/usr/bin/python3';
const PYTHON_SHA256 = 'b8763cf250e607a778bb4603cecb5b90338814d0a3dfcba0d57b1de242f610e9';
const MAX_HELPER_OUTPUT = 1_024;

export const PHASE9_TERMINAL_RECOVERY_COMMAND = Object.freeze({
  name: 'recover-terminal',
  providerOperations: 0,
  browserRows: 0,
});

export async function executePhase9TerminalRecoveryDisposition({
  operation, directoryHandle, directoryIdentity, credentialHandle, credentialIdentity, name,
  helperEnvironment = {}, helperTimeoutMs = 10_000,
} = {}) {
  if (process.platform !== 'darwin'
    || operation !== 'zeroize-credential'
    || !directoryHandle || !directoryIdentity || typeof name !== 'string'
    || (operation === 'zeroize-credential' && (!credentialHandle || !credentialIdentity || name !== 'credentials.json'))
    || typeof helperEnvironment !== 'object' || helperEnvironment === null || Array.isArray(helperEnvironment)
    || Object.keys(helperEnvironment).some(key => !new Set([
      'PHASE9_RECOVERY_TEST_BEFORE_CREDENTIAL_ZEROIZE_MS',
    ]).has(key))
    || !Number.isSafeInteger(helperTimeoutMs) || helperTimeoutMs < 100 || helperTimeoutMs > 30_000) {
    throw new Error('Terminal recovery disposition helper configuration is invalid.');
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
    throw new Error('Terminal recovery disposition helper runtime is invalid.');
  }
  const request = {
    version: 3, operation, workspace: directoryIdentity, name, credential: credentialIdentity,
  };
  return new Promise((resolvePromise, rejectPromise) => {
    const stdio = ['pipe', 'pipe', 'pipe', directoryHandle.fd, 'ignore', credentialHandle.fd];
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
    child.once('error', () => finish(new Error('Terminal recovery disposition helper failed.')));
    child.once('close', code => {
      if (timedOut) return finish(new Error('Terminal recovery disposition helper timed out.'));
      let result;
      try { result = JSON.parse(stdout); } catch { result = null; }
      if (code !== 0 || !result || Object.keys(result).sort().join(',') !== 'ok,status'
        || result.ok !== true || result.status !== 'committed') {
        finish(new Error('Terminal recovery disposition helper failed.'));
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

function identityCommitment(value) {
  return createHash('sha256').update(JSON.stringify({
    dev: value.dev, ino: value.ino, uid: value.uid, mode: value.mode, nlink: value.nlink,
  })).digest('hex');
}

function disposition(phase, credentialIdentity, workspaceIdentity, manifestSha256) {
  return Object.freeze({
    phase,
    credentialIdentity: identityCommitment(credentialIdentity),
    workspaceIdentity: identityCommitment(workspaceIdentity),
    manifestSha256,
    originalPathsAbsent: false,
    credentialZeroized: phase !== 'validated',
    workspaceQuarantinedInPlace: phase === 'zeroized',
    workspaceRetained: true,
  });
}

function migratedCheckpoint(document, recoveryDisposition) {
  const legacy = document.version === 1;
  return Object.freeze({
    version: 3,
    command: 'hosted',
    status: 'closure-pending',
    exitCode: 1,
    category: 'pending',
    primaryCategory: legacy ? 'legacy-primary-unavailable' : document.primaryCategory,
    primaryStage: legacy ? document.lifecycle.state : document.primaryStage,
    recoveryDisposition,
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
    lifecycle: { ...checkpoint.lifecycle, credentialRemoved: false, workspaceRemoved: false },
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
  const buffer = Buffer.alloc(before.size);
  const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
  if (bytesRead !== buffer.length) throw new Error('Terminal recovery manifest identity changed.');
  const text = buffer.toString('utf8');
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
  return Object.freeze({
    manifest,
    sha256: createHash('sha256').update(text).digest('hex'),
  });
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
  dispositionExecutor,
  dispositionHelperEnvironment = {},
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

  const writer = await writerFactory({
    resultPath,
    repositoryRoot,
    workspacePath,
    evidenceDirectory,
    platform,
    allowLegacyFailedRecovery: true,
    allowTerminalReplay: true,
  });
  try {
    const admitted = writer.result;
    if (!admitted) throw new Error('Terminal recovery requires an exact retained checkpoint.');
    const terminalReplay = admitted.version === 3 && admitted.status === 'failed'
      && admitted.recoveryDisposition.phase === 'zeroized';
    const activeWorkspacePath = workspacePath;
    const activeManifestPath = manifestPath;
    const activeCredentialPath = credentialPath;

    const canonicalWorkspace = await filesystem.realpath(activeWorkspacePath);
    if (canonicalWorkspace !== activeWorkspacePath) throw new Error('Terminal recovery workspace must be canonical.');
    const workspaceMetadata = await filesystem.lstat(activeWorkspacePath);
    if (!workspaceMetadata.isDirectory?.() || workspaceMetadata.isSymbolicLink?.()
      || workspaceMetadata.uid !== process.getuid() || (workspaceMetadata.mode & 0o777) !== 0o700) {
      throw new Error('Terminal recovery workspace identity is invalid.');
    }
    const workspaceIdentity = identity(workspaceMetadata);
    const entries = (await filesystem.readdir(activeWorkspacePath)).sort();
    if (entries.join(',') !== 'credentials.json,manifest.json') {
      throw new Error('Terminal recovery workspace entries are invalid.');
    }
    const [manifestMetadata, credentialMetadata] = await Promise.all([
      filesystem.lstat(activeManifestPath), filesystem.lstat(activeCredentialPath),
    ]);
    const manifestIdentity = identity(manifestMetadata);
    if (!matches(manifestMetadata, manifestIdentity, 'file') || manifestIdentity.uid !== process.getuid()
      || manifestIdentity.mode !== 0o600 || manifestIdentity.nlink !== 1) {
      throw new Error('Terminal recovery manifest metadata is invalid.');
    }
    const credentialIdentity = identity(credentialMetadata);
    if (!matches(credentialMetadata, credentialIdentity, 'file') || credentialIdentity.uid !== process.getuid()
      || credentialIdentity.mode !== 0o600 || credentialIdentity.nlink !== 1) {
      throw new Error('Terminal recovery credential metadata is invalid.');
    }
    if (admitted.version === 3 && admitted.recoveryDisposition.phase !== 'validated'
      && credentialIdentity.size !== 0) {
      throw new Error('Terminal recovery zeroization checkpoint conflicts with retained resources.');
    }
    const manifestHandle = await filesystem.open(activeManifestPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
    const workspaceHandle = await filesystem.open(activeWorkspacePath, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
    const executeDisposition = dispositionExecutor ?? executePhase9TerminalRecoveryDisposition;
    let credentialHandle = null;
    try {
      credentialHandle = await filesystem.open(activeCredentialPath, fsConstants.O_RDWR | fsConstants.O_NOFOLLOW);
      const validateRetained = async requireZeroized => {
        const [namedWorkspace, heldWorkspace, namedManifest, namedCredential, heldCredential, retainedEntries] = await Promise.all([
          filesystem.lstat(activeWorkspacePath), workspaceHandle.stat(), filesystem.lstat(activeManifestPath),
          filesystem.lstat(activeCredentialPath), credentialHandle.stat(), filesystem.readdir(activeWorkspacePath),
        ]);
        if (!matches(namedWorkspace, workspaceIdentity, 'directory')
          || !matches(heldWorkspace, workspaceIdentity, 'directory')
          || !matches(namedManifest, manifestIdentity, 'file')
          || namedCredential.dev !== credentialIdentity.dev || namedCredential.ino !== credentialIdentity.ino
          || heldCredential.dev !== credentialIdentity.dev || heldCredential.ino !== credentialIdentity.ino
          || !namedCredential.isFile?.() || namedCredential.isSymbolicLink?.()
          || !heldCredential.isFile?.() || heldCredential.isSymbolicLink?.()
          || namedCredential.uid !== credentialIdentity.uid || heldCredential.uid !== credentialIdentity.uid
          || (namedCredential.mode & 0o777) !== credentialIdentity.mode
          || (heldCredential.mode & 0o777) !== credentialIdentity.mode
          || namedCredential.nlink !== 1 || heldCredential.nlink !== 1
          || namedCredential.size !== heldCredential.size
          || (requireZeroized ? namedCredential.size !== 0 : namedCredential.size !== credentialIdentity.size)
          || retainedEntries.sort().join(',') !== 'credentials.json,manifest.json') {
          throw new Error('Terminal recovery retained workspace identity changed.');
        }
        return readManifestThroughHandle(manifestHandle, manifestIdentity);
      };
      let manifestReceipt = await validateRetained(credentialMetadata.size === 0);
      const recoveredDisposition = disposition(credentialMetadata.size === 0 ? 'zeroized' : 'validated', credentialIdentity, workspaceIdentity, manifestReceipt.sha256);
      let checkpoint = migratedCheckpoint(admitted, recoveredDisposition);
      if (admitted.version === 3 && (
        admitted.recoveryDisposition.credentialIdentity !== recoveredDisposition.credentialIdentity
        || admitted.recoveryDisposition.workspaceIdentity !== recoveredDisposition.workspaceIdentity
        || admitted.recoveryDisposition.manifestSha256 !== recoveredDisposition.manifestSha256
      )) throw new Error('Terminal recovery retained identity commitment changed.');
      assertCertificateManifestConsistency(checkpoint, manifestReceipt.manifest);

      if (admitted.version === 1 || admitted.version === 2) {
        manifestReceipt = await validateRetained(credentialMetadata.size === 0);
        try { await writer.write(checkpoint); } catch { throw new Error('Terminal recovery checkpoint publication failed.'); }
      }
      let didZeroize = false;
      if (credentialMetadata.size !== 0) {
        let zeroized;
        try { zeroized = await executeDisposition({
          operation: 'zeroize-credential', directoryHandle: workspaceHandle,
          directoryIdentity: workspaceIdentity, credentialHandle, credentialIdentity,
          name: basename(credentialPath), helperEnvironment: dispositionHelperEnvironment,
        }); } catch { throw new Error('Terminal recovery credential zeroization failed.'); }
        if (zeroized !== true) throw new Error('Terminal recovery credential zeroization failed.');
        didZeroize = true;
      }
      manifestReceipt = await validateRetained(true);
      checkpoint = Object.freeze({
        ...checkpoint,
        recoveryDisposition: disposition('zeroized', credentialIdentity, workspaceIdentity, manifestReceipt.sha256),
      });
      if (!terminalReplay && (didZeroize
        || (admitted.version === 3 && admitted.recoveryDisposition.phase === 'validated'))) {
        manifestReceipt = await validateRetained(true);
        try { await writer.write(checkpoint); } catch { throw new Error('Terminal recovery zeroization checkpoint failed.'); }
      }
      if (terminalReplay) {
        await validateRetained(true);
        await writer.revalidate();
        return summary(admitted);
      }
      await validateRetained(true);
      const terminal = terminalFailure(checkpoint);
      try { await writer.write(terminal); } catch { throw new Error('Terminal recovery final promotion failed.'); }
      return summary(terminal);
    } finally {
      await credentialHandle?.close().catch(() => {});
      await manifestHandle.close().catch(() => {});
      await workspaceHandle.close().catch(() => {});
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
