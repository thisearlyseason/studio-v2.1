import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe-client';
import { assertNonAnonymous, verifyFirebaseToken } from '@/lib/api-auth';
import { expectsManaged, managedSaasEnabled, managedSubscriptionChangesEnabled, managedPortalAccess } from '@/lib/stripe-managed-checkout';

// Read only; identities come from verified auth, never from client parameters.
export async function GET(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  const anonymous = assertNonAnonymous(auth);
  if (anonymous) return anonymous;
  try {
    const snapshot = await adminDb.collection('users').doc(auth.uid).get();
    if (!snapshot.exists) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const profile = snapshot.data()!;
    let managedSubscription = false;
    let portalAccess = { portalAllowed: true, paymentMethodUpdateAllowed: true };
    if (profile.stripe_subscription_id) {
      const subscription = await getStripe().subscriptions.retrieve(profile.stripe_subscription_id);
      const customer = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
      if (!profile.stripe_customer_id || customer !== profile.stripe_customer_id ||
          (subscription.metadata?.firebase_uid && subscription.metadata.firebase_uid !== auth.uid)) {
        return NextResponse.json({ error: 'Subscription ownership could not be verified' }, { status: 409 });
      }
      managedSubscription = expectsManaged(subscription);
      portalAccess = await managedPortalAccess(getStripe(), subscription);
    }
    const enabled = managedSubscriptionChangesEnabled();
    return NextResponse.json({
      portalAllowed: portalAccess.portalAllowed,
      paymentMethodUpdateAllowed: portalAccess.paymentMethodUpdateAllowed,
      planChangesAllowed: !managedSubscription || (managedSaasEnabled() && enabled),
      addonsAllowed: managedSubscription ? (managedSaasEnabled() && enabled) : (profile.stripe_subscription_id ? true : (!managedSaasEnabled() || enabled)),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'Subscription capabilities unavailable' }, { status: 503 });
  }
}
