
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
  'squad_organization_custom': { planId: 'squad_organization', limit: 15 },
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
    // RevenueCat sends the webhook secret in the Authorization header as a Bearer token
    const authHeader = req.headers.get('Authorization');
    const webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
    
    // Safety: If a secret is configured in env, we must verify it.
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

    // app_user_id corresponds to the Firebase User UID passed during RC initialization
    if (!userId) {
      return NextResponse.json({ message: 'No app_user_id provided, skipping sync' }, { status: 200 });
    }

    // Use Client SDK for server-side operations (requires rules to allow or specialized configuration)
    const { firestore } = initializeFirebase();

    // 2. Handle Event Logic
    switch (eventType) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'PRODUCT_CHANGE': {
        const plan = PRODUCT_PLAN_MAP[productId] || { planId: 'squad_pro', limit: 1 };

        // Update User Profile (Authoritative state)
        // This is idempotent as it overwrites with the latest product state
        await updateDoc(doc(firestore, 'users', userId), {
          activePlanId: plan.planId,
          proTeamLimit: plan.limit,
          planSource: 'revenuecat'
        });

        // Sync Subscription collection (Historical/Mirror state)
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
        // Update Subscription status to inactive
        await setDoc(doc(firestore, 'subscriptions', userId), {
          entitlementActive: false,
          lastSyncedAt: new Date().toISOString()
        }, { merge: true });

        /**
         * RULE: "Never auto-downgrade"
         * We set the proTeamLimit to 0 in the user profile.
         * The application's TeamProvider detects this change and triggers the QuotaResolutionOverlay.
         * The user then manually confirms which teams return to the Starter tier.
         * No team data is ever deleted, ensuring a safe transition.
         */
        await updateDoc(doc(firestore, 'users', userId), {
          activePlanId: 'starter_squad',
          proTeamLimit: 0
        });

        console.log(`Sync Expire: User ${userId} entitlement deactivated. Quota resolution triggered.`);
        break;
      }

      default:
        // Acknowledge other event types (billing issues, transfers, etc.) without state changes
        break;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('RevenueCat Webhook processing failed:', error);
    // Returning 500 tells RevenueCat to retry the delivery later
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
