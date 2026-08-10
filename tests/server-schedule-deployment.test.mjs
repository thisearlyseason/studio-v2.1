import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  prepareLeagueScheduleClearUpdates,
  prepareLeagueScheduleForDeployment,
  runRecoverableDeployment,
  ScheduleDeploymentError,
  validateLeagueAppendIntegrity,
  validateLeagueDeploymentIntegrity,
} from '../src/lib/server-schedule-deployment.ts';
import { generateLeagueSchedule } from '../src/lib/scheduler-utils.ts';

function league(overrides = {}) {
  return {
    name: 'City League',
    creatorId: 'owner-1',
    teams: {
      alpha: { teamName: 'Alpha', status: 'accepted', wins: 4, losses: 1, ties: 0, points: 12 },
      beta: { teamName: 'Beta', status: 'accepted', wins: 2, losses: 3, ties: 0, points: 6 },
      gamma: { teamName: 'Gamma', status: 'accepted', wins: 1, losses: 4, ties: 0, points: 3 },
    },
    schedulerConfig: {
      gameLength: '60',
      selectedFields: ['facility-1:Main Field', 'facility-1:Field 2'],
    },
    schedule: [],
    ...overrides,
  };
}

function game(overrides = {}) {
  return {
    id: 'lg_1',
    team1Id: 'alpha',
    team2Id: 'beta',
    team1: 'Client supplied name',
    team2: 'Client supplied name',
    date: '2026-09-01',
    time: '6:00 PM',
    location: 'Main Field',
    resourceId: 'facility-1:Main Field',
    ...overrides,
  };
}

test('replacement normalizes trusted team names and stable resource identities', () => {
  const result = prepareLeagueScheduleForDeployment(
    'league-1',
    league(),
    'replace',
    [game()]
  );

  assert.equal(result.games[0].team1, 'Alpha');
  assert.equal(result.games[0].team2, 'Beta');
  assert.equal(result.games[0].resourceId, 'facility-1:Main Field');
  assert.equal(result.games[0].durationMinutes, 60);
  assert.equal(result.games[0].time, '6:00 PM');
  assert.equal(result.games[0].location, 'Main Field');
});

test('replacement rejects unconfigured fields and altered durations', () => {
  assert.throws(
    () => prepareLeagueScheduleForDeployment(
      'league-1',
      league(),
      'replace',
      [game({ resourceId: 'facility-2:Other Field', location: 'Other Field' })]
    ),
    error => error instanceof ScheduleDeploymentError && error.code === 'UNCONFIGURED_RESOURCE'
  );
  assert.throws(
    () => prepareLeagueScheduleForDeployment(
      'league-1',
      league(),
      'replace',
      [game({ durationMinutes: 1 })]
    ),
    error => error instanceof ScheduleDeploymentError && error.code === 'DURATION_MISMATCH'
  );

  const canonical = prepareLeagueScheduleForDeployment(
    'league-1',
    league(),
    'replace',
    [game({ location: 'Offsite Park' })]
  );
  assert.equal(canonical.games[0].location, 'Main Field');
});

test('replacement rejects overlapping teams and fields', () => {
  assert.throws(
    () => prepareLeagueScheduleForDeployment(
      'league-1',
      league(),
      'replace',
      [
        game(),
        game({
          id: 'lg_2',
          team1Id: 'alpha',
          team2Id: 'gamma',
          time: '6:30 PM',
        }),
      ]
    ),
    error => error instanceof ScheduleDeploymentError &&
      error.code === 'SCHEDULE_CONFLICT' &&
      error.conflicts.some(conflict => conflict.includes('alpha')) &&
      error.conflicts.some(conflict => conflict.includes('Main Field'))
  );
});

test('manual additions use deterministic IDs and are idempotent on retry', () => {
  const manual = {
    team1Id: 'alpha',
    team2Id: 'gamma',
    date: '2026-09-02',
    time: '18:00',
    location: 'Field 2',
  };
  const first = prepareLeagueScheduleForDeployment(
    'league-1',
    league(),
    'append',
    undefined,
    manual
  );
  assert.match(first.appendedGame.id, /^manual_[a-f0-9]{24}$/);
  assert.equal(first.appendedGame.isExhibition, true);
  assert.equal(first.appendedGame.resourceId, 'facility-1:Field 2');

  const retry = prepareLeagueScheduleForDeployment(
    'league-1',
    league({ schedule: first.games }),
    'append',
    undefined,
    manual
  );
  assert.equal(retry.idempotent, true);
  assert.equal(retry.games.length, 1);
  assert.equal(retry.appendedGame.id, first.appendedGame.id);
});

