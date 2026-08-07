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
