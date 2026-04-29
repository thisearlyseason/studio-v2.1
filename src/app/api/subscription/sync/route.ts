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
    const { userId } = await req.json();

    if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

    // Verify the caller owns this account
    const ownerCheck = assertOwner(auth, userId);
    if (ownerCheck) return ownerCheck;

    const stripe = getStripe();
    const { firestore } = initializeFirebase();
    const userRef = doc(firestore, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const userData = userSnap.data();
    const customerId = userData.stripe_customer_id;

    if (!customerId) {
      return NextResponse.json({ error: 'No Stripe customer associated with this account.' }, { status: 400 });
    }

    // List ALL subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 5,
    });

    if (subscriptions.data.length === 0) {
      return NextResponse.json({ message: 'No subscriptions found in Stripe.' });
    }

    const activeSub =
      subscriptions.data.find(s => ['active', 'trialing', 'incomplete'].includes(s.status)) ||
      subscriptions.data[0];

    let planType = userData.plan_type || 'free';
    let teamLimit = userData.team_limit || 1;
    let extraTeams = 0;

    for (const item of activeSub.items.data) {
      const resolved = PLAN_PRICE_MAP[item.price.id];
      if (resolved) {
        planType = resolved.id;
        teamLimit = resolved.teamLimit;
      } else if (
        item.price.id === EXTRA_TEAM_PRICE_IDS.monthly ||
        item.price.id === EXTRA_TEAM_PRICE_IDS.annual
      ) {
        extraTeams = item.quantity || 0;
      }
    }

    await updateDoc(userRef, {
      stripe_subscription_id: activeSub.id,
      subscription_status: activeSub.status,
      plan_type: planType,
      team_limit: teamLimit + extraTeams,
      extra_teams: extraTeams,
      last_webhook_sync: new Date().toISOString(),
    });

    // CASCADE: Update all teams
    try {
      const teamsSnap = await getDocs(query(collection(firestore, 'teams'), where('ownerUserId', '==', userId)));
      if (!teamsSnap.empty) {
        const batch = writeBatch(firestore);
        teamsSnap.docs.forEach(teamDoc => {
          batch.update(teamDoc.ref, {
            planId: planType,
            isPro: planType !== 'free',
            last_plan_sync: new Date().toISOString(),
          });
        });
        await batch.commit();
      }
    } catch (cascadeErr: any) {
      console.error('[subscription/sync] Team cascade error:', cascadeErr.message);
    }

    return NextResponse.json({ success: true, subscriptionId: activeSub.id });
  } catch (err: any) {
    console.error('[subscription/sync] Error:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
