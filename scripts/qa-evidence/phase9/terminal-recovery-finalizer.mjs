import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, readFile, readdir, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildFixtureDefinition } from '../../qa-fixtures/definition.mjs';
import { assertExactFixtureJournal } from '../../qa-fixtures/manifest.mjs';
import { createPhase9TerminalCertificateWriter } from './terminal-certificate-writer.mjs';

const MAX_MANIFEST_BYTES = 32_768;
const DEFAULT_FILESYSTEM = Object.freeze({ lstat, open, readFile, readdir, realpath });
const RECOVERY_HELPER_PATH = fileURLToPath(new URL('./terminal-recovery-dirfd-helper.py', import.meta.url));
const RECOVERY_HELPER_SHA256 = 'f6864df64a778c9f365fa31678acde3b0bcabb7292fb0ce2cabee2d71f5de3a1';
const PYTHON_RUNTIME = '/usr/bin/python3';
const PYTHON_SHA256 = 'b8763cf250e607a778bb4603cecb5b90338814d0a3dfcba0d57b1de242f610e9';
const MAX_HELPER_OUTPUT = 1_024;

export const PHASE9_TERMINAL_RECOVERY_COMMAND = Object.freeze({
  name: 'recover-terminal',
  providerOperations: 0,
  browserRows: 0,
});

