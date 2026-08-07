const ENTITLED_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);

export function isEntitledSubscriptionStatus(status: unknown): boolean {
  return typeof status === 'string' && ENTITLED_SUBSCRIPTION_STATUSES.has(status);
}

export function hasPendingSubscriptionUpdate(value: unknown): boolean {
  return Boolean(value && typeof value === 'object');
}

export function isActiveSubscriptionMutationLock(
  value: unknown,
  now: number
): boolean {
  if (!value || typeof value !== 'object') return false;
  const expiresAt = (value as { expiresAt?: unknown }).expiresAt;
  return (
    typeof expiresAt === 'number' &&
    Number.isFinite(expiresAt) &&
    expiresAt > now
  );
}

export function chooseAuthoritativeSubscriptionId(input: {
  eventSubscriptionId: string;
  subscriptions: ReadonlyArray<{
    id: string;
    status: unknown;
    created: number;
    hasRecognizedBasePlan: boolean;
  }>;
}): string {
  const entitled = input.subscriptions
    .filter(
      subscription =>
        subscription.hasRecognizedBasePlan &&
        isEntitledSubscriptionStatus(subscription.status)
    )
    .sort((a, b) => {
      const createdDifference = b.created - a.created;
      if (createdDifference !== 0) return createdDifference;
      return b.id.localeCompare(a.id);
    });
  return entitled[0]?.id || input.eventSubscriptionId;
}

export function choosePaidTeamIds(input: {
  allocatedTeamIds: readonly string[];
  selectedTeamId?: string | null;
  entitled: boolean;
  capacity: number;
}): string[] {
  if (!input.entitled) return [];

  const capacity = Number.isFinite(input.capacity)
    ? Math.max(0, Math.floor(input.capacity))
    : 0;
  if (capacity === 0) return [];

  const allocated = [...new Set(input.allocatedTeamIds.filter(Boolean))].sort();
  const candidates = input.selectedTeamId
    ? [
        input.selectedTeamId,
        ...allocated.filter(teamId => teamId !== input.selectedTeamId),
      ]
    : allocated;

  return candidates.slice(0, capacity);
}
