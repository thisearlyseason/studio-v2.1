import type { AccountSessionDecision } from '@/lib/account-session-policy';

export function accountSessionRedirect(
  pathname: string,
  decision: AccountSessionDecision,
): string | null {
  if (!decision.allowed) return '/login?reason=unavailable';
  if (!decision.redirectTo || decision.redirectTo === pathname) return null;
  return decision.redirectTo;
}
