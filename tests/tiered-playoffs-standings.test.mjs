import assert from 'node:assert/strict';
import test from 'node:test';

const teams = ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((name, index) => ({ id: `t${index + 1}`, name }));
const game = (id, team1Id, team2Id, score1, score2, extra = {}) => ({
  id,
  team1Id,
  team2Id,
  team1: teams.find(team => team.id === team1Id)?.name || team1Id,
  team2: teams.find(team => team.id === team2Id)?.name || team2Id,
  score1,
  score2,
  date: '2026-09-08',
  time: '10:00 AM',
  location: 'Field 1',
  isCompleted: true,
  phase: 'preliminary',
  ...extra,
});

const standingsConfig = (overrides = {}) => ({
  pointsEnabled: true,
  points: { win: 2, tie: 1, loss: 0 },
  rankingRules: ['tournament_points', 'wins', 'differential', 'points_for', 'points_against'],
  finalResolution: 'manual',
  maximumDifferentialPerGame: null,
  ...overrides,
});

async function load() {
  const loaded = await import('../src/lib/tiered-playoffs/standings.ts').catch(() => null);
  assert.ok(loaded, 'Tiered standings module must exist');
  return loaded;
}

test('Tiered standings use configured points and ignore non-official or playoff games', async () => {
  const { calculateTieredStandings } = await load();
  const standings = calculateTieredStandings(teams, [
    game('g1', 't1', 't2', 4, 2),
    game('g2', 't1', 't3', 3, 3),
    game('g3', 't2', 't3', 9, 0, { isDisputed: true }),
    game('g4', 't4', 't1', 99, 0, { phase: 'playoff' }),
  ], standingsConfig());
  assert.deepEqual(standings.map(row => ({
    id: row.id, played: row.gamesPlayed, wins: row.wins, losses: row.losses,
    ties: row.ties, points: row.tournamentPoints, for: row.pointsFor,
    against: row.pointsAgainst, differential: row.differential,
  })), [
    { id: 't1', played: 2, wins: 1, losses: 0, ties: 1, points: 3, for: 7, against: 5, differential: 2 },
    { id: 't2', played: 1, wins: 0, losses: 1, ties: 0, points: 0, for: 2, against: 4, differential: -2 },
    { id: 't3', played: 1, wins: 0, losses: 0, ties: 1, points: 1, for: 3, against: 3, differential: 0 },
    { id: 't4', played: 0, wins: 0, losses: 0, ties: 0, points: 0, for: 0, against: 0, differential: 0 },
  ]);
});

test('maximum differential caps standings impact without changing displayed score totals', async () => {
  const { calculateTieredStandings } = await load();
  const standings = calculateTieredStandings(teams.slice(0, 2), [game('g1', 't1', 't2', 20, 2)], standingsConfig({ maximumDifferentialPerGame: 7 }));
  assert.deepEqual(standings.map(row => ({ id: row.id, for: row.pointsFor, against: row.pointsAgainst, raw: row.rawDifferential, differential: row.differential })), [
    { id: 't1', for: 20, against: 2, raw: 18, differential: 7 },
    { id: 't2', for: 2, against: 20, raw: -18, differential: -7 },
  ]);
});

test('configured rule order resolves equal records by differential then points for', async () => {
  const { calculateTieredStandings, resolveTieredRanking } = await load();
  const games = [
    game('g1', 't1', 't3', 5, 3),
    game('g2', 't2', 't4', 3, 1),
    game('g3', 't3', 't4', 2, 1),
  ];
  const config = standingsConfig({ rankingRules: ['wins', 'differential', 'points_for'] });
  const result = resolveTieredRanking(calculateTieredStandings(teams, games, config), games, config);
  assert.deepEqual(result.ranked.map(row => row.id), ['t1', 't2', 't3', 't4']);
  assert.deepEqual(result.unresolvedGroups, []);
});

test('multi-team head-to-head uses a mini-table among the tied teams', async () => {
  const { calculateTieredStandings, resolveTieredRanking } = await load();
  const games = [
    game('g1', 't1', 't2', 1, 0),
    game('g2', 't2', 't3', 5, 0),
    game('g3', 't3', 't1', 8, 0),
  ];
  const config = standingsConfig({ rankingRules: ['wins', 'head_to_head', 'differential'] });
  const result = resolveTieredRanking(calculateTieredStandings(teams.slice(0, 3), games, config), games, config);
  assert.deepEqual(result.ranked.map(row => row.id), ['t2', 't3', 't1']);
});

test('manual final resolution reports a truly unresolved tie while random draw is reproducible', async () => {
  const { calculateTieredStandings, resolveTieredRanking } = await load();
  const tied = calculateTieredStandings(teams.slice(0, 2), [], standingsConfig({ rankingRules: ['wins'] }));
  const manual = resolveTieredRanking(tied, [], standingsConfig({ rankingRules: ['wins'], finalResolution: 'manual' }));
  assert.deepEqual(manual.unresolvedGroups, [['t1', 't2']]);

  const drawConfig = standingsConfig({ rankingRules: ['wins'], finalResolution: 'random_draw', randomSeed: 'tournament-24' });
  assert.deepEqual(
    resolveTieredRanking(tied, [], drawConfig).ranked.map(row => row.id),
    resolveTieredRanking(tied, [], drawConfig).ranked.map(row => row.id),
  );
  assert.deepEqual(resolveTieredRanking(tied, [], drawConfig).unresolvedGroups, []);
});

test('sport labels remain display-only and use the right scoring nouns', async () => {
  const { tieredScoreLabels } = await import('../src/lib/tiered-playoffs/sport-labels.ts').catch(() => ({}));
  assert.equal(typeof tieredScoreLabels, 'function');
  assert.deepEqual(tieredScoreLabels('Softball'), { forLabel: 'Runs For', againstLabel: 'Runs Against', differentialLabel: 'Run Differential' });
  assert.deepEqual(tieredScoreLabels('Basketball'), { forLabel: 'Points For', againstLabel: 'Points Against', differentialLabel: 'Point Differential' });
  assert.deepEqual(tieredScoreLabels('Hockey'), { forLabel: 'Goals For', againstLabel: 'Goals Against', differentialLabel: 'Goal Differential' });
  assert.deepEqual(tieredScoreLabels('Curling'), { forLabel: 'Points For', againstLabel: 'Points Against', differentialLabel: 'Differential' });
});
