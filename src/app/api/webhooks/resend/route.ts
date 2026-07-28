import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { Resend, type WebhookEventPayload } from 'resend';
import { adminDb } from '@/lib/firebase-admin';
import {
  blocksNewsletterDelivery,
  campaignCounterField,
  emailEventTimestampField,
  isResendContactEvent,
  isResendEmailEvent,
  normalizeWebhookEmail,
} from '@/lib/resend-webhook';

const MAX_BODY_SIZE = 256_000;
const PROCESSING_LEASE_MS = 5 * 60 * 1000;
const SUBSCRIBER_COLLECTIONS = [
  'newsletter_subscribers',
  'newsletter_signups',
  'sports_hub_newsletter_subscribers',
] as const;

function hashId(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeEventDate(value: unknown): string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    ? new Date(value).toISOString()
    : new Date().toISOString();
}

async function claimDelivery(deliveryId: string, event: WebhookEventPayload): Promise<boolean> {
  const ref = adminDb.collection('newsletter_webhook_events').doc(hashId(deliveryId));
  return adminDb.runTransaction(async transaction => {
    const existing = await transaction.get(ref);
    const now = new Date().toISOString();
    if (existing.exists) {
      const data = existing.data() || {};
      if (data.status === 'completed') return false;
      if (data.status === 'processing') {
        const startedAt = Date.parse(data.processingStartedAt || '');
        if (Number.isFinite(startedAt) && Date.now() - startedAt < PROCESSING_LEASE_MS) {
          return false;
        }
      }
      transaction.update(ref, {
        status: 'processing',
        processingStartedAt: now,
        attempt: Number(data.attempt || 1) + 1,
      });
      return true;
    }
    transaction.set(ref, {
      provider: 'resend',
      deliveryId,
      eventType: event.type,
      eventCreatedAt: safeEventDate(event.created_at),
      status: 'processing',
      processingStartedAt: now,
      receivedAt: now,
      attempt: 1,
    });
    return true;
  });
}

async function finishDelivery(deliveryId: string, status: 'completed' | 'failed', error?: unknown) {
  await adminDb.collection('newsletter_webhook_events').doc(hashId(deliveryId)).set({
    status,
    ...(status === 'completed'
      ? { completedAt: new Date().toISOString() }
      : {
          failedAt: new Date().toISOString(),
          failureReason: error instanceof Error ? error.message.slice(0, 500) : 'Unknown processing error',
        }),
  }, { merge: true });
}

