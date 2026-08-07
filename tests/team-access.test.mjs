import assert from 'node:assert/strict';
import test from 'node:test';
import * as teamAccess from '../src/lib/server-team-access.ts';

const { isParentMember, isStaffMember } = teamAccess;

test('staff classification recognizes administrative and coaching positions', () => {
  assert.equal(isStaffMember({ role: 'Admin', position: 'Member' }), true);
  assert.equal(isStaffMember({ role: 'Member', position: 'Head Coach' }), true);
  assert.equal(isStaffMember({ role: 'Member', position: 'Assistant Coach' }), true);
  assert.equal(isStaffMember({ role: 'Member', position: 'Player' }), false);
});

test('parent classification is limited to parent and guardian positions', () => {
  assert.equal(isParentMember({ position: 'Parent' }), true);
  assert.equal(isParentMember({ position: 'Guardian' }), true);
  assert.equal(isParentMember({ position: 'Family Member' }), false);
  assert.equal(isParentMember({ position: 'Coach' }), false);
});
