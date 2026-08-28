import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, readFile, readdir, realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const DEFAULT_FILESYSTEM = Object.freeze({ lstat, open, readFile, readdir, realpath, stat });

function exactKeys(value, keys, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) {
    throw new Error(`Terminal certificate ${name} is invalid.`);
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
    const requiredHistoryLength = status === 'complete' ? STATES.length : 10;
    const removalRequired = status === 'complete';
    if (value.history.length !== requiredHistoryLength
      || value.state !== STATES[requiredHistoryLength - 1]
      || !value.browserClosureCertified || !value.processClosureCertified || !value.profileClosureCertified
      || !value.fixtureClosureCertified
      || value.credentialRemoved !== removalRequired || value.workspaceRemoved !== removalRequired) {
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

function validateCertificate(input) {
  const value = structuredClone(input);
  exactKeys(value, ['version', 'command', 'status', 'exitCode', 'category', 'deployment', 'lifecycle', 'evidence'], 'document');
  if (value.version !== 1 || value.command !== 'hosted'
    || !new Set(['closure-pending', 'complete', 'failed']).has(value.status)
    || !Number.isSafeInteger(value.exitCode) || !new Set([0, 1]).has(value.exitCode)
    || typeof value.category !== 'string' || !CATEGORIES.has(value.category)) {
    throw new Error('Terminal certificate status or category is invalid.');
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

function canonicalDocument(value) {
  const document = `${JSON.stringify(canonicalize(validateCertificate(value)))}\n`;
  if (Buffer.byteLength(document) > MAX_CERTIFICATE_BYTES) throw new Error('Terminal certificate is oversized.');
  return document;
}

function isWithin(path, boundary) {
  const child = relative(boundary, path);
  return child === '' || (!child.startsWith(`..${sep}`) && child !== '..' && !isAbsolute(child));
}

async function readCheckpoint(filesystem, path, location = 'result') {
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
    const parsed = validateCertificate(JSON.parse(text));
    if (parsed.status !== 'closure-pending' || canonicalDocument(parsed) !== text) {
      throw new Error('Terminal certificate checkpoint is not resumable.');
    }
    return Object.freeze({
      state: 'checkpoint', location, size: Buffer.byteLength(text),
      sha256: createHash('sha256').update(text).digest('hex'), document: parsed,
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
    const parsed = validateCertificate(JSON.parse(text));
    if (parsed.status !== validated.status || canonicalDocument(parsed) !== text) {
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
      location: 'result', size: receipt.size, sha256: receipt.sha256, document: parsed,
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
} = {}) {
  if (typeof resultPath !== 'string' || !isAbsolute(resultPath) || resolve(resultPath) !== resultPath
    || typeof repositoryRoot !== 'string' || !isAbsolute(repositoryRoot) || resolve(repositoryRoot) !== repositoryRoot
    || typeof workspacePath !== 'string' || !isAbsolute(workspacePath) || resolve(workspacePath) !== workspacePath
    || typeof evidenceDirectory !== 'string' || !isAbsolute(evidenceDirectory) || resolve(evidenceDirectory) !== evidenceDirectory
    || !helperEnvironment || typeof helperEnvironment !== 'object' || Array.isArray(helperEnvironment)
    || Object.keys(helperEnvironment).some(key => !new Set([
      'PHASE9_CERTIFICATE_TEST_FAIL_PROMOTION', 'PHASE9_CERTIFICATE_TEST_BEFORE_PROMOTION_MS',
      'PHASE9_CERTIFICATE_TEST_AFTER_CHECKPOINT_VALIDATION_MS', 'PHASE9_CERTIFICATE_TEST_HANG',
    ]).has(key))
    || !Number.isSafeInteger(helperTimeoutMs) || helperTimeoutMs < 100 || helperTimeoutMs > 30_000) {
    throw new Error('Terminal certificate configuration is invalid.');
  }
  const name = basename(resultPath);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,126}\.json$/.test(name)) throw new Error('Terminal certificate filename is invalid.');
  const parentPath = dirname(resultPath);
  const recoveryName = `.${name}.checkpoint`;
  const recoveryPath = join(parentPath, recoveryName);
  const [canonicalParent, canonicalRepository, canonicalWorkspace, canonicalEvidence, helperMetadata, helperCanonical, helperSource, pythonMetadata, pythonCanonical, pythonBytes] = await Promise.all([
    filesystem.realpath(parentPath), filesystem.realpath(repositoryRoot), filesystem.realpath(workspacePath),
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
  const canonicalResultPath = join(canonicalParent, name);
  if (canonicalParent !== parentPath || isWithin(canonicalResultPath, canonicalRepository)
    || isWithin(canonicalResultPath, canonicalWorkspace) || isWithin(canonicalResultPath, canonicalEvidence)) {
    throw new Error('Terminal certificate path must be canonical and external.');
  }
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
  if (names.includes(name)) expected = await readCheckpoint(filesystem, resultPath, 'result');
  else if (names.includes(recoveryName)) expected = await readCheckpoint(filesystem, recoveryPath, 'recovery');
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
    async write(certificate) {
      if (closed) throw new Error('Terminal certificate writer is closed.');
      const validated = validateCertificate(certificate);
      if (expected.state === 'absent' && validated.status === 'complete') {
        throw new Error('Terminal certificate completion requires a checkpoint.');
      }
      await revalidateParent();
      const document = canonicalDocument(validated);
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

export { canonicalDocument as canonicalPhase9TerminalCertificate };
