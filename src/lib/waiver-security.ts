import { createHash } from 'node:crypto';

const DOCUMENT_ID = /^[A-Za-z0-9_-]{1,200}$/;
const TEXT_HASH = /^[a-f0-9]{64}$/;
const SIGNATURE_KEYS = new Set([
  'teamId', 'memberId', 'documentId', 'signatureName', 'expectedVersion', 'expectedTextHash',
]);
const COACH_SIGNATURE_KEYS = new Set([
  'teamId', 'documentId', 'signatureName', 'expectedVersion', 'expectedTextHash',
]);

function normalizeText(value: unknown): string {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim();
}

function normalizeAudience(value: unknown): 'participant' | 'team' {
  return value === 'team' ? 'team' : 'participant';
}

function normalizeAssignments(value: unknown): string[] {
  const assignedTo = Array.isArray(value)
    ? Array.from(new Set(value.map(item => String(item).trim()).filter(item => DOCUMENT_ID.test(item)))).sort()
    : ['all'];
  if (assignedTo.length === 0) throw new Error('A valid waiver assignment is required.');
  return assignedTo;
}

export function normalizeWaiverVersion(value: unknown): number {
  if (value === undefined || value === null) return 1;
  if (!Number.isInteger(value) || Number(value) < 1) throw new Error('A valid waiver version is required.');
  return Number(value);
}

export function buildWaiverVersionIdentity(_input: {
  title: unknown;
  content: unknown;
  version: unknown;
  waiverAudience?: unknown;
  assignedTo?: unknown;
}): { title: string; content: string; version: number; textHash: string; waiverAudience: 'participant' | 'team'; assignedTo: string[] } {
  const title = normalizeText(_input.title);
  const content = normalizeText(_input.content);
  const version = normalizeWaiverVersion(_input.version);
  const waiverAudience = normalizeAudience(_input.waiverAudience);
  const assignedTo = normalizeAssignments(_input.assignedTo);
  if (!title || !content) throw new Error('A valid waiver title and content are required.');
  const textHash = createHash('sha256').update(JSON.stringify({ title, content, waiverAudience, assignedTo }), 'utf8').digest('hex');
  return { title, content, version, textHash, waiverAudience, assignedTo };
}

const CANONICAL_WAIVER_FIELDS = [
  'documentId', 'deploymentId', 'version', 'textHash', 'waiverTitle', 'waiverText',
  'waiverAudience', 'assignedTo', 'teamId', 'memberId', 'subjectPlayerId', 'signedBy',
  'signerName',
  'ownerUserId', 'sourceGlobalDocumentId', 'targetTeamIds', 'requestId', 'isGlobal', 'isClubMaster',
] as const;

export function canonicalWaiverRecordMatches(
  existing: Record<string, unknown>,
  expected: Record<string, unknown>
): boolean {
  return CANONICAL_WAIVER_FIELDS.every(field => {
    if (expected[field] === undefined) return true;
    return JSON.stringify(existing[field]) === JSON.stringify(expected[field]);
  });
}

export function canSignWaiverAssignment(assignedTo: unknown, subjectIds: string[]): boolean {
  const normalized = normalizeAssignments(assignedTo);
  const subjects = new Set(subjectIds.map(id => String(id).trim()).filter(Boolean));
  return normalized.includes('all') || normalized.some(id => subjects.has(id));
}

export type WaiverSignatureInput = {
  teamId: string;
  memberId: string;
  documentId: string;
  signatureName: string;
  expectedVersion?: number;
  expectedTextHash?: string;
};

export function validateWaiverSignatureInput(input: unknown): WaiverSignatureInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('A valid waiver signature request is required.');
  }
  const record = input as Record<string, unknown>;
  const unsupported = Object.keys(record).filter(key => !SIGNATURE_KEYS.has(key));
  if (unsupported.length) throw new Error(`Unsupported waiver signature field: ${unsupported[0]}.`);
  const teamId = String(record.teamId || '').trim();
  const memberId = String(record.memberId || '').trim();
  const documentId = String(record.documentId || '').trim();
  const signatureName = normalizeText(record.signatureName).slice(0, 150);
  if (![teamId, memberId, documentId].every(value => DOCUMENT_ID.test(value)) || signatureName.length < 2) {
    throw new Error('A valid waiver, participant, and signature are required.');
  }
  const result: WaiverSignatureInput = { teamId, memberId, documentId, signatureName };
  if (record.expectedVersion === undefined || record.expectedTextHash === undefined) {
    throw new Error('The displayed waiver version and hash are required.');
  }
  if (record.expectedVersion !== undefined) result.expectedVersion = normalizeWaiverVersion(record.expectedVersion);
  if (record.expectedTextHash !== undefined) {
    const expectedTextHash = String(record.expectedTextHash).trim().toLowerCase();
    if (!TEXT_HASH.test(expectedTextHash)) throw new Error('A valid waiver text hash is required.');
    result.expectedTextHash = expectedTextHash;
  }
  return result;
}

export type CoachWaiverSignatureInput = Omit<WaiverSignatureInput, 'memberId'>;

export function validateCoachWaiverSignatureInput(input: unknown): CoachWaiverSignatureInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('A valid coach waiver signature request is required.');
  const record = input as Record<string, unknown>;
  const unsupported = Object.keys(record).filter(key => !COACH_SIGNATURE_KEYS.has(key));
  if (unsupported.length) throw new Error(`Unsupported waiver signature field: ${unsupported[0]}.`);
  const teamId = String(record.teamId || '').trim();
  const documentId = String(record.documentId || '').trim();
  const signatureName = normalizeText(record.signatureName).slice(0, 150);
  if (!DOCUMENT_ID.test(teamId) || !DOCUMENT_ID.test(documentId) || signatureName.length < 2) throw new Error('A valid waiver and coach signature are required.');
  const result: CoachWaiverSignatureInput = { teamId, documentId, signatureName };
  if (record.expectedVersion === undefined || record.expectedTextHash === undefined) {
    throw new Error('The displayed waiver version and hash are required.');
  }
  if (record.expectedVersion !== undefined) result.expectedVersion = normalizeWaiverVersion(record.expectedVersion);
  if (record.expectedTextHash !== undefined) {
    const expectedTextHash = String(record.expectedTextHash).trim().toLowerCase();
    if (!TEXT_HASH.test(expectedTextHash)) throw new Error('A valid waiver text hash is required.');
    result.expectedTextHash = expectedTextHash;
  }
  return result;
}
