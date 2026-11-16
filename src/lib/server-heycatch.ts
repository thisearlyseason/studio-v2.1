import { analytics } from '@heycatch/sdk';

analytics.init({ projectKey: 'hck_pk_APvOG4sebjLfK6k-1DXlNpFKJICaSF8m' });

export async function trackSubscriptionOutcome(eventName: 'subscription_started' | 'subscription_updated' | 'subscription_ended', outcome: { userId: string; planType: string; status: string; billingCycle: string | null }, eventId: string) {
  await analytics.setIdentity(outcome.userId, { plan: outcome.planType });
  await analytics.trackEvent(eventName, {
    plan: outcome.planType,
    status: outcome.status,
    billing_cycle: outcome.billingCycle,
    stripe_event_id: eventId,
  }, { userId: outcome.userId });
}
