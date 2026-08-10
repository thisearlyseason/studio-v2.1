import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateLeagueSchedule,
  generateTournamentSchedule,
  ScheduleGenerationError,
} from '../src/lib/scheduler-utils.ts';
import { validateSchedule } from '../src/lib/intelligent-scheduler.ts';

const teams = count => Array.from({ length: count }, (_, index) => ({
  id: `team_${index + 1}`,
  name: `Team ${index + 1}`,
}));

const fields = count => Array.from({ length: count }, (_, index) => ({
  id: `facility_1:field_${index + 1}`,
  name: `Field ${index + 1}`,
}));

const base = {
  fields: fields(16),
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  startTime: '08:00',
  endTime: '22:00',
  gameLength: 60,
  breakLength: 15,
  doubleHeaderOption: 'differentTeams',
};

function minutes(time) {
  const match = time.match(/^(\d+):(\d+)\s+(AM|PM)$/);
  assert.ok(match, `Unexpected time ${time}`);
  let hour = Number(match[1]);
  if (match[3] === 'PM' && hour !== 12) hour += 12;
  if (match[3] === 'AM' && hour === 12) hour = 0;
  return hour * 60 + Number(match[2]);
}

function assertNoDirectConflicts(games, duration = 60) {
  for (let left = 0; left < games.length; left++) {
    for (let right = left + 1; right < games.length; right++) {
      if (games[left].date !== games[right].date) continue;
      const overlaps = minutes(games[left].time) < minutes(games[right].time) + duration &&
        minutes(games[right].time) < minutes(games[left].time) + duration;
      if (!overlaps) continue;
      assert.notEqual(games[left].resourceId, games[right].resourceId, 'field overlap');
      const leftTeams = [games[left].team1Id, games[left].team2Id].filter(id => id !== 'tbd' && id !== 'bye');
      const rightTeams = [games[right].team1Id, games[right].team2Id].filter(id => id !== 'tbd' && id !== 'bye');
      assert.equal(leftTeams.some(id => rightTeams.includes(id)), false, 'team overlap');
    }
  }
}

function poolFromPlaceholder(value) {
  return /Pool ([A-Z]+)/.exec(value || '')?.[1];
}

function assertNoSamePoolFirstKnockoutMatch(games, context = '') {
  const knockoutGames = games.filter(game => game.stage === 'Knockout');
  const incomingBySlot = new Map();
  knockoutGames.forEach(game => {
    if (game.winnerTo && game.winnerToSlot) {
      incomingBySlot.set(`${game.winnerTo}:${game.winnerToSlot}`, game);
    }
  });

  const possiblePools = (game, slot, visited = new Set()) => {
    const directPool = poolFromPlaceholder(game[slot]);
    if (directPool) return new Set([directPool]);

    const key = `${game.id}:${slot}`;
    if (visited.has(key)) return new Set();
    const feeder = incomingBySlot.get(key);
    if (!feeder) return new Set();

    const nextVisited = new Set(visited).add(key);
    return new Set([
      ...possiblePools(feeder, 'team1', nextVisited),
      ...possiblePools(feeder, 'team2', nextVisited),
    ]);
  };

  knockoutGames.forEach(game => {
    for (const [slot, opponentSlot] of [['team1', 'team2'], ['team2', 'team1']]) {
      const pool = poolFromPlaceholder(game[slot]);
      if (!pool) continue;
      assert.equal(
        possiblePools(game, opponentSlot).has(pool),
        false,
        `${context} ${game.round}: Pool ${pool} could face its own pool in its first knockout match`
      );
    }
  });
}

