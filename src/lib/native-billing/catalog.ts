import { PLAN_TEAM_LIMITS } from '@/lib/plan-catalog';

export const NATIVE_PLANS = ['team', 'elite', 'league', 'school'] as const;
export type NativePlan = typeof NATIVE_PLANS[number];
export const NATIVE_PRODUCTS = Object.fromEntries(NATIVE_PLANS.flatMap(plan =>
  (['monthly', 'annual'] as const).map(cycle => [
    `pro.thesquad.${plan}.${cycle}`,
    { plan, cycle, capacity: PLAN_TEAM_LIMITS[plan], entitlement: `squad_${plan}` },
  ])
));
export function nativeProductIds(platform: 'ios' | 'android') {
  // Purchase availability is separate from receipt recognition: removing an
  // option from sale must never remove an existing customer's paid access.
  return Object.entries(NATIVE_PRODUCTS)
    .filter(([, product]) => product.cycle === 'monthly' || product.plan === 'team')
    .map(([id, product]) =>
    platform === 'android' ? `${id}:${product.cycle}` : id);
}
export type NativeEntitlement = {
  plan: string; capacity: number; expiresAt: string | null;
  store: string | null; productId: string | null; cycle: string | null;
};
export const EMPTY_NATIVE_ENTITLEMENT: NativeEntitlement = {
  plan: 'free', capacity: 0, expiresAt: null, store: null, productId: null, cycle: null,
};
function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

// Only a server-to-server subscriber response may reach this resolver.
// Expiration is authoritative: cancelling renewal must not revoke paid time.
export function resolveNativeEntitlement(payload: unknown, now = Date.now(), allowSandbox = false): NativeEntitlement {
  const subscriber = record(record(payload)?.subscriber);
  const entitlements = record(subscriber?.entitlements), subscriptions = record(subscriber?.subscriptions);
  if (!entitlements || !subscriptions) throw new Error('Invalid subscriber response');
  let result = { ...EMPTY_NATIVE_ENTITLEMENT };
  for (const [id, product] of Object.entries(NATIVE_PRODUCTS)) {
    const entitlement = record(entitlements[product.entitlement]);
    const googleId = `${id}:${product.cycle}`;
    const subscription = record(subscriptions[id] || subscriptions[googleId]);
    if (!entitlement || ![id, googleId].includes(String(entitlement.product_identifier)) || !subscription) continue;
    if (!['app_store', 'play_store'].includes(String(subscription.store))) continue;
    if (subscription.store === 'app_store' && entitlement.product_identifier !== id) continue;
    if (subscription.store === 'play_store') {
      const basePlan = entitlement.product_plan_identifier || subscription.product_plan_identifier;
      if (basePlan && basePlan !== product.cycle) continue;
    }
    if (subscription.is_sandbox !== false && !(allowSandbox && subscription.is_sandbox === true)) continue;
    if (subscription.refunded_at) continue;
    const expiration = Date.parse(String(entitlement.expires_date));
    const grace = Date.parse(String(subscription.grace_period_expires_date));
    if (!Number.isFinite(expiration)) throw new Error('Invalid subscription expiration');
    const expires = Math.max(Number.isFinite(expiration) ? expiration : 0, Number.isFinite(grace) ? grace : 0);
    if (expires <= now || product.capacity < result.capacity) continue;
    result = { plan: product.plan, capacity: product.capacity, expiresAt: new Date(expires).toISOString(),
      productId: id, store: String(subscription.store), cycle: product.cycle };
  }
  return result;
}

export function activeNativeEntitlement(value: unknown, now = Date.now()): NativeEntitlement | null {
  const candidate = value as NativeEntitlement | null;
  if (!candidate?.productId || !candidate.expiresAt || Date.parse(candidate.expiresAt) <= now) return null;
  const product = NATIVE_PRODUCTS[candidate.productId];
  if (!product || candidate.plan !== product.plan || candidate.capacity !== product.capacity ||
    candidate.cycle !== product.cycle || !['app_store', 'play_store'].includes(candidate.store || '') ||
    !Number.isFinite(Date.parse(candidate.expiresAt))) return null;
  return candidate;
}
