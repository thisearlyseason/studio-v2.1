import assert from 'node:assert/strict';
import test from 'node:test';
import * as demoPlans from '../src/lib/demo-plan-config.ts';

test('an active demo seed lock defers role redirects until rich data finishes', () => {
  assert.equal(typeof demoPlans.hasActiveDemoSeedLock, 'function');
  assert.equal(typeof demoPlans.shouldRedirectParentFromDashboard, 'function');
  const now = 1_800_000;
  assert.equal(demoPlans.hasActiveDemoSeedLock(`parent_demo|${now - 59_999}`, now), true);
  assert.equal(demoPlans.hasActiveDemoSeedLock(`parent_demo|${now - 60_000}`, now), false);
  assert.equal(demoPlans.hasActiveDemoSeedLock('parent_demo|not-a-time', now), false);
  assert.equal(demoPlans.hasActiveDemoSeedLock(null, now), false);
  assert.equal(demoPlans.shouldRedirectParentFromDashboard({
    isParent: true,
    isDemo: true,
    seedLock: `parent_demo|${now - 100}`,
    now,
  }), false);
  assert.equal(demoPlans.shouldRedirectParentFromDashboard({
    isParent: true,
    isDemo: true,
    seedLock: `parent_demo|${now - 60_000}`,
    now,
  }), true);
  assert.equal(demoPlans.shouldRedirectParentFromDashboard({
    isParent: false,
    isDemo: true,
    seedLock: null,
    now,
  }), false);
});
