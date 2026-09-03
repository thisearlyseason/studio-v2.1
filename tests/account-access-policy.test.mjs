import assert from 'node:assert/strict';
import test from 'node:test';
import { isAccountAccessBlocked } from '../src/lib/account-access-policy.ts';

test('active and incomplete profiles retain access', () => {
  assert.equal(isAccountAccessBlocked(null), false);
  assert.equal(isAccountAccessBlocked({}), false);
  assert.equal(isAccountAccessBlocked({ accountStatus: 'active' }), false);
  assert.equal(isAccountAccessBlocked({ deletionStatus: 'cancelled' }), false);
});

test('suspended, disabled, and deletion lifecycle profiles lose access immediately', () => {
  for (const accountStatus of ['suspended', 'disabled', 'pending_deletion', 'deleted']) {
    assert.equal(isAccountAccessBlocked({ accountStatus }), true);
  }
  for (const deletionStatus of ['pending', 'processing', 'completed', 'deleted']) {
    assert.equal(isAccountAccessBlocked({ deletionStatus }), true);
  }
});
