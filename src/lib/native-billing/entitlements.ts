import { activeNativeEntitlement } from './catalog';
import { isEntitledSubscriptionStatus } from '@/lib/subscription-seat-policy';

type SeatGrant = { planType: string; entitled: boolean; capacity: number };
type StripeGrant = SeatGrant & {
  status: string; billingCycle: unknown; extraTeams: unknown;
  cancelAtPeriodEnd: unknown; trialEnd: unknown;
};

function storedStripeGrant(user: Record<string, any>): StripeGrant {
  if (user.stripe_seat_grant) return user.stripe_seat_grant;
  const status = user.stripe_subscription_status || user.subscription_status || 'inactive';
  return {
    planType: user.plan_type || 'free', capacity: Number(user.team_limit) || 0,
    entitled: Boolean(user.stripe_subscription_id && isEntitledSubscriptionStatus(status)),
    status, billingCycle: user.billing_cycle || 'monthly', extraTeams: user.extra_teams || 0,
    cancelAtPeriodEnd: user.cancel_at_period_end === true, trialEnd: user.trial_end || null,
  };
}

// Source-specific grants prevent cancellation on one store from revoking paid
// access on another. Capacity is the larger active grant, never their sum.
export function mergeBillingSources(
  user: Record<string, any>,
  input: SeatGrant & { source?: 'stripe' | 'revenuecat'; userUpdates: Record<string, unknown> },
  now = Date.now()
) {
  const updates = input.userUpdates;
  const native = activeNativeEntitlement(input.source === 'revenuecat' ? updates.native_subscription : user.native_subscription, now);
  const previous = storedStripeGrant(user);
  const stripe: StripeGrant = input.source === 'revenuecat' ? previous : {
    planType: input.planType, entitled: input.entitled, capacity: input.capacity,
    status: String(updates.subscription_status || 'inactive'),
    billingCycle: updates.billing_cycle ?? previous.billingCycle,
    extraTeams: updates.extra_teams ?? previous.extraTeams,
    cancelAtPeriodEnd: updates.cancel_at_period_end ?? previous.cancelAtPeriodEnd,
    trialEnd: updates.trial_end ?? null,
  };
  const useNative = Boolean(native && (!stripe.entitled || native.capacity > stripe.capacity));
  const grant: SeatGrant = useNative
    ? { planType: native!.plan, entitled: true, capacity: native!.capacity }
    : stripe.entitled
      ? { planType: stripe.planType, entitled: true, capacity: stripe.capacity }
      : { planType: 'free', entitled: false, capacity: 0 };
  return {
    grant,
    updates: {
      ...updates,
      stripe_seat_grant: stripe,
      stripe_subscription_status: stripe.status,
      plan_type: grant.planType, team_limit: grant.capacity,
      subscription_status: useNative ? 'active' : stripe.status,
      billing_cycle: useNative ? native!.cycle : stripe.billingCycle,
      extra_teams: useNative ? 0 : stripe.extraTeams,
      cancel_at_period_end: useNative ? false : stripe.cancelAtPeriodEnd,
      trial_end: useNative ? null : stripe.trialEnd,
      billing_provider: useNative ? native!.store : stripe.entitled ? 'stripe' : null,
    },
  };
}

// Fail closed if an expiration webhook is delayed. Legacy web-only profiles
// keep their existing behavior until the first server reconciliation.
export function hasCurrentPaidSubscription(user: Record<string, any>, now = Date.now()) {
  if (user.billing_provider === 'app_store' || user.billing_provider === 'play_store') {
    return Boolean(activeNativeEntitlement(user.native_subscription, now));
  }
  return isEntitledSubscriptionStatus(user.subscription_status);
}
