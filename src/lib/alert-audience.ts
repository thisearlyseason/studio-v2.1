export type AlertAudienceRecord = {
  audience?: string;
  targetUserId?: string | null;
};

export type AlertRecipient = {
  userId?: string | null;
  isStaff: boolean;
  isPlayer: boolean;
  isParent: boolean;
};

/** Keeps the badge, automatic popup, inbox, and history on one audience contract. */
export function isAlertRelevantToRecipient(
  alert: AlertAudienceRecord,
  recipient: AlertRecipient,
): boolean {
  if (alert.targetUserId && alert.targetUserId !== recipient.userId) return false;

  switch (alert.audience) {
    case 'everyone': return true;
    case 'coaches': return recipient.isStaff;
    case 'players': return recipient.isPlayer;
    case 'parents': return recipient.isParent;
    default: return false;
  }
}

/** Display scope for server-only signup records; never used to grant access. */
export function alertAudienceLabel(
  alert: AlertAudienceRecord & { id?: string; createdBy?: string },
): string {
  if (alert.id?.startsWith('signup_') && alert.createdBy === 'system' && alert.targetUserId) {
    return 'Superadmin only';
  }
  return String(alert.audience || '');
}