test('complete round-robin leagues remain exact and balanced for 2-32 teams', () => {
  for (let teamCount = 2; teamCount <= 32; teamCount++) {
    const configuredTeams = teams(teamCount);
    const games = generateLeagueSchedule({
      ...base,
      teams: configuredTeams,
      gamesPerTeam: teamCount - 1,
    });
    assert.equal(games.length, teamCount * (teamCount - 1) / 2, `${teamCount} teams`);
    const counts = new Map(configuredTeams.map(team => [team.id, 0]));
    const homes = new Map(configuredTeams.map(team => [team.id, 0]));
    const opponents = new Map(configuredTeams.map(team => [team.id, new Map()]));
    games.forEach(game => {
      counts.set(game.team1Id, counts.get(game.team1Id) + 1);
      counts.set(game.team2Id, counts.get(game.team2Id) + 1);
      homes.set(game.team1Id, homes.get(game.team1Id) + 1);
      opponents.get(game.team1Id).set(game.team2Id, (opponents.get(game.team1Id).get(game.team2Id) || 0) + 1);
      opponents.get(game.team2Id).set(game.team1Id, (opponents.get(game.team2Id).get(game.team1Id) || 0) + 1);
    });
    configuredTeams.forEach(team => {
      assert.equal(counts.get(team.id), teamCount - 1);
      assert.ok(Math.abs(homes.get(team.id) - ((teamCount - 1) - homes.get(team.id))) <= 1);
      assert.equal(opponents.get(team.id).size, teamCount - 1);
      assert.deepEqual([...opponents.get(team.id).values()], Array(teamCount - 1).fill(1));
    });
    assertNoDirectConflicts(games);
  }
});

test('feasible partial league degrees stay exact with opponent spread at most one', () => {
  for (let teamCount = 2; teamCount <= 16; teamCount++) {
    for (let gamesPerTeam = 1; gamesPerTeam <= Math.min(12, teamCount + 3); gamesPerTeam++) {
      if ((teamCount * gamesPerTeam) % 2 !== 0) continue;
      const configuredTeams = teams(teamCount);
      const games = generateLeagueSchedule({ ...base, teams: configuredTeams, gamesPerTeam });
      const counts = new Map(configuredTeams.map(team => [team.id, 0]));
      const homes = new Map(configuredTeams.map(team => [team.id, 0]));
      const opponents = new Map(configuredTeams.map(team => [team.id, new Map()]));
      games.forEach(game => {
        counts.set(game.team1Id, counts.get(game.team1Id) + 1);
        counts.set(game.team2Id, counts.get(game.team2Id) + 1);
        homes.set(game.team1Id, homes.get(game.team1Id) + 1);
        opponents.get(game.team1Id).set(game.team2Id, (opponents.get(game.team1Id).get(game.team2Id) || 0) + 1);
        opponents.get(game.team2Id).set(game.team1Id, (opponents.get(game.team2Id).get(game.team1Id) || 0) + 1);
      });
      configuredTeams.forEach(team => {
        assert.equal(counts.get(team.id), gamesPerTeam);
        assert.ok(Math.abs(homes.get(team.id) - (gamesPerTeam - homes.get(team.id))) <= 1);
        const frequencies = [...opponents.get(team.id).values()];
        assert.ok(Math.max(...frequencies) - Math.min(...frequencies) <= 1);
      });
    }
  }
});

test('league generation fails closed for impossible counts, bad values, and insufficient capacity', () => {
  assert.throws(
    () => generateLeagueSchedule({ ...base, teams: teams(3), gamesPerTeam: 1 }),
    error => error instanceof ScheduleGenerationError && error.code === 'UNEQUAL_GAME_COUNT'
  );
  for (const invalid of [0, -1, Number.NaN]) {
    assert.throws(
      () => generateLeagueSchedule({ ...base, teams: teams(4), gamesPerTeam: 3, gameLength: invalid }),
      error => error instanceof ScheduleGenerationError && error.code === 'INVALID_GAME_LENGTH'
    );
  }
  assert.throws(
    () => generateLeagueSchedule({
      ...base,
      teams: teams(8),
      fields: fields(1),
      gamesPerTeam: 7,
      startDate: '2026-01-01',
      endDate: '2026-01-01',
      startTime: '18:00',
      endTime: '19:00',
    }),
    error => error instanceof ScheduleGenerationError && error.code === 'INSUFFICIENT_CAPACITY'
  );
});

