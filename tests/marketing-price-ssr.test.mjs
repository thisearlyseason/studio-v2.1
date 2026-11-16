import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BillingDisplayPriceProvider, useBillingDisplayPrices } from '../src/lib/use-billing-display-prices.ts';
import { DISPLAY_PRICE_MAX_AGE_MS } from '../src/lib/billing-display-price.ts';
import { createBillingPriceRefresh } from '../src/lib/billing-price-refresh.ts';

const quote = overrides => ({ id: 'team-monthly', amount: 19.99, currency: 'USD', formatted: 'USD 19.99', interval: 'month', fetchedAt: Date.now(), ...overrides });
function VisiblePrice() { return React.createElement('span', null, useBillingDisplayPrices().label('team-monthly')); }
const render = prices => renderToStaticMarkup(React.createElement(BillingDisplayPriceProvider, { prices }, React.createElement(VisiblePrice)));

test('fresh public catalog prices are visible in HTML before JavaScript runs', () => {
  assert.equal(render([quote({})]), '<span>USD 19.99</span>');
});
test('unavailable, expired and future server seeds do not become published prices', () => {
  for (const prices of [[], [quote({ fetchedAt: Date.now() - DISPLAY_PRICE_MAX_AGE_MS - 1000 })], [quote({ fetchedAt: Date.now() + 10000 })]]) {
    assert.equal(render(prices), '<span>Loading price…</span>');
  }
});
test('a public seed remains visible during revalidation and failed requests only while fresh', async () => {
  let now = 1800000000000;
  const states = [];
  const initial = quote({ fetchedAt: now });
  const controller = createBillingPriceRefresh({ initialPrices: [initial], now: () => now, available: () => true, changed: state => states.push(state), load: async () => { throw new Error('Offline'); }, schedule: () => 1, cancel: () => {} });
  controller.refresh();
  assert.deepEqual(states.at(-1).prices, [initial]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(states.at(-1).prices, [initial]);
  now += DISPLAY_PRICE_MAX_AGE_MS;
  controller.refresh();
  assert.deepEqual(states.at(-1).prices, []);
  controller.stop();
});
