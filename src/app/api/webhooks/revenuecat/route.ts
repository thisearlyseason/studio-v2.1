import { NextResponse } from 'next/server';
import { initializeFirebase } from '@/firebase';
import { doc, updateDoc, setDoc } from 'firebase/firestore';

/**
 * Authoritative mapping of RevenueCat Product IDs to internal Plans and Quotas.
 */
const PRODUCT_PLAN_MAP: Record<string, { planId: string; limit: number }> = {
  'squad_pro_monthly': { planId: 'squad_pro', limit: 1 },
  'squad_pro_annual': { planId: 'squad_pro', limit: 1 },
  'elite_teams_monthly': { planId: 'elite_teams', limit: 8 },
  'elite_teams_annual': { planId: 'elite_teams', limit: 8 },
  'elite_league_monthly': { planId: 'elite_league', limit: 20 },
  'elite_league_annual': { planId: 'elite_league', limit: 20 },
  'squad_organization_custom': { planId: 'squad_organization', limit: 100 },
};

/**
 * Next.js Route Handler for RevenueCat Webhooks.
 * Hardened with explicit JSON parsing error handling.
 */
export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    const webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
    
    if (webhookSecret && authHeader !== `Bearer ${webhookSecret}`) {
      console.warn('Unauthorized RevenueCat webhook attempt blocked.');
      return new Response('Unauthorized', { status: 401 });
    }

    let body;
    try {
      body = await req.json();
    } catch (e) {
      console.error('RevenueCat Webhook: Failed to parse request body as JSON');
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const event = body?.event;

    if (!event) {
      return NextResponse.json({ error: 'Invalid webhook payload structure' }, { status: 400 });
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
    // Return 500 only for unexpected runtime failures
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
