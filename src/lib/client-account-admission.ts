const ACCOUNT_SETUP_PATHS = new Set([
  '/login',
  '/signup',
  '/verify-email',
  '/onboarding',
]);

export function canStartProtectedAccountState(pathname: string): boolean {
  return !ACCOUNT_SETUP_PATHS.has(pathname);
}

export function canStartGlobalPlanCatalogState(pathname: string): boolean {
  return canStartProtectedAccountState(pathname) && pathname !== '/teams/join';
}

export function canStartSquadMembershipState(pathname: string): boolean {
  return canStartProtectedAccountState(pathname) && pathname !== '/teams/join';
}

export function canClaimPendingSchoolInvites(pathname: string): boolean {
  return pathname === '/teams/join';
}
