import { PRICING_CONFIG } from '@/lib/pricing';
import { isFreshDisplayPrice, type DisplayPrice } from '@/lib/billing-display-price';

const pricingUrl = 'https://www.thesquad.pro/plans';
const starterOffer = { '@type': 'Offer', name: 'Starter — free plan', price: 0, priceCurrency: 'USD', url: pricingUrl };

// Use only the public live catalog. Missing/expired quotes never become made-up prices.
export function productOffersFromCatalog(candidates: unknown, now = Date.now()) {
  const offers: Record<string, unknown>[] = [starterOffer];
  if (!Array.isArray(candidates)) return offers;
  for (const plan of PRICING_CONFIG) {
    for (const cycle of ['monthly', 'annual'] as const) {
      const priceId = cycle === 'monthly' ? plan.monthlyPriceId : plan.annualPriceId;
      const interval = cycle === 'monthly' ? 'month' : 'year';
      const quote = candidates.find(candidate => candidate && typeof candidate === 'object' && candidate.id === priceId && candidate.interval === interval && isFreshDisplayPrice(candidate as DisplayPrice, now)) as DisplayPrice | undefined;
      if (!quote) continue;
      offers.push({ '@type': 'Offer', name: `${plan.id === 'team' ? 'Squad Pro' : plan.id === 'school' ? 'School District' : plan.name} — ${cycle}`, price: quote.amount, priceCurrency: quote.currency, url: pricingUrl, priceSpecification: { '@type': 'UnitPriceSpecification', price: quote.amount, priceCurrency: quote.currency, billingDuration: cycle === 'monthly' ? 'P1M' : 'P1Y' } });
    }
  }
  return offers;
}

export async function loadPublicDisplayPrices(): Promise<DisplayPrice[]> {
  try {
    const response = await fetch('https://www.thesquad.pro/api/billing/display-catalog', { cache: 'no-store', signal: AbortSignal.timeout(3500) });
    if (!response.ok) return [];
    const catalog = await response.json();
    return Array.isArray(catalog?.prices) ? catalog.prices.filter((quote: DisplayPrice) => isFreshDisplayPrice(quote)) : [];
  } catch {
    return [];
  }
}

export async function loadPublicProductOffers() {
  return productOffersFromCatalog(await loadPublicDisplayPrices());
}
