const AUTHORITY_FIELDS = new Set([
  'ownerUserId', 'userId', 'parentId', 'guardianIds',
  'isPro', 'planId', 'plan', 'isDemo', 'demoSessionOwnerId',
]);
const PROTECTED_NORMALIZED_FIELDS = new Set(['parentuid', 'invitetoken']);

export function encodeFirestoreValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Firestore probe values must be finite.');
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeFirestoreValue) } };
  if (typeof value === 'object') {
    return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, encodeFirestoreValue(child)])) } };
  }
  throw new Error(`Unsupported Firestore probe value type: ${typeof value}.`);
}

function validateProbeBoundary({ projectId, documentPath, idToken }) {
  if (typeof projectId !== 'string' || !projectId.startsWith('demo-')) {
    throw new Error('Tenant mutation probes require a demo project.');
  }
  if (typeof documentPath !== 'string' || !documentPath || documentPath.startsWith('/') ||
      documentPath.includes('..') || documentPath.split('/').length % 2 !== 0) {
    throw new Error('Tenant mutation probes require an exact document path.');
  }
  if (typeof idToken !== 'string' || !idToken) throw new Error('Tenant mutation probes require an authenticated token.');
}

async function performFirestorePatch({ projectId, documentPath, idToken, fields, signal, fetchImpl }) {
  const entries = Object.entries(fields);
  const query = new URLSearchParams();
  for (const [field] of entries) query.append('updateMask.fieldPaths', field);
  const response = await fetchImpl(
    `http://127.0.0.1:8080/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${documentPath}?${query}`,
    {
      method: 'PATCH',
      ...(signal ? { signal } : {}),
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json', Connection: 'close' },
      body: JSON.stringify({ fields: Object.fromEntries(entries.map(([field, value]) => [field, encodeFirestoreValue(value)])) }),
    },
  );
  let body = null;
  try { body = await response.json(); } catch { /* Status remains authoritative. */ }
  return Object.freeze({ status: response.status, body });
}

export async function patchFirestoreFields({
  projectId,
  documentPath,
  idToken,
  fields,
  signal,
  fetchImpl = fetch,
}) {
  validateProbeBoundary({ projectId, documentPath, idToken });
  const entries = Object.entries(fields || {});
  if (entries.length === 0) throw new Error('Tenant mutation probes require at least one field.');
  for (const [field] of entries) {
    const normalizedField = field.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
    if (!field || field.includes('.') || AUTHORITY_FIELDS.has(field) || PROTECTED_NORMALIZED_FIELDS.has(normalizedField)) {
      throw new Error(`Tenant mutation probe rejected authority-bearing field ${field || '<empty>'}.`);
    }
  }
  return performFirestorePatch({ projectId, documentPath, idToken, fields, signal, fetchImpl });
}

export async function probeForgedWatchProgressDenial({
  projectId,
  documentPath,
  idToken,
  actorUid,
  targetUserId,
  percentage,
  watchedAt,
  signal,
  fetchImpl = fetch,
}) {
  validateProbeBoundary({ projectId, documentPath, idToken });
  if (!/^players\/[^/]+\/videos\/[^/]+\/watchProgress\/[^/]+$/.test(documentPath)) {
    throw new Error('Forged progress probe requires an exact watch-progress document path.');
  }
  if (typeof actorUid !== 'string' || !actorUid || typeof targetUserId !== 'string' || !targetUserId || actorUid === targetUserId) {
    throw new Error('Forged progress probe requires a distinct actor and target.');
  }
  if (documentPath.split('/').at(-1) !== targetUserId) {
    throw new Error('Forged progress probe target must match the watch-progress document ID.');
  }
  if (typeof percentage !== 'number' || !Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
    throw new Error('Forged progress probe requires a finite percentage from 0 through 100.');
  }
  if (typeof watchedAt !== 'string' || !watchedAt || !Number.isFinite(Date.parse(watchedAt))) {
    throw new Error('Forged progress probe requires a valid watchedAt timestamp.');
  }
  const result = await performFirestorePatch({
    projectId,
    documentPath,
    idToken,
    fields: { userId: targetUserId, percentage, watchedAt },
    signal,
    fetchImpl,
  });
  if (result.status !== 403) {
    throw new Error(`Forged progress probe expected 403 denial, received ${result.status}.`);
  }
  return result;
}
