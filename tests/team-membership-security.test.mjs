import assert from 'node:assert/strict';
import test from 'node:test';
import * as membershipModule from '../src/lib/team-membership-security.ts';

const { isActiveTeamMembership } = membershipModule;

test('legacy and active roster records grant membership', () => {
  assert.equal(isActiveTeamMembership({ role: 'Member' }), true);
  assert.equal(isActiveTeamMembership({ status: 'active' }), true);
});

test('removed, deleted, and missing roster records do not grant membership', () => {
  assert.equal(isActiveTeamMembership({ status: 'removed' }), false);
  assert.equal(isActiveTeamMembership({ isDeleted: true }), false);
  assert.equal(isActiveTeamMembership(null), false);
});