test('manual additions enforce season, blackout, window, rest, and double-header rules', () => {
  const configured = league({
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    schedulerConfig: {
      gameLength: 60,
      breakLength: 15,
      gamesPerTeam: 4,
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      startTime: '18:00',
      endTime: '21:00',
      playDays: [2, 3],
      blackoutDates: ['2026-09-02'],
      doubleHeaderOption: 'sameTeam',
      selectedFields: ['facility-1:Main Field', 'facility-1:Field 2'],
    },
  });

  const blackout = prepareLeagueScheduleForDeployment(
    'league-1', configured, 'append', undefined,
    game({ id: undefined, date: '2026-09-02' })
  );
  assert.throws(
    () => validateLeagueAppendIntegrity(configured, blackout.games),
    error => error instanceof ScheduleDeploymentError && error.code === 'DISALLOWED_PLAY_DATE'
  );

  const first = game({ date: '2026-09-01', time: '6:00 PM' });
  const second = game({
    id: undefined,
    team2Id: 'gamma',
    team2: 'Gamma',
    date: '2026-09-01',
    time: '7:15 PM',
    location: 'Field 2',
    resourceId: 'facility-1:Field 2',
  });
  const doubleHeader = prepareLeagueScheduleForDeployment(
    'league-1',
    { ...configured, schedule: [first] },
    'append',
    undefined,
    second
  );
  assert.throws(
    () => validateLeagueAppendIntegrity(configured, doubleHeader.games),
    error => error instanceof ScheduleDeploymentError && error.code === 'DOUBLEHEADER_OPPONENT'
  );
});

test('deployment rejects teams that are not accepted into the league', () => {
  assert.throws(
    () => prepareLeagueScheduleForDeployment(
      'league-1',
      league(),
      'replace',
      [game({ team2Id: 'outsider' })]
    ),
    error => error instanceof ScheduleDeploymentError && error.code === 'TEAM_NOT_ENROLLED'
  );
});

