export const RESEND_EMAIL_EVENT_TYPES = [
  'email.sent',
  'email.scheduled',
  'email.delivered',
  'email.delivery_delayed',
  'email.complained',
  'email.bounced',
  'email.opened',
  'email.clicked',
  'email.failed',
  'email.suppressed',
] as const;

export const RESEND_CONTACT_EVENT_TYPES = [
  'contact.created',
  'contact.updated',
  'contact.deleted',
] as const;

const EMAIL_EVENT_FIELDS: Record<string, string> = {
  'email.sent': 'sentAt',
  'email.scheduled': 'scheduledAt',
  'email.delivered': 'deliveredAt',
  'email.delivery_delayed': 'deliveryDelayedAt',
  'email.complained': 'complainedAt',
  'email.bounced': 'bouncedAt',
  'email.opened': 'lastOpenedAt',
  'email.clicked': 'lastClickedAt',
  'email.failed': 'failedAt',
  'email.suppressed': 'suppressedAt',
};

const CAMPAIGN_COUNTER_FIELDS: Record<string, string> = {
  'email.sent': 'sentCount',
  'email.delivered': 'deliveredCount',
  'email.delivery_delayed': 'deliveryDelayedCount',
  'email.complained': 'complainedCount',
  'email.bounced': 'bouncedCount',
  'email.opened': 'openedCount',
  'email.clicked': 'clickedCount',
  'email.failed': 'failedCount',
  'email.suppressed': 'suppressedCount',
};

export function isResendEmailEvent(type: string): boolean {
  return (RESEND_EMAIL_EVENT_TYPES as readonly string[]).includes(type);
}

export function isResendContactEvent(type: string): boolean {
  return (RESEND_CONTACT_EVENT_TYPES as readonly string[]).includes(type);
}

export function blocksNewsletterDelivery(type: string): boolean {
  return ['email.bounced', 'email.complained', 'email.suppressed'].includes(type);
}

export function emailEventTimestampField(type: string): string | null {
  return EMAIL_EVENT_FIELDS[type] || null;
}

export function campaignCounterField(type: string): string | null {
  return CAMPAIGN_COUNTER_FIELDS[type] || null;
}

export function normalizeWebhookEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase().slice(0, 254) : '';
}

