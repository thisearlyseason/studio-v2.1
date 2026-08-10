import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { generateTournamentSchedule } from '../src/lib/scheduler-utils.ts';
import {
  executeCompensatedScheduleMutation,
  prepareTournamentScheduleForDeployment,
  TournamentScheduleDeploymentError,
} from '../src/lib/server-tournament-schedule-deployment.ts';

const teams = Array.from({ length: 8 }, (_, index) => ({
  id: `team_${index + 1}`,
  name: `Team ${index + 1}`,
}));

const fields = Array.from({ length: 4 }, (_, index) => ({
  id: `facility_1:field_${index + 1}`,
  name: `Field ${index + 1}`,
}));

function event(overrides = {}) {
  return {
    isTournament: true,
    date: '2026-09-01',
    endDate: '2026-09-03',
    gameLength: 60,
    breakLength: 15,
    gamesPerTeam: 3,
    tournamentType: 'single_elimination',
    tournamentTeamsData: teams,
    selectedFields: fields.map(field => field.id),
    ...overrides,
  };
}

function schedule(overrides = {}) {
  return generateTournamentSchedule({
    teams,
    fields,
    startDate: '2026-09-01',
    endDate: '2026-09-03',
    startTime: '08:00',
    endTime: '20:00',
    gameLength: 60,
    breakLength: 15,
    tournamentType: 'single_elimination',
    ...overrides,
  });
}

test('server preparation preserves stable resources and reserves all possible finalists', () => {
  const prepared = prepareTournamentScheduleForDeployment(event(), schedule());
  const championship = prepared.find(game => game.round === 'Championship');
  assert.ok(championship);
  assert.equal(championship.possibleTeamIds.length, teams.length);
  assert.ok(prepared.every(game => game.resourceId.startsWith('facility_1:')));
});

test('server preparation rejects missing resource identities', () => {
  const games = schedule();
  delete games[0].resourceId;
  assert.throws(
    () => prepareTournamentScheduleForDeployment(event(), games),
    error => error instanceof TournamentScheduleDeploymentError && error.code === 'INCOMPLETE_GAME'
  );
});

test('server preparation rejects unconfigured resources and altered durations', () => {
  const unconfigured = schedule();
  unconfigured[0].resourceId = 'facility_2:unselected';
  assert.throws(
    () => prepareTournamentScheduleForDeployment(event(), unconfigured),
    error => error instanceof TournamentScheduleDeploymentError && error.code === 'UNCONFIGURED_RESOURCE'
  );

  const shortened = schedule();
  shortened[0].durationMinutes = 1;
  assert.throws(
    () => prepareTournamentScheduleForDeployment(event(), shortened),
    error => error instanceof TournamentScheduleDeploymentError && error.code === 'INVALID_GAME_DURATION'
  );
});

test('server preparation rejects brackets that do not match the selected elimination format', () => {
  const fourTeams = teams.slice(0, 4);
  const pairings = [
    [0, 1, '2026-09-01', '8:00 AM'],
    [2, 3, '2026-09-01', '9:15 AM'],
    [0, 2, '2026-09-01', '10:30 AM'],
    [1, 3, '2026-09-01', '11:45 AM'],
    [0, 3, '2026-09-02', '8:00 AM'],
    [1, 2, '2026-09-02', '9:15 AM'],
    [0, 1, '2026-09-02', '10:30 AM'],
  ];
  const exhibitions = pairings.map(([left, right, date, time], index) => ({
    id: `exhibition_${index}`,
    team1: fourTeams[left].name,
    team1Id: fourTeams[left].id,
    team2: fourTeams[right].name,
    team2Id: fourTeams[right].id,
    date,
    time,
    location: fields[0].name,
    resourceId: fields[0].id,
    round: 'Exhibition',
    stage: 'Main',
  }));

  assert.throws(
    () => prepareTournamentScheduleForDeployment(event({
      tournamentType: 'double_elimination',
      tournamentTeamsData: fourTeams,
    }), exhibitions),
    error => error instanceof TournamentScheduleDeploymentError && error.code === 'INVALID_TOURNAMENT_TOPOLOGY'
  );
});

