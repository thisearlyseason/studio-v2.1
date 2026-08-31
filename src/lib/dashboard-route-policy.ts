export type DashboardAccessProfile = {
  role?: string | null;
  plan_type?: string | null;
  planId?: string | null;
  activePlanId?: string | null;
  isPrimaryClubAuthority?: boolean;
};

type RouteSessionIdentity = {
  uid: string;
  role?: string;
  signInProvider?: string;
  selectedTeamId?: string;
};

type VerifiedRouteSessionIdentity = RouteSessionIdentity & {
  emailVerified: boolean;
};

type RouteAccountDecision =
  | { allowed: false; code: 'auth/account-unavailable' }
  | {
      allowed: true;
      redirectTo: '/onboarding' | '/teams/join' | null;
      profile: DashboardAccessProfile | null;
      institutionAuthority?: true;
      coachesCornerAuthority?: true;
    };

type RouteDecision =
  | { allowed: true }
  | { allowed: false; redirectTo: string };

type RouteAdmissionRedirect = {
  location: string;
  clearSession: boolean;
  reason?: 'expired';
  returnTo?: string;
};

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

const MANAGEMENT_ROLES = new Set(['coach', 'admin', 'league_creator']);
const INSTITUTION_PLANS = new Set(['elite', 'elite_teams', 'league', 'elite_league', 'school']);

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function normalizedRole(profile: DashboardAccessProfile | null, claimsRole?: unknown): string {
  const claim = typeof claimsRole === 'string' ? claimsRole : '';
  return String(claim || profile?.role || '').trim().toLowerCase();
}

function normalizedClaimRole(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
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
    matchesPrefix(pathname, '/family') ||
    STAFF_PREFIXES.some(prefix => matchesPrefix(pathname, prefix));
}

export function dashboardHomePresentation(role: unknown, pathname: string) {
  const leagueCreator = normalizedClaimRole(role) === 'league_creator';
  return {
    href: '/dashboard',
    label: leagueCreator ? 'Competition Hub' : 'Dashboard',
    active: pathname === '/dashboard',
  } as const;
}

export function showDashboardCoordinationTab(
  role: unknown,
  hasActiveTeam: boolean,
  tabName: string,
): boolean {
  if (normalizedClaimRole(role) !== 'league_creator') return true;
  if (tabName === 'Competition Hub') return false;
  return hasActiveTeam;
}

export function authorizeDashboardRoute(
  pathname: string,
  profile: DashboardAccessProfile | null,
  claimsRole?: unknown,
  institutionAuthority = false,
  coachesCornerAuthority = false,
): RouteDecision {
  const role = normalizedRole(profile, claimsRole);
  const isTrustedSuperAdmin = normalizedClaimRole(claimsRole) === 'superadmin';
  const isManagement = isTrustedSuperAdmin || MANAGEMENT_ROLES.has(role) ||
    profile?.isPrimaryClubAuthority === true;
  const deniedLanding = institutionAuthority || profile?.isPrimaryClubAuthority === true
    ? '/club'
    : role === 'parent'
        ? '/family'
        : '/dashboard';

  if (matchesPrefix(pathname, '/admin')) {
    return isTrustedSuperAdmin ? { allowed: true } : { allowed: false, redirectTo: deniedLanding };
  }

  if (matchesPrefix(pathname, '/family')) {
    return role === 'parent' || isTrustedSuperAdmin
      ? { allowed: true }
      : { allowed: false, redirectTo: deniedLanding };
  }

  if (matchesPrefix(pathname, '/dashboard/billing')) {
    return isManagement ? { allowed: true } : { allowed: false, redirectTo: deniedLanding };
  }

  if (matchesPrefix(pathname, '/club')) {
    const hasInstitutionAccess = isTrustedSuperAdmin || profile?.isPrimaryClubAuthority === true ||
      institutionAuthority === true;
    return hasInstitutionAccess ? { allowed: true } : { allowed: false, redirectTo: deniedLanding };
  }

  if (matchesPrefix(pathname, '/competition')) {
    const hasCompetitionAccess = isTrustedSuperAdmin || role === 'league_creator' ||
      (isManagement && ['league', 'elite_league', 'school'].includes(normalizedPlan(profile)));
    return hasCompetitionAccess ? { allowed: true } : { allowed: false, redirectTo: deniedLanding };
  }

  if (
    matchesPrefix(pathname, '/coaches-corner') &&
    role === 'league_creator' &&
    !isTrustedSuperAdmin &&
    coachesCornerAuthority !== true
  ) {
    return { allowed: false, redirectTo: deniedLanding };
  }

  if (STAFF_PREFIXES.some(prefix => matchesPrefix(pathname, prefix))) {
    return isManagement ? { allowed: true } : { allowed: false, redirectTo: deniedLanding };
  }

  return { allowed: true };
}

export async function resolveDashboardRouteRedirect(
  pathname: string,
  identity: RouteSessionIdentity,
  resolveAccountSession: (identity: RouteSessionIdentity) => Promise<RouteAccountDecision>,
): Promise<string | null> {
  const access = await resolveAccountSession(identity);
  if (!access.allowed) return '/login?reason=unavailable';
  if (access.redirectTo && access.redirectTo !== pathname) return access.redirectTo;

  const decision = authorizeDashboardRoute(
    pathname,
    access.profile,
    identity.role,
    access.institutionAuthority === true,
    access.coachesCornerAuthority === true,
  );
  return decision.allowed ? null : decision.redirectTo;
}

export async function runProtectedRouteAdmission<T>(
  request: {
    pathname: string;
    search: string;
    sessionCookie?: string;
  },
  dependencies: {
    verifySession(sessionCookie: string): Promise<VerifiedRouteSessionIdentity>;
    resolveAccountSession(identity: RouteSessionIdentity): Promise<RouteAccountDecision>;
    redirect(decision: RouteAdmissionRedirect): T;
    continueRequest(): T;
  },
): Promise<T> {
  if (!request.sessionCookie) {
    return dependencies.redirect({
      location: '/login',
      reason: 'expired',
      returnTo: `${request.pathname}${request.search}`,
      clearSession: false,
    });
  }

  let identity: VerifiedRouteSessionIdentity;
  try {
    identity = await dependencies.verifySession(request.sessionCookie);
    if (
      identity.signInProvider !== 'anonymous' &&
      identity.emailVerified !== true &&
      identity.role !== 'superadmin'
    ) {
      throw new Error('EMAIL_NOT_VERIFIED');
    }
  } catch {
    return dependencies.redirect({
      location: '/login',
      reason: 'expired',
      returnTo: `${request.pathname}${request.search}`,
      clearSession: true,
    });
  }

  if (isSensitiveDashboardPath(request.pathname)) {
    let redirectPath: string | null;
    try {
      redirectPath = await resolveDashboardRouteRedirect(
        request.pathname,
        identity,
        dependencies.resolveAccountSession,
      );
    } catch {
      return dependencies.redirect({
        location: '/login?reason=session-unavailable',
        clearSession: false,
      });
    }
    if (redirectPath) {
      return dependencies.redirect({ location: redirectPath, clearSession: false });
    }
  }

  return dependencies.continueRequest();
}
