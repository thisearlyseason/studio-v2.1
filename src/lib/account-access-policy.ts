export type AccountAccessProfile = {
  accountStatus?: unknown;
  deletionStatus?: unknown;
};

const BLOCKED_ACCOUNT_STATUSES = new Set([
  'deleted',
  'disabled',
  'pending_deletion',
  'suspended',
]);

const BLOCKED_DELETION_STATUSES = new Set([
  'completed',
  'deleted',
  'pending',
  'processing',
]);

function normalized(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isAccountAccessBlocked(profile: AccountAccessProfile | null | undefined): boolean {
  if (!profile) return false;
  return BLOCKED_ACCOUNT_STATUSES.has(normalized(profile.accountStatus)) ||
    BLOCKED_DELETION_STATUSES.has(normalized(profile.deletionStatus));
}
