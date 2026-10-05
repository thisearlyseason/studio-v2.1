import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, assertNonAnonymous } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { enforceUserRateLimit, readJsonBodyWithLimit } from '@/lib/server-request-guards';
import { nativeBillingEnabled, syncNativeBilling } from '@/lib/native-billing/server';
import { activeNativeEntitlement, nativeProductIds } from '@/lib/native-billing/catalog';
import { isBlockingSubscriptionStatus } from '@/lib/checkout-policy';
import { isAccountAccessBlocked } from '@/lib/account-access-policy';
export const runtime = 'nodejs';
export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  const anonymous = assertNonAnonymous(auth); if (anonymous) return anonymous;
  const rate = await enforceUserRateLimit(auth.uid, 'native-billing-session', 60, 60_000); if (rate) return rate;
  if (!nativeBillingEnabled(auth.uid)) return NextResponse.json({error:'In-app subscriptions are not available yet.'},{status:503});
  try {
    const { platform, action } = await readJsonBodyWithLimit<{platform?:string;action?:string}>(req, 2048);
    if (!['ios','android'].includes(platform || '') || !['catalog','purchase','restore','manage'].includes(action || '')) return NextResponse.json({error:'Invalid request'},{status:400});
    let user = (await adminDb.collection('users').doc(auth.uid).get()).data();
    if (!user || user.isDemo || isAccountAccessBlocked(user)) return NextResponse.json({error:'A registered active account is required.'},{status:403});
    if (action === 'purchase' || action === 'catalog') {
      await syncNativeBilling(auth.uid);
      user = (await adminDb.collection('users').doc(auth.uid).get()).data();
      if (!user || isAccountAccessBlocked(user)) return NextResponse.json({error:'Account unavailable.'},{status:403});
    }
    const existing = Boolean(user.pendingCheckout) ||
      Boolean(user.stripe_subscription_id && isBlockingSubscriptionStatus(user.stripe_subscription_status || user.subscription_status)) ||
      Boolean(activeNativeEntitlement(user.native_subscription));
    if (action === 'purchase' && existing) return NextResponse.json({error:'You already have a subscription. Manage your existing subscription to make changes.'},{status:409});
    const apiKey = platform === 'ios' ? process.env.REVENUECAT_IOS_PUBLIC_KEY : process.env.REVENUECAT_ANDROID_PUBLIC_KEY;
    if (!apiKey || !(platform === 'ios' ? apiKey.startsWith('appl_') : apiKey.startsWith('goog_'))) return NextResponse.json({error:'Store billing is not configured.'},{status:503});
    return NextResponse.json({ userId:auth.uid, apiKey, offering:'the_squad_v1', productIds:nativeProductIds(platform as 'ios'|'android'), existingSubscription:existing },{headers:{'Cache-Control':'no-store'}});
  } catch { return NextResponse.json({error:'Unable to prepare billing.'},{status:400}); }
}
