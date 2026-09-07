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

test('a recognized free plan does not satisfy canonical competition entitlement', async () => {
  const { db } = communicationDb({ 'teams/free-plan': { ownerUserId: 'free-owner', planId: 'free' } });
  await assert.rejects(
    () => resolveCompetitionAuthority({ db, actorUid: 'free-owner', teamId: 'free-plan' }),
    /Forbidden/,
  );
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

test('competition authority rejects missing and ambiguous League tenant ownership', async () => {
  const { db } = communicationDb({
    'teams/team-a': { ownerUserId: 'owner-a', planId: 'elite_league' },
    'leagues/missing-tenant': { creatorId: 'owner-a' },
    'leagues/ambiguous-tenant': { creatorId: 'owner-a', tenantId: 'team-a', hostTeamId: 'team-b' },
  });
  await assert.rejects(
    () => resolveCompetitionAuthority({ db, actorUid: 'owner-a', teamId: 'team-a', leagueId: 'missing-tenant' }),
    /Forbidden/,
  );
  await assert.rejects(
    () => resolveCompetitionAuthority({ db, actorUid: 'owner-a', teamId: 'team-a', leagueId: 'ambiguous-tenant' }),
    /Forbidden/,
  );
});

test('competition authority requires an explicitly active staff membership status', async () => {
  const seed = { 'teams/team-a': { ownerUserId: 'owner-a', planId: 'elite_league' } };
  for (const [actorUid, status] of [['pending-staff', 'pending'], ['inactive-staff', 'inactive'], ['unknown-staff', 'mystery'], ['statusless-staff', undefined]]) {
    seed[`teams/team-a/members/${actorUid}`] = { userId: actorUid, position: 'Coach', ...(status ? { status } : {}) };
  }
  const { db } = communicationDb(seed);
  for (const actorUid of ['pending-staff', 'inactive-staff', 'unknown-staff', 'statusless-staff']) {
    await assert.rejects(
      () => resolveCompetitionAuthority({ db, actorUid, teamId: 'team-a' }),
      /Forbidden/,
    );
  }
});

test('teamless competition authority is derived only from the authenticated actor profile in the transaction', async () => {
  const { db } = communicationDb({
    'users/creator-a': { role: 'league_creator', plan_type: 'free', accountStatus: 'active' },
    'users/ordinary': { role: 'parent', plan_type: 'free', accountStatus: 'active' },
    'users/removed': { role: 'league_creator', plan_type: 'elite_league', status: 'removed' },
    'users/disabled': { role: 'league_creator', plan_type: 'elite_league', accountStatus: 'disabled' },
    'users/deleted': { role: 'league_creator', plan_type: 'elite_league', deletionStatus: 'deleted' },
    'users/ineligible': { role: 'coach', plan_type: 'free', accountStatus: 'active' },
  });
  const authority = await db.runTransaction(transaction => resolveCompetitionAuthority({ db, transaction, actorUid: 'creator-a' }));
  assert.deepEqual(authority, {
    actorUid: 'creator-a', tenantId: 'profile:creator-a', memberRefPath: 'users/creator-a', role: 'league_creator', planId: 'free',
  });
  await assert.rejects(() => resolveCompetitionAuthority({ db, actorUid: 'creator-a' }), /Forbidden/);
  await assert.rejects(
    () => db.runTransaction(transaction => resolveCompetitionAuthority({ db, transaction, actorUid: 'creator-a', teamId: 'profile:creator-a' })),
    /Forbidden/,
  );
  for (const input of [
    { actorUid: 'ordinary' },
    { actorUid: 'removed' },
    { actorUid: 'disabled' },
    { actorUid: 'deleted' },
    { actorUid: 'ineligible' },
    { actorUid: 'ordinary', actorRole: 'league_creator' },
    { actorUid: 'ordinary', profileUid: 'creator-a', actorRole: 'league_creator' },
  ]) {
    await assert.rejects(
      () => db.runTransaction(transaction => resolveCompetitionAuthority({ db, transaction, ...input })),
      /Forbidden/,
    );
  }
});

test('legacy tenantless standalone League derives only to its current creator profile', async () => {
  const { db } = communicationDb({
    'users/creator-a': { role: 'league_creator', plan_type: 'free', accountStatus: 'active' },
    'users/creator-b': { role: 'league_creator', plan_type: 'free', accountStatus: 'active' },
    'leagues/standalone': { creatorId: 'creator-a', memberTeamIds: [] },
    'leagues/explicit-profile': { creatorId: 'creator-a', tenantId: 'profile:creator-a' },
    'leagues/invalid-explicit': { creatorId: 'creator-a', tenantId: 42, memberTeamIds: [] },
  });
  const authority = await db.runTransaction(transaction => resolveCompetitionAuthority({ db, transaction, actorUid: 'creator-a', leagueId: 'standalone' }));
  assert.equal(authority.tenantId, 'profile:creator-a');
  const explicit = await db.runTransaction(transaction => resolveCompetitionAuthority({ db, transaction, actorUid: 'creator-a', leagueId: 'explicit-profile' }));
  assert.equal(explicit.tenantId, 'profile:creator-a');
  await assert.rejects(
    () => db.runTransaction(transaction => resolveCompetitionAuthority({ db, transaction, actorUid: 'creator-a', leagueId: 'invalid-explicit' })),
    /Forbidden/,
  );
  await assert.rejects(
    () => db.runTransaction(transaction => resolveCompetitionAuthority({ db, transaction, actorUid: 'creator-b', leagueId: 'standalone' })),
    /Forbidden/,
  );
});

test('legacy tenantless team League derives only from one participant team currently owned by its creator', async () => {
  const { db } = communicationDb({
    'teams/creator-team': { ownerUserId: 'creator-a', planId: 'elite_league' },
    'teams/creator-team-2': { ownerUserId: 'creator-a', planId: 'elite_league' },
    'teams/foreign-team': { ownerUserId: 'other-owner', planId: 'elite_league' },
    'leagues/one-team': { creatorId: 'creator-a', memberTeamIds: ['creator-team'] },
    'leagues/multiple-teams': { creatorId: 'creator-a', memberTeamIds: ['creator-team', 'creator-team-2'] },
    'leagues/foreign-team': { creatorId: 'creator-a', memberTeamIds: ['foreign-team'] },
    'leagues/missing-team': { creatorId: 'creator-a', memberTeamIds: ['does-not-exist'] },
    'leagues/missing-creator': { memberTeamIds: ['creator-team'] },
  });
  const authority = await db.runTransaction(transaction => resolveCompetitionAuthority({ db, transaction, actorUid: 'creator-a', leagueId: 'one-team' }));
  assert.equal(authority.tenantId, 'creator-team');
  assert.equal(authority.role, 'owner');
  for (const leagueId of ['multiple-teams', 'foreign-team', 'missing-team', 'missing-creator']) {
    await assert.rejects(
      () => db.runTransaction(transaction => resolveCompetitionAuthority({ db, transaction, actorUid: 'creator-a', leagueId })),
      /Forbidden/,
    );
  }
});