test('minimal-capacity league rounds fit exactly and rotate start times and fields', () => {
  const sixTeams = teams(6);
  const exactCapacity = generateLeagueSchedule({
    ...base,
    teams: sixTeams,
    fields: fields(1),
    gamesPerTeam: 5,
    startDate: '2026-08-10',
    endDate: '2026-09-07',
    startTime: '18:00',
    endTime: '21:00',
    playDays: [1],
    breakLength: 0,
    doubleHeaderOption: 'none',
  });
  assert.equal(exactCapacity.length, 15);
  assert.equal(new Set(exactCapacity.map(game => game.date)).size, 5);

  const startsByTeam = new Map(sixTeams.map(team => [team.id, new Map()]));
  exactCapacity.forEach(game => {
    for (const teamId of [game.team1Id, game.team2Id]) {
      const starts = startsByTeam.get(teamId);
      starts.set(game.time, (starts.get(game.time) || 0) + 1);
    }
  });
  startsByTeam.forEach(starts => {
    const counts = [...starts.values()];
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
  });

  const fieldRotation = generateLeagueSchedule({
    ...base,
    teams: teams(8),
    fields: fields(4),
    gamesPerTeam: 7,
    startDate: '2026-08-10',
    endDate: '2026-09-21',
    startTime: '18:00',
    endTime: '19:00',
    playDays: [1],
    breakLength: 0,
    doubleHeaderOption: 'none',
  });
  const fieldsByTeam = new Map(teams(8).map(team => [team.id, new Map()]));
  fieldRotation.forEach(game => {
    for (const teamId of [game.team1Id, game.team2Id]) {
      const allocations = fieldsByTeam.get(teamId);
      allocations.set(game.resourceId, (allocations.get(game.resourceId) || 0) + 1);
    }
  });
  fieldsByTeam.forEach(allocations => {
    const counts = fields(4).map(field => allocations.get(field.id) || 0);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1);
  });
});

test('common odd and even four-field leagues avoid exponential fairness searches', () => {
  for (const teamCount of [9, 12]) {
    const startedAt = performance.now();
    const configuredTeams = teams(teamCount);
    const games = generateLeagueSchedule({
      ...base,
      teams: configuredTeams,
      fields: fields(4),
      gamesPerTeam: teamCount - 1,
      startDate: '2026-08-10',
      endDate: '2026-12-31',
      startTime: '18:00',
      endTime: '22:00',
      playDays: [1, 3],
      doubleHeaderOption: 'none',
    });
    const elapsedMs = performance.now() - startedAt;

    assert.equal(games.length, teamCount * (teamCount - 1) / 2);
    assert.ok(elapsedMs < 5_000, `${teamCount}-team generation took ${elapsedMs.toFixed(0)}ms`);
    assertNoDirectConflicts(games);

    const counts = new Map(configuredTeams.map(team => [team.id, 0]));
    const homes = new Map(configuredTeams.map(team => [team.id, 0]));
    const opponents = new Map(configuredTeams.map(team => [team.id, new Set()]));
    games.forEach(game => {
      counts.set(game.team1Id, counts.get(game.team1Id) + 1);
      counts.set(game.team2Id, counts.get(game.team2Id) + 1);
      homes.set(game.team1Id, homes.get(game.team1Id) + 1);
      opponents.get(game.team1Id).add(game.team2Id);
      opponents.get(game.team2Id).add(game.team1Id);
    });
    configuredTeams.forEach(team => {
      assert.equal(counts.get(team.id), teamCount - 1);
      assert.ok(Math.abs(homes.get(team.id) - ((teamCount - 1) - homes.get(team.id))) <= 1);
      assert.equal(opponents.get(team.id).size, teamCount - 1);
    });
  }
});

