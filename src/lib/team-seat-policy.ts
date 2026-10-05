export type TeamSeatCandidate = {
  type?: unknown;
  isInstitution?: unknown;
  isOrganizationHub?: unknown;
};

export type OrganizationAssociation = {
  ownerId: string;
  hubId: string | null;
  type: 'club' | 'school';
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

/**
 * Organization membership outlives an individual paid-seat allocation. Keeping
 * this link lets an authorized owner release and later reassign the same squad
 * without broadening authority to an unrelated hub.
 */
export function buildOrganizationAssociationFields(organization: OrganizationAssociation) {
  return organization.hubId
    ? {
        organizationOwnerUserId: organization.ownerId,
        organizationHubId: organization.hubId,
        organizationType: organization.type,
        schoolId: organization.hubId,
      }
    : {
        organizationOwnerUserId: organization.ownerId,
        organizationType: organization.type,
        clubId: organization.ownerId,
      };
}