test('server preparation rejects duplicated and omitted opening entrants', () => {
  const fourTeams = teams.slice(0, 4);
  const games = schedule({ teams: fourTeams });
  const incoming = new Set(games.flatMap(game => [game.winnerTo, game.loserTo].filter(Boolean)));
  const openingGames = games.filter(game => !incoming.has(game.id));
  openingGames[1].team1 = openingGames[0].team1;
  openingGames[1].team1Id = openingGames[0].team1Id;

  assert.throws(
    () => prepareTournamentScheduleForDeployment(event({ tournamentTeamsData: fourTeams }), games),
    error => error instanceof TournamentScheduleDeploymentError && error.code === 'INVALID_TOURNAMENT_ENTRANTS'
  );
});

test('server preparation rejects prefilled downstream bracket entrants', () => {
  const fourTeams = teams.slice(0, 4);
  const games = schedule({ teams: fourTeams });
  const championship = games.find(game => game.round === 'Championship');
  championship.team1 = fourTeams[1].name;
  championship.team1Id = fourTeams[1].id;

  assert.throws(
    () => prepareTournamentScheduleForDeployment(event({ tournamentTeamsData: fourTeams }), games),
    error => error instanceof TournamentScheduleDeploymentError && error.code === 'INVALID_TOURNAMENT_ENTRANTS'
  );
});

test('server preparation rejects possible-participant overlaps', () => {
  const games = schedule();
  const semifinal = games.find(game => game.round === 'Semi-Finals');
  const championship = games.find(game => game.round === 'Championship');
  championship.date = semifinal.date;
  championship.time = semifinal.time;
  championship.resourceId = fields[3].id;
  championship.location = fields[3].name;
  assert.throws(
    () => prepareTournamentScheduleForDeployment(event(), games),
    error => error instanceof TournamentScheduleDeploymentError &&
      ['SCHEDULE_CONFLICT', 'INVALID_GENERATED_SCHEDULE'].includes(error.code)
  );
});

test('pool knockout preparation carries pool-specific possible participants', () => {
  const games = schedule({
    tournamentType: 'pool_play_knockout',
    poolCount: 2,
    advancePerPool: 2,
    gamesPerTeam: 3,
  });
  const prepared = prepareTournamentScheduleForDeployment(event({
    tournamentType: 'pool_play_knockout',
    poolCount: 2,
    advancePerPool: 2,
  }), games);
  const semifinals = prepared.filter(game => game.round === 'Semi-Finals');
  assert.equal(semifinals.length, 2);
  assert.ok(semifinals.every(game => game.possibleTeamIds.length === teams.length));
});

test('double-elimination reset reserves every possible championship participant', () => {
  const games = schedule({ tournamentType: 'double_elimination' });
  const prepared = prepareTournamentScheduleForDeployment(event({
    tournamentType: 'double_elimination',
  }), games);
  const championship = prepared.find(game => game.stage === 'GF' && game.round === 'Championship');
  const reset = prepared.find(game => game.isResetMatch);
  assert.ok(championship);
  assert.ok(reset);
  assert.deepEqual(reset.possibleTeamIds, championship.possibleTeamIds);
  assert.equal(reset.possibleTeamIds.length, teams.length);
});

test('server preparation enforces daily limits against every possible bracket participant', () => {
  const oneDay = schedule({
    endDate: '2026-09-01',
    maxDailyGamesPerTeam: 3,
  });
  assert.throws(
    () => prepareTournamentScheduleForDeployment(event({
      endDate: '2026-09-01',
      maxDailyGamesPerTeam: 1,
    }), oneDay),
    error => error instanceof TournamentScheduleDeploymentError &&
      error.code === 'SCHEDULE_CONFLICT' &&
      error.conflicts.some(conflict => conflict.includes('exceeding the daily limit of 1'))
  );
});

test('compensated schedule mutations restore state after staging and publication failures', async () => {
  for (const failurePoint of ['mutate', 'publish']) {
    const state = { bookings: ['old'], event: 'old' };
    await assert.rejects(
      executeCompensatedScheduleMutation({
        mutate: async () => {
          state.bookings = ['partial-new'];
          if (failurePoint === 'mutate') throw new Error('injected staging failure');
          state.bookings = ['new'];
        },
        publish: async () => {
          if (failurePoint === 'publish') throw new Error('injected publication failure');
          state.event = 'new';
        },
        compensate: async () => {
          state.bookings = ['old'];
          state.event = 'old';
        },
      }),
      new RegExp(`injected ${failurePoint === 'mutate' ? 'staging' : 'publication'} failure`)
    );
    assert.deepEqual(state, { bookings: ['old'], event: 'old' });
  }
});

