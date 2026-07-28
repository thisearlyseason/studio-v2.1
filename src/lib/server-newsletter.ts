import 'server-only';

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { Resend } from 'resend';
import { adminDb } from '@/lib/firebase-admin';
import { parseNewsletterDraft } from '@/lib/newsletter-draft-validation';
import { renderNewsletterHtml, renderNewsletterText } from '@/lib/newsletter-content';

const SEGMENT_NAME = 'The Squad Newsletter';
const CONFIG_REF = () => adminDb.collection('newsletter_system').doc('resend');
const WELCOME_REF = () => adminDb.collection('newsletter_system').doc('welcome_email');
const FROM = 'The Squad <noreply@thesquad.pro>';
const DEFAULT_WELCOME_DRAFT = {
  subject: 'Welcome to The Squad',
  previewText: 'You are officially on The Squad newsletter list.',
  title: 'Welcome to The Squad',
  blocks: [
    {
      id: 'welcome-intro',
      type: 'paragraph' as const,
      text: 'Thanks for subscribing. You will now receive product news, sports insights, and updates from **The Squad**.',
    },
    {
      id: 'welcome-hub',
      type: 'button' as const,
      label: 'Explore the Sports Hub',
      url: 'https://www.thesquad.pro/sports-hub',
    },
  ],
};
const SUBSCRIBER_COLLECTIONS = [
  { name: 'newsletter_subscribers', dateField: 'subscribedAt', fallbackSource: 'newsletter' },
  { name: 'newsletter_signups', dateField: 'createdAt', fallbackSource: 'landing_page' },
  { name: 'sports_hub_newsletter_subscribers', dateField: 'subscribedAt', fallbackSource: 'sports_hub' },
] as const;

let cachedSegmentId: string | null = null;

export type AdminNewsletterSubscriber = {
  email: string;
  name: string;
  sources: string[];
  subscribedAt: string;
  isActive: boolean;
};

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not configured.');
  return new Resend(key);
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function publicAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  if (configured && /^https:\/\//.test(configured)) return configured.replace(/\/$/, '');
  return 'https://www.thesquad.pro';
}

function unsubscribeToken(email: string): string {
  const secret = process.env.RESEND_API_KEY;
  if (!secret) throw new Error('RESEND_API_KEY is not configured.');
  return createHmac('sha256', secret).update(`newsletter-unsubscribe:${email}`).digest('hex');
}

export function newsletterUnsubscribeUrl(emailValue: string): string {
  const email = normalizeEmail(emailValue);
  const params = new URLSearchParams({ email, token: unsubscribeToken(email) });
  return `${publicAppUrl()}/api/newsletter/unsubscribe?${params.toString()}`;
}

export function validNewsletterUnsubscribeToken(emailValue: string, token: string): boolean {
  const email = normalizeEmail(emailValue);
  if (!email || !/^[a-f0-9]{64}$/.test(token)) return false;
  const expected = Buffer.from(unsubscribeToken(email), 'hex');
  const supplied = Buffer.from(token, 'hex');
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

function toIso(value: unknown): string {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return new Date(0).toISOString();
}

function splitName(name: string): { firstName?: string; lastName?: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return {};
  return { firstName: parts[0], ...(parts.length > 1 ? { lastName: parts.slice(1).join(' ') } : {}) };
}

function resendError(error: unknown, fallback: string): Error {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return new Error(error.message);
  }
  return new Error(fallback);
}

