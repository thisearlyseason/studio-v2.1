import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTieredPlayoffsConfig } from '../src/lib/tiered-playoffs/config.ts';
import { validateTieredPlayoffsConfig } from '../src/lib/tiered-playoffs/types.ts';

test('organizer settings build a valid automatic Tiered Playoffs configuration', () => {
  const config = buildTieredPlayoffsConfig({
    teamCount: 10, gamesPerTeam: 3, gameDurationMinutes: 50, transitionMinutes: 10,
    minimumRestMinutes: 40, maximumGamesPerTeamPerDay: 3, sizing: 'automatic',
    divisionNames: ['Gold', 'Silver', 'Bronze'], points: { win: 3, tie: 1, loss: 0 },
    rankingRules: ['tournament_points', 'head_to_head', 'differential', 'points_for'],
    finalResolution: 'manual', maximumDifferentialPerGame: 7, avoidPreliminaryRematches: true,
  });
  assert.deepEqual(config.divisions.definitions.map(item => item.size), [4, 3, 3]);
  assert.equal(validateTieredPlayoffsConfig(config, 10).valid, true);
});

test('custom Tiered division sizes must cover every team exactly once', () => {
  assert.throws(() => buildTieredPlayoffsConfig({
    teamCount: 8, gamesPerTeam: 2, gameDurationMinutes: 60, transitionMinutes: 15,
    minimumRestMinutes: 45, maximumGamesPerTeamPerDay: 3, sizing: 'custom',
    divisionNames: ['A', 'B'], divisionSizes: [4, 3], points: { win: 2, tie: 1, loss: 0 },
    rankingRules: ['wins'], finalResolution: 'manual', maximumDifferentialPerGame: null,
    avoidPreliminaryRematches: false,
  }), /include all 8 teams/);
});
