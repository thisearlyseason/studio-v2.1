const INVITE_PLAYER_FIELDS = [
  'pendingInviteEmail',
  'inviteToken',
  'inviteSentAt',
  'inviteExpiresAt',
] as const;

export type YouthInvitePlayerState = Partial<Record<(typeof INVITE_PLAYER_FIELDS)[number], unknown>>;

export function captureYouthInvitePlayerState(player: Record<string, unknown>): YouthInvitePlayerState {
  const state: YouthInvitePlayerState = {};
  for (const field of INVITE_PLAYER_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(player, field)) state[field] = player[field];
  }
  return state;
}

export function youthInviteRollbackPlan({
  currentToken,
  replacementToken,
  previousInvite,
  previousPlayer,
}: {
  currentToken: unknown;
  replacementToken: string;
  previousInvite: Record<string, unknown> | null;
  previousPlayer: YouthInvitePlayerState;
}) {
  if (currentToken !== replacementToken) return null;
  return {
    deleteReplacement: true,
    restorePreviousInvite: previousInvite,
    restorePlayer: previousPlayer,
  };
}

export { INVITE_PLAYER_FIELDS };
