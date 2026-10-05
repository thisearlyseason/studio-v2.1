export type TeamMembershipData = Record<string, unknown> | null | undefined;

export function isActiveTeamMembership(data: TeamMembershipData): boolean {
  return Boolean(data) && data?.status !== 'removed' && data?.isDeleted !== true;
}

export function activeTeamMemberships<T extends Record<string, unknown>>(memberships: T[]): T[] {
  return memberships.filter(isActiveTeamMembership);
}
