import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebase } from '@/firebase/core';
import { doc, getDoc, updateDoc, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { getStripe } from '@/lib/stripe-client';
import { verifyFirebaseToken, assertOwner } from '@/lib/api-auth';
import { PLAN_PRICE_MAP, EXTRA_TEAM_PRICE_IDS } from '@/lib/stripe-price-map';

export async function POST(req: NextRequest) {
  // Authenticate caller
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { userId, newPriceId } = await req.json();

    if (!userId || !newPriceId) {
      return NextResponse.json({ error: 'userId and newPriceId are required' }, { status: 400 });
    }

    // Verify the caller owns this account
    const ownerCheck = assertOwner(auth, userId);
    if (ownerCheck) return ownerCheck;

    // Validate the priceId is a known plan
    const resolvedPlan = PLAN_PRICE_MAP[newPriceId];
    if (!resolvedPlan) {
      return NextResponse.json({ error: 'Invalid priceId: not a recognized plan.' }, { status: 400 });
    }

    const stripe = getStripe();
    const { firestore } = initializeFirebase();

    const userRef = doc(firestore, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const subscriptionId = userSnap.data().stripe_subscription_id;
    if (!subscriptionId) {
      return NextResponse.json({ error: 'No active subscription found.' }, { status: 400 });
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Find the current base plan item
    const basePlanItem = subscription.items.data.find(item =>
      PLAN_PRICE_MAP[item.price.id] != null
    );

    if (!basePlanItem) {
      return NextResponse.json({ error: 'Could not find base plan item in subscription.' }, { status: 400 });
    }

    // Update the subscription item to the new price
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      items: [{ id: basePlanItem.id, price: newPriceId }],
      proration_behavior: 'always_invoice',
    });

    // Sync new plan to Firestore
    await updateDoc(userRef, {
      plan_type: resolvedPlan.id,
      team_limit: resolvedPlan.teamLimit,
      subscription_status: 'active',
      last_sync_method: 'direct_upgrade',
      last_webhook_sync: new Date().toISOString(),
    });

    // CASCADE: Update all teams owned by this user
    try {
      const teamsSnap = await getDocs(query(collection(firestore, 'teams'), where('ownerUserId', '==', userId)));
      if (!teamsSnap.empty) {
        const batch = writeBatch(firestore);
        teamsSnap.docs.forEach(teamDoc => {
          batch.update(teamDoc.ref, {
            planId: resolvedPlan.id,
            isPro: true,
            last_plan_sync: new Date().toISOString(),
          });
        });
        await batch.commit();
      }
    } catch (cascadeErr: any) {
      console.error('[subscription/update] Team cascade error:', cascadeErr.message);
    }

    return NextResponse.json({ success: true, subscription: updatedSubscription });
  } catch (err: any) {
    console.error('[subscription/update] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
