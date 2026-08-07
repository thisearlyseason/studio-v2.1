export type DashboardAccessProfile = {
  role?: string | null;
  plan_type?: string | null;
  planId?: string | null;
  activePlanId?: string | null;
  isPrimaryClubAuthority?: boolean;
};

type RouteDecision =
  | { allowed: true }
  | { allowed: false; redirectTo: string };

const PROTECTED_EXACT_PATHS = new Set([
  '/calendar', '/dashboard', '/drills', '/equipment', '/events', '/facilities',
  '/feed', '/files', '/fundraising', '/games', '/leagues', '/practice', '/pricing',
  '/roster', '/settings', '/team', '/tournaments', '/volunteers',
]);

const PROTECTED_PREFIXES = [
  '/admin', '/chats', '/club', '/coaches-corner', '/competition', '/dashboard',
  '/family', '/leagues/registration', '/manage-tournaments', '/teams/join', '/teams/new',
];

const STAFF_PREFIXES = [
  '/coaches-corner', '/equipment', '/facilities', '/fundraising',
  '/manage-tournaments', '/teams/new',
];

const MANAGEMENT_ROLES = new Set(['coach', 'admin', 'league_creator', 'superadmin']);
const INSTITUTION_PLANS = new Set(['elite', 'elite_teams', 'league', 'elite_league', 'school']);

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function normalizedRole(profile: DashboardAccessProfile | null, claimsRole?: unknown): string {
  const claim = typeof claimsRole === 'string' ? claimsRole : '';
  return String(claim || profile?.role || '').trim().toLowerCase();
}

function normalizedPlan(profile: DashboardAccessProfile | null): string {
  return String(profile?.plan_type || profile?.planId || profile?.activePlanId || 'free')
    .trim()
    .toLowerCase();
}

export function isProtectedDashboardPath(pathname: string): boolean {
  return PROTECTED_EXACT_PATHS.has(pathname) ||
    PROTECTED_PREFIXES.some(prefix => matchesPrefix(pathname, prefix));
}

export function isSensitiveDashboardPath(pathname: string): boolean {
  return matchesPrefix(pathname, '/admin') ||
    matchesPrefix(pathname, '/club') ||
    matchesPrefix(pathname, '/competition') ||
    matchesPrefix(pathname, '/dashboard/billing') ||
    matchesPrefix(pathname, '/family/payments') ||
    STAFF_PREFIXES.some(prefix => matchesPrefix(pathname, prefix));
}

export function authorizeDashboardRoute(
  pathname: string,
  profile: DashboardAccessProfile | null,
  claimsRole?: unknown,
): RouteDecision {
  const role = normalizedRole(profile, claimsRole);
  const isSuperAdmin = role === 'superadmin';
  const isManagement = MANAGEMENT_ROLES.has(role) || profile?.isPrimaryClubAuthority === true;

  if (matchesPrefix(pathname, '/admin')) {
    return isSuperAdmin ? { allowed: true } : { allowed: false, redirectTo: '/dashboard' };
  }

  if (matchesPrefix(pathname, '/family')) {
    return role === 'parent' || isSuperAdmin
      ? { allowed: true }
      : { allowed: false, redirectTo: '/dashboard' };
  }

  if (matchesPrefix(pathname, '/dashboard/billing')) {
    return isManagement ? { allowed: true } : { allowed: false, redirectTo: '/dashboard' };
  }

  if (matchesPrefix(pathname, '/club')) {
    const hasInstitutionAccess = isSuperAdmin || profile?.isPrimaryClubAuthority === true ||
      (isManagement && INSTITUTION_PLANS.has(normalizedPlan(profile)));
    return hasInstitutionAccess ? { allowed: true } : { allowed: false, redirectTo: '/dashboard' };
  }

  if (matchesPrefix(pathname, '/competition')) {
    const hasCompetitionAccess = isSuperAdmin || role === 'league_creator' ||
      (isManagement && ['league', 'elite_league', 'school'].includes(normalizedPlan(profile)));
    return hasCompetitionAccess ? { allowed: true } : { allowed: false, redirectTo: '/dashboard' };
  }

  if (STAFF_PREFIXES.some(prefix => matchesPrefix(pathname, prefix))) {
    return isManagement ? { allowed: true } : { allowed: false, redirectTo: '/dashboard' };
  }

  return { allowed: true };
}
