import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { adminDb } from '@/lib/firebase-admin';
import { getStripe } from '@/lib/stripe-client';
import {
  PLAN_PRICE_MAP,
  EXTRA_TEAM_PRICE_IDS,
  PRICE_BILLING_CYCLE,
} from '@/lib/stripe-price-map';
import { isEntitledSubscriptionStatus } from '@/lib/server-team-entitlements';
import { reconcilePaidTeamSeats } from '@/lib/server-subscription-seats';
import { chooseAuthoritativeSubscriptionId } from '@/lib/subscription-seat-policy';
import {
  ownerNewRegistrationEmail,
  ownerPaymentReceivedEmail,
  ownerCancellationEmail,
  ownerPaymentFailedEmail,
} from '@/lib/email-templates';
import { Resend } from 'resend';

// Webhook endpoint secret — must be set; no silent fallback
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

/** Owner notification config — set these in .env.local / App Hosting secrets */
const OWNER_EMAIL = process.env.OWNER_NOTIFICATION_EMAIL;
const OWNER_FCM_TOKEN = process.env.OWNER_FCM_TOKEN; // optional — push to owner's device

/** Max body size: 512KB. Stripe events are typically <64KB. */
const MAX_BODY_SIZE = 512_000;
const WEBHOOK_PROCESSING_LEASE_MS = 10 * 60 * 1000;

/**
 * Sends a push notification to the platform owner's device (fire-and-forget).
 * Requires OWNER_FCM_TOKEN env var. Silently skips if not configured.
 */
