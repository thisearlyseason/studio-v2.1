export function isSafeFirestoreId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 200 && !value.includes('/');
}

export function storedPaymentSourceMatches(
  stored: Record<string, unknown>,
  connectedAccountId: string,
  paymentLinkId?: string | null,
): boolean {
  const storedAccount = stored.stripeAccountId ?? stored.stripeConnectAccountId;
  if (storedAccount !== connectedAccountId) return false;
  return !paymentLinkId || stored.stripePaymentLinkId === paymentLinkId;
}

export function stripePaymentDocumentId(paymentIntentId: unknown, fallbackEventId: string): string {
  return isSafeFirestoreId(paymentIntentId) ? `stripe_${paymentIntentId}` : fallbackEventId;
}

export type StripePaymentStatusEvent = {
  status: 'paid' | 'failed';
  eventCreated: number;
  eventId: string;
};

export function shouldApplyStripePaymentStatus(
  current: StripePaymentStatusEvent | null,
  incoming: StripePaymentStatusEvent,
): boolean {
  if (!current) return true;

  // A successful PaymentIntent is terminal. Event delivery order must never
  // let an earlier failure downgrade a payment Stripe has confirmed as paid.
  if (current.status === 'paid' && incoming.status !== 'paid') return false;
  if (incoming.status === 'paid' && current.status !== 'paid') return true;

  if (incoming.eventCreated !== current.eventCreated) {
    return incoming.eventCreated > current.eventCreated;
  }
  return incoming.eventId > current.eventId;
}
