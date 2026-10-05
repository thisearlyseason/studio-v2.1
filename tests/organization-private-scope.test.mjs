import test from 'node:test';
import assert from 'node:assert/strict';
import { privateOrganizationSquads } from '../src/lib/organization-private-scope.ts';

const squads = [{ id: 'a', ownerUserId: 'owner' }, { id: 'b', ownerUserId: 'owner' }];

test('recognized staff positions retain private records even with a Member role', () => {
  assert.deepEqual(privateOrganizationSquads(squads, [{ id: 'a', role: 'Member', position: 'Coach' }, { id: 'b', role: 'Member', position: 'Player' }], 'delegate', false).map(t => t.id), ['a']);
});

test('hub visibility does not grant private squad access without a staff membership', () => {
  assert.deepEqual(privateOrganizationSquads(squads, [{ id: 'hub', role: 'Admin' }, { id: 'a', role: 'Admin' }], 'delegate', false).map(t => t.id), ['a']);
});
test('ordinary and removed membership projections cannot request staff records', () => {
  assert.deepEqual(privateOrganizationSquads(squads, [{ id: 'a', role: 'Member' }, { id: 'b', role: 'Admin', status: 'removed' }], 'delegate', false), []);
});
test('owners and trusted administrators retain their existing private squad views', () => {
  assert.deepEqual(privateOrganizationSquads(squads, [], 'owner', false), squads);
  assert.deepEqual(privateOrganizationSquads(squads, [], 'trusted', true), squads);
});
