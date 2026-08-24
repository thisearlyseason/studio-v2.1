import { MANAGED_PREFIX, STAGING_PROJECT_ID } from './guard.mjs';

const RUN_ID_PATTERN = new RegExp(`^${MANAGED_PREFIX}[A-Za-z0-9][A-Za-z0-9_-]*$`);
const UID_SUFFIX_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const MANIFEST_STATES = new Set(['planned', 'partial', 'seeded', 'cleaned']);
const MANIFEST_FIELDS = new Set([
  'version',
  'runId',
  'projectId',
  'authUids',
  'firestorePaths',
  'state',
  'createdAt',
  'updatedAt',
  'expiresAt',
]);
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertRunId(runId) {
  if (typeof runId !== 'string' || !RUN_ID_PATTERN.test(runId) || runId.includes('..')) {
    throw new Error(`run ID must begin with ${MANAGED_PREFIX} and contain only safe namespace characters.`);
  }
}

function assertStringArray(value, fieldName) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`${fieldName} must be an array of strings.`);
  }
  if (new Set(value).size !== value.length) {
    throw new Error(`${fieldName} must contain unique values.`);
  }
}

function assertTimestamp(value, fieldName) {
  if (value !== undefined && (typeof value !== 'string' || !ISO_TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value)))) {
    throw new Error(`${fieldName} must be an ISO-8601 UTC timestamp.`);
  }
}

function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    freezeDeep(child);
  }
  return Object.freeze(value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function managedUidForRun(uid, runId) {
  return uid === runId || uid.startsWith(`${runId}-`);
}

/** Assert that an Auth UID is owned by the exact run namespace. */
export function assertManagedUid(uid, runId) {
  assertRunId(runId);
  if (
    typeof uid !== 'string'
    || uid.length > 128
    || !managedUidForRun(uid, runId)
    || !UID_SUFFIX_PATTERN.test(uid.slice(runId.length + (uid === runId ? 0 : 1)))
  ) {
    throw new Error(`Managed UID must belong to run ${runId}.`);
  }
}

/**
 * Assert that a Firestore document path is normalized and all document IDs
 * are owned by the exact run namespace. Collection paths are not accepted;
 * callers must identify concrete documents for safe cleanup.
 */
export function assertManagedPath(path, runId) {
  assertRunId(runId);
  if (typeof path !== 'string' || path.length === 0 || path.includes('\\')) {
    throw new Error(`Managed Firestore path must belong to run ${runId}.`);
  }

  const segments = path.split('/');
  if (
    segments.length === 0
    || segments.length % 2 !== 0
    || segments.some(segment => segment.length === 0 || segment === '.' || segment === '..' || segment.trim() !== segment)
  ) {
    throw new Error(`Managed Firestore path must be normalized for run ${runId}.`);
  }

  const runPattern = new RegExp(`^${escapeRegExp(runId)}(?:-[A-Za-z0-9][A-Za-z0-9_-]*)?$`);
  const documentIds = segments.filter((_, index) => index % 2 === 1);
  if (documentIds.length === 0 || documentIds.some(id => !runPattern.test(id))) {
    throw new Error(`Managed Firestore path must contain only document IDs from run ${runId}.`);
  }
}

/** Create the non-secret run namespace used by a fixture lifecycle. */
export function createRunId({ now = new Date(), randomSuffix } = {}) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) {
    throw new Error('now must be a valid date.');
  }
  if (typeof randomSuffix !== 'string' || !/^[A-Za-z0-9]+$/.test(randomSuffix)) {
    throw new Error('randomSuffix must contain only letters and digits.');
  }
  const stamp = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return `${MANAGED_PREFIX}${stamp}-${randomSuffix.toLowerCase()}`;
}

/** Validate and deeply freeze a repository-safe fixture run manifest. */
export function validateManifest(manifest) {
  if (!isRecord(manifest)) {
    throw new Error('Manifest must be an object.');
  }
  const unknownFields = Object.keys(manifest).filter(field => !MANIFEST_FIELDS.has(field));
  if (unknownFields.length > 0) {
    throw new Error(`Unknown manifest field: ${unknownFields[0]}.`);
  }
  if (manifest.version !== 1) {
    throw new Error('Manifest version must equal 1.');
  }
  if (manifest.projectId !== STAGING_PROJECT_ID) {
    throw new Error('Manifest project must equal the isolated staging project.');
  }
  assertRunId(manifest.runId);
  assertStringArray(manifest.authUids, 'authUids');
  assertStringArray(manifest.firestorePaths, 'firestorePaths');

  for (const uid of manifest.authUids) {
    assertManagedUid(uid, manifest.runId);
  }
  for (const path of manifest.firestorePaths) {
    assertManagedPath(path, manifest.runId);
  }
  if (!MANIFEST_STATES.has(manifest.state)) {
    throw new Error('Manifest state must be planned, partial, seeded, or cleaned.');
  }
  assertTimestamp(manifest.createdAt, 'createdAt');
  assertTimestamp(manifest.updatedAt, 'updatedAt');
  assertTimestamp(manifest.expiresAt, 'expiresAt');

  const normalized = {
    version: 1,
    runId: manifest.runId,
    projectId: STAGING_PROJECT_ID,
    authUids: [...manifest.authUids],
    firestorePaths: [...manifest.firestorePaths],
    state: manifest.state,
  };
  for (const field of ['createdAt', 'updatedAt', 'expiresAt']) {
    if (manifest[field] !== undefined) {
      normalized[field] = manifest[field];
    }
  }
  return freezeDeep(normalized);
}

export { MANAGED_PREFIX, STAGING_PROJECT_ID };