test('booking compensation retries transient restoration failures', async () => {
  let attempts = 0;
  await assert.rejects(
    executeCompensatedScheduleMutation({
      mutate: async () => { throw new Error('injected mutation failure'); },
      publish: async () => {},
      compensate: async () => {
        attempts++;
        if (attempts < 3) throw new Error('transient rollback failure');
      },
    }),
    /injected mutation failure/
  );
  assert.equal(attempts, 3);
});

test('exhausted booking compensation requires recovery before scheduling can resume', async () => {
  let attempts = 0;
  let recoveryFailure;
  await assert.rejects(
    executeCompensatedScheduleMutation({
      mutate: async () => { throw new Error('injected mutation failure'); },
      publish: async () => {},
      compensate: async () => {
        attempts++;
        throw new Error(`permanent rollback failure ${attempts}`);
      },
      onCompensationFailure: async error => {
        recoveryFailure = error;
      },
    }),
    error => error instanceof TournamentScheduleDeploymentError &&
      error.code === 'SCHEDULE_RECOVERY_REQUIRED' && error.status === 503
  );
  assert.equal(attempts, 3);
  assert.equal(recoveryFailure?.message, 'permanent rollback failure 3');
});

test('tournament schedule mutations share and preserve the global recovery lock', async () => {
  const source = await readFile(
    new URL('../src/lib/server-tournament-schedule-deployment.ts', import.meta.url),
    'utf8'
  );
  assert.match(source, /snapshot\.data\(\)\?\.recoveryRequired === true/);
  assert.match(source, /holder === holder && snapshot\.data\(\)\?\.recoveryRequired !== true/);
  assert.match(source, /recoveryRequired: true,[\s\S]*recoveryFailedAt:[\s\S]*recoveryError:/);
  assert.match(source, /onCompensationFailure: error => markLockRecoveryRequired\(holder, error\)/);
  assert.match(
    source,
    /export async function mutateTournamentSchedule[\s\S]*return withTournamentScheduleMutationLock\(\(\) => mutateTournamentScheduleUnlocked\(input\)\)/
  );
  assert.match(
    source,
    /await acquireLock\(holder\);[\s\S]{0,200}const eventSnapshot = await eventRef\.get\(\)/
  );
});

test('tournament schedules, live mutations, clearing, archiving, and demo cleanup use the server boundary', async () => {
  const [page, route, cleanup, seed, rules, provider, scorekeeperGame, scorekeeperList] = await Promise.all([
    readFile(new URL('../src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/tournaments/schedule/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/server-demo-cleanup.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/api/demo/seed/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../firestore.rules', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/providers/team-provider.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/tournaments/scorekeeper/[teamId]/[eventId]/[gameId]/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/tournaments/scorekeeper/[teamId]/[eventId]/page.tsx', import.meta.url), 'utf8'),
  ]);
  assert.match(page, /fetch\('\/api\/tournaments\/schedule'/);
  assert.match(page, /action: 'clear'/);
  assert.match(page, /method: 'DELETE'/);
  assert.match(route, /deployTournamentSchedule/);
  assert.match(route, /mutateTournamentSchedule/);
  assert.match(route, /clearTournamentSchedule/);
  assert.match(route, /archiveTournamentSchedule/);
  assert.match(route, /tournament-schedule-live-mutation/);
  assert.match(route, /isLiveMutation \? 300 : 30/);
  assert.match(page, /action: 'assign-referee'/);
  assert.match(page, /action: 'clear-referee'/);
  assert.match(page, /action: 'seed-pools'/);
  assert.match(provider, /action: 'score'/);
  assert.match(provider, /action: 'dispute'/);
  assert.doesNotMatch(
    `${page}\n${provider}\n${scorekeeperGame}\n${scorekeeperList}`,
    /updateDoc\([\s\S]{0,300}?\{\s*(?:schedule|tournamentGames)\s*:/
  );
  assert.match(cleanup, /collection\('scheduleBookings'\)/);
  assert.match(seed, /collection\('scheduleBookings'\)/);
  assert.match(rules, /match \/scheduleBookings\/\{bookingId\}[\s\S]*allow read, write: if false;/);
});
