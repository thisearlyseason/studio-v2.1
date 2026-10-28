// Exact codes approved against https://docs.stripe.com/tax/tax-codes.
// A declaration selects tax treatment, never an entitlement or exemption.
export const SAAS_TAX_REVISION = 'squad-saas-electronic-v1';
export const SAAS_TAX_CODES = { personal: 'txcd_10103100', commercial: 'txcd_10103101' } as const;
export type SaasTaxUse = keyof typeof SAAS_TAX_CODES;
export type SaasTaxCycle = 'monthly' | 'annual';
export const SAAS_TAX_OFFERS = {
  team: { name: 'Pro Team', sourceProduct: 'prod_UJiH2n4kD5Tkpd', monthly: 1999, annual: 19900 },
  elite: { name: 'Elite Teams', sourceProduct: 'prod_UJiLCn2Buz5jf7', monthly: 11900, annual: 111900 },
  league: { name: 'Elite League', sourceProduct: 'prod_UJiXiTtYmc4M9d', monthly: 27900, annual: 279000 },
  school: { name: 'Schools Plan', sourceProduct: 'prod_UJiawzYzumXBcb', monthly: 17500, annual: 175000 },
  extra_team: { name: 'Extra Pro Teams', sourceProduct: 'prod_UJiibgPNc1GT3m', monthly: 1599, annual: 15900 },
} as const;
export type SaasTaxOffer = keyof typeof SAAS_TAX_OFFERS;
export type SaasTaxEntry = { offer: SaasTaxOffer; use: SaasTaxUse; cycle: SaasTaxCycle; priceId: string; productId: string; livemode: boolean };
export class SaasTaxConfigurationError extends Error { readonly status = 503; }
export class SaasTaxDeclarationError extends Error { readonly status = 400; }

export function parseSaasTaxUse(value: unknown): SaasTaxUse {
  if (value === 'personal' || value === 'commercial') return value;
  throw new SaasTaxDeclarationError('Choose personal/recreational or commercial business use before checkout. If neither fits, contact team@thesquad.pro.');
}

// Server configuration contains provider IDs only, never credentials. No guessed
// IDs or fallback to the legacy account-wide tax preset is permitted.
export function readSaasTaxCatalog(raw = process.env.SQUAD_STRIPE_SAAS_TAX_CATALOG): SaasTaxEntry[] {
  if (!raw) return [];
  try {
    const config = JSON.parse(raw);
    if (config.revision !== SAAS_TAX_REVISION || typeof config.livemode !== 'boolean' ||
        !config.products || Object.keys(config.products).length !== 10) throw new Error();
    const ids = new Set<string>();
    const products = new Set<string>();
    const entries: SaasTaxEntry[] = [];
    for (const offer of Object.keys(SAAS_TAX_OFFERS) as SaasTaxOffer[]) {
      for (const use of Object.keys(SAAS_TAX_CODES) as SaasTaxUse[]) {
        const product = config.products[`${offer}:${use}`];
        if (!product || !/^prod_[A-Za-z0-9]+$/.test(product.productId) || products.has(product.productId)) throw new Error();
        products.add(product.productId);
        for (const cycle of ['monthly', 'annual'] as const) {
          const priceId = product[`${cycle}PriceId`];
          if (typeof priceId !== 'string' || !/^price_[A-Za-z0-9]+$/.test(priceId) || ids.has(priceId)) throw new Error();
          ids.add(priceId);
          entries.push({ offer, use, cycle, priceId, productId: product.productId, livemode: config.livemode });
        }
      }
    }
    return entries;
  } catch {
    throw new SaasTaxConfigurationError('The reviewed tax catalog is unavailable. Please try again later.');
  }
}

export function resolveSaasTaxEntry(offer: string, cycle: SaasTaxCycle, use: SaasTaxUse): SaasTaxEntry {
  const entry = readSaasTaxCatalog().find(item => item.offer === offer && item.cycle === cycle && item.use === use);
  if (!entry) throw new SaasTaxConfigurationError('The reviewed tax catalog is unavailable. Please try again later.');
  return entry;
}

export function saasTaxEntryForPrice(priceId: string) {
  return readSaasTaxCatalog().find(entry => entry.priceId === priceId);
}

export function saasTaxMetadata(offer: string, cycle: SaasTaxCycle, use: SaasTaxUse): Record<string, string> {
  return { squad_tax_revision: SAAS_TAX_REVISION, squad_tax_use: use, squad_plan_id: offer, squad_billing_cycle: cycle };
}
