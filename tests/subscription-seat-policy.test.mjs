import assert from 'node:assert/strict';
import test from 'node:test';
import * as seatPolicy from '../src/lib/subscription-seat-policy.ts';
import * as teamSeatPolicy from '../src/lib/team-seat-policy.ts';

const {
  chooseAuthoritativeSubscriptionId,
  choosePaidTeamIds,
  buildPlanChangeStripeUpdate,
  buildSubscriptionResumeStripeUpdate,
  hasPendingSubscriptionUpdate,
  isActiveSubscriptionMutationLock,
  isEntitledSubscriptionStatus,
} = seatPolicy;
const { isBillableSquadSeat } = teamSeatPolicy;

test('administrative organization hubs never consume paid squad seats', () => {
  assert.equal(isBillableSquadSeat({ type: 'school', isPro: true }), false);
  assert.equal(isBillableSquadSeat({ type: 'school_hub', isPro: true }), false);
  assert.equal(isBillableSquadSeat({ type: 'league_hub', isPro: true }), false);
  assert.equal(isBillableSquadSeat({ isOrganizationHub: true, isPro: true }), false);
});

test('playable and legacy squads consume paid squad seats', () => {
  assert.equal(isBillableSquadSeat({ type: 'school_squad', isPro: true }), true);
  assert.equal(isBillableSquadSeat({ type: 'youth', isPro: true }), true);
  assert.equal(isBillableSquadSeat({ type: 'adult', isPro: true }), true);
  assert.equal(isBillableSquadSeat({ isPro: true }), true);
});

test('paid seats are capped deterministically after a downgrade', () => {
  assert.deepEqual(
    choosePaidTeamIds({
      allocatedTeamIds: ['team-c', 'team-a', 'team-b'],
      entitled: true,
      capacity: 2,
    }),
    ['team-a', 'team-b']
  );
});

test('non-entitled subscription statuses retain no paid squads', () => {
  assert.deepEqual(
    choosePaidTeamIds({
      allocatedTeamIds: ['team-a', 'team-b'],
      entitled: false,
      capacity: 10,
    }),
    []
  );
});

test('only active and trialing Stripe statuses grant paid seats', () => {
  assert.equal(isEntitledSubscriptionStatus('active'), true);
  assert.equal(isEntitledSubscriptionStatus('trialing'), true);
  assert.equal(isEntitledSubscriptionStatus('past_due'), false);
  assert.equal(isEntitledSubscriptionStatus('incomplete'), false);
  assert.equal(isEntitledSubscriptionStatus('unpaid'), false);
  assert.equal(isEntitledSubscriptionStatus('canceled'), false);
});

test('an existing pending Stripe update blocks another mutation', () => {
  assert.equal(hasPendingSubscriptionUpdate({ expires_at: 123 }), true);
  assert.equal(hasPendingSubscriptionUpdate(null), false);
});

test('plan changes keep pending-update and resume parameters separate', () => {
  assert.deepEqual(
    buildPlanChangeStripeUpdate([{ id: 'si_base', price: 'price_team_monthly' }]),
    {
      items: [{ id: 'si_base', price: 'price_team_monthly' }],
      proration_behavior: 'always_invoice',
      payment_behavior: 'pending_if_incomplete',
    }
  );
  assert.deepEqual(buildSubscriptionResumeStripeUpdate(), {
    cancel_at_period_end: false,
  });
});

test('subscription mutation locks expire deterministically', () => {
  assert.equal(
    isActiveSubscriptionMutationLock({ expiresAt: 2_000 }, 1_000),
    true
  );
  assert.equal(
    isActiveSubscriptionMutationLock({ expiresAt: 2_000 }, 2_000),
    false
  );
  assert.equal(isActiveSubscriptionMutationLock({}, 1_000), false);
});

test('a checkout-selected owned squad fills an available paid seat', () => {
  assert.deepEqual(
    choosePaidTeamIds({
      allocatedTeamIds: ['team-a'],
      selectedTeamId: 'team-b',
      entitled: true,
      capacity: 2,
    }),
    ['team-b', 'team-a']
  );
});

test('a checkout-selected squad takes priority without exceeding paid capacity', () => {
  assert.deepEqual(
    choosePaidTeamIds({
      allocatedTeamIds: ['team-a'],
      selectedTeamId: 'team-b',
      entitled: true,
      capacity: 1,
    }),
    ['team-b']
  );
});

test('an already allocated checkout-selected squad still takes priority', () => {
  assert.deepEqual(
    choosePaidTeamIds({
      allocatedTeamIds: ['team-a', 'team-z'],
      selectedTeamId: 'team-z',
      entitled: true,
      capacity: 1,
    }),
    ['team-z']
  );
});

test('invalid or zero capacity fails closed', () => {
  assert.deepEqual(
    choosePaidTeamIds({
      allocatedTeamIds: ['team-a'],
      entitled: true,
      capacity: Number.NaN,
    }),
    []
  );
  assert.deepEqual(
    choosePaidTeamIds({
      allocatedTeamIds: ['team-a'],
      entitled: true,
      capacity: 0,
    }),
    []
  );
});

test('late webhook events cannot replace a newer entitled subscription', () => {
  assert.equal(
    chooseAuthoritativeSubscriptionId({
      eventSubscriptionId: 'sub-old',
      subscriptions: [
        {
          id: 'sub-old',
          status: 'canceled',
          created: 100,
          hasRecognizedBasePlan: true,
        },
        {
          id: 'sub-new',
          status: 'active',
          created: 200,
          hasRecognizedBasePlan: true,
        },
      ],
    }),
    'sub-new'
  );
});

test('event subscription remains authoritative when no paid subscription exists', () => {
  assert.equal(
    chooseAuthoritativeSubscriptionId({
      eventSubscriptionId: 'sub-canceled',
      subscriptions: [
        {
          id: 'sub-canceled',
          status: 'canceled',
          created: 100,
          hasRecognizedBasePlan: true,
        },
      ],
    }),
    'sub-canceled'
  );
});

test('same-second entitled ties resolve consistently across event order', () => {
  const subscriptions = [
    {
      id: 'sub-a',
      status: 'active',
      created: 200,
      hasRecognizedBasePlan: true,
    },
    {
      id: 'sub-b',
      status: 'active',
      created: 200,
      hasRecognizedBasePlan: true,
    },
  ];
  const fromA = chooseAuthoritativeSubscriptionId({
    eventSubscriptionId: 'sub-a',
    subscriptions,
  });
  const fromB = chooseAuthoritativeSubscriptionId({
    eventSubscriptionId: 'sub-b',
    subscriptions,
  });

  assert.equal(fromA, fromB);
});
