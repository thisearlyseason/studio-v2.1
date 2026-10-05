type SquadEntitlement = {
  isPro?: boolean;
} | null | undefined;

/**
 * Coaches Corner is licensed to the currently selected paid squad.
 * Account-level plans and other owned Pro squads must never upgrade a free
 * squad implicitly. Super Admin remains the only global exception.
 */
export function hasCoachesCornerEntitlement(
  activeTeam: SquadEntitlement,
  isSuperAdmin = false
) {
  return isSuperAdmin || activeTeam?.isPro === true;
}
