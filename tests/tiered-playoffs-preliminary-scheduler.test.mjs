import assert from 'node:assert/strict';
import test from 'node:test';

async function load() {
  const module = await import('../src/lib/tiered-playoffs/preliminary-scheduler.ts').catch(() => null);
  assert.ok(module, 'Tiered preliminary scheduler module must exist');
  return module;
}

const teams = count => Array.from({ length: count }, (_, index) => ({ id: `team_${index + 1}`, name: `Team ${index + 1}` }));
const input = (teamCount, gamesPerTeam, overrides = {}) => ({
  teams: teams(teamCount),
  gamesPerTeam,
  fields: Array.from({ length: 8 }, (_, index) => ({ id: `field_${index + 1}`, name: `Field ${index + 1}` })),
  dailyWindows: [{ date: '2026-09-10', startTime: '08:00', endTime: '22:00' }],
  gameDurationMinutes: 60,
  transitionMinutes: 0,
  ...overrides,
});

test('required tournament sizes produce exact deterministic preliminary matchup totals', async () => {
  const { generateTieredPreliminaryMatchups } = await load();
  const matrix = [[4, 2, 4], [6, 3, 9], [8, 4, 16], [10, 5, 25], [12, 2, 12], [16, 3, 24], [20, 4, 40], [22, 5, 55], [24, 4, 48], [32, 5, 80]];
  for (const [teamCount, gamesPerTeam, expectedGames] of matrix) {
    const config = input(teamCount, gamesPerTeam);
    const first = generateTieredPreliminaryMatchups(config);
    const second = generateTieredPreliminaryMatchups(config);
    assert.equal(first.length, expectedGames, `${teamCount} teams x ${gamesPerTeam}`);
    assert.deepEqual(first, second, `${teamCount} teams x ${gamesPerTeam} must be reproducible`);
    const appearances = new Map(config.teams.map(team => [team.id, 0]));
    const opponents = new Set();
    for (const matchup of first) {
      assert.notEqual(matchup.team1Id, matchup.team2Id);
      appearances.set(matchup.team1Id, appearances.get(matchup.team1Id) + 1);
      appearances.set(matchup.team2Id, appearances.get(matchup.team2Id) + 1);
      const pair = [matchup.team1Id, matchup.team2Id].sort().join(':');
      assert.equal(opponents.has(pair), false, `duplicate pair ${pair}`);
      opponents.add(pair);
    }
    assert.deepEqual([...appearances.values()], Array(teamCount).fill(gamesPerTeam));
  }
});

test('odd team counts work only when their total appearances can be paired evenly', async () => {
  const { analyzeTieredFeasibility, generateTieredPreliminaryMatchups } = await load();
  assert.equal(generateTieredPreliminaryMatchups(input(5, 2)).length, 5);
  const impossible = analyzeTieredFeasibility(input(5, 3));
  assert.equal(impossible.feasible, false);
  assert.equal(impossible.requiredGames, null);
  assert.match(impossible.conflicts.join(' '), /cannot be paired evenly/i);
});

test('feasibility reports required and supported games without silently dropping work', async () => {
  const { analyzeTieredFeasibility } = await load();
  const report = analyzeTieredFeasibility(input(24, 4, {
    fields: [{ id: 'field_1', name: 'Field 1' }],
    dailyWindows: [{ date: '2026-09-10', startTime: '08:00', endTime: '20:00' }],
  }));
  assert.deepEqual({ feasible: report.feasible, requiredGames: report.requiredGames, supportedGames: report.supportedGames }, {
    feasible: false,
    requiredGames: 48,
    supportedGames: 12,
  });
  assert.match(report.conflicts.join(' '), /requires 48 games.*supports 12/i);
  assert.ok(report.recommendations.some(value => /field|day|hours|games per team/i.test(value)));
});

test('invalid resources, durations, and unique-opponent requests fail clearly', async () => {
  const { analyzeTieredFeasibility } = await load();
  assert.equal(analyzeTieredFeasibility(input(6, 2, { fields: [] })).feasible, false);
  assert.equal(analyzeTieredFeasibility(input(6, 2, { gameDurationMinutes: 0 })).feasible, false);
  assert.equal(analyzeTieredFeasibility(input(6, 6)).feasible, false);
  assert.equal(analyzeTieredFeasibility(input(6, 2, { dailyWindows: [] })).feasible, false);
});
