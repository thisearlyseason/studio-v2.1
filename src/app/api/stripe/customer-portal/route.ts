import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebase } from '@/firebase/core';
import { doc, getDoc } from 'firebase/firestore';
import { getStripe } from '@/lib/stripe-client';
import { verifyFirebaseToken, assertOwner } from '@/lib/api-auth';

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { userId } = await req.json();

    if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

    const ownerCheck = assertOwner(auth, userId);
    if (ownerCheck) return ownerCheck;

    const stripe = getStripe();
    const { firestore } = initializeFirebase();
    const userSnap = await getDoc(doc(firestore, 'users', userId));

    if (!userSnap.exists()) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const stripeCustomerId: string | undefined = userSnap.data().stripe_customer_id;

    if (!stripeCustomerId) {
      return NextResponse.json({
        error: 'No Stripe customer found for this user. Please subscribe first.',
      }, { status: 400 });
    }

    const origin =
      req.headers.get('origin') ?? process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:9002';

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${origin}/settings`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err: any) {
    console.error('[stripe/customer-portal] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