export async function executePhase9TerminalRecoveryDisposition({
  operation, directoryHandle, directoryIdentity, workspaceHandle, workspaceIdentity,
  credentialHandle, credentialIdentity, name, quarantineName,
  helperEnvironment = {}, helperTimeoutMs = 10_000,
} = {}) {
  if (process.platform !== 'darwin'
    || !new Set(['zeroize-credential', 'quarantine-workspace']).has(operation)
    || !directoryHandle || !directoryIdentity || typeof name !== 'string'
    || (operation === 'zeroize-credential' && (!credentialHandle || !credentialIdentity || name !== 'credentials.json'))
    || (operation === 'quarantine-workspace' && (
      !workspaceHandle || !workspaceIdentity || typeof quarantineName !== 'string'
    ))
    || typeof helperEnvironment !== 'object' || helperEnvironment === null || Array.isArray(helperEnvironment)
    || Object.keys(helperEnvironment).some(key => !new Set([
      'PHASE9_RECOVERY_TEST_BEFORE_CREDENTIAL_ZEROIZE_MS',
      'PHASE9_RECOVERY_TEST_BEFORE_WORKSPACE_QUARANTINE_MS',
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
  const request = operation === 'zeroize-credential' ? {
    version: 2, operation, workspace: directoryIdentity, name, credential: credentialIdentity,
  } : {
    version: 2, operation, directory: directoryIdentity, workspaceName: name,
    quarantineName, workspace: workspaceIdentity,
  };
  return new Promise((resolvePromise, rejectPromise) => {
    const stdio = operation === 'quarantine-workspace'
      ? ['pipe', 'pipe', 'pipe', directoryHandle.fd, workspaceHandle.fd]
      : ['pipe', 'pipe', 'pipe', directoryHandle.fd, 'ignore', credentialHandle.fd];
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

function isWithin(path, boundary) {
  const child = relative(boundary, path);
  return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child));
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
    originalPathsAbsent: phase === 'quarantined',
    credentialZeroized: phase !== 'validated',
    workspaceQuarantined: phase === 'quarantined',
    quarantineRetained: phase === 'quarantined',
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
  quarantinePath,
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
    [credentialPath, 'credential'], [quarantinePath, 'quarantine'],
    [repositoryRoot, 'repository'], [evidenceDirectory, 'evidence'],
  ]) exactAbsolutePath(value, name);
  if (!/^\/private\/tmp\/phase9-core-identities\.[A-Za-z0-9_-]+$/.test(workspacePath)
    || manifestPath !== join(workspacePath, 'manifest.json')
    || credentialPath !== join(workspacePath, 'credentials.json')
    || quarantinePath !== workspacePath.replace('/phase9-core-identities.', '/phase9-terminal-quarantine.')
    || dirname(quarantinePath) !== dirname(workspacePath) || quarantinePath === workspacePath) {
    throw new Error('Terminal recovery workspace children are invalid.');
  }

  const workspaceMissing = await absent(filesystem, workspacePath);
  const quarantineMissing = await absent(filesystem, quarantinePath);
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
    const terminalReplay = admitted.version === 3 && admitted.status === 'failed'
      && admitted.recoveryDisposition.phase === 'quarantined';
    if (terminalReplay) {
      if (!workspaceMissing || quarantineMissing || !(await absent(filesystem, credentialPath))) {
        throw new Error('Terminal recovery terminal replay conflicts with retained resources.');
      }
    }
    if (admitted.version === 3 && admitted.recoveryDisposition.phase === 'quarantined'
      && (!workspaceMissing || quarantineMissing)) {
      throw new Error('Terminal recovery quarantined checkpoint conflicts with retained resources.');
    }
    if (workspaceMissing && (quarantineMissing || admitted.version !== 3
      || !new Set(['zeroized', 'quarantined']).has(admitted.recoveryDisposition.phase))) {
      throw new Error('Terminal recovery quarantine resume requires exact retained identity validation.');
    }
    if (!workspaceMissing && !quarantineMissing) throw new Error('Terminal recovery quarantine path must be absent.');
    const activeWorkspacePath = workspaceMissing ? quarantinePath : workspacePath;
    const activeManifestPath = join(activeWorkspacePath, 'manifest.json');
    const activeCredentialPath = join(activeWorkspacePath, 'credentials.json');

    const canonicalWorkspace = await filesystem.realpath(activeWorkspacePath);
    if (canonicalWorkspace !== activeWorkspacePath) throw new Error('Terminal recovery workspace must be canonical.');
    const [canonicalRepository, canonicalEvidence, canonicalQuarantineParent, canonicalResultParent] = await Promise.all([
      filesystem.realpath(repositoryRoot), filesystem.realpath(evidenceDirectory),
      filesystem.realpath(dirname(quarantinePath)), filesystem.realpath(dirname(resultPath)),
    ]);
    const canonicalQuarantine = join(canonicalQuarantineParent, basename(quarantinePath));
    if (canonicalQuarantine !== quarantinePath || isWithin(canonicalQuarantine, canonicalRepository)
      || isWithin(canonicalQuarantine, canonicalEvidence) || isWithin(canonicalQuarantine, canonicalResultParent)) {
      throw new Error('Terminal recovery quarantine must be canonical and external.');
    }
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
    const parentPath = dirname(workspacePath);
    const parentMetadata = await filesystem.lstat(parentPath);
    const parentIdentity = identity(parentMetadata);
    if (!matches(parentMetadata, parentIdentity, 'directory') || parentIdentity.uid !== 0
      || parentIdentity.mode !== 0o777) throw new Error('Terminal recovery parent identity is invalid.');
    const parentHandle = await filesystem.open(parentPath, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
    const executeDisposition = dispositionExecutor ?? executePhase9TerminalRecoveryDisposition;
    let credentialHandle = null;
    try {
      credentialHandle = await filesystem.open(activeCredentialPath, fsConstants.O_RDWR | fsConstants.O_NOFOLLOW);
      const manifestReceipt = await readManifestThroughHandle(manifestHandle, manifestIdentity);
      const recoveredDisposition = disposition(credentialMetadata.size === 0 ? 'zeroized' : 'validated', credentialIdentity, workspaceIdentity, manifestReceipt.sha256);
      let checkpoint = migratedCheckpoint(admitted, recoveredDisposition);
      if (admitted.version === 3 && (
        admitted.recoveryDisposition.credentialIdentity !== recoveredDisposition.credentialIdentity
        || admitted.recoveryDisposition.workspaceIdentity !== recoveredDisposition.workspaceIdentity
        || admitted.recoveryDisposition.manifestSha256 !== recoveredDisposition.manifestSha256
      )) throw new Error('Terminal recovery retained identity commitment changed.');
      assertCertificateManifestConsistency(checkpoint, manifestReceipt.manifest);
      const heldWorkspace = await workspaceHandle.stat();
      if (!matches(heldWorkspace, workspaceIdentity, 'directory')) throw new Error('Terminal recovery workspace identity changed.');
      if (!matches(await credentialHandle.stat(), credentialIdentity, 'file')) {
        throw new Error('Terminal recovery credential identity changed.');
      }

      if (admitted.version === 1 || admitted.version === 2) {
        try { await writer.write(checkpoint); } catch { throw new Error('Terminal recovery checkpoint publication failed.'); }
      }
      if (credentialMetadata.size !== 0) {
        let zeroized;
        try { zeroized = await executeDisposition({
          operation: 'zeroize-credential', directoryHandle: workspaceHandle,
          directoryIdentity: workspaceIdentity, credentialHandle, credentialIdentity,
          name: basename(credentialPath), helperEnvironment: dispositionHelperEnvironment,
        }); } catch { throw new Error('Terminal recovery credential zeroization failed.'); }
        if (zeroized !== true) throw new Error('Terminal recovery credential zeroization failed.');
      }
      const zeroizedHeld = await credentialHandle.stat();
      const zeroizedNamed = await filesystem.lstat(activeCredentialPath);
      if (!zeroizedHeld.isFile?.() || zeroizedHeld.isSymbolicLink?.() || !zeroizedNamed.isFile?.()
        || zeroizedNamed.isSymbolicLink?.() || zeroizedHeld.dev !== credentialIdentity.dev
        || zeroizedHeld.ino !== credentialIdentity.ino || zeroizedNamed.dev !== credentialIdentity.dev
        || zeroizedNamed.ino !== credentialIdentity.ino || zeroizedHeld.size !== 0 || zeroizedNamed.size !== 0) {
        throw new Error('Terminal recovery credential zeroization is uncertain.');
      }
      checkpoint = Object.freeze({
        ...checkpoint,
        recoveryDisposition: disposition('zeroized', credentialIdentity, workspaceIdentity, manifestReceipt.sha256),
      });
      if (!terminalReplay && admitted.recoveryDisposition?.phase !== 'quarantined') {
        try { await writer.write(checkpoint); } catch { throw new Error('Terminal recovery zeroization checkpoint failed.'); }
      }
      const namedWorkspace = await filesystem.lstat(activeWorkspacePath);
      if (!matches(namedWorkspace, workspaceIdentity, 'directory')) {
        throw new Error('Terminal recovery workspace pathname changed.');
      }
      if (!workspaceMissing) {
        try { await executeDisposition({
          operation: 'quarantine-workspace', directoryHandle: parentHandle, directoryIdentity: parentIdentity,
          workspaceHandle, workspaceIdentity, name: basename(workspacePath), quarantineName: basename(quarantinePath),
          helperEnvironment: dispositionHelperEnvironment,
        }); } catch { throw new Error('Terminal recovery workspace quarantine failed.'); }
        if (!(await absent(filesystem, workspacePath)) || !(await absent(filesystem, credentialPath))
          || await absent(filesystem, quarantinePath)) {
          throw new Error('Terminal recovery workspace quarantine failed.');
        }
      }
      if (!(await absent(filesystem, workspacePath)) || !(await absent(filesystem, credentialPath))) {
        throw new Error('Terminal recovery original path absence is uncertain.');
      }
      const quarantined = await filesystem.lstat(quarantinePath);
      if (!matches(quarantined, workspaceIdentity, 'directory')) throw new Error('Terminal recovery quarantine identity changed.');
      if (terminalReplay) {
        await writer.revalidate();
        return summary(admitted);
      }
      checkpoint = Object.freeze({
        ...checkpoint,
        recoveryDisposition: disposition('quarantined', credentialIdentity, workspaceIdentity, manifestReceipt.sha256),
      });
      try { await writer.write(checkpoint); } catch { throw new Error('Terminal recovery quarantine checkpoint failed.'); }
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
