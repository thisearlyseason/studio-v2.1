import assert from 'node:assert/strict';
import test from 'node:test';
import * as pricingModule from '../src/lib/pricing.ts';
import * as priceMapModule from '../src/lib/stripe-price-map.ts';
import * as portalCustomerModule from '../src/lib/stripe-portal-customer.ts';
import * as entitlementModule from '../src/lib/subscription-entitlements.ts';
const { PRICING_CONFIG } = pricingModule;
const { PLAN_PRICE_MAP } = priceMapModule;
const { resolvePortalCustomerId } = portalCustomerModule;
const { resolveSubscriptionEntitlements, selectSubscriptionForSync } = entitlementModule;

const expectedPlans = new Map([
  ['team', 1],
  ['elite', 8],
  ['league', 18],
  ['school', 15],
]);

for (const plan of PRICING_CONFIG) {
  for (const [cycle, priceId] of [
    ['monthly', plan.monthlyPriceId],
    ['annual', plan.annualPriceId],
  ]) {
    test(`${plan.name} ${cycle} subscription maps to the correct portal plan`, () => {
      assert.deepEqual(PLAN_PRICE_MAP[priceId], {
        id: plan.id,
        teamLimit: expectedPlans.get(plan.id),
      });
    });
  }
}

function stripeFixture({ customers = {}, subscriptions = {}, listedCustomers = [] } = {}) {
  return {
    customers: {
      async retrieve(id) {
        if (!(id in customers)) {
          const error = new Error(`No such customer: ${id}`);
          error.code = 'resource_missing';
          throw error;
        }
        return customers[id];
      },
      async list() {
        return { data: listedCustomers };
      },
    },
    subscriptions: {
      async retrieve(id) {
        if (!(id in subscriptions)) {
          const error = new Error(`No such subscription: ${id}`);
          error.code = 'resource_missing';
          throw error;
        }
        return subscriptions[id];
      },
    },
  };
}

test('portal uses a valid stored Stripe customer', async () => {
  const stripe = stripeFixture({ customers: { cus_current: { id: 'cus_current' } } });
  const result = await resolvePortalCustomerId(stripe, 'user-1', {
    stripe_customer_id: 'cus_current',
  });
  assert.equal(result, 'cus_current');
});

test('portal recovers the customer from a legacy subscription', async () => {
  const stripe = stripeFixture({
    customers: { cus_from_sub: { id: 'cus_from_sub' } },
    subscriptions: { sub_legacy: { customer: 'cus_from_sub' } },
  });
  const result = await resolvePortalCustomerId(stripe, 'user-2', {
    stripe_subscription_id: 'sub_legacy',
  });
  assert.equal(result, 'cus_from_sub');
});

test('portal repairs a stale customer ID using Firebase metadata', async () => {
  const stripe = stripeFixture({
    listedCustomers: [
      { id: 'cus_other', metadata: { firebase_uid: 'someone-else' } },
      { id: 'cus_repaired', metadata: { firebase_uid: 'user-3' } },
    ],
  });
  const result = await resolvePortalCustomerId(stripe, 'user-3', {
    email: 'owner@example.com',
    stripe_customer_id: 'cus_stale',
  });
  assert.equal(result, 'cus_repaired');
});

test('portal does not attach an email match belonging to another user', async () => {
  const stripe = stripeFixture({
    listedCustomers: [{ id: 'cus_other', metadata: { firebase_uid: 'someone-else' } }],
  });
  const result = await resolvePortalCustomerId(stripe, 'user-4', {
    email: 'shared@example.com',
    stripe_customer_id: 'cus_stale',
  });
  assert.equal(result, null);
});

test('portal preserves unexpected Stripe failures for accurate API reporting', async () => {
  const stripe = stripeFixture();
  stripe.customers.retrieve = async () => {
    throw new Error('Stripe connection failed');
  };

  await assert.rejects(
    resolvePortalCustomerId(stripe, 'user-5', { stripe_customer_id: 'cus_current' }),
    /Stripe connection failed/
  );
});

const teamMonthlyPrice = PRICING_CONFIG.find(plan => plan.id === 'team').monthlyPriceId;
const eliteAnnualPrice = PRICING_CONFIG.find(plan => plan.id === 'elite').annualPriceId;
const extraMonthlyPrice = priceMapModule.EXTRA_TEAM_PRICE_IDS.monthly;

function subscription(status, priceId = teamMonthlyPrice, extras = 0, created = 1) {
  return {
    id: `sub_${status}_${created}`,
    status,
    created,
    items: {
      data: [
        { price: { id: priceId }, quantity: 1 },
        ...(extras ? [{ price: { id: extraMonthlyPrice }, quantity: extras }] : []),
      ],
    },
  };
}

for (const status of ['active', 'trialing', 'past_due']) {
  test(`${status} subscriptions retain paid entitlements and add-on teams`, () => {
    assert.deepEqual(resolveSubscriptionEntitlements(subscription(status, eliteAnnualPrice, 3)), {
      planType: 'elite', teamLimit: 11, extraTeams: 3,
      subscriptionStatus: status, isEntitled: true,
    });
  });
}

for (const status of ['incomplete', 'incomplete_expired', 'canceled', 'unpaid', 'paused']) {
  test(`${status} subscriptions cannot grant paid entitlements`, () => {
    assert.deepEqual(resolveSubscriptionEntitlements(subscription(status, eliteAnnualPrice, 3)), {
      planType: 'free', teamLimit: 1, extraTeams: 0,
      subscriptionStatus: status, isEntitled: false,
    });
  });
}

test('subscription sync prefers an entitled subscription over a newer canceled record', () => {
  const selected = selectSubscriptionForSync([
    subscription('active', teamMonthlyPrice, 0, 10),
    subscription('canceled', eliteAnnualPrice, 0, 20),
  ]);
  assert.equal(selected.status, 'active');
});

test('subscription sync returns the newest record when none grant entitlements', () => {
  const selected = selectSubscriptionForSync([
    subscription('canceled', teamMonthlyPrice, 0, 10),
    subscription('incomplete', eliteAnnualPrice, 0, 20),
  ]);
  assert.equal(selected.status, 'incomplete');
});
