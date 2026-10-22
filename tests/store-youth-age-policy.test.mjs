import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  canActivateYouthAccount,
  STORE_MINIMUM_DIRECT_ACCOUNT_AGE,
  STORE_YOUTH_AGE_ERROR,
} from '../src/lib/store-youth-age-policy.ts';

const now = new Date('2026-09-14T12:00:00.000Z');

test('store youth accounts enforce the exact 13th-birthday boundary', () => {
  assert.equal(STORE_MINIMUM_DIRECT_ACCOUNT_AGE, 13);
  assert.equal(canActivateYouthAccount('2013-09-14', 'store', now), true);
  assert.equal(canActivateYouthAccount('2013-09-15', 'store', now), false);
  assert.equal(canActivateYouthAccount('2010-12-31', 'store', now), true);
});

test('store youth account eligibility fails closed on missing or invalid birth dates', () => {
  for (const value of [undefined, null, '', 'not-a-date', '2013-02-29', '2030-01-01']) {
    assert.equal(canActivateYouthAccount(value, 'store', now), false, String(value));
  }
  assert.match(STORE_YOUTH_AGE_ERROR, /from age 13/i);
  assert.match(STORE_YOUTH_AGE_ERROR, /parent or guardian/i);
});

test('web distribution preserves the existing parent-managed youth flow', () => {
  for (const value of [undefined, '2018-01-01', '2013-09-15']) {
    assert.equal(canActivateYouthAccount(value, 'web', now), true, String(value));
  }
});

test('youth invite API applies the store gate before account creation and inside redemption transaction', () => {
  const source = readFileSync(new URL('../src/app/api/invites/youth/route.ts', import.meta.url), 'utf8');
  assert.match(source, /canActivateYouthAccount\(player\.dateOfBirth\)/);
  assert.match(source, /canActivateYouthAccount\(invitedPlayer\.data\(\)\?\.dateOfBirth\)/);
  assert.match(source, /canActivateYouthAccount\(playerData\.dateOfBirth\)/);
  assert.match(source, /if \(isStoreDistribution && childId\)/);
  assert.match(source, /if \(isStoreDistribution\) \{\s+const invitedPlayer/);
});
