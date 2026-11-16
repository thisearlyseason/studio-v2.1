import assert from 'node:assert/strict';
import test from 'node:test';
import { productOffersFromCatalog } from '../src/lib/public-product-offers.ts';
import { PRICING_CONFIG } from '../src/lib/pricing.ts';
const now = 1_800_000_000_000;
const plan = PRICING_CONFIG.find(plan => plan.id === 'team');
const quote = overrides => ({ id: plan.monthlyPriceId, amount: 19.99, formatted: 'USD 19.99', currency: 'USD', interval: 'month', fetchedAt: now, ...overrides });

test('product offers publish real monthly and annual totals with explicit billing periods', () => {
  const offers = productOffersFromCatalog([quote({}), quote({ id: plan.annualPriceId, amount: 199, interval: 'year' })], now);
  assert.equal(offers.length, 3);
  assert.equal(offers[1].price, 19.99);
  assert.equal(offers[1].priceSpecification.billingDuration, 'P1M');
  assert.equal(offers[2].price, 199);
  assert.equal(offers[2].priceSpecification.billingDuration, 'P1Y');
});
test('expired, future, malformed, foreign and wrongly labeled quotes never produce paid offers', () => {
  for (const invalid of [quote({ fetchedAt: now - 300_001 }), quote({ fetchedAt: now + 1 }), quote({ amount: -1 }), quote({ currency: 'usd' }), quote({ id: 'unrecognized' }), quote({ interval: 'year' }), null, '19.99']) {
    assert.equal(productOffersFromCatalog([invalid], now).length, 1);
  }
});
test('an unavailable catalog retains only the verified free Starter offer', () => {
  for (const missing of [null, {}, [], undefined]) {
    const offers = productOffersFromCatalog(missing, now);
    assert.equal(offers.length, 1);
    assert.equal(offers[0].price, 0);
    assert.equal(offers[0].name, 'Starter — free plan');
  }
});
