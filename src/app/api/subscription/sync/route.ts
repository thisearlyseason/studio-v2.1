import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { initializeFirebase } from '@/firebase/core';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-03-31.basil',
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const { firestore } = initializeFirebase();
    const userRef = doc(firestore, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const userData = userSnap.data();
    const customerId = userData.stripe_customer_id;

    if (!customerId) {
      return NextResponse.json({ error: 'No Stripe customer associated with this account' }, { status: 400 });
    }

    // List active subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1
    });

    if (subscriptions.data.length === 0) {
      return NextResponse.json({ message: 'No active subscriptions found in Stripe' });
    }

    const activeSub = subscriptions.data[0];

    // Force sync the subscription ID to Firestore
    await updateDoc(userRef, {
      stripe_subscription_id: activeSub.id,
      subscription_status: activeSub.status,
      last_webhook_sync: new Date().toISOString()
    });

    return NextResponse.json({ success: true, subscriptionId: activeSub.id });
  } catch (err: any) {
    console.error('[Sync Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
