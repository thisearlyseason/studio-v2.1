import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { supportsPublicPortals } from '@/lib/public-portal-data';
import { hasCurrentPaidSubscription } from '@/lib/native-billing/entitlements';

/** Resolve the competition's own billing scope; an unrelated paid team grants no access. */
export async function competitionHasPro(db: Firestore, transaction: Transaction | undefined, tenantId: string): Promise<boolean> {
  const read = (path: string) => transaction ? transaction.get(db.doc(path)) : db.doc(path).get();
  if (!tenantId.startsWith('profile:')) {
    return (await read(`teams/${tenantId}`)).data()?.isPro === true;
  }
  const profile = (await read(`users/${tenantId.slice(8)}`)).data();
  return Boolean(profile && supportsPublicPortals(profile.plan_type || profile.planId || profile.activePlanId) && hasCurrentPaidSubscription(profile));
}
