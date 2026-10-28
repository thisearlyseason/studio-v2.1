import type Stripe from 'stripe';
import { SAAS_TAX_CODES, SAAS_TAX_OFFERS, SAAS_TAX_REVISION, SaasTaxConfigurationError, resolveSaasTaxEntry, saasTaxEntryForPrice, type SaasTaxCycle, type SaasTaxEntry, type SaasTaxUse } from './saas-tax-catalog';

/** Read the actual provider objects before any customer/checkout mutation.
 * Never trust a correctly shaped environment value as evidence of classification. */
export async function verifiedSaasTaxPrice(stripe: Stripe, entry: SaasTaxEntry) {
  const price = await stripe.prices.retrieve(entry.priceId, { expand: ['product'] });
  const product = typeof price.product === 'object' && !('deleted' in price.product) ? price.product : null;
  const code = product && (typeof product.tax_code === 'string' ? product.tax_code : product.tax_code?.id);
  if (price.id !== entry.priceId || !price.active || price.livemode !== entry.livemode ||
      price.currency !== 'usd' || price.unit_amount !== SAAS_TAX_OFFERS[entry.offer][entry.cycle] ||
      price.tax_behavior !== 'exclusive' || price.billing_scheme !== 'per_unit' ||
      price.recurring?.interval !== (entry.cycle === 'annual' ? 'year' : 'month') || price.recurring.interval_count !== 1 ||
      price.recurring.usage_type !== 'licensed' || price.transform_quantity ||
      !product || !product.active || product.id !== entry.productId || product.livemode !== entry.livemode ||
      code !== SAAS_TAX_CODES[entry.use] || product.metadata.squad_tax_revision !== SAAS_TAX_REVISION ||
      product.metadata.squad_tax_use !== entry.use || product.metadata.squad_plan_id !== entry.offer ||
      product.metadata.source_product_id !== SAAS_TAX_OFFERS[entry.offer].sourceProduct) {
    throw new SaasTaxConfigurationError('The selected tax price could not be verified. Please try again later.');
  }
  return price;
}

export async function resolveVerifiedSaasTaxPrice(stripe: Stripe, offer: string, cycle: SaasTaxCycle, use: SaasTaxUse) {
  const entry = resolveSaasTaxEntry(offer, cycle, use);
  await verifiedSaasTaxPrice(stripe, entry);
  return entry.priceId;
}

/** Existing subscribers stay on legacy prices. A classified subscription keeps
 * its original use when changing plan/interval or adding seats. */
export function subscriptionSaasTaxUse(subscription: Stripe.Subscription): SaasTaxUse | null {
  const entries = subscription.items.data.map(item => saasTaxEntryForPrice(item.price.id)).filter(Boolean) as SaasTaxEntry[];
  const revision = subscription.metadata?.squad_tax_revision;
  if (!entries.length && !revision) return null;
  const base = entries.find(entry => entry.offer !== 'extra_team');
  if (!base || entries.length !== subscription.items.data.length || revision !== SAAS_TAX_REVISION ||
      subscription.metadata.squad_tax_use !== base.use || entries.some(entry => entry.use !== base.use || entry.cycle !== base.cycle)) {
    throw new SaasTaxConfigurationError('The subscription tax declaration needs reconciliation before changing billing.');
  }
  return base.use;
}
