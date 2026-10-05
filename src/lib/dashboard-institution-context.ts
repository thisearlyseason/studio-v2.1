import { authorizeDashboardRoute, type DashboardAccessProfile } from './dashboard-route-policy';
type InstitutionTeam = { type?: string; schoolAdminIds?: string[] } | null | undefined;

export function isSchoolInstitutionContext(team: InstitutionTeam, primaryAuthority: boolean, uid?: string): boolean {
  if (!team) return primaryAuthority;
  if (team.type !== 'school' && team.type !== 'school_hub') return false;
  return primaryAuthority || Boolean(uid && team.schoolAdminIds?.includes(uid));
}

export function schoolInstitutionLandingAllowed(team: InstitutionTeam, primaryAuthority: boolean, uid: string | undefined, profile: DashboardAccessProfile | null, claimsRole?: unknown): boolean {
  return isSchoolInstitutionContext(team, primaryAuthority, uid) &&
    authorizeDashboardRoute('/club', { ...profile, isPrimaryClubAuthority: primaryAuthority }, claimsRole).allowed;
}
