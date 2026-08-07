import { createHash } from 'node:crypto';

export const SIGNUP_TRIAL_DAYS = 5;
export const NEW_ACCOUNT_TRIAL_WINDOW_MS = 2 * 60 * 60 * 1000;
const BLOCKING_SUBSCRIPTION_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
  'paused',
]);

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
  return statuses.some(status => BLOCKING_SUBSCRIPTION_STATUSES.has(status));
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
