import { EXTRA_TEAM_PRICE_IDS, PLAN_PRICE_MAP } from '@/lib/stripe-price-map';
import { isEntitledSubscriptionStatus } from '@/lib/subscription-seat-policy';

export type SubscriptionItemLike = {
  price: { id: string };
  quantity?: number | null;
};

export type SubscriptionLike = {
  id: string;
  status: string;
  created?: number;
  items: { data: SubscriptionItemLike[] };
};

export type SubscriptionEntitlements = {
  planType: string;
  teamLimit: number;
  extraTeams: number;
  subscriptionStatus: string;
  isEntitled: boolean;
};

export function resolveSubscriptionEntitlements(
  subscription: SubscriptionLike,
): SubscriptionEntitlements {
  let paidPlan: { id: string; teamLimit: number } | null = null;
  let extraTeams = 0;

  for (const item of subscription.items.data) {
    const resolvedPlan = PLAN_PRICE_MAP[item.price.id];
    if (resolvedPlan) {
      paidPlan = resolvedPlan;
      continue;
    }
    if (
      item.price.id === EXTRA_TEAM_PRICE_IDS.monthly ||
      item.price.id === EXTRA_TEAM_PRICE_IDS.annual
    ) {
      extraTeams += Math.max(0, item.quantity || 0);
    }
  }

  const isEntitled = isEntitledSubscriptionStatus(subscription.status) && paidPlan !== null;
  return {
    planType: isEntitled ? paidPlan!.id : 'free',
    teamLimit: isEntitled ? paidPlan!.teamLimit + extraTeams : 1,
    extraTeams: isEntitled ? extraTeams : 0,
    subscriptionStatus: subscription.status,
    isEntitled,
  };
}

export function selectSubscriptionForSync<T extends SubscriptionLike>(subscriptions: T[]): T | null {
  if (subscriptions.length === 0) return null;

  const newestFirst = [...subscriptions].sort((a, b) => (b.created || 0) - (a.created || 0));
  return newestFirst.find(subscription => resolveSubscriptionEntitlements(subscription).isEntitled)
    || newestFirst[0];
}
