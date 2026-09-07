import assert from 'node:assert/strict';
import test from 'node:test';
import { communicationDb } from './helpers/communication-route-harness.mjs';
import {
  assertCompetitionMutationAuthority,
  resolveCompetitionAuthority,
} from '../src/lib/server-competition-authority.ts';

const authoritySeed = {
  'teams/team-a': {
    ownerUserId: 'owner-a',
    planId: 'elite_league',
    schoolAdminIds: ['oa-a'],
  },
  'teams/team-a/members/coach-record': {
    userId: 'coach-a',
    position: 'Assistant Coach',
    status: 'active',
  },
  'teams/team-a/members/staff-a': {
    userId: 'staff-a',
    position: 'Athletic Director',
    status: 'active',
  },
  'teams/team-a/members/member-a': {
    userId: 'member-a',
    position: 'Player',
    status: 'active',
  },
  'teams/team-a/members/removed-a': {
    userId: 'removed-a',
    position: 'Coach',
    status: 'removed',
  },
  'teams/team-b': { ownerUserId: 'owner-b', planId: 'elite_league' },
  'teams/team-b/members/cross-tenant': {
    userId: 'cross-tenant',
    position: 'Coach',
    status: 'active',
  },
  'leagues/league-a': { creatorId: 'organizer-a', tenantId: 'team-a' },
};

test('competition authority resolves owner, organizer, canonical staff, and delegated school authority', async () => {
  const { db } = communicationDb(authoritySeed);
  assert.deepEqual(await resolveCompetitionAuthority({ db, actorUid: 'owner-a', teamId: 'team-a', leagueId: 'league-a' }), {
    actorUid: 'owner-a', tenantId: 'team-a', memberRefPath: 'teams/team-a', role: 'owner', planId: 'elite_league',
  });
  assert.deepEqual(await resolveCompetitionAuthority({ db, actorUid: 'organizer-a', teamId: 'team-a', leagueId: 'league-a' }), {
    actorUid: 'organizer-a', tenantId: 'team-a', memberRefPath: 'leagues/league-a', role: 'league_creator', planId: 'elite_league',
  });
  assert.equal((await resolveCompetitionAuthority({ db, actorUid: 'coach-a', teamId: 'team-a' })).role, 'coach');
  assert.equal((await resolveCompetitionAuthority({ db, actorUid: 'staff-a', teamId: 'team-a' })).role, 'staff');
  assert.deepEqual(await resolveCompetitionAuthority({ db, actorUid: 'oa-a', teamId: 'team-a' }), {
    actorUid: 'oa-a', tenantId: 'team-a', memberRefPath: 'teams/team-a', role: 'staff', planId: 'elite_league',
  });
  assert.equal((await resolveCompetitionAuthority({ db, actorUid: 'global-admin', actorRole: 'superadmin', teamId: 'team-a' })).role, 'superadmin');
});

test('competition authority preserves organization-owner, OA, and delegated hub staff representations', async () => {
  const { db } = communicationDb({
    'teams/school-hub': { ownerUserId: 'school-owner', planId: 'school', schoolAdminIds: ['oa-hub'] },
    'teams/school-hub/members/delegated-record': { userId: 'delegated-ad', position: 'Director of Athletics', status: 'active' },
    'teams/school-squad': { ownerUserId: 'squad-owner', planId: 'school', schoolId: 'school-hub' },
  });
  assert.equal((await resolveCompetitionAuthority({ db, actorUid: 'school-owner', teamId: 'school-squad' })).role, 'staff');
  assert.equal((await resolveCompetitionAuthority({ db, actorUid: 'oa-hub', teamId: 'school-squad' })).role, 'staff');
  const delegated = await resolveCompetitionAuthority({ db, actorUid: 'delegated-ad', teamId: 'school-squad' });
  assert.equal(delegated.role, 'staff');
  assert.equal(delegated.memberRefPath, 'teams/school-hub/members/delegated-record');
});

test('competition authority fails closed for ordinary, removed, cross-tenant, and invalid-plan actors', async () => {
  const { db } = communicationDb({
    ...authoritySeed,
    'teams/missing-plan': { ownerUserId: 'missing-owner' },
    'teams/unknown-plan': { ownerUserId: 'unknown-owner', planId: 'future_magic' },
  });
  for (const input of [
    { actorUid: 'member-a', teamId: 'team-a' },
    { actorUid: 'removed-a', teamId: 'team-a' },
    { actorUid: 'cross-tenant', teamId: 'team-a' },
    { actorUid: 'owner-b', teamId: 'team-b', leagueId: 'league-a' },
    { actorUid: 'missing-owner', teamId: 'missing-plan' },
    { actorUid: 'unknown-owner', teamId: 'unknown-plan' },
  ]) {
    await assert.rejects(() => resolveCompetitionAuthority({ db, ...input }), /Forbidden/);
  }
});

test('competition mutation authority revalidates non-UID membership inside the committing transaction', async () => {
  let demote = false;
  const { db } = communicationDb(authoritySeed, {
    beforeTransaction: ({ records }) => {
      if (demote) records.set('teams/team-a/members/coach-record', { userId: 'coach-a', position: 'Player', status: 'active' });
    },
  });
  assert.equal((await resolveCompetitionAuthority({ db, actorUid: 'coach-a', teamId: 'team-a' })).memberRefPath, 'teams/team-a/members/coach-record');
  demote = true;
  await assert.rejects(
    () => db.runTransaction(transaction => assertCompetitionMutationAuthority({ db, transaction, actorUid: 'coach-a', teamId: 'team-a' })),
    /Forbidden/,
  );
});