test('browser league schedule mutations use the server route and bookings remain private', async () => {
  const [provider, rules, route, teamEventRoute, page, service] = await Promise.all([
    readFile(new URL('../src/components/providers/team-provider.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/leagues/schedule/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/teams/events/action/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/(dashboard)/leagues/leagues-page-content.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/server-schedule-deployment.ts', import.meta.url), 'utf8'),
  ]);

  assert.match(provider, /fetch\('\/api\/leagues\/schedule'/);
  assert.match(provider, /action: 'append'/);
  assert.match(provider, /action: 'replace'/);
  assert.match(rules, /match \/scheduleBookings\/\{bookingId\}[\s\S]*allow read, write: if false;/);
  assert.match(rules, /match \/scheduleBookingLocks\/\{lockId\}[\s\S]*allow read, write: if false;/);
  assert.match(route, /clearLeagueSchedule/);
  assert.match(route, /mutateLeagueScheduleGame/);
  assert.match(route, /removeLeagueTeamMembership/);
  assert.match(route, /body\.action === 'clear'/);
  assert.match(route, /league-schedule-game-mutation/);
  assert.match(route, /isLiveMutation \? 300 : 30/);
  assert.match(service, /acquireScheduleMutationLock/);
  assert.match(service, /withScheduleMutationLock\(\(\) => mutateLeagueScheduleGameUnlocked/);
  assert.match(service, /runRecoverableDeployment/);
  assert.match(teamEventRoute, /withScheduleMutationLock/);
  assert.match(teamEventRoute, /collection\('scheduleBookings'\)/);
  assert.match(teamEventRoute, /assertEventAvailability/);
  assert.match(provider, /action: 'create'.*teamId: activeTeam\.id/s);
  assert.match(provider, /action: 'update'.*teamId: activeTeam\.id/s);
  assert.match(provider, /action: 'delete'.*teamId: activeTeam\.id/s);
  assert.match(service, /collectionGroup\('events'\)/);
  assert.match(service, /scheduleBookings.*sourceId/s);
  assert.match(provider, /action: 'score'/);
  assert.match(provider, /action: 'dispute'/);
  assert.doesNotMatch(`${provider}\n${page}`, /updateDoc\([\s\S]{0,300}?\{\s*(?:schedule|tournamentGames)\s*:/);
  assert.match(page, /action: 'clear'/);
  assert.match(page, /mode\s*\}\),/);
  assert.match(page, /action: 'configure'/);
});

test('manual exhibitions can coexist with a complete official schedule without raising game caps', () => {
  const configuredLeague = league({
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    schedulerConfig: {
      gameLength: '60',
      breakLength: '15',
      gamesPerTeam: '2',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      startTime: '18:00',
      endTime: '22:00',
      playDays: [1, 2, 3, 4, 5, 6, 0],
      doubleHeaderOption: 'none',
      selectedFields: ['facility-1:Main Field', 'facility-1:Field 2'],
    },
  });
  const official = generateLeagueSchedule({
    teams: [
      { id: 'alpha', name: 'Alpha' },
      { id: 'beta', name: 'Beta' },
      { id: 'gamma', name: 'Gamma' },
    ],
    fields: [
      { id: 'facility-1:Main Field', name: 'Main Field' },
      { id: 'facility-1:Field 2', name: 'Field 2' },
    ],
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    startTime: '18:00',
    endTime: '22:00',
    gameLength: 60,
    breakLength: 15,
    gamesPerTeam: 2,
    doubleHeaderOption: 'none',
  });
  const deployed = prepareLeagueScheduleForDeployment('league-1', configuredLeague, 'replace', official).games;
  const appended = prepareLeagueScheduleForDeployment(
    'league-1',
    { ...configuredLeague, schedule: deployed },
    'append',
    undefined,
    {
      team1Id: 'alpha',
      team2Id: 'beta',
      date: '2026-09-20',
      time: '6:00 PM',
      location: 'Main Field',
      resourceId: 'facility-1:Main Field',
    }
  );
  assert.equal(appended.appendedGame.isExhibition, true);
  assert.doesNotThrow(() => validateLeagueAppendIntegrity(configuredLeague, appended.games));
});

test('recoverable deployment restores after apply failure and retries transient recovery failures', async () => {
  const original = new Error('batch failed');
  let recoveries = 0;
  await assert.rejects(
    runRecoverableDeployment(
      async () => { throw original; },
      async () => {
        recoveries += 1;
        if (recoveries < 3) throw new Error('transient recovery failure');
      }
    ),
    error => error === original
  );
  assert.equal(recoveries, 3);
});

test('schedule cleanup preserves archive semantics and purges standings only in purge mode', () => {
  const archived = prepareLeagueScheduleClearUpdates('archive', 'owner-1', '2026-09-05T12:00:00.000Z');
  assert.deepEqual(archived.schedule, []);
  assert.equal(archived.isArchived, true);
  assert.equal('teams' in archived, false);

  const purged = prepareLeagueScheduleClearUpdates('purge', 'owner-1', '2026-09-05T12:00:00.000Z');
  assert.deepEqual(purged.schedule, []);
  assert.deepEqual(purged.teams, {});
  assert.equal('isArchived' in purged, false);
});

test('authenticated deployment integrity rejects incomplete handcrafted schedules', () => {
  const configuredLeague = league({
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    schedulerConfig: {
      gameLength: '60',
      breakLength: '15',
      gamesPerTeam: '2',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      startTime: '18:00',
      endTime: '21:00',
      playDays: [1, 2, 3, 4, 5, 6, 0],
      doubleHeaderOption: 'none',
      selectedFields: ['facility-1:Main Field', 'facility-1:Field 2'],
    },
  });
  const prepared = prepareLeagueScheduleForDeployment('league-1', configuredLeague, 'replace', [game()]);
  assert.throws(
    () => validateLeagueDeploymentIntegrity(configuredLeague, prepared.games),
    error => error instanceof ScheduleDeploymentError && error.code === 'INVALID_GENERATED_SCHEDULE'
  );
});

test('authenticated deployment integrity accepts a complete balanced schedule', () => {
  const configuredLeague = league({
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    schedulerConfig: {
      gameLength: '60',
      breakLength: '15',
      gamesPerTeam: '2',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      startTime: '18:00',
      endTime: '21:00',
      playDays: [1, 2, 3, 4, 5, 6, 0],
      doubleHeaderOption: 'none',
      selectedFields: ['facility-1:Main Field', 'facility-1:Field 2'],
    },
  });
  const generated = generateLeagueSchedule({
    teams: [
      { id: 'alpha', name: 'Alpha' },
      { id: 'beta', name: 'Beta' },
      { id: 'gamma', name: 'Gamma' },
    ],
    fields: [
      { id: 'facility-1:Main Field', name: 'Main Field' },
      { id: 'facility-1:Field 2', name: 'Field 2' },
    ],
    startDate: '2026-09-01',
    endDate: '2026-09-30',
    startTime: '18:00',
    endTime: '21:00',
    gameLength: 60,
    breakLength: 15,
    gamesPerTeam: 2,
    doubleHeaderOption: 'none',
  });
  const prepared = prepareLeagueScheduleForDeployment('league-1', configuredLeague, 'replace', generated);
  assert.doesNotThrow(() => validateLeagueDeploymentIntegrity(configuredLeague, prepared.games));
});
