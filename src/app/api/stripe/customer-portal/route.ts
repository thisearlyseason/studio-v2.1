import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe-client';
import { verifyFirebaseToken, assertOwner } from '@/lib/api-auth';
import { resolvePortalCustomerId } from '@/lib/stripe-portal-customer';
import {
  enforceUserRateLimit,
  getTrustedAppOrigin,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const limited = await enforceUserRateLimit(auth.uid, 'stripe-customer-portal', 30, 60 * 60 * 1000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 4_000);
    const userId = body.userId;

    if (typeof userId !== 'string' || !userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

    const ownerCheck = assertOwner(auth, userId);
    if (ownerCheck) return ownerCheck;

    const stripe = getStripe();
    const userSnap = await adminDb.collection('users').doc(userId).get();

    if (!userSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userSnap.data()!;
    const stripeCustomerId = await resolvePortalCustomerId(stripe, userId, userData);

    if (!stripeCustomerId) {
      return NextResponse.json({
        error: 'We could not link this subscription to Stripe. Please refresh billing or contact support.',
      }, { status: 409 });
    }

    if (userData.stripe_customer_id !== stripeCustomerId) {
      await userSnap.ref.update({ stripe_customer_id: stripeCustomerId });
    }

    const origin = getTrustedAppOrigin(req);

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${origin}/dashboard/billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err: any) {
    if (err instanceof RequestBodyError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[stripe/customer-portal] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
