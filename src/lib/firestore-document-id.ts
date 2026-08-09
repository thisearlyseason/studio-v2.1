const FIRESTORE_DOCUMENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const RESERVED_DOCUMENT_ID_PATTERN = /^__.*__$/;

export function isValidFirestoreDocumentId(value: unknown): value is string {
  return typeof value === 'string' &&
    FIRESTORE_DOCUMENT_ID_PATTERN.test(value) &&
    !RESERVED_DOCUMENT_ID_PATTERN.test(value);
}

export function validFirestoreDocumentId(value: unknown): string | null {
  return isValidFirestoreDocumentId(value) ? value : null;
}