test('league dates, blackouts, windows, and field identities are enforced', () => {
  const games = generateLeagueSchedule({
    ...base,
    teams: teams(4),
    fields: [fields(2)[0], fields(2)[0]],
    gamesPerTeam: 3,
    startDate: '2026-01-01',
    endDate: '2026-01-10',
    startTime: '18:00',
    endTime: '20:15',
    playDays: [4, 6],
    blackoutDates: ['2026-01-01'],
  });
  assert.ok(games.every(game => game.date !== '2026-01-01'));
  assert.ok(games.every(game => ['2026-01-03', '2026-01-08', '2026-01-10'].includes(game.date)));
  assert.ok(games.every(game => minutes(game.time) + 60 <= 20 * 60 + 15));
  assert.ok(games.every(game => game.resourceId === 'facility_1:field_1'));
  assert.throws(
    () => generateLeagueSchedule({
      ...base,
      teams: teams(2),
      fields: [{ id: 'same', name: 'One' }, { id: 'same', name: 'Two' }],
      gamesPerTeam: 1,
    }),
    error => error instanceof ScheduleGenerationError && error.code === 'DUPLICATE_FIELD_ID'
  );
});

test('single elimination collapses BYEs and schedules every dependency after its feeder', () => {
  for (let teamCount = 2; teamCount <= 16; teamCount++) {
    const games = generateTournamentSchedule({
      ...base,
      teams: teams(teamCount),
      tournamentType: 'single_elimination',
    });
    assert.equal(games.length, teamCount - 1);
    assert.equal(games.some(game => game.team1Id === 'bye' || game.team2Id === 'bye'), false);
    const byId = new Map(games.map(game => [game.id, game]));
    games.forEach(game => {
      [game.winnerTo, game.loserTo].filter(Boolean).forEach(targetId => {
        assert.ok(byId.has(targetId));
        const target = byId.get(targetId);
        const sourceStamp = Date.parse(`${game.date}T00:00:00`) + minutes(game.time) * 60_000;
        const targetStamp = Date.parse(`${target.date}T00:00:00`) + minutes(target.time) * 60_000;
        assert.ok(targetStamp >= sourceStamp + 75 * 60_000);
      });
    });
    assertNoDirectConflicts(games);
  }
});

test('three-team single elimination pre-fills the BYE recipient in the championship', () => {
  const configuredTeams = teams(3);
  const games = generateTournamentSchedule({
    ...base,
    teams: configuredTeams,
    tournamentType: 'single_elimination',
  });
  const championship = games.find(game => game.round === 'Championship');
  assert.equal(games.length, 2);
  assert.ok(championship);
  assert.equal(championship.team1Id, configuredTeams[0].id);
  assert.equal(validateSchedule(games, {
    ...base,
    teams: configuredTeams,
    tournamentType: 'single_elimination',
  }, 'tournament').isValid, true);
});

test('double elimination has complete links and a conditional championship reset', () => {
  for (const teamCount of [2, 4, 8, 16]) {
    const games = generateTournamentSchedule({
      ...base,
      teams: teams(teamCount),
      tournamentType: 'double_elimination',
    });
    assert.equal(games.length, teamCount * 2 - 1);
    assert.equal(games.filter(game => game.isResetMatch).length, 1);
    assert.equal(games.find(game => game.isResetMatch).isConditional, true);
    const ids = new Set(games.map(game => game.id));
    games.forEach(game => {
      [game.winnerTo, game.loserTo].filter(Boolean).forEach(targetId => assert.ok(ids.has(targetId)));
    });
  }
  assert.throws(
    () => generateTournamentSchedule({ ...base, teams: teams(6), tournamentType: 'double_elimination' }),
    error => error instanceof ScheduleGenerationError && error.code === 'DOUBLE_ELIMINATION_TEAM_COUNT'
  );
});

