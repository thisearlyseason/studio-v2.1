import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { initializeFirebase } from '@/firebase/core';
import { doc, getDoc } from 'firebase/firestore';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy', {
  apiVersion: '2025-03-31.basil',
});

export async function POST(req: NextRequest) {
  try {
    const { userId, newPriceId } = await req.json();

    if (!userId || !newPriceId) {
      return NextResponse.json({ error: 'userId and newPriceId are required' }, { status: 400 });
    }

    const { firestore } = initializeFirebase();
    const userRef = doc(firestore, 'users', userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const userData = userSnap.data();

    const subscriptionId = userData.stripe_subscription_id;
    if (!subscriptionId) return NextResponse.json({ error: 'No active subscription found' }, { status: 400 });

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    
    // Find the current plan item (the one that ISN'T an add-on)
    // In our setup, we could have multiple items, but the plan is usually the primary one.
    // We'll look for the item that doesn't correspond to an extra team price.
    const EXTRA_TEAM_PRICE_IDS = [
      process.env.STRIPE_PRICE_EXTRA_TEAM_MONTHLY,
      process.env.STRIPE_PRICE_EXTRA_TEAM_ANNUAL
    ];

    const planItem = subscription.items.data.find(item => !EXTRA_TEAM_PRICE_IDS.includes(item.price.id));

    if (!planItem) {
      return NextResponse.json({ error: 'Main plan item not found in subscription' }, { status: 400 });
    }

    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: planItem.id,
          price: newPriceId,
        },
      ],
      proration_behavior: 'always_invoice',
    });

    // IMMEDIATE FIRESTORE SYNC
    // Use a self-contained map to avoid env var resolution issues with dynamic imports.
    // These are the actual Stripe Price IDs from .env.local.
    const PLAN_PRICE_MAP: Record<string, { id: string; teamLimit: number }> = {
      // Pro Team
      'price_1TL4qyGu1UxxOYbPen5QOIJv': { id: 'team', teamLimit: 1 },
      'price_1TL4qyGu1UxxOYbPxrnZKSd4': { id: 'team', teamLimit: 1 },
      // Elite Teams
      'price_1TL4vCGu1UxxOYbPc9MX6y8L': { id: 'elite', teamLimit: 8 },
      'price_1TL4vCGu1UxxOYbPxiAlj9Jc': { id: 'elite', teamLimit: 8 },
      // Elite League
      'price_1TL55yGu1UxxOYbPcQvc6AZV': { id: 'league', teamLimit: 18 },
      'price_1TL55yGu1UxxOYbPV7zlMKCQ': { id: 'league', teamLimit: 18 },
      // Schools Plan
      'price_1TL58qGu1UxxOYbPOUPCAqdz': { id: 'school', teamLimit: 10 },
      'price_1TL58qGu1UxxOYbPWXLqlsyB': { id: 'school', teamLimit: 10 },
    };

    // Also resolve from env vars for flexibility
    const envPlanMap: Record<string, { id: string; teamLimit: number }> = {};
    const planEnvPairs = [
      { ids: [process.env.NEXT_PUBLIC_STRIPE_PRICE_TEAM_MONTHLY, process.env.NEXT_PUBLIC_STRIPE_PRICE_TEAM_ANNUAL], plan: { id: 'team', teamLimit: 1 } },
      { ids: [process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_MONTHLY, process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_TEAMS_ANNUAL], plan: { id: 'elite', teamLimit: 8 } },
      { ids: [process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_MONTHLY, process.env.NEXT_PUBLIC_STRIPE_PRICE_ELITE_LEAGUE_ANNUAL], plan: { id: 'league', teamLimit: 18 } },
      { ids: [process.env.NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_MONTHLY, process.env.NEXT_PUBLIC_STRIPE_PRICE_SCHOOLS_ANNUAL], plan: { id: 'school', teamLimit: 10 } },
    ];
    for (const { ids, plan } of planEnvPairs) {
      ids.forEach(id => { if (id) envPlanMap[id] = plan; });
    }

    const resolvedPlan = envPlanMap[newPriceId] || PLAN_PRICE_MAP[newPriceId];
    
    console.log(`[Update DEBUG] newPriceId: ${newPriceId}`);
    console.log(`[Update DEBUG] Resolved Plan:`, resolvedPlan);

    if (resolvedPlan) {
      const { updateDoc } = await import('firebase/firestore');
      await updateDoc(userRef, {
        plan_type: resolvedPlan.id,
        team_limit: resolvedPlan.teamLimit,
        subscription_status: 'active',
        last_sync_method: 'direct_upgrade'
      });
      console.log(`[Update SUCCESS] Upgraded user ${userId} to plan: ${resolvedPlan.id} (limit: ${resolvedPlan.teamLimit})`);

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
              planId: resolvedPlan.id,
              isPro: true,
              last_plan_sync: new Date().toISOString()
            });
          });
          await batch.commit();
          console.log(`[Update CASCADE] Updated ${teamsSnap.size} squads for user ${userId}`);
        }
      } catch (cascadeErr: any) {
        console.error('[Update CASCADE Error]:', cascadeErr);
      }
    } else {
      console.warn(`[Update ERROR] Could not map priceId ${newPriceId} to a known plan.`);
      // If we can't map it but it's clearly a high-value plan (by ID pattern or metadata), 
      // we should consider if it's a new plan we forgot to map.
    }

    return NextResponse.json({ success: true, subscription: updatedSubscription });
  } catch (err: any) {
    console.error('[Subscription Update Error]:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
