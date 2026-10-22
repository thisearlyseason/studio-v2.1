export type BillingUiMode = 'legacy' | 'quote' | 'blocked';
// Capability metadata selects UI only; native guards remain authoritative.
export function billingUiMode(scope: object): BillingUiMode {
  if (!('squadNativeBillingCapabilities' in scope)) return 'legacy';
  const value = (scope as { squadNativeBillingCapabilities?: unknown }).squadNativeBillingCapabilities;
  if (value && typeof value === 'object' &&
      (value as { version?: unknown }).version === 2 &&
      (value as { priceQuoteRequired?: unknown }).priceQuoteRequired === true) return 'quote';
  return 'blocked';
}
