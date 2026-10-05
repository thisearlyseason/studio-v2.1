const PLAYER_ROLES = new Set(['adult_player', 'youth_player', 'player']);

/**
 * Join codes grant ordinary squad membership only. Staff authority must be
 * assigned later by the squad owner, never accepted from a join request.
 */
export function safeJoinPosition(input: {
  profileRole: unknown;
  joiningLinkedChild: boolean;
  requestedPlayerEnrollment?: boolean;
}): 'Parent' | 'Player' | 'Member' {
  if (input.joiningLinkedChild) return 'Player';
  if (input.requestedPlayerEnrollment) return 'Player';
  const role = typeof input.profileRole === 'string'
    ? input.profileRole.trim().toLowerCase()
    : '';
  if (role === 'parent' || role === 'guardian') return 'Parent';
  if (PLAYER_ROLES.has(role)) return 'Player';
  return 'Member';
}
