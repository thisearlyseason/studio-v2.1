import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  communicationDb,
  communicationRequest,
  loadCommunicationRoute,
} from './helpers/communication-route-harness.mjs';

const routePath = '../../src/app/api/teams/members/lifecycle/route.ts';

async function invoke(initial, auth, body, options) {
  const store = communicationDb(initial, options);
  const loaded = await loadCommunicationRoute(routePath, store.db, auth);
  try {
    const response = await loaded.route.POST(communicationRequest(body));
    return { response, payload: await response.json(), ...store };
  } finally {
    loaded.dispose();
  }
}

test('owner decommissions a linked athlete atomically and removes inherited team access', async () => {
  const { response, records } = await invoke({
    'teams/team-a': { ownerId: 'owner-a', name: 'Falcons', isPro: true, planId: 'pro' },
    'teams/team-a/members/member-a': { userId: 'athlete-a', playerId: 'player-a', role: 'Player', position: 'Forward', status: 'active' },
    'users/athlete-a/teamMemberships/team-a': { teamId: 'team-a', isPro: true, planId: 'pro', status: 'active' },
    'players/player-a': { joinedTeamIds: ['team-a', 'team-b'], primaryTeamId: 'team-a' },
  }, { uid: 'owner-a' }, { teamId: 'team-a', memberId: 'member-a', action: 'remove', reason: 'Left the squad' }, { enforceReadBeforeWrite: true });

  assert.equal(response.status, 200);
  assert.equal(records.get('teams/team-a/members/member-a').status, 'removed');
  assert.equal(records.has('users/athlete-a/teamMemberships/team-a'), false);
  assert.deepEqual(records.get('players/player-a').joinedTeamIds, ['team-b']);
  assert.equal(records.get('players/player-a').primaryTeamId, 'team-b');
});

test('reinstatement reconstructs server-owned membership access and player linkage', async () => {
  const { response, records } = await invoke({
    'teams/team-a': { ownerId: 'owner-a', name: 'Falcons', isPro: true, planId: 'pro' },
    'teams/team-a/members/member-a': { userId: 'athlete-a', playerId: 'player-a', role: 'Player', position: 'Forward', status: 'removed' },
    'players/player-a': { joinedTeamIds: ['team-b'], primaryTeamId: 'team-b' },
  }, { uid: 'owner-a' }, { teamId: 'team-a', memberId: 'member-a', action: 'reinstate' }, { enforceReadBeforeWrite: true });

  assert.equal(response.status, 200);
  assert.equal(records.get('teams/team-a/members/member-a').status, 'active');
  assert.equal(records.get('users/athlete-a/teamMemberships/team-a').status, 'active');
  assert.equal(records.get('users/athlete-a/teamMemberships/team-a').isPro, true);
  assert.deepEqual(records.get('players/player-a').joinedTeamIds, ['team-b', 'team-a']);
});

test('ordinary members and staff cannot decommission privileged staff', async () => {
  const initial = {
    'teams/team-a': { ownerId: 'owner-a', name: 'Falcons' },
    'teams/team-a/members/ordinary-a': { userId: 'ordinary-a', role: 'Player', status: 'active' },
    'teams/team-a/members/staff-a': { userId: 'staff-a', role: 'Staff', position: 'Assistant Coach', status: 'active' },
    'teams/team-a/members/staff-b': { userId: 'staff-b', role: 'Staff', position: 'Coach', status: 'active' },
  };
  const ordinary = await invoke(initial, { uid: 'ordinary-a' }, { teamId: 'team-a', memberId: 'staff-a', action: 'remove', reason: 'No authority' });
  assert.equal(ordinary.response.status, 403);
  assert.equal(ordinary.records.get('teams/team-a/members/staff-a').status, 'active');

  const staff = await invoke(initial, { uid: 'staff-b' }, { teamId: 'team-a', memberId: 'staff-a', action: 'remove', reason: 'No authority' });
  assert.equal(staff.response.status, 403);
  assert.equal(staff.records.get('teams/team-a/members/staff-a').status, 'active');
});

test('authorization is rechecked inside the transaction after an actor is removed', async () => {
  const initial = {
    'teams/team-a': { ownerId: 'owner-a', name: 'Falcons' },
    'teams/team-a/members/staff-a': { userId: 'staff-a', role: 'Staff', position: 'Coach', status: 'active' },
    'teams/team-a/members/member-a': { userId: 'athlete-a', role: 'Player', status: 'active' },
  };
  const result = await invoke(initial, { uid: 'staff-a' }, {
    teamId: 'team-a', memberId: 'member-a', action: 'remove', reason: 'Race test',
  }, {
    beforeTransaction: ({ records }) => records.set('teams/team-a/members/staff-a', {
      ...records.get('teams/team-a/members/staff-a'), status: 'removed',
    }),
  });
  assert.equal(result.response.status, 403);
  assert.equal(result.records.get('teams/team-a/members/member-a').status, 'active');
});

test('registered users cannot write their server-owned team access projection', () => {
  const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const membershipBlock = rules.match(/match \/teamMemberships\/\{teamId\} \{([\s\S]*?)\n\s*\}/)?.[1] || '';
  assert.match(membershipBlock, /allow write: if isAnonymousSession\(\) && isOwner\(userId\)/);
  assert.doesNotMatch(membershipBlock, /allow write: if isSignedIn\(\) && isOwner\(userId\)/);
  assert.match(rules, /allow write: if subCollection != 'tokens' &&\s*subCollection != 'teamMemberships'/);

  const provider = fs.readFileSync(new URL('../src/components/providers/team-provider.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(provider, /updateDoc\(doc\(db, 'users', mData\.userId, 'teamMemberships'/);
  assert.doesNotMatch(provider, /updateDoc\(membershipRef, \{ code \}\)/);
});
