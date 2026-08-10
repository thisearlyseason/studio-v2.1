import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSchedule } from '../src/lib/intelligent-scheduler.ts';

const teams = ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((name, index) => ({
  id: `team-${index + 1}`,
  name,
}));

function config(overrides = {}) {
  return {
    teams,
    fields: ['field-1', 'field-2'],
    startDate: '2026-08-10',
    endDate: '2026-08-24',
    startTime: '18:00',
    endTime: '21:00',
    gameLength: 60,
    breakLength: 15,
    gamesPerTeam: 1,
    doubleHeaderOption: 'none',
    playDays: [1],
    ...overrides,
  };
}

function game(id, team1, team2, date, time, location, extras = {}) {
  return {
    id,
    team1: team1?.name || 'TBD',
    team2: team2?.name || 'TBD',
    team1Id: team1?.id || 'tbd',
    team2Id: team2?.id || 'tbd',
    score1: 0,
    score2: 0,
    date,
    time,
    location,
    isCompleted: false,
    ...extras,
  };
}

test('league validation rejects a nonempty schedule that omits teams and fixtures', () => {
  const report = validateSchedule([
    game('game-1', teams[0], teams[1], '2026-08-10', '6:00 PM', 'field-1'),
  ], config(), 'league');

  assert.equal(report.isValid, false);
  assert.ok(report.conflicts.includes('Incomplete schedule: expected 2 matches but generated 1.'));
  assert.ok(report.conflicts.includes('Team Charlie requires 1 game but has 0.'));
  assert.ok(report.conflicts.includes('Team Delta requires 1 game but has 0.'));
  assert.equal(report.fairnessScore, 80);
});

test('league validation accepts complete balanced fixtures', () => {
  const report = validateSchedule([
    game('game-1', teams[0], teams[3], '2026-08-10', '6:00 PM', 'field-1'),
    game('game-2', teams[1], teams[2], '2026-08-10', '6:00 PM', 'field-2'),
  ], config(), 'league');

  assert.equal(report.isValid, true);
  assert.deepEqual(report.conflicts, []);
  assert.equal(report.fairnessScore, 100);
});

test('league validation rejects complete schedules with unfair home and away allocation', () => {
  const report = validateSchedule([
    game('game-1', teams[0], teams[3], '2026-08-10', '6:00 PM', 'field-1'),
    game('game-2', teams[1], teams[2], '2026-08-10', '6:00 PM', 'field-2'),
    game('game-3', teams[0], teams[2], '2026-08-17', '6:00 PM', 'field-1'),
    game('game-4', teams[3], teams[1], '2026-08-17', '6:00 PM', 'field-2'),
    game('game-5', teams[0], teams[1], '2026-08-24', '6:00 PM', 'field-1'),
    game('game-6', teams[2], teams[3], '2026-08-24', '6:00 PM', 'field-2'),
  ], config({ gamesPerTeam: 3 }), 'league');

  assert.equal(report.isValid, false);
  assert.ok(report.conflicts.includes('Home/away imbalance: Alpha has 3 home and 0 away games.'));
  assert.ok(report.fairnessScore < 100);
});

test('league validation reports concentrated start-time and field assignments as warnings', () => {
  const report = validateSchedule([
    game('game-1', teams[0], teams[3], '2026-08-10', '6:00 PM', 'field-1', { resourceId: 'field-1' }),
    game('game-2', teams[1], teams[2], '2026-08-10', '7:15 PM', 'field-2', { resourceId: 'field-2' }),
    game('game-3', teams[2], teams[0], '2026-08-17', '6:00 PM', 'field-1', { resourceId: 'field-1' }),
    game('game-4', teams[3], teams[1], '2026-08-17', '7:15 PM', 'field-2', { resourceId: 'field-2' }),
    game('game-5', teams[0], teams[1], '2026-08-24', '6:00 PM', 'field-1', { resourceId: 'field-1' }),
    game('game-6', teams[2], teams[3], '2026-08-24', '7:15 PM', 'field-2', { resourceId: 'field-2' }),
  ], config({ gamesPerTeam: 3 }), 'league');

  assert.equal(report.isValid, true);
  assert.ok(report.warnings.some(warning => warning.startsWith('Start-time imbalance:')));
  assert.ok(report.warnings.some(warning => warning.startsWith('Field imbalance:')));
  assert.ok(report.fairnessScore < 100);
});

test('tournament validation accepts a complete bracket with ordered dependencies', () => {
  const tournamentConfig = config({
    tournamentType: 'single_elimination',
    gamesPerTeam: undefined,
    startDate: '2026-08-10',
    endDate: '2026-08-10',
    startTime: '09:00',
    endTime: '12:00',
  });
  const report = validateSchedule([
    game('semi-1', teams[0], teams[3], '2026-08-10', '9:00 AM', 'field-1', {
      winnerTo: 'final',
      winnerToSlot: 'team1',
    }),
    game('semi-2', teams[1], teams[2], '2026-08-10', '9:00 AM', 'field-2', {
      winnerTo: 'final',
      winnerToSlot: 'team2',
    }),
    game('final', null, null, '2026-08-10', '10:15 AM', 'field-1', {
      round: 'Championship',
      stage: 'Main',
    }),
  ], tournamentConfig, 'tournament');

  assert.equal(report.isValid, true);
  assert.deepEqual(report.conflicts, []);
});

test('tournament validation rejects missing and mistimed dependency targets', () => {
  const tournamentConfig = config({
    tournamentType: 'single_elimination',
    gamesPerTeam: undefined,
    startDate: '2026-08-10',
    endDate: '2026-08-10',
    startTime: '09:00',
    endTime: '12:00',
  });
  const report = validateSchedule([
    game('semi-1', teams[0], teams[3], '2026-08-10', '9:00 AM', 'field-1', {
      winnerTo: 'missing-final',
      winnerToSlot: 'team1',
    }),
    game('semi-2', teams[1], teams[2], '2026-08-10', '9:00 AM', 'field-2', {
      winnerTo: 'final',
      winnerToSlot: 'team2',
    }),
    game('final', null, null, '2026-08-10', '9:30 AM', 'field-1', {
      round: 'Championship',
      stage: 'Main',
    }),
  ], tournamentConfig, 'tournament');

  assert.equal(report.isValid, false);
  assert.ok(report.conflicts.includes('Match semi-1 references missing dependency target missing-final.'));
  assert.ok(report.conflicts.includes('Dependency timing: match final starts before match semi-2 can finish and rest.'));
  assert.ok(report.conflicts.includes('Match final has an unresolved team1 slot with no dependency feeder.'));
});

test('validation rejects games that cannot finish inside the organizer time window', () => {
  const report = validateSchedule([
    game('late-game', teams[0], teams[1], '2026-08-10', '7:15 PM', 'field-1'),
    game('early-game', teams[2], teams[3], '2026-08-10', '6:00 PM', 'field-2'),
  ], config({ startTime: '18:00', endTime: '19:30' }), 'league');

  assert.equal(report.isValid, false);
  assert.ok(report.conflicts.includes('Match late-game falls outside its configured daily time window.'));
});
