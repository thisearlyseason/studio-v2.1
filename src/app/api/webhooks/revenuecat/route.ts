
import { NextResponse } from 'next/server';
import { initializeFirebase } from '@/firebase';
import { doc, updateDoc, setDoc } from 'firebase/firestore';

/**
 * Authoritative mapping of RevenueCat Product IDs to internal Plans and Quotas.
 * Ensure these keys match your RevenueCat Product identifiers.
 */
const PRODUCT_PLAN_MAP: Record<string, { planId: string; limit: number }> = {
  'squad_pro_monthly': { planId: 'squad_pro', limit: 1 },
  'squad_pro_annual': { planId: 'squad_pro', limit: 1 },
  'squad_duo_monthly': { planId: 'squad_duo', limit: 2 },
  'squad_duo_annual': { planId: 'squad_duo', limit: 2 },
  'squad_crew_monthly': { planId: 'squad_crew', limit: 4 },
  'squad_crew_annual': { planId: 'squad_crew', limit: 4 },
  'squad_league_monthly': { planId: 'squad_league', limit: 9 },
  'squad_league_annual': { planId: 'squad_league', limit: 9 },
  'squad_division_monthly': { planId: 'squad_division', limit: 12 },
  'squad_division_annual': { planId: 'squad_division', limit: 12 },
  'squad_conference_monthly': { planId: 'squad_conference', limit: 15 },
  'squad_conference_annual': { planId: 'squad_conference', limit: 15 },
  'squad_organization_custom': { planId: 'squad_organization', limit: 100 },
};

/**
 * Next.js Route Handler for RevenueCat Webhooks.
 * This function synchronizes subscription state from RevenueCat to Firestore.
 * 
 * Path: /api/webhooks/revenuecat
 */
export async function POST(req: Request) {
  try {
    // 1. Signature Verification
    const authHeader = req.headers.get('Authorization');
    const webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
    
    if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
      console.warn('Unauthorized RevenueCat webhook attempt blocked.');
      return new Response('Unauthorized', { status: 401 });
    }

    const body = await req.json();
    const event = body.event;

    if (!event) {
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 });
    }

    const { 
      type: eventType, 
      app_user_id: userId, 
      product_id: productId 
    } = event;

    if (!userId) {
      return NextResponse.json({ message: 'No app_user_id provided, skipping sync' }, { status: 200 });
    }

    const { firestore } = initializeFirebase();

    // 2. Handle Event Logic
    switch (eventType) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'PRODUCT_CHANGE': {
        const plan = PRODUCT_PLAN_MAP[productId] || { planId: 'squad_pro', limit: 1 };

        await updateDoc(doc(firestore, 'users', userId), {
          activePlanId: plan.planId,
          proTeamLimit: plan.limit,
          planSource: 'revenuecat'
        });

        await setDoc(doc(firestore, 'subscriptions', userId), {
          userId,
          productId,
          entitlementActive: true,
          proTeamLimit: plan.limit,
          source: 'revenuecat',
          lastSyncedAt: new Date().toISOString()
        }, { merge: true });

        console.log(`Sync Success: User ${userId} updated to ${plan.planId} (Limit: ${plan.limit})`);
        break;
      }

      case 'EXPIRATION':
      case 'CANCELLATION': {
        await setDoc(doc(firestore, 'subscriptions', userId), {
          entitlementActive: false,
          lastSyncedAt: new Date().toISOString()
        }, { merge: true });

        await updateDoc(doc(firestore, 'users', userId), {
          activePlanId: 'starter_squad',
          proTeamLimit: 0
        });

        console.log(`Sync Expire: User ${userId} deactivation triggered.`);
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('RevenueCat Webhook processing failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
