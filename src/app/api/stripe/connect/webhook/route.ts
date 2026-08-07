import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe-client';
import {
  isSafeFirestoreId,
  storedPaymentSourceMatches,
  stripePaymentDocumentId,
} from '@/lib/stripe-connect-webhook-security';

/**
 * POST /api/stripe/connect/webhook
 *
 * Stripe Connect webhook handler — receives events from ALL connected accounts
 * (coaches' Stripe Express accounts). This is separate from /api/webhook which
 * handles platform-level subscription events.
 *
 * This endpoint must be registered in Stripe Dashboard under:
 *   Connect → Webhooks → Add endpoint
 *
 * Required env var: STRIPE_CONNECT_WEBHOOK_SECRET
 *
 * Events handled:
 *   - checkout.session.completed  → creates a `payments` doc (payment_method: 'online')
 *   - payment_intent.succeeded    → updates existing payment doc to 'paid'
 *   - payment_intent.payment_failed → updates existing payment doc to 'failed'
 */

const CONNECT_WEBHOOK_SECRET = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
const MAX_BODY_SIZE = 512_000;

export async function POST(req: NextRequest) {
  // Guard oversized payloads
  const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
  if (contentLength > MAX_BODY_SIZE) {
    return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
  }

  const body = await req.text();
  if (body.length > MAX_BODY_SIZE) {
    return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
  }

  if (!CONNECT_WEBHOOK_SECRET) {
    console.error('[Connect Webhook] STRIPE_CONNECT_WEBHOOK_SECRET is not set.');
    return NextResponse.json({ error: 'Webhook secret not configured.' }, { status: 500 });
  }

  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header.' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(body, sig, CONNECT_WEBHOOK_SECRET);
  } catch (err: any) {
    console.error(`[Connect Webhook] Signature verification failed: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  // The connected account ID is in the event's account field
  const connectedAccountId = (event as any).account as string | undefined;

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session, connectedAccountId, event.id);
        break;
      }

      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await handlePaymentIntentSucceeded(pi, connectedAccountId, event.id);
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await handlePaymentIntentFailed(pi, connectedAccountId, event.id);
        break;
      }

      default:
        // Intentionally unhandled — not an error
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('[Connect Webhook] Processing error:', err.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

type VerifiedPaymentSource = { teamId: string; name: string };

async function resolveVerifiedPaymentSource(
  metadata: Stripe.Metadata | null | undefined,
  connectedAccountId: string | undefined,
  paymentLinkId?: string | null,
): Promise<VerifiedPaymentSource | null> {
  const teamId = metadata?.firebase_team_id;
  if (!isSafeFirestoreId(teamId) || !connectedAccountId) return null;

  const teamRef = adminDb.collection('teams').doc(teamId);
  if (!(await teamRef.get()).exists) return null;

  const paymentItemId = metadata?.firebase_payment_item_id;
  if (isSafeFirestoreId(paymentItemId)) {
    const itemSnap = await teamRef.collection('paymentItems').doc(paymentItemId).get();
    if (itemSnap.exists && storedPaymentSourceMatches(itemSnap.data()!, connectedAccountId, paymentLinkId)) {
      return { teamId, name: String(itemSnap.data()!.name || 'Online Payment') };
    }
  }

  const campaignId = metadata?.firebase_campaign_id;
  if (isSafeFirestoreId(campaignId)) {
    const campaignSnap = await teamRef.collection('fundraising').doc(campaignId).get();
    if (campaignSnap.exists && storedPaymentSourceMatches(campaignSnap.data()!, connectedAccountId, paymentLinkId)) {
      return { teamId, name: String(campaignSnap.data()!.title || 'Fundraising Donation') };
    }
  }

  // Legacy links did not include their Firestore item ID. A Payment Link ID is
  // still sufficient to bind the signed event to a stored source and account.
  if (paymentLinkId) {
    const itemQuery = await teamRef.collection('paymentItems')
      .where('stripePaymentLinkId', '==', paymentLinkId).limit(1).get();
    if (!itemQuery.empty) {
      const data = itemQuery.docs[0].data();
      if (storedPaymentSourceMatches(data, connectedAccountId, paymentLinkId)) {
        return { teamId, name: String(data.name || 'Online Payment') };
      }
    }

    const campaignQuery = await teamRef.collection('fundraising')
      .where('stripePaymentLinkId', '==', paymentLinkId).limit(1).get();
    if (!campaignQuery.empty) {
      const data = campaignQuery.docs[0].data();
      if (storedPaymentSourceMatches(data, connectedAccountId, paymentLinkId)) {
        return { teamId, name: String(data.title || 'Fundraising Donation') };
      }
    }
  }

  return null;
}

/**
 * Handles a completed Stripe Checkout session originating from a Payment Link
 * on a connected account. Creates or updates a `payments` Firestore doc.
 *
 * Idempotent: uses event.id as the Firestore document ID to prevent duplicates
 * on Stripe retries.
 */
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  connectedAccountId: string | undefined,
  eventId: string
) {
  const paymentLinkId = typeof session.payment_link === 'string'
    ? session.payment_link
    : session.payment_link?.id;
  const source = await resolveVerifiedPaymentSource(session.metadata, connectedAccountId, paymentLinkId);
  if (!source) {
    // This checkout session was not created through our payment items system;
    // could be a subscription session. Skip silently.
    return;
  }
  const { teamId } = source;

  const payerEmail = session.customer_details?.email ?? session.customer_email ?? '';
  const payerName = session.customer_details?.name ?? '';
  const amountTotal = session.amount_total ?? 0;
  const currency = session.currency ?? 'usd';

  // Fetch receipt URL from the payment intent (if available)
  let receiptUrl: string | null = null;
  try {
    if (session.payment_intent && connectedAccountId) {
      const stripe = getStripe();
      const pi = await stripe.paymentIntents.retrieve(
        session.payment_intent as string,
        { expand: ['latest_charge'] },
        { stripeAccount: connectedAccountId }
      );
      receiptUrl = (pi.latest_charge as Stripe.Charge)?.receipt_url ?? null;
    }
  } catch (err: any) {
    console.warn('[Connect Webhook] Could not fetch receipt URL:', err.message);
  }

  const now = new Date().toISOString();

  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id;
  const paymentDocId = stripePaymentDocumentId(paymentIntentId, eventId);
  const docRef = adminDb
    .collection('teams').doc(teamId)
    .collection('payments').doc(paymentDocId);

  await docRef.set(
    {
      id: paymentDocId,
      teamId,
      paymentItemName: source.name,
      payer_name: payerName,
      payer_email: payerEmail,
      amount: amountTotal,
      currency,
      payment_method: 'online',
      status: 'paid',
      stripe_session_id: session.id,
      stripe_receipt_url: receiptUrl,
      stripe_connect_account_id: connectedAccountId ?? null,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  console.log(`[Connect Webhook] Payment recorded for team ${teamId}: ${payerEmail} paid ${amountTotal} ${currency}`);
}

/**
 * Handles payment_intent.succeeded (belt-and-suspenders for Payment Links
 * that might not generate a checkout.session.completed event in all flows).
 */
async function handlePaymentIntentSucceeded(
  pi: Stripe.PaymentIntent,
  connectedAccountId: string | undefined,
  eventId: string
) {
  const source = await resolveVerifiedPaymentSource(pi.metadata, connectedAccountId);
  if (!source) return;
  const paymentDocId = stripePaymentDocumentId(pi.id, eventId);

  await adminDb
    .collection('teams').doc(source.teamId)
    .collection('payments').doc(paymentDocId)
    .set(
      {
        id: paymentDocId,
        teamId: source.teamId,
        payment_method: 'online',
        status: 'paid',
        amount: pi.amount_received,
        currency: pi.currency,
        payer_email: pi.receipt_email ?? '',
        payer_name: '',
        paymentItemName: source.name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
}

/**
 * Handles payment_intent.payment_failed — marks the payment record as failed.
 */
async function handlePaymentIntentFailed(
  pi: Stripe.PaymentIntent,
  connectedAccountId: string | undefined,
  eventId: string
) {
  const source = await resolveVerifiedPaymentSource(pi.metadata, connectedAccountId);
  if (!source) return;
  const paymentDocId = stripePaymentDocumentId(pi.id, eventId);

  await adminDb
    .collection('teams').doc(source.teamId)
    .collection('payments').doc(paymentDocId)
    .set(
      {
        id: paymentDocId,
        teamId: source.teamId,
        payment_method: 'online',
        status: 'failed',
        amount: pi.amount,
        currency: pi.currency,
        payer_email: pi.receipt_email ?? '',
        payer_name: '',
        paymentItemName: source.name,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
}
