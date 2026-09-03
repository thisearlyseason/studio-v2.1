import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { lstat, open, readFile, realpath } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { types as utilTypes } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  REQUIRED_LEDGER_COLUMNS,
  SCENARIO_GROUP_COUNTS,
  SCENARIO_TOTALS,
  STAGING_ORIGIN,
  STAGING_PROJECT_ID,
  assertNoFixtureIdentifierLeak,
  validateLedger,
} from './scenario-contracts.mjs';
import { ORDERED_STATES } from './lifecycle-guardian.mjs';

const DIRECTORY_SUFFIX = join(
  'docs', 'qa', 'production-audit', 'runs', '2026-08-25-phase9-core-identities',
);
const MODULE_REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FILES = Object.freeze([
  '00-environment.md', '01-fixture-lifecycle.md', '03-browser-ledger.md', '04-cleanup.md',
]);
const SENSITIVE = /(?:bearer\s+[a-z0-9._~-]+|(?:cookie|password|credential|storage[_ -]?state|private[_ -]?key|token)\s*[:=])/i;
const PRIVATE_PATH = /(?:^|[\s`'"(])(?:\/tmp\/|\/Users\/|\/home\/|[A-Za-z]:\\)/;
const DEFAULT_FILESYSTEM = Object.freeze({ lstat, open, readFile, realpath });
const HELPER_PATH = join(dirname(fileURLToPath(import.meta.url)), 'evidence-dirfd-helper.py');
const HELPER_SHA256 = '217af8dc511e7d1d2098fbea8f2040517f4264e36b2bc4ca80e4bb548a44bfc1';
const PYTHON_RUNTIME = '/usr/bin/python3';
const PYTHON_SHA256 = 'b8763cf250e607a778bb4603cecb5b90338814d0a3dfcba0d57b1de242f610e9';
const CAPTURED_SET_TIMEOUT = globalThis.setTimeout;
const CAPTURED_CLEAR_TIMEOUT = globalThis.clearTimeout;
const CAPTURED_PROCESS_KILL = process.kill.bind(process);

function snapshotData(value, depth = 0) {
  if (depth > 12) throw new Error('Evidence input nesting is unsafe.');
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (typeof value !== 'object' || utilTypes.isProxy(value) || Object.getOwnPropertySymbols(value).length !== 0) {
    throw new Error('Evidence input contains an unsafe value.');
  }
  if (Array.isArray(value)) {
    if (value.length > 256 || Object.keys(value).length !== value.length) throw new Error('Evidence input array is unsafe.');
    return value.map(item => snapshotData(item, depth + 1));
  }
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new Error('Evidence input object is unsafe.');
  }
  const result = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') throw new Error('Evidence input contains an unsafe key.');
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) throw new Error('Evidence input contains an unsafe field.');
    result[key] = snapshotData(descriptor.value, depth + 1);
  }
  return result;
}

function exactObject(value, required, optional = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Evidence input must be an exact object.');
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  if (required.some(key => !Object.hasOwn(value, key)) || keys.some(key => !allowed.has(key))) {
    throw new Error('Evidence input has incomplete or unexpected fields.');
  }
  return value;
}

function validateLifecycle(value) {
  exactObject(value, ['ok', 'state', 'history', 'browserClosureCertified', 'closureCertified'], ['rows']);
  if (
    value.ok !== true
    || value.state !== 'disarmed'
    || value.browserClosureCertified !== true
    || value.closureCertified !== true
    || !Array.isArray(value.history)
    || value.history.length !== ORDERED_STATES.length
    || value.history.some((state, index) => state !== ORDERED_STATES[index])
  ) throw new Error('Lifecycle evidence is not completely certified.');
  return value;
}

function validateDeployment(value) {
  exactObject(value, ['projectId', 'origin', 'deployedSha', 'stagingRunId', 'pullRequestNumber']);
  if (
    value.projectId !== STAGING_PROJECT_ID
    || value.origin !== STAGING_ORIGIN
    || !/^[0-9a-f]{40}$/.test(value.deployedSha)
    || !/^[1-9][0-9]{5,20}$/.test(value.stagingRunId)
    || !Number.isSafeInteger(value.pullRequestNumber)
    || value.pullRequestNumber <= 0
  ) throw new Error('Deployment evidence is inconsistent with exact staging admission.');
  return value;
}

function validateOutputDirectory(value, repositoryRoot) {
  if (typeof value !== 'string' || !isAbsolute(value) || resolve(value) !== value) {
    throw new Error('Output must use the exact Phase 9 evidence directory.');
  }
  if (typeof repositoryRoot !== 'string' || !isAbsolute(repositoryRoot) || resolve(repositoryRoot) !== repositoryRoot) {
    throw new Error('Evidence repository root is invalid.');
  }
  if (value !== join(repositoryRoot, DIRECTORY_SUFFIX)) {
    throw new Error('Output must use the exact Phase 9 evidence directory.');
  }
  return value;
}

async function snapshotBoundary(repositoryRoot, outputDirectory, filesystem) {
  const suffix = relative(repositoryRoot, outputDirectory);
  if (!suffix || suffix.startsWith('..') || isAbsolute(suffix)) throw new Error('Evidence directory escapes its repository boundary.');
  const paths = [repositoryRoot];
  let cursor = repositoryRoot;
  for (const component of suffix.split(sep)) { cursor = join(cursor, component); paths.push(cursor); }
  const snapshots = [];
  for (const path of paths) {
    const metadata = await filesystem.lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error('Evidence directory boundary contains a symlink or non-directory component.');
    snapshots.push(Object.freeze({ path, dev: metadata.dev, ino: metadata.ino, mode: metadata.mode & 0o777 }));
  }
  return Object.freeze(snapshots);
}

async function revalidateBoundary(snapshots, filesystem) {
  for (const snapshot of snapshots) {
    const metadata = await filesystem.lstat(snapshot.path);
    if (metadata.isSymbolicLink() || !metadata.isDirectory() || metadata.dev !== snapshot.dev || metadata.ino !== snapshot.ino
      || (metadata.mode & 0o777) !== snapshot.mode) {
      throw new Error('Evidence directory boundary identity changed.');
    }
  }
}

function rejectSensitive(value, label) {
  const serialized = JSON.stringify(value);
  if (SENSITIVE.test(serialized) || PRIVATE_PATH.test(serialized)) {
    throw new Error(`${label} contains unsafe sensitive material.`);
  }
  assertNoFixtureIdentifierLeak(value, label);
}

function cell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function environmentMarkdown(deployment) {
  return `# Phase 9 Core Identity Environment

- Status: \`PASS — COMMITTED GUARDED BROWSER EVIDENCE COMPLETE\`
- Release status: \`NOT READY\` pending the remaining production-readiness phases

| Check | Sanitized result |
| --- | --- |
| Firebase project | \`${deployment.projectId}\` |
| Canonical origin | \`${deployment.origin}\` |
| Deployed application SHA | \`${deployment.deployedSha}\` |
| Staging workflow | \`${deployment.stagingRunId}\` completed successfully for the exact deployed SHA |
| Pull request | \`#${deployment.pullRequestNumber}\` remained open and unmerged |
| Browser plan | \`44/44\` canonical rows across \`390x844\` and \`1440x900\` |
| Guarded closure | Exact fixture cleanup, independent absence, credential/workspace removal, and zero browser sessions |

Only sanitized Markdown is retained. Production was not accessed or changed, and no merge occurred.
`;
}

function lifecycleMarkdown() {
  return `# Phase 9 Fixture Lifecycle

## Result

\`PASS\` — the committed guardian completed its exact ordered lifecycle.

| Gate | Sanitized result |
| --- | --- |
| Read-only preflight | PASS — exact staging project, origin, deployment, and open PR |
| Seed and inspect | PASS — manifest v3; \`20\` Auth / \`82\` Firestore; zero drift |
| Browser evidence | PASS — \`40\` pre-transition rows then \`4\` post-transition rows |
| Pending-delete transition | PASS — exact account transitioned before revoked checks |
| Cleanup | PASS — exact manifest cleanup and independently initialized absence proof |
| Final state | \`disarmed\` |
`;
}

function ledgerMarkdown(rows) {
  const header = REQUIRED_LEDGER_COLUMNS.map(cell).join(' | ');
  const divider = REQUIRED_LEDGER_COLUMNS.map(() => '---').join(' | ');
  const lines = rows.map(row => REQUIRED_LEDGER_COLUMNS.map(column => cell(row[column])).join(' | '));
  return `# Phase 9 Browser Ledger

## Status

\`PASS — 44/44 CANONICAL CONTEXTS\`

| ${header} |
| ${divider} |
${lines.map(line => `| ${line} |`).join('\n')}

| Group | PASS |
| --- | ---: |
${Object.entries(SCENARIO_GROUP_COUNTS).map(([group, count]) => `| ${group} | ${count} |`).join('\n')}
| Total | 44 |
`;
}

function cleanupMarkdown() {
  return `# Phase 9 Fixture Cleanup

| Proof | Sanitized result |
| --- | --- |
| Pre-cleanup actual presence | \`20\` Auth / \`82\` Firestore |
| Guarded exact cleanup | PASS — deleted \`20\` Auth / \`82\` Firestore |
| Retained resources and cleanup failures | \`0\` |
| Post-cleanup lifecycle inspect | PASS — actual presence \`0/0\` |
| Separately initialized exact probe | PASS — \`20\` UIDs / \`82\` paths / \`1\` expected-absence path; present \`0/0/0\` |
| Credential and workspace | Removed and proved absent |
| Browser sessions | \`0\` |
| Guardian | \`disarmed\` |

No broad enumeration, recursive Firebase deletion, credential material, raw browser artifact, production operation, or merge was used.
`;
}

const sha256Bytes = bytes => createHash('sha256').update(bytes).digest('hex');

async function snapshotImmutableRuntime(filesystem) {
  const paths = ['/'];
  let cursor = '';
  for (const component of PYTHON_RUNTIME.split('/').filter(Boolean)) { cursor += `/${component}`; paths.push(cursor); }
  const snapshots = [];
  for (const path of paths) {
    const metadata = await filesystem.lstat(path);
    if (metadata.isSymbolicLink() || metadata.uid !== 0 || (metadata.mode & 0o022) !== 0
      || (path === PYTHON_RUNTIME ? !metadata.isFile() : !metadata.isDirectory())) {
      throw new Error('Pinned Python runtime boundary is not immutable.');
    }
    snapshots.push({ path, dev: metadata.dev, ino: metadata.ino, mode: metadata.mode, size: metadata.size });
  }
  return snapshots;
}

async function revalidateImmutableRuntime(filesystem, snapshots) {
  for (const snapshot of snapshots) {
    const metadata = await filesystem.lstat(snapshot.path);
    if (metadata.isSymbolicLink() || metadata.uid !== 0 || (metadata.mode & 0o022) !== 0
      || metadata.dev !== snapshot.dev || metadata.ino !== snapshot.ino || metadata.mode !== snapshot.mode
      || metadata.size !== snapshot.size) throw new Error('Pinned Python runtime boundary identity changed.');
  }
}

async function verifyHelper(filesystem, helperPath) {
  const helperMetadata = await filesystem.lstat(helperPath);
  const helperCanonical = await filesystem.realpath(helperPath);
  const helperBytes = await filesystem.readFile(helperPath);
  const runtimeMetadata = await filesystem.lstat(PYTHON_RUNTIME);
  const runtimeCanonical = await filesystem.realpath(PYTHON_RUNTIME);
  const runtimeBytes = await filesystem.readFile(PYTHON_RUNTIME);
  if (!helperMetadata.isFile() || helperMetadata.isSymbolicLink() || helperCanonical !== helperPath
    || (helperMetadata.mode & 0o022) !== 0 || sha256Bytes(helperBytes) !== HELPER_SHA256
    || !runtimeMetadata.isFile() || runtimeMetadata.isSymbolicLink() || runtimeCanonical !== PYTHON_RUNTIME
    || (runtimeMetadata.mode & 0o022) !== 0 || sha256Bytes(runtimeBytes) !== PYTHON_SHA256) {
    throw new Error('Descriptor-anchored evidence helper is not the reviewed local runtime.');
  }
  return { helperSource: helperBytes.toString('utf8'), runtimeBoundary: await snapshotImmutableRuntime(filesystem) };
}

async function runDescriptorTransaction(outputDirectory, documents, boundary, filesystem, helperEnvironment, helperPath, helperTimeoutMs) {
  const captured = await verifyHelper(filesystem, helperPath);
  await revalidateBoundary(boundary, filesystem);
  const directory = await filesystem.open(
    outputDirectory,
    fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW,
  );
  try {
    const expected = boundary.at(-1);
    const metadata = await directory.stat();
    if (!metadata.isDirectory() || metadata.dev !== expected.dev || metadata.ino !== expected.ino
      || (metadata.mode & 0o777) !== expected.mode) {
      throw new Error('Evidence output descriptor identity does not match the reviewed boundary.');
    }
    const directoryIdentity = { dev: metadata.dev, ino: metadata.ino, mode: metadata.mode & 0o777 };
    const invokeHelper = async payload => {
      await revalidateImmutableRuntime(filesystem, captured.runtimeBoundary);
      const request = JSON.stringify(payload);
      const result = await new Promise(resolvePromise => {
      const child = spawn(PYTHON_RUNTIME, ['-c', captured.helperSource], {
        cwd: '/',
        env: {
          LANG: 'C', LC_ALL: 'C', PYTHONHASHSEED: '0', PYTHONNOUSERSITE: '1',
          ...helperEnvironment,
        },
        stdio: ['pipe', 'pipe', 'pipe', directory.fd], detached: true,
      });
      let stdout = '';
      let stderrBytes = 0;
      let timedOut = false;
      let killTimer;
      const timer = CAPTURED_SET_TIMEOUT(() => {
        timedOut = true;
        try { CAPTURED_PROCESS_KILL(-child.pid, 'SIGTERM'); } catch {}
        killTimer = CAPTURED_SET_TIMEOUT(() => { try { CAPTURED_PROCESS_KILL(-child.pid, 'SIGKILL'); } catch {} }, 250);
      }, helperTimeoutMs);
      child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); if (stdout.length > 65536) child.kill('SIGKILL'); });
      child.stderr.on('data', chunk => { stderrBytes += chunk.length; if (stderrBytes > 65536) child.kill('SIGKILL'); });
      child.stdin.on('error', () => {});
      child.on('error', () => { CAPTURED_CLEAR_TIMEOUT(timer); resolvePromise({ ok: false }); });
      child.on('close', code => {
        CAPTURED_CLEAR_TIMEOUT(timer); if (killTimer) CAPTURED_CLEAR_TIMEOUT(killTimer);
        let status;
        try { status = stdout.length <= 65536 ? JSON.parse(stdout) : null; } catch { status = null; }
        resolvePromise({ code, timedOut, status });
      });
      child.stdin.end(request);
    });
      await revalidateImmutableRuntime(filesystem, captured.runtimeBoundary);
      return result;
    };
    const initial = await invokeHelper({ version: 1, operation: 'snapshot', directory: directoryIdentity });
    if (initial.timedOut || initial.code !== 0 || initial.status?.ok !== true || initial.status?.status !== 'snapshot'
      || !Array.isArray(initial.status.files) || initial.status.files.length !== FILES.length) {
      throw new Error('Evidence recovery status is uncertain; directory preserved for manual recovery.');
    }
    const result = await invokeHelper({
      version: 1, operation: 'write',
      transaction: `${process.pid}-${Date.now()}-${randomBytes(8).toString('hex')}`,
      directory: directoryIdentity,
      documents: documents.map(([name, contents]) => ({ name, contents })),
    });
    await revalidateImmutableRuntime(filesystem, captured.runtimeBoundary);
    const after = await directory.stat();
    if (after.dev !== expected.dev || after.ino !== expected.ino) {
      throw new Error('Evidence files were not written atomically.');
    }
    if (!result.timedOut && result.code === 0 && result.status?.ok === true && result.status?.status === 'committed') return;
    const final = await invokeHelper({ version: 1, operation: 'snapshot', directory: directoryIdentity });
    if (final.timedOut || final.code !== 0 || final.status?.ok !== true || final.status?.status !== 'snapshot'
      || !Array.isArray(final.status.files) || final.status.files.length !== FILES.length) {
      throw new Error('Evidence recovery status is uncertain; directory preserved for manual recovery.');
    }
    const exactRestoration = JSON.stringify(final.status.files) === JSON.stringify(initial.status.files);
    const originalByName = new Map(initial.status.files.map(file => [file.name, file]));
    const noTransactionOutput = final.status.files.every(file => {
      const original = originalByName.get(file.name);
      return file.present === false || JSON.stringify(file) === JSON.stringify(original);
    });
    if (result.status?.status === 'atomic-restoration' && exactRestoration) {
      throw new Error('Evidence files were not written atomically.');
    }
    if (result.status?.status === 'transaction-outputs-removed' && noTransactionOutput) {
      throw new Error('Evidence recovery is incomplete; transaction-owned public output was removed, evidence was not written atomically, and no atomicity is claimed.');
    }
    throw new Error('Evidence recovery status is uncertain; directory preserved for manual recovery.');
  } finally {
    await directory.close();
  }
}

