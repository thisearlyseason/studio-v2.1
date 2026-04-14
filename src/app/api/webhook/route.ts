import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { initializeFirebase } from '@/firebase/core';
import { doc, updateDoc, collection, query, where, getDocs, setDoc } from 'firebase/firestore';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy', {
  apiVersion: '2025-03-31.basil',
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

import { PRICING_CONFIG, EXTRA_TEAM_CONFIG } from '@/lib/pricing';

/**
 * Normalizes subscription data into Firestore.
 * Handles plan mapping, team limits, and add-on calculations.
 */
async function syncSubscriptionToFirestore(subscription: Stripe.Subscription) {
  const { firestore } = initializeFirebase();
  const customerId = subscription.customer as string;

  console.log(`[Webhook DEBUG] Syncing sub: ${subscription.id}, Customer: ${customerId}`);

  // 1. Identify User: Prioritize firebase_uid in metadata, then fallback to customer ID lookup
  let userId = subscription.metadata?.firebase_uid;
  console.log(`[Webhook DEBUG] Resolved userId from metadata: ${userId}`);
  
  if (!userId) {
    const usersRef = collection(firestore, 'users');
    const q = query(usersRef, where('stripe_customer_id', '==', customerId));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      userId = querySnapshot.docs[0].id;
      console.log(`[Webhook DEBUG] Resolved userId from customer index: ${userId}`);
    }
  }

  if (!userId) {
    console.warn(`[Webhook ERROR] Could not resolve userId for customer ${customerId}. Subscription: ${subscription.id}. Metadata: ${JSON.stringify(subscription.metadata)}`);
    return;
  }

  // 2. Identify Plan & Calculate Limits
  let planType = 'free';
  let baseLimit = 1;
  let extraTeams = 0;

  console.log(`[Webhook DEBUG] Subscription items:`, subscription.items.data.map(i => i.price.id));

  // Use a hardcoded map to avoid env var resolution issues in server contexts.
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

  for (const item of subscription.items.data) {
    const priceId = item.price.id;
    
    // Match against primary plans
    const resolvedPlan = PLAN_PRICE_MAP[priceId];
    
    if (resolvedPlan) {
      planType = resolvedPlan.id;
      baseLimit = resolvedPlan.teamLimit;
      console.log(`[Webhook DEBUG] Matched primary plan: ${planType} (Limit: ${baseLimit})`);
    } 
    // Match against add-ons
    else if (priceId === EXTRA_TEAM_CONFIG.monthlyPriceId || priceId === EXTRA_TEAM_CONFIG.annualPriceId) {
      extraTeams += (item.quantity || 0);
      console.log(`[Webhook DEBUG] Found extra team add-ons: ${item.quantity}`);
    } else {
      console.warn(`[Webhook DEBUG] Unrecognized priceId: ${priceId}`);
    }
  }

  // 3. Update User Context
  const userRef = doc(firestore, 'users', userId);
  const status = subscription.status;
  const isActive = status === 'active' || status === 'past_due' || status === 'trialing';

  console.log(`[Webhook DEBUG] Updating Firestore for ${userId}. Status: ${status}, Plan: ${planType}, Limit: ${baseLimit + extraTeams}`);

  try {
    await updateDoc(userRef, {
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customerId,
      subscription_status: status,
      plan_type: isActive ? planType : 'free',
      team_limit: isActive ? (baseLimit + extraTeams) : 1,
      extra_teams: extraTeams,
      last_webhook_sync: new Date().toISOString()
    });

    // CASCADE: Update all teams owned by this user to reflect the new plan status
    try {
      const teamsRef = collection(firestore, 'teams');
      const q = query(teamsRef, where('ownerUserId', '==', userId));
      const teamsSnap = await getDocs(q);
      
      if (!teamsSnap.empty) {
        const batch = writeBatch(firestore);
        teamsSnap.docs.forEach(teamDoc => {
          batch.update(teamDoc.ref, {
            planId: planType,
            isPro: isActive && planType !== 'free',
            last_plan_sync: new Date().toISOString()
          });
        });
        await batch.commit();
        console.log(`[Webhook CASCADE] Updated ${teamsSnap.size} squads for user ${userId}`);
      }
    } catch (cascadeErr: any) {
      console.error('[Webhook CASCADE Error]:', cascadeErr.message);
    }
  } catch (err: any) {
    console.error(`[Webhook ERROR] Failed to update user doc ${userId}:`, err.message);
    // If updateDoc fails because doc doesn't exist, we skip
    if (err.code === 'not-found') return;
  }

  // 4. Persistence for secondary audit log
  try {
    const subDocRef = doc(firestore, 'subscriptions', subscription.id);
    await setDoc(subDocRef, {
      userId,
      customerId,
      status,
      planType,
      teamLimit: baseLimit + extraTeams,
      extraTeams,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (err: any) {
    console.error(`[Webhook ERROR] Failed to update audit log:`, err.message);
  }

  console.log(`[Webhook SUCCESS] User ${userId} is now ${planType} (${status})`);
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;

  console.log(`[Webhook] Received POST request. Signature length: ${sig?.length || 0}`);

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
  } catch (err: any) {
    console.error(`[Webhook Error Signature]: ${err.message}. Ensure STRIPE_WEBHOOK_SECRET is correct.`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  console.log(`[Webhook] Event verified: ${event.type} (ID: ${event.id})`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`[Webhook] Checkout session completed: ${session.id}, User: ${session.metadata?.firebase_uid}`);
        if (session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          // Prioritize metadata from session if subscription doesn't have it
          if (!subscription.metadata?.firebase_uid && session.metadata?.firebase_uid) {
             subscription.metadata = { ...subscription.metadata, firebase_uid: session.metadata.firebase_uid };
          }
          await syncSubscriptionToFirestore(subscription);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await syncSubscriptionToFirestore(subscription);
        break;
      }

      case 'invoice.paid':
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          await syncSubscriptionToFirestore(subscription);
        }
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error(`[Webhook Process Error]: ${err.message}`);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
