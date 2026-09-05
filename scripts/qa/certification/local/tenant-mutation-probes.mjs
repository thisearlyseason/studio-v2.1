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

export async function patchFirestoreFields({
  projectId,
  documentPath,
  idToken,
  fields,
  fetchImpl = fetch,
}) {
  if (typeof projectId !== 'string' || !projectId.startsWith('demo-')) {
    throw new Error('Tenant mutation probes require a demo project.');
  }
  if (typeof documentPath !== 'string' || !documentPath || documentPath.startsWith('/') ||
      documentPath.includes('..') || documentPath.split('/').length % 2 !== 0) {
    throw new Error('Tenant mutation probes require an exact document path.');
  }
  if (typeof idToken !== 'string' || !idToken) throw new Error('Tenant mutation probes require an authenticated token.');
  const entries = Object.entries(fields || {});
  if (entries.length === 0) throw new Error('Tenant mutation probes require at least one field.');
  for (const [field] of entries) {
    const normalizedField = field.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
    if (!field || field.includes('.') || AUTHORITY_FIELDS.has(field) || PROTECTED_NORMALIZED_FIELDS.has(normalizedField)) {
      throw new Error(`Tenant mutation probe rejected authority-bearing field ${field || '<empty>'}.`);
    }
  }
  const query = new URLSearchParams();
  for (const [field] of entries) query.append('updateMask.fieldPaths', field);
  const response = await fetchImpl(
    `http://127.0.0.1:8080/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/${documentPath}?${query}`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json', Connection: 'close' },
      body: JSON.stringify({ fields: Object.fromEntries(entries.map(([field, value]) => [field, encodeFirestoreValue(value)])) }),
    },
  );
  let body = null;
  try { body = await response.json(); } catch { /* Status remains authoritative. */ }
  return Object.freeze({ status: response.status, body });
}
