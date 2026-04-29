import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { initializeFirebase } from '@/firebase/core';
import { doc, updateDoc, collection, query, where, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { getStripe } from '@/lib/stripe-client';
import { PLAN_PRICE_MAP, EXTRA_TEAM_PRICE_IDS } from '@/lib/stripe-price-map';

// Webhook endpoint secret — must be set; no silent fallback
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

/** Max body size: 512KB. Stripe events are typically <64KB. */
const MAX_BODY_SIZE = 512_000;

/**
 * Normalizes subscription data into Firestore user doc + audit log.
 * Called by all subscription lifecycle events.
 */
async function syncSubscriptionToFirestore(subscription: Stripe.Subscription) {
  const { firestore } = initializeFirebase();
  const customerId = subscription.customer as string;

  // 1. Identify User — prefer firebase_uid metadata, fall back to customer index
  let userId = subscription.metadata?.firebase_uid;

  if (!userId) {
    const usersSnap = await getDocs(
      query(collection(firestore, 'users'), where('stripe_customer_id', '==', customerId))
    );
    if (!usersSnap.empty) userId = usersSnap.docs[0].id;
  }

  if (!userId) {
    console.error(`[Webhook] Could not resolve userId for customer ${customerId}, sub ${subscription.id}`);
    return;
  }

  // 2. Map subscription items to plan + add-ons
  let planType = 'free';
  let baseLimit = 1;
  let extraTeams = 0;

  for (const item of subscription.items.data) {
    const priceId = item.price.id;
    const resolved = PLAN_PRICE_MAP[priceId];
    if (resolved) {
      planType = resolved.id;
      baseLimit = resolved.teamLimit;
    } else if (
      priceId === EXTRA_TEAM_PRICE_IDS.monthly ||
      priceId === EXTRA_TEAM_PRICE_IDS.annual
    ) {
      extraTeams += item.quantity || 0;
    } else {
      console.warn(`[Webhook] Unrecognized priceId: ${priceId} — add to stripe-price-map.ts`);
    }
  }

  const status = subscription.status;
  const isActive = status === 'active' || status === 'past_due' || status === 'trialing';
  const userRef = doc(firestore, 'users', userId);

  // 3. Update user plan data
  try {
    await updateDoc(userRef, {
      stripe_subscription_id: subscription.id,
      stripe_customer_id: customerId,
      subscription_status: status,
      plan_type: isActive ? planType : 'free',
      team_limit: isActive ? baseLimit + extraTeams : 1,
      extra_teams: extraTeams,
      last_webhook_sync: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error(`[Webhook] Failed to update user doc ${userId}:`, err.message);
    if (err.code === 'not-found') return;
  }

  // 4. CASCADE: Update all teams owned by this user (chunked to stay under 500-op limit)
  try {
    const teamsSnap = await getDocs(
      query(collection(firestore, 'teams'), where('ownerUserId', '==', userId))
    );

    if (!teamsSnap.empty) {
      // Chunk into groups of 400 to stay well under Firestore's 500-op batch limit
      const CHUNK = 400;
      for (let i = 0; i < teamsSnap.docs.length; i += CHUNK) {
        const chunk = teamsSnap.docs.slice(i, i + CHUNK);
        const batch = writeBatch(firestore);
        chunk.forEach(teamDoc => {
          batch.update(teamDoc.ref, {
            planId: isActive ? planType : 'free',
            isPro: isActive && planType !== 'free',
            last_plan_sync: new Date().toISOString(),
          });
        });
        await batch.commit();
      }
    }
  } catch (cascadeErr: any) {
    console.error('[Webhook] Team cascade error:', cascadeErr.message);
  }

  // 5. Write secondary audit log (server-side only — Firestore rules block client writes)
  try {
    await setDoc(
      doc(firestore, 'subscriptions', subscription.id),
      {
        userId,
        customerId,
        status,
        planType,
        teamLimit: baseLimit + extraTeams,
        extraTeams,
        // current_period_end may be on subscription.items in newer Stripe API versions
        currentPeriodEnd: (() => {
          const ts = (subscription as any).current_period_end
            ?? subscription.items?.data?.[0]?.current_period_end;
          return ts ? new Date(ts * 1000).toISOString() : new Date().toISOString();
        })(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err: any) {
    console.error('[Webhook] Failed to write audit log:', err.message);
  }
}

export async function POST(req: NextRequest) {
  // Guard: reject oversized payloads before reading body
  const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_BODY_SIZE) {
    return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
  }

  const body = await req.text();

  // Secondary size guard (content-length header can be spoofed)
  if (body.length > MAX_BODY_SIZE) {
    return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
  }

  if (!endpointSecret) {
    console.error('[Webhook] STRIPE_WEBHOOK_SECRET is not set. Cannot verify webhook signatures.');
    return NextResponse.json({ error: 'Webhook secret not configured.' }, { status: 500 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header.' }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
  } catch (err: any) {
    console.error(`[Webhook] Signature verification failed: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const stripe = getStripe();
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          // Propagate firebase_uid from session metadata if not on subscription
          if (!subscription.metadata?.firebase_uid && session.metadata?.firebase_uid) {
            subscription.metadata = {
              ...subscription.metadata,
              firebase_uid: session.metadata.firebase_uid,
            };
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
        // In Stripe Dahlia API, subscription moved to invoice.parent.subscription_details.subscription
        const invoiceSubscriptionId =
          (invoice as any).subscription ||
          (invoice as any).parent?.subscription_details?.subscription;
        if (invoiceSubscriptionId) {
          const stripe = getStripe();
          const subscription = await stripe.subscriptions.retrieve(invoiceSubscriptionId as string);
          await syncSubscriptionToFirestore(subscription);
        }
        break;
      }

      default:
        // Intentionally unhandled — not an error
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('[Webhook] Processing error:', err.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