async function updateSubscriberConsent(input: {
  email: string;
  isActive: boolean;
  reason: string;
  eventAt: string;
  allowCreate?: boolean;
  name?: string;
}) {
  const snapshots = await Promise.all(SUBSCRIBER_COLLECTIONS.map(collectionName =>
    adminDb.collection(collectionName).where('email', '==', input.email).limit(25).get()
  ));
  const existingRefs = snapshots.flatMap(snapshot => snapshot.docs.map(document => document.ref));
  const canonicalRef = adminDb.collection('newsletter_subscribers').doc(hashId(input.email));
  const canonicalExists = existingRefs.some(ref => ref.path === canonicalRef.path);
  if (!existingRefs.length && !input.allowCreate) return;

  const batch = adminDb.batch();
  existingRefs.forEach(ref => batch.set(ref, {
    isActive: input.isActive,
    consentUpdatedAt: input.eventAt,
    consentSource: 'resend_webhook',
    ...(input.isActive
      ? { reactivatedAt: input.eventAt, suppressionReason: FieldValue.delete() }
      : { unsubscribedAt: input.eventAt, suppressionReason: input.reason }),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true }));

  if (!canonicalExists && input.allowCreate) {
    batch.set(canonicalRef, {
      email: input.email,
      ...(input.name ? { name: input.name.slice(0, 120) } : {}),
      source: 'resend_webhook',
      sources: FieldValue.arrayUnion('resend'),
      isActive: input.isActive,
      subscribedAt: FieldValue.serverTimestamp(),
      consentUpdatedAt: input.eventAt,
      consentSource: 'resend_webhook',
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await batch.commit();
}

async function processEmailEvent(event: WebhookEventPayload) {
  const data = event.data as unknown as Record<string, unknown>;
  const emailId = typeof data.email_id === 'string' ? data.email_id : '';
  if (!emailId) throw new Error('Verified Resend email event is missing email_id.');
  const eventAt = safeEventDate(event.created_at);
  const recipients = Array.isArray(data.to)
    ? data.to.map(normalizeWebhookEmail).filter(email => email.includes('@')).slice(0, 100)
    : [];
  const broadcastId = typeof data.broadcast_id === 'string' ? data.broadcast_id : null;
  const timestampField = emailEventTimestampField(event.type);

  const emailRef = adminDb.collection('newsletter_email_events').doc(hashId(emailId));
  const batch = adminDb.batch();
  batch.set(emailRef, {
    provider: 'resend',
    emailId,
    eventType: event.type,
    eventCreatedAt: eventAt,
    lastEventAt: eventAt,
    recipients,
    subject: typeof data.subject === 'string' ? data.subject.slice(0, 300) : '',
    ...(broadcastId ? { broadcastId } : {}),
    ...(timestampField ? { [timestampField]: eventAt } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const counterField = campaignCounterField(event.type);
  if (broadcastId && counterField) {
    const campaigns = await adminDb.collection('newsletter_campaigns')
      .where('resendBroadcastId', '==', broadcastId)
      .limit(1)
      .get();
    if (!campaigns.empty) {
      batch.set(campaigns.docs[0].ref, {
        [counterField]: FieldValue.increment(1),
        lastDeliveryEventAt: eventAt,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }

  const inquiries = await adminDb.collection('contact_inquiries')
    .where('resendEmailId', '==', emailId)
    .limit(1)
    .get();
  if (!inquiries.empty) {
    const contactStatus: Record<string, string> = {
      'email.sent': 'accepted',
      'email.delivered': 'delivered',
      'email.delivery_delayed': 'delayed',
      'email.bounced': 'bounced',
      'email.failed': 'failed',
      'email.suppressed': 'suppressed',
    };
    const status = contactStatus[event.type];
    const existingStatus = inquiries.docs[0].data().deliveryStatus;
    const terminalStatuses = ['delivered', 'bounced', 'failed', 'suppressed'];
    const wouldRegressTerminalStatus = terminalStatuses.includes(existingStatus) &&
      (status === 'accepted' || status === 'delayed');
    if (status && !wouldRegressTerminalStatus) {
      batch.set(inquiries.docs[0].ref, {
        deliveryStatus: status,
        lastDeliveryEvent: event.type,
        lastDeliveryEventAt: eventAt,
        ...(event.type === 'email.delivered' ? { deliveredAt: eventAt } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }
  await batch.commit();

  if (blocksNewsletterDelivery(event.type)) {
    await Promise.all(recipients.map(email => updateSubscriberConsent({
      email,
      isActive: false,
      reason: event.type,
      eventAt,
    })));
  }
}

async function processContactEvent(event: WebhookEventPayload) {
  const data = event.data as unknown as Record<string, unknown>;
  const email = normalizeWebhookEmail(data.email);
  if (!email.includes('@')) throw new Error('Verified Resend contact event is missing a valid email.');
  const eventAt = safeEventDate(event.created_at);
  const segmentIds = Array.isArray(data.segment_ids)
    ? data.segment_ids.filter((value): value is string => typeof value === 'string')
    : [];
  const configured = await adminDb.collection('newsletter_system').doc('resend').get();
  const newsletterSegmentId = configured.data()?.segmentId;
  const belongsToNewsletterSegment = typeof newsletterSegmentId === 'string' &&
    segmentIds.includes(newsletterSegmentId);
  const unsubscribed = data.unsubscribed === true || event.type === 'contact.deleted';
  const name = [data.first_name, data.last_name]
    .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    .join(' ')
    .trim();

  await updateSubscriberConsent({
    email,
    isActive: !unsubscribed,
    reason: event.type === 'contact.deleted' ? 'contact.deleted' : 'resend_unsubscribe',
    eventAt,
    allowCreate: !unsubscribed && belongsToNewsletterSegment,
    name,
  });
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_SIZE) {
    return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
  }

  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    console.error('[Resend Webhook] RESEND_WEBHOOK_SECRET is not configured.');
    return NextResponse.json({ error: 'Webhook secret not configured.' }, { status: 500 });
  }

  const deliveryId = request.headers.get('svix-id');
  const timestamp = request.headers.get('svix-timestamp');
  const signature = request.headers.get('svix-signature');
  if (!deliveryId || !timestamp || !signature) {
    return NextResponse.json({ error: 'Missing Resend signature headers.' }, { status: 400 });
  }

  const payload = await request.text();
  if (Buffer.byteLength(payload, 'utf8') > MAX_BODY_SIZE) {
    return NextResponse.json({ error: 'Payload too large.' }, { status: 413 });
  }

  let event: WebhookEventPayload;
  try {
    event = new Resend(process.env.RESEND_API_KEY).webhooks.verify({
      payload,
      headers: { id: deliveryId, timestamp, signature },
      webhookSecret,
    });
  } catch (error) {
    console.warn('[Resend Webhook] Signature verification failed.');
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 400 });
  }

  try {
    const shouldProcess = await claimDelivery(deliveryId, event);
    if (!shouldProcess) return NextResponse.json({ received: true, duplicate: true });

    if (isResendEmailEvent(event.type)) await processEmailEvent(event);
    else if (isResendContactEvent(event.type)) await processContactEvent(event);

    await finishDelivery(deliveryId, 'completed');
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[Resend Webhook] Processing failed:', error);
    await finishDelivery(deliveryId, 'failed', error).catch(() => undefined);
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 500 });
  }
}