export async function ensureNewsletterSegment(): Promise<string> {
  if (cachedSegmentId) return cachedSegmentId;

  const configured = await CONFIG_REF().get();
  const storedId = configured.data()?.segmentId;
  if (typeof storedId === 'string' && storedId) {
    cachedSegmentId = storedId;
    return storedId;
  }

  const resend = getResend();
  const listed = await resend.segments.list({ limit: 100 });
  if (listed.error) throw resendError(listed.error, 'Unable to read Resend segments.');
  const existing = listed.data?.data.find(segment => segment.name === SEGMENT_NAME);
  if (existing) {
    cachedSegmentId = existing.id;
  } else {
    const created = await resend.segments.create({ name: SEGMENT_NAME });
    if (created.error || !created.data?.id) {
      throw resendError(created.error, 'Unable to create the Resend newsletter segment.');
    }
    cachedSegmentId = created.data.id;
  }

  await CONFIG_REF().set({
    segmentId: cachedSegmentId,
    segmentName: SEGMENT_NAME,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return cachedSegmentId;
}

async function syncResendContact(input: {
  email: string;
  name: string;
  reactivate: boolean;
}): Promise<void> {
  const resend = getResend();
  const segmentId = await ensureNewsletterSegment();
  const names = splitName(input.name);
  const created = await resend.contacts.create({
    email: input.email,
    ...names,
    ...(input.reactivate ? { unsubscribed: false } : {}),
    segments: [{ id: segmentId }],
  });
  if (!created.error) return;

  const updated = await resend.contacts.update({
    email: input.email,
    ...names,
    ...(input.reactivate ? { unsubscribed: false } : {}),
  });
  if (updated.error) throw resendError(updated.error, 'Unable to update the Resend contact.');

  const segmented = await resend.contacts.segments.add({ email: input.email, segmentId });
  if (segmented.error && !/already|exist/i.test(segmented.error.message || '')) {
    throw resendError(segmented.error, 'Unable to add the contact to the newsletter segment.');
  }
}

async function sendWelcomeEmailIfNeeded(email: string, name: string): Promise<void> {
  const configSnapshot = await WELCOME_REF().get();
  const config = configSnapshot.data();
  if (configSnapshot.exists && config?.enabled !== true) return;
  const draft = parseNewsletterDraft(configSnapshot.exists ? config : DEFAULT_WELCOME_DRAFT);
  if (!draft) throw new Error('The newsletter welcome email configuration is invalid.');

  const id = createHash('sha256').update(email).digest('hex');
  const subscriberRef = adminDb.collection('newsletter_subscribers').doc(id);
  const now = Date.now();
  const acquired = await adminDb.runTransaction(async transaction => {
    const subscriber = await transaction.get(subscriberRef);
    const data = subscriber.data();
    const leaseStartedAt = typeof data?.welcomeEmailSendingAtMs === 'number'
      ? data.welcomeEmailSendingAtMs
      : 0;
    if (!subscriber.exists || data?.welcomeEmailSentAt || leaseStartedAt > now - 15 * 60 * 1000) return false;
    transaction.set(subscriberRef, {
      welcomeEmailSendingAtMs: now,
      welcomeEmailPending: false,
    }, { merge: true });
    return true;
  });
  if (!acquired) return;

  try {
    const unsubscribeUrl = newsletterUnsubscribeUrl(email);
    const response = await getResend().emails.send({
      from: FROM,
      to: [email],
      subject: draft.subject,
      html: renderNewsletterHtml(draft, unsubscribeUrl),
      text: renderNewsletterText(draft, unsubscribeUrl),
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      tags: [
        { name: 'email_type', value: 'newsletter_welcome' },
        { name: 'subscriber_source', value: 'newsletter' },
      ],
    });
    if (response.error || !response.data?.id) {
      throw resendError(response.error, 'Resend did not accept the welcome email.');
    }
    await subscriberRef.set({
      welcomeEmailSentAt: FieldValue.serverTimestamp(),
      welcomeEmailResendId: response.data.id,
      welcomeEmailSendingAtMs: FieldValue.delete(),
      welcomeEmailPending: FieldValue.delete(),
      welcomeEmailFailureReason: FieldValue.delete(),
      ...(name ? { welcomeEmailRecipientName: name } : {}),
    }, { merge: true });
  } catch (error) {
    await subscriberRef.set({
      welcomeEmailSendingAtMs: FieldValue.delete(),
      welcomeEmailPending: true,
      welcomeEmailFailureReason: error instanceof Error ? error.message.slice(0, 500) : 'Unknown delivery error',
      welcomeEmailFailedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    throw error;
  }
}

export async function subscribeToNewsletter(input: {
  email: string;
  name?: string;
  source: 'landing_page' | 'sports_hub';
}): Promise<void> {
  const email = normalizeEmail(input.email);
  const name = (input.name || '').trim().slice(0, 120);
  const id = createHash('sha256').update(email).digest('hex');
  const ref = adminDb.collection('newsletter_subscribers').doc(id);

  await adminDb.runTransaction(async transaction => {
    const existing = await transaction.get(ref);
    transaction.set(ref, {
      email,
      ...(name ? { name } : {}),
      source: input.source,
      sources: FieldValue.arrayUnion(input.source),
      isActive: true,
      subscribedAt: existing.exists
        ? existing.data()?.subscribedAt || FieldValue.serverTimestamp()
        : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  try {
    await syncResendContact({ email, name, reactivate: true });
    await ref.set({
      resendSyncedAt: FieldValue.serverTimestamp(),
      resendSyncPending: FieldValue.delete(),
      resendSyncFailureReason: FieldValue.delete(),
    }, { merge: true });
  } catch (error) {
    console.error('[Newsletter] Subscriber saved, but Resend sync failed:', error);
    await ref.set({
      resendSyncPending: true,
      resendSyncFailureReason: error instanceof Error ? error.message.slice(0, 500) : 'Unknown Resend sync error',
      resendSyncFailedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    throw new Error('Your subscription was saved, but email delivery is temporarily unavailable. Please try again later.');
  }

  await sendWelcomeEmailIfNeeded(email, name);
}

export async function unsubscribeNewsletterSubscriber(emailValue: string): Promise<void> {
  const email = normalizeEmail(emailValue);
  const snapshots = await Promise.all(SUBSCRIBER_COLLECTIONS.map(source =>
    adminDb.collection(source.name).where('email', '==', email).get()
  ));
  const batch = adminDb.batch();
  snapshots.forEach(snapshot => snapshot.docs.forEach(document => batch.set(document.ref, {
    isActive: false,
    unsubscribedAt: FieldValue.serverTimestamp(),
    unsubscribeSource: 'email_link',
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })));
  await batch.commit();

  const updated = await getResend().contacts.update({ email, unsubscribed: true });
  if (updated.error && !/not found/i.test(updated.error.message || '')) {
    throw resendError(updated.error, 'Unable to update newsletter consent in Resend.');
  }
}

async function readFirestoreSubscribers(): Promise<Map<string, AdminNewsletterSubscriber>> {
  const snapshots = await Promise.all(SUBSCRIBER_COLLECTIONS.map(source =>
    adminDb.collection(source.name).limit(5000).get()
  ));
  const subscribers = new Map<string, AdminNewsletterSubscriber>();

  snapshots.forEach((snapshot, index) => {
    const source = SUBSCRIBER_COLLECTIONS[index];
    snapshot.docs.forEach(document => {
      const data = document.data();
      const email = normalizeEmail(data.email);
      if (!email || !email.includes('@')) return;
      const date = toIso(data[source.dateField]);
      const sourceName = typeof data.source === 'string' ? data.source : source.fallbackSource;
      const current = subscribers.get(email);
      if (!current) {
        subscribers.set(email, {
          email,
          name: typeof data.name === 'string' ? data.name : '',
          sources: [sourceName],
          subscribedAt: date,
          isActive: data.isActive !== false,
        });
        return;
      }
      if (!current.sources.includes(sourceName)) current.sources.push(sourceName);
      if (!current.name && typeof data.name === 'string') current.name = data.name;
      if (date > current.subscribedAt) current.subscribedAt = date;
      current.isActive = current.isActive || data.isActive !== false;
    });
  });
  return subscribers;
}

async function listResendContactStatuses(segmentId: string): Promise<Map<string, boolean>> {
  const resend = getResend();
  const statuses = new Map<string, boolean>();
  let after: string | undefined;
  for (let page = 0; page < 50; page += 1) {
    const response = await resend.contacts.list({ segmentId, limit: 100, ...(after ? { after } : {}) });
    if (response.error) throw resendError(response.error, 'Unable to read Resend contacts.');
    const contacts = response.data?.data || [];
    contacts.forEach(contact => statuses.set(normalizeEmail(contact.email), !contact.unsubscribed));
    if (!response.data?.has_more || !contacts.length) break;
    after = contacts[contacts.length - 1].id;
  }
  return statuses;
}

export async function listNewsletterSubscribers(): Promise<AdminNewsletterSubscriber[]> {
  const subscribers = await readFirestoreSubscribers();
  try {
    const segmentId = await ensureNewsletterSegment();
    const resendStatuses = await listResendContactStatuses(segmentId);
    resendStatuses.forEach((active, email) => {
      const subscriber = subscribers.get(email);
      if (subscriber) subscriber.isActive = subscriber.isActive && active;
    });
  } catch (error) {
    console.error('[Newsletter] Resend status lookup failed:', error);
  }
  return [...subscribers.values()].sort((a, b) => b.subscribedAt.localeCompare(a.subscribedAt));
}

export async function syncNewsletterSubscribersToResend(): Promise<number> {
  const subscribers = [...(await readFirestoreSubscribers()).values()].filter(subscriber => subscriber.isActive);
  for (let index = 0; index < subscribers.length; index += 10) {
    const chunk = subscribers.slice(index, index + 10);
    await Promise.all(chunk.map(subscriber => syncResendContact({
      email: subscriber.email,
      name: subscriber.name,
      reactivate: false,
    })));
  }
  return subscribers.length;
}

export async function deleteNewsletterSubscriber(emailValue: string): Promise<void> {
  const email = normalizeEmail(emailValue);
  const snapshots = await Promise.all(SUBSCRIBER_COLLECTIONS.map(source =>
    adminDb.collection(source.name).where('email', '==', email).get()
  ));
  const batch = adminDb.batch();
  snapshots.forEach(snapshot => snapshot.docs.forEach(document => batch.delete(document.ref)));
  await batch.commit();

  try {
    const removed = await getResend().contacts.remove({ email });
    if (removed.error && !/not found/i.test(removed.error.message || '')) {
      throw resendError(removed.error, 'Unable to delete the Resend contact.');
    }
  } catch (error) {
    console.error('[Newsletter] Firestore subscriber deleted, but Resend removal failed:', error);
    throw new Error('The subscriber was removed locally, but Resend could not be updated. Please retry.');
  }
}

export function newsletterResendClient(): Resend {
  return getResend();
}
