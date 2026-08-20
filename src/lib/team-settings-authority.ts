export type TeamSettingsAuthorityInput = {
  hasActiveTeam: boolean;
  isTeamStaff: boolean;
  accountRole?: unknown;
};

export function canManageActiveTeamModules({
  hasActiveTeam,
  isTeamStaff,
}: TeamSettingsAuthorityInput): boolean {
  return hasActiveTeam && isTeamStaff;
}
