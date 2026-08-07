export type TeamSeatCandidate = {
  type?: unknown;
  isInstitution?: unknown;
  isOrganizationHub?: unknown;
};

const NON_BILLABLE_TEAM_TYPES = new Set([
  'school',
  'school_hub',
  'institution',
  'organization',
  'organization_hub',
  'club',
  'club_hub',
  'league',
  'league_hub',
  'competition_hub',
]);

/**
 * Paid seats belong to playable squads, not the administrative hub used by an
 * athletic director or league/club organizer.
 */
export function isBillableSquadSeat(team: TeamSeatCandidate | null | undefined): boolean {
  if (!team) return false;
  if (team.isInstitution === true || team.isOrganizationHub === true) return false;
  const type = typeof team.type === 'string' ? team.type.trim().toLowerCase() : '';
  return !NON_BILLABLE_TEAM_TYPES.has(type);
}