async function notifyOwnerPush(title: string, body: string, url?: string) {
  if (!OWNER_FCM_TOKEN) return;
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://studio-6850142148-fe343.web.app';
    await fetch(`${baseUrl}/api/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.INTERNAL_API_SECRET || '' },
      body: JSON.stringify({ tokens: [OWNER_FCM_TOKEN], title, body, url }),
    });
  } catch (err) {
    console.warn('[Webhook] Owner push notification failed (non-critical):', err);
  }
}

/**
 * Sends an email notification to the platform owner (fire-and-forget).
 * Requires OWNER_NOTIFICATION_EMAIL + RESEND_API_KEY env vars.
 */
async function notifyOwnerEmail(subject: string, html: string) {
  const resendApiKey = process.env.RESEND_API_KEY;
  if (!OWNER_EMAIL || !resendApiKey) return;
  try {
    const resend = new Resend(resendApiKey);
    const { error } = await resend.emails.send({
      from: 'The Squad Pro Alerts <noreply@thesquad.pro>',
      to: [OWNER_EMAIL],
      subject,
      html,
    });
    if (error) throw new Error(error.message || 'Resend rejected the owner notification.');
  } catch (err) {
    console.warn('[Webhook] Owner email notification failed (non-critical):', err);
  }
}

function hasRecognizedBasePlan(subscription: Stripe.Subscription): boolean {
  return subscription.items.data.some(item => Boolean(PLAN_PRICE_MAP[item.price.id]));
}

async function resolveAuthoritativeSubscription(
  stripe: Stripe,
  eventSubscription: Stripe.Subscription
): Promise<Stripe.Subscription> {
  const latestEventSubscription = await stripe.subscriptions.retrieve(
    eventSubscription.id
  );
  const subscriptions = await stripe.subscriptions.list({
    customer: eventSubscription.customer as string,
    status: 'all',
    limit: 100,
  });
  const entitledCount = subscriptions.data.filter(
    subscription =>
      isEntitledSubscriptionStatus(subscription.status) &&
      hasRecognizedBasePlan(subscription)
  ).length;
  if (entitledCount > 1) {
    console.error(
      `[Webhook] Customer ${eventSubscription.customer} has ${entitledCount} entitled subscriptions; reconciling one deterministic subscription only.`
    );
  }
  const authoritativeId = chooseAuthoritativeSubscriptionId({
    eventSubscriptionId: latestEventSubscription.id,
    subscriptions: subscriptions.data.map(subscription => ({
      id: subscription.id,
      status: subscription.status,
      created: subscription.created,
      hasRecognizedBasePlan: hasRecognizedBasePlan(subscription),
    })),
  });

  return (
    subscriptions.data.find(subscription => subscription.id === authoritativeId) ||
    latestEventSubscription
  );
}

/**
 * Normalizes subscription data into Firestore user doc + audit log.
 * Called by all subscription lifecycle events.
 */
async function syncSubscriptionToFirestore(
  subscription: Stripe.Subscription,
  selectedTeamId?: string | null,
  fallbackUserId?: string | null
) {
  const customerId = subscription.customer as string;

  // 1. Identify User — prefer firebase_uid metadata, fall back to customer index
  let userId = subscription.metadata?.firebase_uid || fallbackUserId || undefined;

  if (!userId) {
    const usersSnap = await adminDb
      .collection('users')
      .where('stripe_customer_id', '==', customerId)
      .get();
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
  let billingCycle: 'monthly' | 'annual' | null = null;

  for (const item of subscription.items.data) {
    const priceId = item.price.id;
    const resolved = PLAN_PRICE_MAP[priceId];
    if (resolved) {
      planType = resolved.id;
      baseLimit = resolved.teamLimit;
      billingCycle = PRICE_BILLING_CYCLE[priceId] || null;
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
  const hasPaidEntitlement =
    isEntitledSubscriptionStatus(status) && planType !== 'free';
  const effectiveExtraTeams = hasPaidEntitlement ? extraTeams : 0;
  const paidTeamLimit = hasPaidEntitlement ? baseLimit + effectiveExtraTeams : 0;

  // 3. Atomically reconcile the user entitlement, authoritative team records,
  // and owner membership mirrors.
  try {
    const reconciliation = await reconcilePaidTeamSeats({
      userId,
      planType,
      entitled: hasPaidEntitlement,
      capacity: paidTeamLimit,
      selectedTeamId,
      userUpdates: {
        stripe_subscription_id: subscription.id,
        stripe_customer_id: customerId,
        subscription_status: status,
        billing_cycle: billingCycle,
        plan_type: hasPaidEntitlement ? planType : 'free',
        team_limit: paidTeamLimit,
        extra_teams: effectiveExtraTeams,
        last_webhook_sync: new Date().toISOString(),
      },
    });
    if (
      hasPaidEntitlement &&
      selectedTeamId &&
      !reconciliation.selectedTeamAllocated
    ) {
      console.warn(
        `[Webhook] Could not allocate Pro seat to team ${selectedTeamId} for user ${userId}`
      );
    }
  } catch (cascadeErr: any) {
    console.error('[Webhook] Team cascade error:', cascadeErr.message);
    if (cascadeErr.message === 'ENTITLEMENT_USER_NOT_FOUND') return;
    throw cascadeErr;
  }

  // 4. Write secondary audit log (server-side only — Firestore rules block client writes)
  try {
    await adminDb.collection('subscriptions').doc(subscription.id).set(
      {
        userId,
        customerId,
        status,
        planType,
        billingCycle,
        teamLimit: paidTeamLimit,
        extraTeams: effectiveExtraTeams,
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

  // Stripe retries deliveries. Atomically claim each verified event before any
  // subscription or notification side effect to prevent duplicate records.
  const eventRef = adminDb.collection('stripeWebhookEvents').doc(event.id);
  const duplicate = await adminDb.runTransaction(async transaction => {
    const existing = await transaction.get(eventRef);
    const processingStartedAt = new Date().toISOString();
    if (existing.exists) {
      const existingData = existing.data() || {};
      const previousStatus = existingData.status;
      // A failed attempt must remain eligible for Stripe's retry. Completed
      // events and actively leased deliveries are safe to acknowledge. A stale
      // processing lease is reclaimed after a crash so the event is not lost.
      if (previousStatus === 'completed') return true;
      if (previousStatus === 'processing') {
        const leaseStarted = Date.parse(
          existingData.processingStartedAt || existingData.receivedAt || ''
        );
        if (Number.isFinite(leaseStarted) && Date.now() - leaseStarted < WEBHOOK_PROCESSING_LEASE_MS) {
          return true;
        }
      }
      transaction.update(eventRef, {
        status: 'processing',
        processingStartedAt,
        attempt: Number(existingData.attempt || 1) + 1,
        retriedAt: new Date().toISOString(),
      });
      return false;
    }
    transaction.set(eventRef, {
      type: event.type,
      status: 'processing',
      processingStartedAt,
      attempt: 1,
      receivedAt: new Date().toISOString(),
    });
    return false;
  });
  if (duplicate) return NextResponse.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.subscription) {
          const stripe = getStripe();
          const checkoutSubscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          );
          const subscription = await resolveAuthoritativeSubscription(
            stripe,
            checkoutSubscription
          );
          const isCurrentCheckoutSubscription =
            subscription.id === checkoutSubscription.id;
          await syncSubscriptionToFirestore(
            subscription,
            isCurrentCheckoutSubscription ? session.metadata?.team_id : null,
            isCurrentCheckoutSubscription ? session.metadata?.firebase_uid : null
          );

          // ── Owner notification: New Registration ──
          try {
            const customerEmail = typeof session.customer_details?.email === 'string' ? session.customer_details.email : 'unknown';
            const amountTotal = session.amount_total ?? 0;
            const currency = session.currency ?? 'usd';
            // Resolve plan name from subscription items
            let planName = 'Unknown Plan';
            let planId = 'unknown';
            for (const item of subscription.items.data) {
              const resolved = PLAN_PRICE_MAP[item.price.id];
              if (resolved) { planName = resolved.id; planId = resolved.id; break; }
            }
            const userId = subscription.metadata?.firebase_uid || 'unknown';
            const tplEmail = ownerNewRegistrationEmail({ planName, planId, customerEmail, userId, amount: amountTotal, interval: subscription.items.data[0]?.price?.recurring?.interval || 'month' });
            await Promise.all([
              notifyOwnerEmail(tplEmail.subject, tplEmail.html),
              notifyOwnerPush('🎉 New Registration', `${customerEmail} subscribed to ${planName}`, '/admin'),
            ]);
          } catch (notifyErr) {
            console.warn('[Webhook] Owner registration notification error (non-critical):', notifyErr);
          }
        }
        break;
      }

      case 'customer.subscription.created': {
        const eventSubscription = event.data.object as Stripe.Subscription;
        const subscription = await resolveAuthoritativeSubscription(
          getStripe(),
          eventSubscription
        );
        await syncSubscriptionToFirestore(subscription);
        break;
      }

      case 'customer.subscription.updated': {
        const eventSubscription = event.data.object as Stripe.Subscription;
        const subscription = await resolveAuthoritativeSubscription(
          getStripe(),
          eventSubscription
        );
        await syncSubscriptionToFirestore(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const deletedSubscription = event.data.object as Stripe.Subscription;
        const subscription = await resolveAuthoritativeSubscription(
          getStripe(),
          deletedSubscription
        );
        await syncSubscriptionToFirestore(subscription);

        // ── Owner notification: Cancellation ──
        try {
          const stripe = getStripe();
          const customer = await stripe.customers.retrieve(deletedSubscription.customer as string) as Stripe.Customer;
          const customerEmail = customer.email || 'unknown';
          let planName = 'Unknown Plan';
          for (const item of deletedSubscription.items.data) {
            const resolved = PLAN_PRICE_MAP[item.price.id];
            if (resolved) { planName = resolved.id; break; }
          }
          const cancelledAt = deletedSubscription.canceled_at
            ? new Date(deletedSubscription.canceled_at * 1000).toLocaleString('en-US', { timeZoneName: 'short' })
            : new Date().toLocaleString('en-US', { timeZoneName: 'short' });
          const userId = deletedSubscription.metadata?.firebase_uid || 'unknown';
          const tplEmail = ownerCancellationEmail({ customerEmail, planName, userId, cancelledAt });
          await Promise.all([
            notifyOwnerEmail(tplEmail.subject, tplEmail.html),
            notifyOwnerPush('⚠️ Subscription Cancelled', `${customerEmail} cancelled ${planName}`, '/admin'),
          ]);
        } catch (notifyErr) {
          console.warn('[Webhook] Owner cancellation notification error (non-critical):', notifyErr);
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const invoiceSubscriptionId =
          (invoice as any).subscription ||
          (invoice as any).parent?.subscription_details?.subscription;
        if (invoiceSubscriptionId) {
          const stripe = getStripe();
          const eventSubscription = await stripe.subscriptions.retrieve(
            invoiceSubscriptionId as string
          );
          const subscription = await resolveAuthoritativeSubscription(
            stripe,
            eventSubscription
          );
          await syncSubscriptionToFirestore(subscription);

          // ── Owner notification: Payment Received ──
          try {
            const customer = await stripe.customers.retrieve(subscription.customer as string) as Stripe.Customer;
            const customerEmail = customer.email || 'unknown';
            let planName = 'Unknown Plan';
            for (const item of subscription.items.data) {
              const resolved = PLAN_PRICE_MAP[item.price.id];
              if (resolved) { planName = resolved.id; break; }
            }
            const amountPaid = (invoice as any).amount_paid ?? 0;
            const currency = (invoice as any).currency ?? 'usd';
            const invoiceId = invoice.id ?? 'unknown';
            const tplEmail = ownerPaymentReceivedEmail({ customerEmail, planName, amount: amountPaid, currency, invoiceId });
            await Promise.all([
              notifyOwnerEmail(tplEmail.subject, tplEmail.html),
              notifyOwnerPush('💰 Payment Received', `${customerEmail} — $${(amountPaid / 100).toFixed(2)} ${currency.toUpperCase()}`, '/admin'),
            ]);
          } catch (notifyErr) {
            console.warn('[Webhook] Owner payment notification error (non-critical):', notifyErr);
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const invoiceSubscriptionId =
          (invoice as any).subscription ||
          (invoice as any).parent?.subscription_details?.subscription;
        if (invoiceSubscriptionId) {
          const stripe = getStripe();
          const eventSubscription = await stripe.subscriptions.retrieve(
            invoiceSubscriptionId as string
          );
          const subscription = await resolveAuthoritativeSubscription(
            stripe,
            eventSubscription
          );
          await syncSubscriptionToFirestore(subscription);

          // ── Owner notification: Payment Failed ──
          try {
            const customer = await stripe.customers.retrieve(subscription.customer as string) as Stripe.Customer;
            const customerEmail = customer.email || 'unknown';
            let planName = 'Unknown Plan';
            for (const item of subscription.items.data) {
              const resolved = PLAN_PRICE_MAP[item.price.id];
              if (resolved) { planName = resolved.id; break; }
            }
            const amountDue = (invoice as any).amount_due ?? 0;
            const currency = (invoice as any).currency ?? 'usd';
            const failureReason = (invoice as any).last_finalization_error?.message;
            const tplEmail = ownerPaymentFailedEmail({ customerEmail, planName, amount: amountDue, currency, failureReason });
            await Promise.all([
              notifyOwnerEmail(tplEmail.subject, tplEmail.html),
              notifyOwnerPush('🚨 Payment Failed', `${customerEmail} — $${(amountDue / 100).toFixed(2)} ${currency.toUpperCase()}`, '/admin'),
            ]);
          } catch (notifyErr) {
            console.warn('[Webhook] Owner payment failed notification error (non-critical):', notifyErr)
          }
        }
        break;
      }

      default:
        // Intentionally unhandled — not an error
        break;
    }

    await eventRef.update({ status: 'completed', completedAt: new Date().toISOString() });
    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('[Webhook] Processing error:', err.message);
    await eventRef.update({ status: 'failed', failedAt: new Date().toISOString(), error: err.message }).catch(() => {});
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
