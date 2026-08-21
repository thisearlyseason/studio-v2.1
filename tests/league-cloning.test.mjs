import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertLeagueCloneCapacity,
  buildLeagueCloneResult,
  buildLeagueCloneDocument,
  getLeagueCloneSuccessCopy,
  getLeagueDeploymentLabel,
  parseLeagueCloneRequest,
  resolveLeagueCloneIdentity,
} from '../src/lib/server-league-cloning.ts';

const sourceDivision = {
  id: 'league_source',
  name: 'City League',
  divisionTitle: 'U14 Gold',
  creatorId: 'owner-1',
  sport: 'Soccer',
  description: 'Competitive youth league',
  startDate: '2026-09-01',
  endDate: '2027-02-01',
  ages: '13-14',
  contactEmail: 'league@example.com',
  contactPhone: '555-0100',
  registrationCost: '250',
  paymentInstructions: 'Pay online',
  socialLinks: { instagram: '@cityleague' },
  requiredSquads: 8,
  blackoutDaysOfWeek: [0],
  schedulerConfig: { gamesPerTeam: 12, selectedFields: ['field-1'] },
  teams: { team_1: { teamName: 'Falcons' } },
  individualRecruits: { player_1: { name: 'Player' } },
  schedule: [{ id: 'game-1' }],
  standings: [{ teamId: 'team_1', wins: 4 }],
  memberTeamIds: ['team_1'],
  memberUserIds: ['owner-1', 'coach-1'],
  memberIndivIds: ['player_1'],
  inviteCode: 'SOURCE',
  deploymentStatus: 'deployed',
  privateOperationalField: 'do not copy',
};

test('a division clone stays in the source league and receives a distinct division name', () => {
  const identity = resolveLeagueCloneIdentity({
    source: sourceDivision,
    destination: 'division',
    requestedName: ' U14 Silver ',
    existingLeagues: [sourceDivision],
  });

  assert.deepEqual(identity, {
    name: 'City League',
    divisionTitle: 'U14 Silver',
  });
});

test('a new-league clone uses a unique league name and keeps the selected division identity', () => {
  const identity = resolveLeagueCloneIdentity({
    source: sourceDivision,
    destination: 'league',
    requestedName: ' Regional League ',
    existingLeagues: [sourceDivision],
  });

  assert.deepEqual(identity, {
    name: 'Regional League',
    divisionTitle: 'U14 Gold',
  });
});

test('clone destinations cannot collide with an existing division or league', () => {
  const existingLeagues = [
    sourceDivision,
    { id: 'league_silver', name: 'City League', divisionTitle: 'U14 Silver' },
    { id: 'league_regional', name: 'Regional League', divisionTitle: '' },
  ];

  assert.throws(
    () => resolveLeagueCloneIdentity({
      source: sourceDivision,
      destination: 'division',
      requestedName: 'u14 silver',
      existingLeagues,
    }),
    /DIVISION_ALREADY_EXISTS/
  );
  assert.throws(
    () => resolveLeagueCloneIdentity({
      source: sourceDivision,
      destination: 'league',
      requestedName: 'regional league',
      existingLeagues,
    }),
    /LEAGUE_ALREADY_EXISTS/
  );
});

test('clone requests require an explicit creation destination and reject the retired overwrite shape', () => {
  assert.deepEqual(
    parseLeagueCloneRequest({
      leagueId: 'league_source',
      destination: 'division',
      name: 'U14 Silver',
    }),
    { sourceLeagueId: 'league_source', destination: 'division', requestedName: 'U14 Silver' }
  );
  assert.deepEqual(
    parseLeagueCloneRequest({
      leagueId: 'league_source',
      destination: 'league',
      name: 'Regional League',
    }),
    { sourceLeagueId: 'league_source', destination: 'league', requestedName: 'Regional League' }
  );
  assert.throws(
    () => parseLeagueCloneRequest({
      leagueId: 'league_source',
      targetLeagueIds: ['league_silver'],
    }),
    /CLONE_DESTINATION_INVALID/
  );
});

