import assert from 'node:assert/strict';
import test from 'node:test';
import { recordTournamentScore } from '../src/lib/scheduler-utils.ts';

async function load() {
  const module = await import('../src/lib/tiered-playoffs/brackets.ts').catch(() => null);
  assert.ok(module, 'Tiered bracket module must exist');
  return module;
}

const placements = count => Array.from({ length: count }, (_, index) => ({
  teamId: `team_${index + 1}`,
  teamName: `Team ${index + 1}`,
  overallSeed: index + 1,
  divisionId: 'division_a',
  divisionName: 'A Division',
  divisionSeed: index + 1,
  calculatedOverallSeed: index + 1,
  approvedOverallSeed: index + 1,
}));

test('bye matrix creates n-1 real games with the correct power-of-two capacity', async () => {
  const { generateTieredDivisionBracket, validateTieredBrackets } = await load();
  for (const count of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16]) {
    const seeded = placements(count);
    const games = generateTieredDivisionBracket({ id: 'division_a', name: 'A Division', size: count }, seeded);
    const capacity = 2 ** Math.ceil(Math.log2(count));
    assert.equal(games.length, count - 1, `${count} teams`);
    assert.equal(games.some(game => game.team1 === 'BYE' || game.team2 === 'BYE' || game.isBye), false);
    const validation = validateTieredBrackets(games, seeded);
    assert.equal(validation.valid, true, `${count}: ${validation.conflicts.join('; ')}`);
    assert.equal(validation.bracketCapacity, capacity);
    assert.equal(validation.byeCount, capacity - count);
  }
});

test('six-team bracket gives Seeds 1 and 2 byes and opens with 3v6 and 4v5', async () => {
  const { generateTieredDivisionBracket } = await load();
  const games = generateTieredDivisionBracket({ id: 'division_a', name: 'A Division', size: 6 }, placements(6));
  const opening = games.filter(game => game.round === 'Quarter-Finals');
  assert.deepEqual(opening.map(game => [game.divisionSeed1, game.divisionSeed2]).sort(), [[3, 6], [4, 5]]);
  const semifinals = games.filter(game => game.round === 'Semi-Finals');
  assert.equal(semifinals.some(game => game.divisionSeed1 === 1 || game.divisionSeed2 === 1), true);
  assert.equal(semifinals.some(game => game.divisionSeed1 === 2 || game.divisionSeed2 === 2), true);
});

test('winner links advance to one independent division champion', async () => {
  const { generateTieredDivisionBracket } = await load();
  let games = generateTieredDivisionBracket({ id: 'division_a', name: 'A Division', size: 4 }, placements(4));
  while (games.some(game => !game.isCompleted)) {
    const ready = games.find(game => !game.isCompleted && game.team1Id !== 'tbd' && game.team2Id !== 'tbd');
    assert.ok(ready, 'bracket must always expose the next playable game');
    games = recordTournamentScore(games, ready.id, 1, 0);
  }
  const championship = games.find(game => game.round === 'Championship');
  assert.equal(championship.isCompleted, true);
  assert.equal(championship.winnerId, 'team_1');
});

test('playoff scheduling waits for every feeder completion plus rest and transition', async () => {
  const { generateTieredDivisionBracket, scheduleTieredPlayoffBrackets } = await load();
  const bracket = generateTieredDivisionBracket({ id: 'division_a', name: 'A Division', size: 6 }, placements(6));
  const scheduled = scheduleTieredPlayoffBrackets(bracket, {
    fields: [{ id: 'field_1', name: 'Field 1' }, { id: 'field_2', name: 'Field 2' }],
    dailyWindows: [{ date: '2026-09-12', startTime: '08:00', endTime: '22:00' }],
    gameDurationMinutes: 60,
    minimumRestMinutes: 60,
    transitionMinutes: 15,
  });
  const byId = new Map(scheduled.map(game => [game.id, game]));
  for (const feeder of scheduled.filter(game => game.winnerTo)) {
    const target = byId.get(feeder.winnerTo);
    assert.ok(target);
    assert.ok(target.scheduledStartMs - feeder.scheduledStartMs >= 120 * 60_000);
    assert.ok(target.possibleTeamIds.length >= 2);
  }
});

test('playoff scheduling avoids occupied preliminary resources and team rest windows', async () => {
  const { generateTieredDivisionBracket, scheduleTieredPlayoffBrackets } = await load();
  const bracket = generateTieredDivisionBracket({ id: 'division_a', name: 'A Division', size: 4 }, placements(4));
  const scheduled = scheduleTieredPlayoffBrackets(bracket, {
    fields: [{ id: 'field_1', name: 'Field 1' }, { id: 'field_2', name: 'Field 2' }],
    dailyWindows: [{ date: '2026-09-12', startTime: '08:00', endTime: '22:00' }],
    gameDurationMinutes: 60,
    minimumRestMinutes: 60,
    transitionMinutes: 15,
    occupiedGames: [{
      id: 'prelim', team1Id: 'team_1', team2Id: 'team_2', team1: 'Team 1', team2: 'Team 2',
      score1: 2, score2: 1, date: '2026-09-12', time: '8:00 AM', location: 'Field 1', resourceId: 'field_1',
      phase: 'preliminary', isCompleted: true,
    }],
  });
  assert.equal(scheduled.some(game => game.resourceId === 'field_1' && game.time === '8:00 AM'), false);
  assert.equal(scheduled.some(game => game.time === '8:00 AM' && game.possibleTeamIds.some(id => id === 'team_1' || id === 'team_2')), false);
});

test('duplicate placements and broken dependency topology fail validation', async () => {
  const { generateTieredDivisionBracket, validateTieredBrackets } = await load();
  const seeded = placements(4);
  assert.equal(validateTieredBrackets(generateTieredDivisionBracket({ id: 'division_a', name: 'A Division', size: 4 }, seeded), [...seeded, seeded[0]]).valid, false);
  const broken = generateTieredDivisionBracket({ id: 'division_a', name: 'A Division', size: 4 }, seeded);
  broken[0].winnerTo = 'missing';
  assert.equal(validateTieredBrackets(broken, seeded).valid, false);
});
