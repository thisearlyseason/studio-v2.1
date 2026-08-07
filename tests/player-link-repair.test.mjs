import assert from 'node:assert/strict';
import test from 'node:test';
import playerLinkRepair from '../src/lib/player-link-repair.ts';
const {
  isRepairableAthlete,
  playerIdentityForMember,
  playerNamesFromMember,
} = playerLinkRepair;

test('player-link repair excludes removed records and staff roles', () => {
  assert.equal(isRepairableAthlete({ position: 'Forward' }), true);
  assert.equal(isRepairableAthlete({ position: 'Head Coach' }), false);
  assert.equal(isRepairableAthlete({ role: 'Admin', position: 'Forward' }), false);
  assert.equal(isRepairableAthlete({ position: 'Forward', status: 'removed' }), false);
  assert.equal(isRepairableAthlete({ position: 'Forward', playerId: 'existing' }), false);
});

test('player-link repair only reuses a login identity for its matching roster document', () => {
  assert.equal(playerIdentityForMember('team', 'user-1', { userId: 'user-1' }), 'p_user-1');
  assert.equal(playerIdentityForMember('team', 'legacy-member', { userId: 'user-1' }), 'legacy_team_legacy-member');
});

test('player-link repair produces useful fallback names', () => {
  assert.deepEqual(playerNamesFromMember({ name: '  Alex Morgan  ' }), { firstName: 'Alex', lastName: 'Morgan' });
  assert.deepEqual(playerNamesFromMember({}), { firstName: 'Athlete', lastName: '' });
});