async function writeEvidence({ lifecycle, rows, deployment, outputDirectory } = {}, repositoryRoot, filesystem = DEFAULT_FILESYSTEM, helperEnvironment = {}, helperPath = HELPER_PATH, helperTimeoutMs = 10_000) {
  ({ lifecycle, rows, deployment, outputDirectory } = snapshotData({ lifecycle, rows, deployment, outputDirectory }));
  validateLifecycle(lifecycle);
  validateDeployment(deployment);
  const directory = validateOutputDirectory(outputDirectory, repositoryRoot);
  const boundary = await snapshotBoundary(repositoryRoot, directory, filesystem);
  const ledger = validateLedger(rows, { groupCounts: SCENARIO_GROUP_COUNTS, totals: SCENARIO_TOTALS });
  if (ledger.totals.pass !== 44 || ledger.totals.fail !== 0 || ledger.totals.inconclusive !== 0) {
    throw new Error('Evidence result arithmetic is incomplete.');
  }
  rejectSensitive({ lifecycle, rows, deployment }, 'Evidence');
  const documents = [
    ['00-environment.md', environmentMarkdown(deployment)],
    ['01-fixture-lifecycle.md', lifecycleMarkdown()],
    ['03-browser-ledger.md', ledgerMarkdown(rows)],
    ['04-cleanup.md', cleanupMarkdown()],
  ];
  for (const [, contents] of documents) rejectSensitive(contents, 'Rendered evidence');
  await runDescriptorTransaction(directory, documents, boundary, filesystem, helperEnvironment, helperPath, helperTimeoutMs);
  return Object.freeze({ files: Object.freeze([...FILES]) });
}

