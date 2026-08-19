import assert from 'node:assert/strict';
import test from 'node:test';

const replicationModule = await import('../src/lib/server-tournament-replication.ts').catch(() => ({}));

test('tournament replication allowlists blueprint fields and resets operational state', () => {
  assert.equal(
    typeof replicationModule.buildTournamentReplicationEvent,
    'function',
    'buildTournamentReplicationEvent must exist'
  );

  const replicated = replicationModule.buildTournamentReplicationEvent({
    source: {
      title: 'Original Cup',
      date: '2026-09-01T12:00:00.000Z',
      endDate: '2026-09-03T12:00:00.000Z',
      location: 'Central Fields',
      description: 'Annual tournament',
      eventType: 'tournament',
      isTournament: true,
      registrationCost: '125',
      tournamentType: 'pool_play_knockout',
      gameLength: 50,
      breakLength: 10,
      gamesPerTeam: 4,
      maxDailyGamesPerTeam: 2,
      poolCount: 2,
      advancePerPool: 2,
      dailyWindows: [{ date: '2026-09-01', startTime: '09:00', endTime: '17:00' }],
      selectedFields: ['facility-1:Field A'],
      manualVenue: 'Overflow Field',
      waiverIds: ['waiver-1'],
      waiverDocuments: [{ id: 'waiver-1', title: 'Release', content: 'Terms' }],
      teamWaiverText: 'Terms',
      adminEmails: ['staff@example.com'],
      sport: 'Soccer',
      divisionTitle: 'U16',
      venueSettings: { mode: 'club' },
      registrationCode: 'OLDCODE',
      tournamentTeams: ['Alpha'],
      tournamentTeamsData: [{ id: 'alpha', name: 'Alpha' }],
      tournamentGames: [{ id: 'game-1' }],
      schedule: [{ id: 'slot-1' }],
      teamAgreements: { Alpha: { agreed: true } },
      refereePool: [{ id: 'ref-1' }],
      setupStatus: 'complete',
      bracketStatus: 'ready',
      scheduleStatus: 'ready',
      deploymentStatus: 'deployed',
      deploymentError: 'old error',
      privateOperationalField: 'must not copy',
    },
    title: 'Next Cup',
    eventId: 'event-new',
    teamId: 'team-1',
    actorUid: 'staff-1',
    ownerUserId: 'owner-1',
    registrationCode: 'NEWCODE',
    now: '2026-08-18T22:30:00.000Z',
  });

  assert.equal(replicated.title, 'Next Cup');
  assert.equal(replicated.registrationCode, 'NEWCODE');
  assert.equal(replicated.tournamentType, 'pool_play_knockout');
  assert.deepEqual(replicated.dailyWindows, [{ date: '2026-09-01', startTime: '09:00', endTime: '17:00' }]);
  assert.deepEqual(replicated.waiverIds, ['waiver-1']);
  assert.deepEqual(replicated.tournamentTeams, []);
  assert.deepEqual(replicated.tournamentTeamsData, []);
  assert.deepEqual(replicated.tournamentGames, []);
  assert.deepEqual(replicated.schedule, []);
  assert.deepEqual(replicated.teamAgreements, {});
  assert.deepEqual(replicated.refereePool, []);
  assert.equal(replicated.setupStatus, 'complete');
  assert.equal(replicated.bracketStatus, 'pending');
  assert.equal(replicated.scheduleStatus, 'pending');
  assert.equal(replicated.deploymentStatus, 'undeployed');
  assert.equal(replicated.deploymentError, '');
  assert.equal('privateOperationalField' in replicated, false);
});
