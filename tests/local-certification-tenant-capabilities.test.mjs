import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFixtureCatalog } from '../scripts/qa/certification/fixture-catalog.mjs';
import { inspectTenantCapabilities } from '../scripts/qa/certification/local/tenant-capabilities.mjs';

const catalog = buildFixtureCatalog('tenant-contract');
const byPath = new Map(catalog.firestoreDocuments.map(item => [item.path, item]));
const identity = alias => catalog.identities.find(item => item.alias === alias);
const team = alias => catalog.teams.find(item => item.alias === alias);

test('Task 4 fixtures use the paths and fields consumed by recruiting and Family', () => {
  const adult = 'qa-player-adult-b-tenant-contract';
  assert.equal(byPath.get(`players/${adult}/recruitingProfile/profile`)?.data.status, 'active');
  assert.ok(byPath.has(`players/${adult}/recruitingProfile/metrics`));
  assert.ok(byPath.has(`players/${adult}/recruitingContact/contact`));
  assert.ok([...byPath.keys()].some(path => path.startsWith(`players/${adult}/stats/`)));
  assert.equal([...byPath.keys()].some(path => path.startsWith(`players/${adult}/videos/`)), false);
  assert.ok([...byPath.keys()].some(path => path.startsWith('players/qa-player-adult-a-tenant-contract/videos/')));
  assert.equal([...byPath.keys()].some(path => path.includes('/recruitingProfiles/')), false);

  const parent = identity('qa-parent-a');
  const payments = catalog.firestoreDocuments.filter(item => item.path.startsWith(`users/${parent.uid}/payments/`));
  assert.equal(payments.length, 3);
  assert.deepEqual(new Set(payments.map(item => item.data.status)), new Set(['paid', 'pending', 'overdue']));
  assert.ok(payments.every(item => typeof item.data.amount === 'number' && typeof item.data.date === 'string'));
});

test('youth, waiver, global document, roster, join, creator, and race graphs match real consumers', () => {
  const youthC = 'qa-player-youth-c-tenant-contract';
  const teamC = team('qa-team-c');
  const member = byPath.get(`teams/${teamC.id}/members/${youthC}`)?.data;
  assert.equal(member?.parentId, identity('qa-parent-a').uid);
  assert.equal(member?.playerId, youthC);
  assert.equal(catalog.youthInvite.childId, youthC);
  assert.equal(catalog.youthInvite.startState, 'no-active-invite');
  assert.equal([...byPath.keys()].some(path => path.startsWith('youthInvites/')), false);

  assert.equal(byPath.get(`teams/${teamC.id}/documents/qa-team-c-waiver-v1-tenant-contract`)?.data.ownerUserId, teamC.ownerUserId);
  const deployment = catalog.globalWaiverDeployment;
  assert.ok(byPath.has(deployment.masterPath));
  assert.ok(deployment.copyPaths.length >= 2);
  assert.ok(deployment.copyPaths.every(path => byPath.get(path)?.data.deploymentId === deployment.deploymentId));

  assert.ok(catalog.rosterVariants.some(item => item.variant === 'accented'));
  assert.ok(catalog.rosterVariants.some(item => item.variant === 'removed'));
  assert.ok(['qa-team-a', 'qa-team-b', 'qa-team-c'].every(alias => {
    const value = byPath.get(`teams/${team(alias).id}`)?.data;
    return value.code && value.teamCode && value.inviteCode;
  }));
  assert.ok(catalog.creationActors.every(actor => actor.tenantAliases.length === 0));
  assert.equal(catalog.raceFixtures.find(item => item.alias === 'qa-race-team-capacity').participantAliases[0],
    catalog.raceFixtures.find(item => item.alias === 'qa-race-team-capacity').participantAliases[1]);
  assert.equal(catalog.raceFixtures.find(item => item.alias === 'qa-race-join-code').targetAlias, 'qa-player-youth-c');
});

test('tenant capabilities fail closed and include dynamic cleanup ownership', () => {
  const result = inspectTenantCapabilities(catalog);
  assert.deepEqual(result.missing, []);
  assert.ok(result.capabilities.every(item => item.state === 'READY'));
  assert.equal(catalog.dynamicCleanupContract.registrationRequiredBeforeWrite, true);
  assert.deepEqual(catalog.dynamicCleanupContract.resourceKinds, ['firestore', 'auth', 'storage', 'browser']);
  assert.equal(Object.isFrozen(result), true);

  const forged = { ...catalog, youthInvite: null };
  assert.ok(inspectTenantCapabilities(forged).missing.includes('youth-invite'));
});
