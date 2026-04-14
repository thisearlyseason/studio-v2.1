import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { initializeFirebase } from '@/firebase/core';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy', {
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

    // List ALL subscriptions for this customer to find the newest valid one
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 5,
      expand: ['data.default_payment_method']
    });

    if (subscriptions.data.length === 0) {
      return NextResponse.json({ message: 'No active subscriptions found in Stripe' });
    }

    // Find the newest subscription that is active or trialing
    const activeSub = subscriptions.data.find(s => ['active', 'trialing', 'incomplete'].includes(s.status)) || subscriptions.data[0];

    // DEEP SYNC: Map items back to plan and add-ons
    const { PRICING_CONFIG, EXTRA_TEAM_CONFIG } = await import('@/lib/pricing');
    
    // Use a hardcoded map to avoid env var resolution issues in API routes.
    const PLAN_PRICE_MAP: Record<string, { id: string; teamLimit: number }> = {
      'price_1TL4qyGu1UxxOYbPen5QOIJv': { id: 'team', teamLimit: 1 },
      'price_1TL4qyGu1UxxOYbPxrnZKSd4': { id: 'team', teamLimit: 1 },
      'price_1TL4vCGu1UxxOYbPc9MX6y8L': { id: 'elite', teamLimit: 8 },
      'price_1TL4vCGu1UxxOYbPxiAlj9Jc': { id: 'elite', teamLimit: 8 },
      'price_1TL55yGu1UxxOYbPcQvc6AZV': { id: 'league', teamLimit: 18 },
      'price_1TL55yGu1UxxOYbPV7zlMKCQ': { id: 'league', teamLimit: 18 },
      'price_1TL58qGu1UxxOYbPOUPCAqdz': { id: 'school', teamLimit: 10 },
      'price_1TL58qGu1UxxOYbPWXLqlsyB': { id: 'school', teamLimit: 10 },
    };

    let planType = userData.plan_type || 'free';
    let teamLimit = userData.team_limit || 1;
    let extraTeams = 0;

    for (const item of activeSub.items.data) {
      const pId = item.price.id;
      console.log(`[Sync DEBUG] Checking Price ID: ${pId}`);
      
      const resolvedPlan = PLAN_PRICE_MAP[pId];
      if (resolvedPlan) {
        planType = resolvedPlan.id;
        teamLimit = resolvedPlan.teamLimit;
        console.log(`[Sync DEBUG] Mapped to plan: ${planType} (Limit: ${teamLimit})`);
      } else {
        console.warn(`[Sync DEBUG] Unrecognized Price ID: ${pId}`);
      }

      // Check if it's an extra team add-on
      const extraTeamMonthly = EXTRA_TEAM_CONFIG.monthlyPriceId || 'price_1TL5HSGu1UxxOYbPiidFB9NB';
      const extraTeamAnnual = EXTRA_TEAM_CONFIG.annualPriceId || 'price_1TL5HSGu1UxxOYbPl0Gqarxg';

      if (pId === extraTeamMonthly || pId === extraTeamAnnual) {
        extraTeams = item.quantity || 0;
        console.log(`[Sync DEBUG] Found ${extraTeams} extra squads`);
      }
    }

    // Force sync the subscription ID and derived plan data to Firestore
    await updateDoc(userRef, {
      stripe_subscription_id: activeSub.id,
      subscription_status: activeSub.status,
      plan_type: planType,
      team_limit: teamLimit,
      extra_teams: extraTeams,
      last_webhook_sync: new Date().toISOString()
    });

    // CASCADE: Update all teams owned by this user to reflect the new plan status
    try {
      const { collection, query, where, getDocs, writeBatch } = await import('firebase/firestore');
      const teamsRef = collection(firestore, 'teams');
      const q = query(teamsRef, where('ownerUserId', '==', userId));
      const teamsSnap = await getDocs(q);
      
      if (!teamsSnap.empty) {
        const batch = writeBatch(firestore);
        teamsSnap.docs.forEach(teamDoc => {
          batch.update(teamDoc.ref, {
            planId: planType,
            isPro: planType !== 'free',
            last_plan_sync: new Date().toISOString()
          });
        });
        await batch.commit();
        console.log(`[Sync CASCADE] Updated ${teamsSnap.size} squads for user ${userId}`);
      }
    } catch (cascadeErr: any) {
      console.error('[Sync CASCADE Error]:', cascadeErr);
      // We don't fail the whole sync if cascade fails, but we log it
    }

    return NextResponse.json({ success: true, subscriptionId: activeSub.id });
  } catch (err: any) {
    console.error('[Sync Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
