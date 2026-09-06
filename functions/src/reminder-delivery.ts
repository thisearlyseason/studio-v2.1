export type WebPushSubscription = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

type ReminderProfile = {
  role?: unknown;
  notificationsEnabled?: unknown;
  upcomingEventNotificationsEnabled?: unknown;
  fcmTokens?: unknown;
  webPushSubscriptions?: unknown;
};

type ReminderDeliveryState = {
  status?: unknown;
  leaseExpiresAt?: unknown;
};

function validFcmToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 4_096;
}

function validWebPushSubscription(value: unknown): value is WebPushSubscription {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof candidate.endpoint !== 'string' || candidate.endpoint.length === 0 || candidate.endpoint.length > 4_096) return false;
  try {
    const endpoint = new URL(candidate.endpoint);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) return false;
  } catch {
    return false;
  }
  return typeof candidate.keys?.p256dh === 'string' && candidate.keys.p256dh.length > 0 &&
    typeof candidate.keys?.auth === 'string' && candidate.keys.auth.length > 0;
}

/**
 * Select delivery transports after applying the schedule recipient policy.
 * The PWA stores standards Web Push subscriptions, while older installations
 * can still have FCM registrations; either transport is eligible.
 */
export function selectReminderDeliveryTargets(profile: ReminderProfile): {
  fcmTokens: string[];
  webPushSubscriptions: WebPushSubscription[];
} {
  if (!['parent', 'adult_player', 'youth_player'].includes(String(profile.role || '')) ||
    profile.notificationsEnabled === false || profile.upcomingEventNotificationsEnabled === false) {
    return { fcmTokens: [], webPushSubscriptions: [] };
  }
  const fcmTokens = Array.isArray(profile.fcmTokens)
    ? [...new Set(profile.fcmTokens.filter(validFcmToken))]
    : [];
  const subscriptions = Array.isArray(profile.webPushSubscriptions)
    ? profile.webPushSubscriptions.filter(validWebPushSubscription)
    : [];
  const seenEndpoints = new Set<string>();
  const webPushSubscriptions = subscriptions.filter(subscription => {
    if (seenEndpoints.has(subscription.endpoint)) return false;
    seenEndpoints.add(subscription.endpoint);
    return true;
  });
  return { fcmTokens, webPushSubscriptions };
}

/** A completed send is terminal; failed and expired leases can retry. */
export function canClaimReminderDelivery(state: ReminderDeliveryState, nowMs: number): boolean {
  if (state.status === 'sent') return false;
  const leaseExpiresAt = typeof state.leaseExpiresAt === 'number' ? state.leaseExpiresAt : 0;
  return state.status !== 'processing' || leaseExpiresAt <= nowMs;
}
