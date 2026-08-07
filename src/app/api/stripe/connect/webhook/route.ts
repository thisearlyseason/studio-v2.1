import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe-client';
import { connectAccountOwnsTeam } from '@/lib/server-stripe-connect';

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
        await handleCheckoutCompleted(session, connectedAccountId);
        break;
      }

      case 'payment_intent.succeeded': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await handlePaymentIntentSucceeded(pi, connectedAccountId);
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object as Stripe.PaymentIntent;
        await handlePaymentIntentFailed(pi, connectedAccountId);
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

/**
 * Handles a completed Stripe Checkout session originating from a Payment Link
 * on a connected account. Creates or updates a `payments` Firestore doc.
 *
 * Idempotent: uses Stripe's payment-intent ID as the Firestore document ID so
 * checkout and payment-intent events for the same payment update one record.
 */
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  connectedAccountId: string | undefined
) {
  const teamId: string | undefined = session.metadata?.firebase_team_id;
  if (!teamId) {
    // This checkout session was not created through our payment items system;
    // could be a subscription session. Skip silently.
    return;
  }
  if (!(await connectAccountOwnsTeam(teamId, connectedAccountId))) {
    throw new Error('Connected account does not own the referenced team.');
  }

  const payerEmail = session.customer_details?.email ?? session.customer_email ?? '';
  const payerName = session.customer_details?.name ?? '';
  const amountTotal = session.amount_total ?? 0;
  const currency = session.currency ?? 'usd';

  // Fetch receipt URL from the payment intent (if available)
  let receiptUrl: string | null = null;
  let paymentIntentMetadata: Stripe.Metadata = {};
  try {
    if (session.payment_intent && connectedAccountId) {
      const stripe = getStripe();
      const pi = await stripe.paymentIntents.retrieve(
        session.payment_intent as string,
        { expand: ['latest_charge'] },
        { stripeAccount: connectedAccountId }
      );
      receiptUrl = (pi.latest_charge as Stripe.Charge)?.receipt_url ?? null;
      paymentIntentMetadata = pi.metadata || {};
    }
  } catch (err: any) {
    console.warn('[Connect Webhook] Could not fetch receipt URL:', err.message);
  }

  const now = new Date().toISOString();

  // Checkout and payment-intent events have different event IDs. The payment
  // intent is the stable identifier they share, so it prevents double records.
  const paymentIntentId = typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id;
  const paymentRecordId = paymentIntentId ?? session.id;
  const docRef = adminDb
    .collection('teams').doc(teamId)
    .collection('payments').doc(paymentRecordId);

  await docRef.set(
    {
      id: paymentRecordId,
      teamId,
      paymentItemName: session.metadata?.payment_item_category
        ? `${session.metadata.payment_item_category} payment`
        : 'Online Payment',
      payer_name: payerName,
      payer_email: payerEmail,
      amount: amountTotal,
      currency,
      payment_method: 'online',
      status: 'paid',
      stripe_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId ?? null,
      stripe_receipt_url: receiptUrl,
      stripe_connect_account_id: connectedAccountId ?? null,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  await recordFundraisingDonation({
    teamId,
    campaignId: session.metadata?.firebase_campaign_id || paymentIntentMetadata.firebase_campaign_id,
    paymentIntentId: paymentRecordId,
    amountCents: amountTotal,
    currency,
    payerName,
    payerEmail,
    receiptUrl,
    connectedAccountId,
  });

  console.log(`[Connect Webhook] Payment recorded for team ${teamId}: ${payerEmail} paid ${amountTotal} ${currency}`);
}

/**
 * Handles payment_intent.succeeded (belt-and-suspenders for Payment Links
 * that might not generate a checkout.session.completed event in all flows).
 */
async function handlePaymentIntentSucceeded(
  pi: Stripe.PaymentIntent,
  connectedAccountId: string | undefined
) {
  const teamId: string | undefined = pi.metadata?.firebase_team_id;
  if (!teamId) return;
  if (!(await connectAccountOwnsTeam(teamId, connectedAccountId))) {
    throw new Error('Connected account does not own the referenced team.');
  }

  // Only update — the checkout.session.completed handler is primary
  await adminDb
    .collection('teams').doc(teamId)
    .collection('payments').doc(pi.id)
    .set(
      {
        id: pi.id,
        teamId,
        payment_method: 'online',
        status: 'paid',
        amount: pi.amount_received,
        currency: pi.currency,
        stripe_payment_intent_id: pi.id,
        stripe_connect_account_id: connectedAccountId,
        payer_email: pi.receipt_email ?? '',
        payer_name: '',
        paymentItemName: 'Online Payment',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

  await recordFundraisingDonation({
    teamId,
    campaignId: pi.metadata?.firebase_campaign_id,
    paymentIntentId: pi.id,
    amountCents: pi.amount_received,
    currency: pi.currency,
    payerName: '',
    payerEmail: pi.receipt_email ?? '',
    receiptUrl: null,
    connectedAccountId,
  });
}

/**
 * Adds a verified donation and updates the campaign total exactly once.
 * Both Stripe checkout and payment-intent events call this helper, so the
 * deterministic donation ID and transaction prevent duplicate totals.
 */
async function recordFundraisingDonation({
  teamId,
  campaignId,
  paymentIntentId,
  amountCents,
  currency,
  payerName,
  payerEmail,
  receiptUrl,
  connectedAccountId,
}: {
  teamId: string;
  campaignId?: string;
  paymentIntentId: string;
  amountCents: number;
  currency: string;
  payerName: string;
  payerEmail: string;
  receiptUrl: string | null;
  connectedAccountId?: string;
}) {
  if (!campaignId || amountCents <= 0) return;

  const campaignRef = adminDb
    .collection('teams').doc(teamId)
    .collection('fundraising').doc(campaignId);
  const donationRef = campaignRef
    .collection('donations').doc(`stripe_${paymentIntentId}`);

  await adminDb.runTransaction(async transaction => {
    const [campaignSnapshot, donationSnapshot] = await Promise.all([
      transaction.get(campaignRef),
      transaction.get(donationRef),
    ]);
    if (!campaignSnapshot.exists) {
      throw new Error('Stripe payment referenced a missing fundraising campaign.');
    }
    if (donationSnapshot.exists) return;

    const now = new Date().toISOString();
    transaction.set(donationRef, {
      id: donationRef.id,
      donorName: payerName || 'Stripe Donor',
      donorEmail: payerEmail,
      amount: amountCents / 100,
      amountCents,
      currency,
      method: 'external',
      status: 'verified',
      stripePaymentIntentId: paymentIntentId,
      stripeReceiptUrl: receiptUrl,
      stripeConnectAccountId: connectedAccountId ?? null,
      createdAt: now,
      verifiedAt: now,
      verificationSource: 'stripe_webhook',
    });
    transaction.update(campaignRef, {
      currentAmount: FieldValue.increment(amountCents / 100),
      lastDonationAt: now,
      updatedAt: now,
    });
  });
}

/**
 * Handles payment_intent.payment_failed — marks the payment record as failed.
 */
async function handlePaymentIntentFailed(
  pi: Stripe.PaymentIntent,
  connectedAccountId: string | undefined
) {
  const teamId: string | undefined = pi.metadata?.firebase_team_id;
  if (!teamId) return;
  if (!(await connectAccountOwnsTeam(teamId, connectedAccountId))) {
    throw new Error('Connected account does not own the referenced team.');
  }

  await adminDb
    .collection('teams').doc(teamId)
    .collection('payments').doc(pi.id)
    .set(
      {
        id: pi.id,
        teamId,
        payment_method: 'online',
        status: 'failed',
        amount: pi.amount,
        currency: pi.currency,
        stripe_payment_intent_id: pi.id,
        stripe_connect_account_id: connectedAccountId,
        payer_email: pi.receipt_email ?? '',
        payer_name: '',
        paymentItemName: 'Online Payment',
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
}
