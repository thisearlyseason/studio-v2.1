import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { SAAS_TAX_CODES, readSaasTaxCatalog, parseSaasTaxUse, resolveSaasTaxEntry, saasTaxMetadata } from '../src/lib/saas-tax-catalog.ts';
import { verifiedSaasTaxPrice, subscriptionSaasTaxUse } from '../src/lib/server-saas-tax-catalog.ts';
import { standardCheckoutTaxParameters, validStandardTaxRequest, sameStandardTaxPolicy } from '../src/lib/standard-checkout-tax.ts';
import { buildCheckoutIdempotencyKey } from '../src/lib/checkout-policy.ts';
import { saasTaxFixture } from './helpers/saas-tax-fixture.mjs';

const original = process.env.SQUAD_STRIPE_SAAS_TAX_CATALOG;
const fixture = saasTaxFixture();
process.env.SQUAD_STRIPE_SAAS_TAX_CATALOG = fixture.raw;
after(() => { if (original === undefined) delete process.env.SQUAD_STRIPE_SAAS_TAX_CATALOG; else process.env.SQUAD_STRIPE_SAAS_TAX_CATALOG = original; });
const stripe = { prices: { retrieve: fixture.retrieve } };
const request = (use = 'personal', cycle = 'monthly') => ({ customer: 'cus_fixture', mode: 'subscription', currency: 'usd', ...standardCheckoutTaxParameters(), metadata: saasTaxMetadata('team', cycle, use), subscription_data: { metadata: saasTaxMetadata('team', cycle, use) }, line_items: [{ price: fixture.id('team', cycle, use), quantity: 1 }] });

test('approved code pair is exact; declaration has no default or inferred buyer type', () => {
  assert.deepEqual(SAAS_TAX_CODES, { personal: 'txcd_10103100', commercial: 'txcd_10103101' });
  for (const value of [undefined, null, '', 'business', 'school', true, { use: 'personal' }]) assert.throws(() => parseSaasTaxUse(value));
  assert.equal(parseSaasTaxUse('commercial'), 'commercial');
});
test('catalog must be complete, unique, versioned and explicitly test/live', () => {
  assert.equal(readSaasTaxCatalog(fixture.raw).length, 20);
  assert.deepEqual(readSaasTaxCatalog(''), []);
  for (const change of [c => c.revision = 'guess', c => delete c.livemode, c => delete c.products['school:commercial'], c => c.products['team:personal'].annualPriceId = c.products['team:personal'].monthlyPriceId, c => c.products['elite:personal'].productId = c.products['team:personal'].productId]) {
    const c = structuredClone(fixture.config); change(c); assert.throws(() => readSaasTaxCatalog(JSON.stringify(c)));
  }
  assert.throws(() => readSaasTaxCatalog('{invalid'));
});
for (const entry of readSaasTaxCatalog(fixture.raw)) test(`verified ${entry.offer}/${entry.cycle}/${entry.use} preserves exact USD catalog`, async () => {
  const price = await verifiedSaasTaxPrice(stripe, entry);
  const expected = { team: [1999, 19900], elite: [11900, 111900], league: [27900, 279000], school: [17500, 175000], extra_team: [1599, 15900] };
  assert.equal(price.unit_amount, expected[entry.offer][entry.cycle === 'annual' ? 1 : 0]);
  assert.equal(price.tax_behavior, 'exclusive');
  assert.equal(price.product.tax_code, entry.use === 'personal' ? 'txcd_10103100' : 'txcd_10103101');
});
test('plausible IDs are insufficient: reject wrong tax code, amount, use, product and environment', async () => {
  const entry = resolveSaasTaxEntry('team', 'monthly', 'personal');
  for (const mutate of [p => p.unit_amount++, p => p.active = false, p => p.livemode = true, p => p.currency = 'cad', p => p.tax_behavior = 'inclusive', p => p.product.tax_code = 'txcd_10103000', p => p.product.metadata.squad_tax_use = 'commercial', p => p.product.metadata.source_product_id = 'prod_other', p => p.product.active = false, p => p.product.id = 'prod_other', p => p.recurring.usage_type = 'metered', p => p.transform_quantity = { divide_by: 2, round: 'up' }]) {
    const price = await fixture.retrieve(entry.priceId); mutate(price);
    await assert.rejects(verifiedSaasTaxPrice({ prices: { retrieve: async () => price } }, entry));
  }
});
test('lock distinguishes delivery revision, use, selection, quantity and target team', () => {
  const personal = request(), commercial = request('commercial');
  assert(validStandardTaxRequest(personal)); assert(validStandardTaxRequest(commercial));
  assert(sameStandardTaxPolicy(personal, structuredClone(personal)));
  assert(!sameStandardTaxPolicy(personal, commercial));
  const old = request(); delete old.metadata.squad_tax_revision;
  assert(!sameStandardTaxPolicy(old, personal));
  const team = request(); team.metadata.team_id = 'another-team'; assert(!sameStandardTaxPolicy(personal, team));
  const addon = request(); addon.line_items.push({ price: fixture.id('extra_team', 'monthly'), quantity: 2 }); assert(validStandardTaxRequest(addon)); assert(!sameStandardTaxPolicy(personal, addon));
  addon.line_items[1].price = fixture.id('extra_team', 'monthly', 'commercial'); assert(!validStandardTaxRequest(addon));
  const forged = request(); forged.subscription_data.metadata.squad_tax_use = 'commercial'; assert(!validStandardTaxRequest(forged));
});
test('provider idempotency scope includes declaration and classification revision', () => {
  const base = { route: 'checkout', userId: 'owner', priceId: 'same-selection', billingCycle: 'monthly', quantity: 0, now: 1, taxRevision: 'squad-saas-electronic-v1', taxUse: 'personal' };
  assert.equal(buildCheckoutIdempotencyKey(base), buildCheckoutIdempotencyKey({ ...base }));
  assert.notEqual(buildCheckoutIdempotencyKey(base), buildCheckoutIdempotencyKey({ ...base, taxUse: 'commercial' }));
  assert.notEqual(buildCheckoutIdempotencyKey(base), buildCheckoutIdempotencyKey({ ...base, taxRevision: 'future-approved-revision' }));
});
test('lifecycle preserves declared use; legacy subscriptions are not migrated', () => {
  const s = { metadata: saasTaxMetadata('team', 'monthly', 'commercial'), items: { data: [{ price: { id: fixture.id('team', 'monthly', 'commercial') } }] } };
  assert.equal(subscriptionSaasTaxUse(s), 'commercial');
  s.items.data.push({ price: { id: fixture.id('extra_team', 'monthly', 'personal') } }); assert.throws(() => subscriptionSaasTaxUse(s));
  assert.equal(subscriptionSaasTaxUse({ metadata: {}, items: { data: [{ price: { id: 'price_legacy' } }] } }), null);
  assert.throws(() => subscriptionSaasTaxUse({ metadata: s.metadata, items: { data: [{ price: { id: 'price_unknown' } }] } }));
});
