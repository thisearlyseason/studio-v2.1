import { createHash } from 'node:crypto';

export const SIGNUP_TRIAL_DAYS = 5;
export const NEW_ACCOUNT_TRIAL_WINDOW_MS = 2 * 60 * 60 * 1000;

export function getTrialCountdown(input: {
  subscriptionStatus?: unknown;
  trialEnd?: unknown;
  now?: number;
}): { active: boolean; days: number; hours: number } {
  if (String(input.subscriptionStatus || '').toLowerCase() !== 'trialing') {
    return { active: false, days: 0, hours: 0 };
  }
  const end = typeof input.trialEnd === 'number'
    ? input.trialEnd
    : Date.parse(String(input.trialEnd || ''));
  const remaining = end - (input.now ?? Date.now());
  if (!Number.isFinite(end) || remaining <= 0) return { active: false, days: 0, hours: 0 };
  const totalHours = Math.ceil(remaining / (60 * 60 * 1000));
  return { active: true, days: Math.floor(totalHours / 24), hours: totalHours % 24 };
}
const BLOCKING_SUBSCRIPTION_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
  'paused',
]);

export function isBlockingSubscriptionStatus(status: unknown): boolean {
  return BLOCKING_SUBSCRIPTION_STATUSES.has(String(status || '').trim().toLowerCase());
}

export function hasUnresolvedSubscription(profile: Record<string, unknown>): boolean {
  const status = profile.subscriptionStatus ??
    profile.subscription_status ??
    profile.stripe_subscription_status;
  if (isBlockingSubscriptionStatus(status)) return true;
  if (['canceled', 'cancelled', 'ended', 'inactive', 'incomplete_expired'].includes(
    String(status || '').trim().toLowerCase()
  )) return false;
  return Boolean(profile.stripe_subscription_id || profile.stripeSubscriptionId);
}

export function calculateSignupTrialDays(input: {
  accountCreatedAt: number;
  now: number;
  hasStripeSubscriptionId: boolean;
  priorSubscriptionCount: number;
}): number {
  const accountAge = input.now - input.accountCreatedAt;
  const isNewAccount =
    Number.isFinite(input.accountCreatedAt) &&
    accountAge >= 0 &&
    accountAge <= NEW_ACCOUNT_TRIAL_WINDOW_MS;

  return isNewAccount &&
    !input.hasStripeSubscriptionId &&
    input.priorSubscriptionCount === 0
    ? SIGNUP_TRIAL_DAYS
    : 0;
}

export function hasBlockingSubscription(
  statuses: readonly string[]
): boolean {
  return statuses.some(isBlockingSubscriptionStatus);
}

export function buildCheckoutIdempotencyKey(input: {
  route: string;
  userId: string;
  priceId: string;
  billingCycle: 'monthly' | 'annual';
  quantity: number;
  teamId?: string | null;
  operationId?: string | null;
  now: number;
}): string {
  const retryScope =
    input.operationId || String(Math.floor(input.now / (30 * 60 * 1000)));
  const digest = createHash('sha256')
    .update([
      input.route,
      input.userId,
      input.priceId,
      input.billingCycle,
      String(input.quantity),
      input.teamId || '',
      input.operationId || '',
      retryScope,
    ].join(':'))
    .digest('hex');
  return `checkout-${digest}`;
}
