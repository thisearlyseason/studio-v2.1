export function validScore(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 999;
}

export function isLegacyOpenPortal(...identifiers: unknown[]) {
  return identifiers.some(identifier => typeof identifier === 'string' && identifier.startsWith('demo_'));
}

export function credentialsMatch(expected: unknown, supplied: unknown, allowLegacyOpen: boolean) {
  const normalizedExpected = String(expected || '').trim();
  if (!normalizedExpected) return allowLegacyOpen;
  return typeof supplied === 'string' && supplied.trim().toLowerCase() === normalizedExpected.toLowerCase();
}
