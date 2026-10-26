import type Stripe from 'stripe';

type Request = Stripe.Checkout.SessionCreateParams;
export function standardCheckoutTaxParameters(): Pick<Request, 'automatic_tax' | 'billing_address_collection' | 'customer_update'> {
  // Hosted Checkout collects the buyer's address; never infer it from country,
  // IP, currency or a demo profile. Product/Price tax settings remain authoritative.
  return { automatic_tax: { enabled: true }, billing_address_collection: 'required', customer_update: { address: 'auto' } };
}
export function isStandardTaxCheckout(request: Request | undefined): boolean {
  return request?.managed_payments?.enabled !== true && request?.automatic_tax?.enabled === true;
}
export function validStandardTaxRequest(request: Request): boolean {
  return !isStandardTaxCheckout(request) || (
    request.mode === 'subscription' && request.currency === 'usd' &&
    typeof request.customer === 'string' && request.customer.length > 0 &&
    !request.automatic_tax?.liability && request.billing_address_collection === 'required' && request.customer_update?.address === 'auto' &&
    !request.shipping_address_collection && !request.customer_update?.shipping &&
    !request.subscription_data?.default_tax_rates?.length &&
    !request.line_items?.some(item => item.tax_rates?.length || item.dynamic_tax_rates?.length)
  );
}
/** Compare only the tax policy here; selection/owner equality remains enforced by
 * the existing lock. Unknown legacy policy must never become a new taxed attempt. */
export function sameStandardTaxPolicy(saved: Request | undefined, incoming: Request): boolean {
  if (!isStandardTaxCheckout(saved) && !isStandardTaxCheckout(incoming)) return true;
  if (!saved || !isStandardTaxCheckout(saved) || !isStandardTaxCheckout(incoming)) return false;
  return validStandardTaxRequest(saved) && validStandardTaxRequest(incoming);
}
export function isTaxLocationFailure(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'customer_tax_location_invalid';
}

export function isDefiniteTaxLocationRejection(error: unknown): boolean {
  return isTaxLocationFailure(error) && 'type' in (error as object) &&
    (error as { type?: string }).type === 'StripeInvalidRequestError' &&
    (error as { statusCode?: number }).statusCode === 400;
}
