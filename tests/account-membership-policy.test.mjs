import assert from 'node:assert/strict';
import test from 'node:test';
import { safeJoinPosition } from '../src/lib/account-membership-policy.ts';

test('join payloads cannot self-assign a staff position', () => {
  assert.equal(safeJoinPosition({ profileRole: 'coach', joiningLinkedChild: false }), 'Member');
  assert.equal(safeJoinPosition({ profileRole: 'admin', joiningLinkedChild: false }), 'Member');
  assert.equal(safeJoinPosition({ profileRole: 'superadmin', joiningLinkedChild: false }), 'Member');
});

test('ordinary account roles receive only their safe join position', () => {
  assert.equal(safeJoinPosition({ profileRole: 'parent', joiningLinkedChild: false }), 'Parent');
  assert.equal(safeJoinPosition({ profileRole: 'adult_player', joiningLinkedChild: false }), 'Player');
  assert.equal(safeJoinPosition({ profileRole: 'youth_player', joiningLinkedChild: false }), 'Player');
  assert.equal(safeJoinPosition({ profileRole: 'coach', joiningLinkedChild: true }), 'Player');
});
