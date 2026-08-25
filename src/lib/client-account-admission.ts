const ACCOUNT_SETUP_PATHS = new Set([
  '/login',
  '/signup',
  '/verify-email',
  '/onboarding',
]);

export function canStartProtectedAccountState(pathname: string): boolean {
  return !ACCOUNT_SETUP_PATHS.has(pathname);
}
