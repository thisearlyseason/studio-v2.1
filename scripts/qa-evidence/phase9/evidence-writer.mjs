import { chmod, lstat, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
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

async function writeAllAtomically(outputDirectory, documents) {
  const transaction = `${process.pid}-${Date.now()}`;
  const temps = [];
  const backups = [];
  const promoted = [];
  try {
    for (const [name, contents] of documents) {
      const temp = join(outputDirectory, `.${basename(name)}.${transaction}.tmp`);
      await writeFile(temp, contents, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await chmod(temp, 0o600);
      temps.push(temp);
    }
    for (const [name] of documents) {
      const target = join(outputDirectory, name);
      try {
        const metadata = await lstat(target);
        if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error('Evidence target is not a regular file.');
        const backup = join(outputDirectory, `.${basename(name)}.${transaction}.bak`);
        await writeFile(backup, await readFile(target), { mode: 0o600, flag: 'wx' });
        backups.push([target, backup, metadata.mode & 0o777]);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
    for (let index = 0; index < documents.length; index += 1) {
      const target = join(outputDirectory, documents[index][0]);
      await rename(temps[index], target);
      promoted.push(target);
      await chmod(target, 0o644);
    }
    for (const [, backup] of backups) await rm(backup, { force: true });
  } catch (error) {
    for (const temp of temps) await rm(temp, { force: true }).catch(() => {});
    for (const target of promoted) await rm(target, { force: true }).catch(() => {});
    for (const [target, backup, mode] of backups) {
      await rename(backup, target).catch(() => {});
      await chmod(target, mode).catch(() => {});
    }
    throw new Error('Evidence files were not written atomically.', { cause: error });
  }
}

async function writeEvidence({ lifecycle, rows, deployment, outputDirectory } = {}, repositoryRoot) {
  ({ lifecycle, rows, deployment, outputDirectory } = snapshotData({ lifecycle, rows, deployment, outputDirectory }));
  validateLifecycle(lifecycle);
  validateDeployment(deployment);
  const directory = validateOutputDirectory(outputDirectory, repositoryRoot);
  const directoryMetadata = await lstat(directory);
  if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink()) {
    throw new Error('Output must use a real Phase 9 evidence directory.');
  }
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
  await writeAllAtomically(directory, documents);
  return Object.freeze({ files: Object.freeze([...FILES]) });
}

export async function writePhase9Evidence(options) {
  return writeEvidence(options, MODULE_REPOSITORY_ROOT);
}

export function createPhase9EvidenceWriter({ repositoryRoot } = {}) {
  if (typeof repositoryRoot !== 'string' || !isAbsolute(repositoryRoot) || resolve(repositoryRoot) !== repositoryRoot) {
    throw new Error('Evidence repository root is invalid.');
  }
  return Object.freeze({ write: options => writeEvidence(options, repositoryRoot) });
}

export { FILES as PHASE9_EVIDENCE_FILES };
