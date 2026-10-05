import { createHash } from 'node:crypto';

export type WebPushSubscriptionRecord = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

const MAX_ENDPOINT_LENGTH = 4_096;
const MAX_KEY_LENGTH = 512;
const KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

export function normalizeWebPushSubscription(value: unknown): WebPushSubscriptionRecord | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  if (
    typeof candidate.endpoint !== 'string' ||
    candidate.endpoint.length === 0 ||
    candidate.endpoint.length > MAX_ENDPOINT_LENGTH
  ) {
    return null;
  }

  try {
    const endpoint = new URL(candidate.endpoint);
    if (endpoint.protocol !== 'https:' || !endpoint.hostname || endpoint.username || endpoint.password) {
      return null;
    }
  } catch {
    return null;
  }

  const { p256dh, auth } = candidate.keys || {};
  if (
    typeof p256dh !== 'string' ||
    typeof auth !== 'string' ||
    p256dh.length === 0 ||
    auth.length === 0 ||
    p256dh.length > MAX_KEY_LENGTH ||
    auth.length > MAX_KEY_LENGTH ||
    !KEY_PATTERN.test(p256dh) ||
    !KEY_PATTERN.test(auth)
  ) {
    return null;
  }

  return { endpoint: candidate.endpoint, keys: { p256dh, auth } };
}

export function webPushSubscriptionId(subscription: WebPushSubscriptionRecord): string {
  return createHash('sha256').update(subscription.endpoint).digest('hex');
}
