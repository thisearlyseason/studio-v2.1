import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SAAS_TAX_CODES, SAAS_TAX_OFFERS, SAAS_TAX_REVISION, readSaasTaxCatalog } from '../../src/lib/saas-tax-catalog.ts';
import { verifiedSaasTaxPrice } from '../../src/lib/server-saas-tax-catalog.ts';
import { getStripe } from '../../src/lib/stripe-client.ts';

// No creation/update of Products, Prices, registrations, settings, subscriptions,
// Checkout or payments. --plan does not contact Stripe. --verify is read-only.
const mode = process.argv[2];
if (mode === '--plan') {
  const products = Object.entries(SAAS_TAX_OFFERS).flatMap(([offer, spec]) =>
    Object.entries(SAAS_TAX_CODES).map(([use, tax_code]) => ({
      key: `${offer}:${use}`,
      product: { name: spec.name, tax_code, metadata: { squad_plan_id: offer, squad_tax_use: use, squad_tax_revision: SAAS_TAX_REVISION, source_product_id: spec.sourceProduct } },
      prices: ['monthly', 'annual'].map(cycle => ({ currency: 'usd', unit_amount: spec[cycle], tax_behavior: 'exclusive', recurring: { interval: cycle === 'annual' ? 'year' : 'month', interval_count: 1 } })),
    })));
  console.log(JSON.stringify({ status: 'PROPOSED_NOT_APPLIED', revision: SAAS_TAX_REVISION, productCount: products.length, priceCount: products.reduce((n, p) => n + p.prices.length, 0), products }, null, 2));
} else if (mode === '--verify' || mode === '--calculate') {
  const entries = readSaasTaxCatalog();
  assert.equal(entries.length, 20, 'Complete authorized sandbox catalog required');
  assert(entries.every(entry => entry.livemode === false), 'This verifier refuses live-mode catalogs');
  const stripe = getStripe(); // Existing authorized server runtime only; never print credentials.
  for (const entry of entries) await verifiedSaasTaxPrice(stripe, entry);
  const result = { scope: 'Stripe sandbox only', revision: SAAS_TAX_REVISION, verifiedPrices: 20, calculations: [] };
  if (mode === '--calculate') {
    assert(process.argv[3], 'An explicitly approved synthetic CA/US address fixture file is required');
    const addresses = JSON.parse(await readFile(process.argv[3], 'utf8'));
    assert.deepEqual(Object.keys(addresses).sort(), ['CA', 'US']);
    for (const [country, address] of Object.entries(addresses)) {
      assert(address.country === country && ['line1', 'city', 'state', 'postal_code'].every(key => typeof address[key] === 'string' && address[key].trim()));
      for (const entry of entries) {
        const calculation = await stripe.tax.calculations.create({ currency: 'usd', customer_details: { address, address_source: 'billing' }, line_items: [{ amount: SAAS_TAX_OFFERS[entry.offer][entry.cycle], reference: `${entry.offer}:${entry.cycle}:${entry.use}`, tax_code: SAAS_TAX_CODES[entry.use], tax_behavior: 'exclusive' }], expand: ['line_items'] });
        assert.equal(calculation.livemode, false);
        const breakdown = calculation.tax_breakdown.map(item => ({ amount: item.amount, taxabilityReason: item.taxability_reason, country: item.tax_rate_details.country, state: item.tax_rate_details.state }));
        result.calculations.push({ country, offer: entry.offer, cycle: entry.cycle, use: entry.use, calculationId: calculation.id, taxAmount: calculation.tax_amount_exclusive, breakdown });
      }
    }
  }
  console.log(JSON.stringify(result, null, 2));
} else {
  throw new Error('Use --plan, --verify, or --calculate <approved-synthetic-address-fixture.json>. Nothing is promoted by this script.');
}
