import { randomUUID, timingSafeEqual } from 'node:crypto';
import { adminDb } from '@/lib/firebase-admin';
import { reconcilePaidTeamSeats } from '@/lib/server-subscription-seats';
import { claimSubscriptionMutation, releaseSubscriptionMutation } from '@/lib/server-subscription-mutation-lock';
import { resolveNativeEntitlement } from './catalog';
import { isAccountAccessBlocked } from '@/lib/account-access-policy';

export function nativeBillingEnabled(uid?: string) {
  if (!process.env.REVENUECAT_SERVER_API_KEY) return false;
  if (process.env.NATIVE_BILLING_ENABLED === 'true') return true;
  // Allow a verified test account to finish store QA before customer launch.
  const testers = (process.env.NATIVE_BILLING_TEST_USER_IDS || '').split(',').map(value => value.trim()).filter(Boolean);
  return process.env.NATIVE_BILLING_ALLOW_SANDBOX === 'true' && Boolean(uid && testers.includes(uid));
}
export function validWebhookAuthorization(value: string | null) {
  const secret = process.env.REVENUECAT_WEBHOOK_AUTHORIZATION;
  if (!secret || secret.length < 32 || !value) return false;
  const a = Buffer.from(secret), b = Buffer.from(value);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function syncNativeBilling(uid: string, selectedTeamId?: string) {
  if (!nativeBillingEnabled(uid)) throw new Error('Native billing is not configured');
  const userRef = adminDb.collection('users').doc(uid);
  const key = `revenuecat:${randomUUID()}`;
  await claimSubscriptionMutation(userRef, key);
  try {
    const user = (await userRef.get()).data();
    if (!user || user.isDemo || isAccountAccessBlocked(user)) throw new Error('Account unavailable');
    if (selectedTeamId) {
      const team = (await adminDb.collection('teams').doc(selectedTeamId).get()).data();
      if (!team || team.ownerUserId !== uid || team.isDemo) throw new Error('Team unavailable');
    }
    const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
      // The v1 subscriber read accepts an existing SDK key. No catalog-writing
      // setup key or unrestricted secret key is required for verification.
      headers: { Authorization: `Bearer ${process.env.REVENUECAT_SERVER_API_KEY}`, Accept: 'application/json' },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    // A provider error must never downgrade a subscriber.
    if (!response.ok) throw new Error('Subscription provider unavailable');
    const sandboxUsers = (process.env.NATIVE_BILLING_TEST_USER_IDS || '').split(',').map(value => value.trim());
    const allowSandbox = process.env.NATIVE_BILLING_ALLOW_SANDBOX === 'true' && sandboxUsers.includes(uid);
    const entitlement = resolveNativeEntitlement(await response.json(), Date.now(), allowSandbox);
    // Browsing plans or restoring an empty receipt must not rewrite accounts
    // that have never had a native subscription (including existing beta access).
    if (entitlement.capacity === 0 && !user.native_subscription) return { active: false, ...entitlement };
    await reconcilePaidTeamSeats({
      userId: uid, planType: entitlement.plan, entitled: entitlement.capacity > 0,
      capacity: entitlement.capacity, selectedTeamId, requiredMutationKey: key,
      source: 'revenuecat', userUpdates: { native_subscription: entitlement, native_subscription_synced_at: new Date().toISOString() },
    });
    return { active: entitlement.capacity > 0, ...entitlement };
  } finally { await releaseSubscriptionMutation(userRef, key); }
}
