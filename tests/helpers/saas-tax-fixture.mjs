import { SAAS_TAX_OFFERS, SAAS_TAX_CODES, SAAS_TAX_REVISION } from '../../src/lib/saas-tax-catalog.ts';

// Synthetic provider objects only. These IDs do not exist at Stripe and must
// never be used as deployment configuration or as provider-calculation evidence.
export function saasTaxFixture() {
  const config = { revision: SAAS_TAX_REVISION, livemode: false, products: {} };
  const prices = new Map();
  for (const [offer, spec] of Object.entries(SAAS_TAX_OFFERS)) {
    for (const [use, code] of Object.entries(SAAS_TAX_CODES)) {
      const productId = 'prod_fixture' + offer.replace('_', '') + use;
      const row = { productId };
      for (const cycle of ['monthly', 'annual']) {
        const id = 'price_fixture' + offer.replace('_', '') + use + cycle;
        row[cycle + 'PriceId'] = id;
        prices.set(id, { id, active: true, object: 'price', livemode: false, currency: 'usd', unit_amount: spec[cycle], tax_behavior: 'exclusive', billing_scheme: 'per_unit', recurring: { interval: cycle === 'annual' ? 'year' : 'month', interval_count: 1, usage_type: 'licensed' }, product: { id: productId, object: 'product', name: spec.name, active: true, livemode: false, tax_code: code, metadata: { squad_plan_id: offer, squad_tax_use: use, squad_tax_revision: SAAS_TAX_REVISION, source_product_id: spec.sourceProduct } } });
      }
      config.products[offer + ':' + use] = row;
    }
  }
  return { config, raw: JSON.stringify(config), prices,
    id: (offer, cycle, use = 'personal') => config.products[offer + ':' + use][cycle + 'PriceId'],
    retrieve: async id => { if (!prices.has(id)) throw Error('Unknown synthetic price'); return structuredClone(prices.get(id)); },
  };
}
