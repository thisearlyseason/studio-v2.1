import type Stripe from 'stripe';
import { isDeepStrictEqual } from 'node:util';
import { SAAS_TAX_REVISION, saasTaxEntryForPrice } from './saas-tax-catalog';

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
    !request.line_items?.some(item => item.tax_rates?.length || item.dynamic_tax_rates?.length) && validTaxSelection(request)
  );
}
function validTaxSelection(request: Request): boolean {
  if (!request.metadata?.squad_tax_revision) return true;
  const metadata = request.metadata;
  if (metadata.squad_tax_revision !== SAAS_TAX_REVISION ||
      !['personal', 'commercial'].includes(String(metadata.squad_tax_use))) return false;
  if (!['squad_tax_revision', 'squad_tax_use', 'squad_plan_id', 'squad_billing_cycle'].every(key =>
    request.subscription_data?.metadata?.[key] === metadata[key])) return false;
  const items = request.line_items;
  if (!items || items.length < 1 || items.length > 2) return false;
  return items.every((item, index) => {
    const entry = typeof item.price === 'string' ? saasTaxEntryForPrice(item.price) : undefined;
    return entry && entry.use === metadata.squad_tax_use && entry.cycle === metadata.squad_billing_cycle &&
      entry.offer === (index === 0 ? metadata.squad_plan_id : 'extra_team') &&
      Number.isInteger(item.quantity) && (index === 0 ? item.quantity === 1 && entry.offer !== 'extra_team' : Number(item.quantity) > 0 && Number(item.quantity) <= 50);
  });
}
/** Compare only the tax policy here; selection/owner equality remains enforced by
 * the existing lock. Unknown legacy policy must never become a new taxed attempt. */
export function sameStandardTaxPolicy(saved: Request | undefined, incoming: Request): boolean {
  if (!isStandardTaxCheckout(saved) && !isStandardTaxCheckout(incoming)) return true;
  if (!saved || !isStandardTaxCheckout(saved) || !isStandardTaxCheckout(incoming)) return false;
  if (!validStandardTaxRequest(saved) || !validStandardTaxRequest(incoming)) return false;
  if (saved.metadata?.squad_tax_revision || incoming.metadata?.squad_tax_revision) {
    const keys = ['squad_tax_revision', 'squad_tax_use', 'squad_plan_id', 'squad_billing_cycle', 'team_id'];
    return keys.every(key => saved.metadata?.[key] === incoming.metadata?.[key]) &&
      isDeepStrictEqual(saved.line_items, incoming.line_items);
  }
  return true;
}
export function isTaxLocationFailure(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'customer_tax_location_invalid';
}

export function isDefiniteTaxLocationRejection(error: unknown): boolean {
  return isTaxLocationFailure(error) && 'type' in (error as object) &&
    (error as { type?: string }).type === 'StripeInvalidRequestError' &&
    (error as { statusCode?: number }).statusCode === 400;
}