test('adding a division does not consume another league slot, but creating a league does', () => {
  const existingLeagues = [
    { id: 'league_gold', name: 'City League', divisionTitle: 'Gold' },
    { id: 'league_silver', name: 'City League', divisionTitle: 'Silver' },
  ];

  assert.doesNotThrow(() => assertLeagueCloneCapacity({
    destination: 'division',
    existingLeagues,
    leagueLimit: 1,
  }));
  assert.throws(() => assertLeagueCloneCapacity({
    destination: 'league',
    existingLeagues,
    leagueLimit: 1,
  }), /LEAGUE_LIMIT_REACHED/);
});

test('a cloned division copies configuration but resets all operational data', () => {
  const cloned = buildLeagueCloneDocument({
    source: sourceDivision,
    leagueId: 'league_new',
    actorUid: 'owner-1',
    identity: { name: 'City League', divisionTitle: 'U14 Silver' },
    now: '2026-08-21T05:00:00.000Z',
  });

  assert.equal(cloned.id, 'league_new');
  assert.equal(cloned.name, 'City League');
  assert.equal(cloned.divisionTitle, 'U14 Silver');
  assert.equal(cloned.sport, 'Soccer');
  assert.equal(cloned.description, 'Competitive youth league');
  assert.deepEqual(cloned.schedulerConfig, { gamesPerTeam: 12, selectedFields: ['field-1'] });
  assert.deepEqual(cloned.teams, {});
  assert.deepEqual(cloned.individualRecruits, {});
  assert.deepEqual(cloned.schedule, []);
  assert.deepEqual(cloned.memberTeamIds, []);
  assert.deepEqual(cloned.memberUserIds, ['owner-1']);
  assert.deepEqual(cloned.memberIndivIds, []);
  assert.equal(cloned.deploymentStatus, 'undeployed');
  assert.equal(cloned.is_active, false);
  assert.equal(cloned.settingsCopiedFrom, 'league_source');
  for (const excluded of ['standings', 'inviteCode', 'privateOperationalField']) {
    assert.equal(excluded in cloned, false, `${excluded} must not be copied`);
  }
});

test('clone results identify exactly where the new setup was created', () => {
  const divisionResult = buildLeagueCloneResult({
    leagueId: 'league_new_division',
    destination: 'division',
    identity: { name: 'City League', divisionTitle: 'U14 Silver' },
  });
  const leagueResult = buildLeagueCloneResult({
    leagueId: 'league_new_league',
    destination: 'league',
    identity: { name: 'Regional League', divisionTitle: 'U14 Gold' },
  });

  assert.deepEqual(divisionResult, {
    leagueId: 'league_new_division',
    destination: 'division',
    name: 'City League',
    divisionTitle: 'U14 Silver',
    status: 'setup',
  });
  assert.deepEqual(leagueResult, {
    leagueId: 'league_new_league',
    destination: 'league',
    name: 'Regional League',
    divisionTitle: 'U14 Gold',
    status: 'setup',
  });
});

test('clone success copy names the destination and explains that setup is not live', () => {
  assert.deepEqual(
    getLeagueCloneSuccessCopy({
      leagueId: 'league_new_division',
      destination: 'division',
      name: 'City League',
      divisionTitle: 'U14 Silver',
      status: 'setup',
    }),
    {
      title: 'Division created',
      description: '“U14 Silver” was added to “City League”. Opening it now. It starts in Setup with no teams or schedule.',
    }
  );
  assert.deepEqual(
    getLeagueCloneSuccessCopy({
      leagueId: 'league_new_league',
      destination: 'league',
      name: 'Regional League',
      divisionTitle: 'U14 Gold',
      status: 'setup',
    }),
    {
      title: 'League created',
      description: '“Regional League” was created as a separate league. Opening it now. It starts in Setup with no teams or schedule.',
    }
  );
});

test('league cards use plain setup and live labels instead of draft terminology', () => {
  assert.equal(getLeagueDeploymentLabel({ deploymentStatus: 'undeployed', schedule: [] }), 'Setup — no schedule');
  assert.equal(getLeagueDeploymentLabel({ deploymentStatus: 'deployed', schedule: [] }), 'Schedule live');
  assert.equal(getLeagueDeploymentLabel({ deploymentStatus: 'undeployed', schedule: [{ id: 'game-1' }] }), 'Schedule live');
});
