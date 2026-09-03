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

export async function requestPendingSchoolInviteClaim({
  getToken,
  getPathname,
  isCancelled,
  signal,
  request,
}: {
  getToken: () => Promise<string | null>;
  getPathname: () => string;
  isCancelled: () => boolean;
  signal: AbortSignal;
  request: (token: string, signal: AbortSignal) => Promise<Response>;
}): Promise<Response | null> {
  const token = await getToken();
  if (isCancelled() || !token || !canClaimPendingSchoolInvites(getPathname())) return null;
  return request(token, signal);
}
