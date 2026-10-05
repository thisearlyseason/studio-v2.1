import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTieredPlayoffsConfig, buildTieredPlayoffsDraftConfig } from '../src/lib/tiered-playoffs/config.ts';
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

test('editing Tiered settings updates timing and scoring without resetting divisions or bracket state', () => {
  const input = {
    gamesPerTeam: 3, gameDurationMinutes: 60, transitionMinutes: 15,
    minimumRestMinutes: 15, maximumGamesPerTeamPerDay: 3,
    points: { win: 3, tie: 1, loss: 0 }, rankingRules: ['wins'],
    finalResolution: 'manual', maximumDifferentialPerGame: null, avoidPreliminaryRematches: true,
  };
  const existing = buildTieredPlayoffsConfig({ ...input, teamCount: 4, sizing: 'automatic', divisionNames: ['Gold', 'Silver'] });
  existing.seeding.status = 'locked';
  existing.seeding.lockedAt = '2026-09-08T12:00:00Z';
  existing.playoffs.status = 'published';
  existing.standings.pointsEnabled = false;
  const before = structuredClone(existing);
  const updated = buildTieredPlayoffsDraftConfig({ ...input,
    gamesPerTeam: 2, gameDurationMinutes: 30, transitionMinutes: 10, minimumRestMinutes: 10,
    maximumGamesPerTeamPerDay: 2, points: { win: 5, tie: 2, loss: 0 },
    maximumDifferentialPerGame: 7, finalResolution: 'random_draw',
    rankingRules: ['tournament_points'], avoidPreliminaryRematches: false,
  }, existing);
  assert.deepEqual(updated.divisions, before.divisions);
  assert.deepEqual(updated.seeding, before.seeding);
  assert.deepEqual(updated.playoffs, before.playoffs);
  assert.deepEqual(updated.standings.rankingRules, ['wins']);
  assert.equal(updated.standings.pointsEnabled, false);
  assert.equal(updated.preliminary.gameDurationMinutes, 30);
  assert.equal(updated.preliminary.gamesPerTeam, 2);
  assert.equal(updated.preliminary.transitionMinutes, 10);
  assert.equal(updated.preliminary.minimumRestMinutes, 10);
  assert.equal(updated.preliminary.maximumGamesPerTeamPerDay, 2);
  assert.deepEqual(updated.standings.points, { win: 5, tie: 2, loss: 0 });
  assert.equal(updated.standings.maximumDifferentialPerGame, 7);
  assert.equal(updated.standings.finalResolution, 'random_draw');
  assert.deepEqual(existing, before);
  const customRest = structuredClone(existing);
  customRest.preliminary.minimumRestMinutes = 45;
  const customUpdated = buildTieredPlayoffsDraftConfig({ ...input, transitionMinutes: 10, minimumRestMinutes: 10 }, customRest);
  assert.equal(customUpdated.preliminary.minimumRestMinutes, 45);
  assert.equal(customRest.preliminary.minimumRestMinutes, 45);
});