export async function writePhase9Evidence(options) {
  return writeEvidence(options, MODULE_REPOSITORY_ROOT);
}

export function createPhase9EvidenceWriter({ repositoryRoot, filesystem = DEFAULT_FILESYSTEM, helperEnvironment = {}, helperPath = HELPER_PATH, helperTimeoutMs = 10_000 } = {}) {
  if (typeof repositoryRoot !== 'string' || !isAbsolute(repositoryRoot) || resolve(repositoryRoot) !== repositoryRoot) {
    throw new Error('Evidence repository root is invalid.');
  }
  if (!filesystem || ['lstat', 'open', 'readFile', 'realpath'].some(name => typeof filesystem[name] !== 'function')) {
    throw new Error('Evidence filesystem boundary is invalid.');
  }
  if (!helperEnvironment || typeof helperEnvironment !== 'object' || Array.isArray(helperEnvironment)
    || Object.keys(helperEnvironment).some(key => ![
      'PHASE9_WRITER_TEST_FAIL_PROMOTION', 'PHASE9_WRITER_TEST_BEFORE_PROMOTION_MS',
      'PHASE9_WRITER_TEST_SIGKILL_AFTER_TEMP', 'PHASE9_WRITER_TEST_HANG',
      'PHASE9_WRITER_TEST_REPLACE_PROMOTION',
      'PHASE9_WRITER_TEST_FAIL_ROLLBACK_PREPARATION', 'PHASE9_WRITER_TEST_FAIL_ROLLBACK_PROMOTION',
      'PHASE9_WRITER_TEST_BEFORE_ROLLBACK_PROMOTION_MS',
      'PHASE9_WRITER_TEST_STEAL_PROMOTION',
    ].includes(key))) {
    throw new Error('Evidence helper environment is invalid.');
  }
  if (typeof helperPath !== 'string' || !isAbsolute(helperPath) || resolve(helperPath) !== helperPath
    || !Number.isInteger(helperTimeoutMs) || helperTimeoutMs < 100 || helperTimeoutMs > 30_000) {
    throw new Error('Evidence helper execution boundary is invalid.');
  }
  return Object.freeze({ write: options => writeEvidence(
    options, repositoryRoot, filesystem, helperEnvironment, helperPath, helperTimeoutMs,
  ) });
}

export { FILES as PHASE9_EVIDENCE_FILES };
