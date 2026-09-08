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
  const restorable = previousInvite?.deliveryStatus !== 'pending' ? previousInvite : null;
  return {
    deleteReplacement: true,
    restorePreviousInvite: restorable,
    restorePlayer: restorable ? previousPlayer : {},
  };
}

export function youthInviteCanStartRotation(invite: Record<string, unknown>): boolean {
  return invite.deliveryStatus !== 'pending';
}

export function youthInviteCanResumeDelivery(
  invite: Record<string, unknown>,
  request: { childId: string; parentId: string; email: string },
): boolean {
  return invite.deliveryStatus === 'pending' &&
    invite.childId === request.childId &&
    invite.parentId === request.parentId &&
    invite.email === request.email;
}

export function canRedeemYouthInvite(player: Record<string, unknown>, token: string): boolean {
  return player.inviteToken === token && player.hasLogin !== true &&
    !(typeof player.userId === 'string' && player.userId);
}

export { INVITE_PLAYER_FIELDS };