test('pool play creates balanced pools and pool-specific qualifier placeholders', () => {
  const games = generateTournamentSchedule({
    ...base,
    teams: teams(8),
    tournamentType: 'pool_play_knockout',
    poolCount: 2,
    advancePerPool: 2,
    gamesPerTeam: 3,
  });
  const poolGames = games.filter(game => Number.isInteger(game.pool));
  const knockoutGames = games.filter(game => game.stage === 'Knockout');
  assert.equal(poolGames.length, 12);
  assert.equal(knockoutGames.length, 3);
  assert.deepEqual([...new Set(poolGames.map(game => game.pool))], [0, 1]);
  assert.ok(knockoutGames.some(game => /Pool A - 1st/.test(`${game.team1} ${game.team2}`)));
  assert.ok(knockoutGames.some(game => /Pool B - 2nd/.test(`${game.team1} ${game.team2}`)));
});

test('six pool qualifiers avoid same-pool first knockout matches through BYE propagation', () => {
  const configuredTeams = teams(6);
  const config = {
    ...base,
    teams: configuredTeams,
    fields: fields(2),
    tournamentType: 'pool_play_knockout',
    poolCount: 3,
    advancePerPool: 2,
    gamesPerTeam: 1,
  };
  const games = generateTournamentSchedule(config);
  assertNoSamePoolFirstKnockoutMatch(games, '3 pools x 2 qualifiers');
  assert.equal(validateSchedule(games, config, 'tournament').isValid, true);
});

test('nine qualifiers from three pools remain separated after first-round BYEs collapse', () => {
  const configuredTeams = teams(9);
  const config = {
    ...base,
    teams: configuredTeams,
    fields: fields(3),
    tournamentType: 'pool_play_knockout',
    poolCount: 3,
    advancePerPool: 3,
    gamesPerTeam: 2,
  };
  const games = generateTournamentSchedule(config);
  assertNoSamePoolFirstKnockoutMatch(games, '9 teams / 3 pools / 3 qualifiers');
  assert.equal(validateSchedule(games, config, 'tournament').isValid, true);
});

test('pool knockout seeding matrix avoids same-pool first matches or fails closed', () => {
  const cases = [
    ...[1, 2, 4].map(advancePerPool => ({ poolCount: 2, advancePerPool })),
    ...[3, 4, 5, 6].flatMap(poolCount =>
      [1, 2, 3, 4].map(advancePerPool => ({ poolCount, advancePerPool }))
    ),
  ];

  cases.forEach(({ poolCount, advancePerPool }) => {
    const poolSize = Math.max(2, advancePerPool);
    const config = {
      ...base,
      teams: teams(poolCount * poolSize),
      tournamentType: 'pool_play_knockout',
      poolCount,
      advancePerPool,
      gamesPerTeam: poolSize - 1,
    };
    const games = generateTournamentSchedule(config);
    assertNoSamePoolFirstKnockoutMatch(games, `${poolCount} pools x ${advancePerPool} qualifiers`);
    assert.equal(validateSchedule(games, config, 'tournament').isValid, true);
  });

  assert.throws(
    () => generateTournamentSchedule({
      ...base,
      teams: teams(6),
      tournamentType: 'pool_play_knockout',
      poolCount: 2,
      advancePerPool: 3,
      gamesPerTeam: 2,
    }),
    error => error instanceof ScheduleGenerationError && error.code === 'POOL_SEEDING_CONFLICT'
  );
});

test('generation is deterministic for the same organizer inputs', () => {
  const stable = games => games.map(game => Object.fromEntries(
    Object.entries(game).filter(([key]) => key !== 'updatedAt')
  ));
  const config = { ...base, teams: teams(8), gamesPerTeam: 7 };
  assert.deepEqual(stable(generateLeagueSchedule(config)), stable(generateLeagueSchedule(config)));
  const tournament = { ...base, teams: teams(8), tournamentType: 'single_elimination' };
  assert.deepEqual(stable(generateTournamentSchedule(tournament)), stable(generateTournamentSchedule(tournament)));
});
