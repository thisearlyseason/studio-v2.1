import assert from 'node:assert/strict';
import test from 'node:test';

const validConfig = {
  schemaVersion: 1,
  preliminary: {
    gamesPerTeam: 4,
    gameDurationMinutes: 60,
    transitionMinutes: 15,
    minimumRestMinutes: 60,
    maximumGamesPerTeamPerDay: 3,
    schedulingMethod: 'automatic',
  },
  standings: {
    pointsEnabled: true,
    points: { win: 2, tie: 1, loss: 0 },
    rankingRules: ['tournament_points', 'wins', 'differential', 'points_for', 'points_against'],
    finalResolution: 'manual',
    maximumDifferentialPerGame: 7,
  },
  divisions: {
    sizing: 'custom',
    definitions: [
      { id: 'division_a', name: 'A Division', size: 6 },
      { id: 'division_b', name: 'B Division', size: 6 },
      { id: 'division_c', name: 'C Division', size: 6 },
      { id: 'division_d', name: 'D Division', size: 6 },
    ],
    avoidPreliminaryRematches: true,
  },
  seeding: {
    status: 'pending',
    calculated: [],
    approved: [],
    standingsFingerprint: null,
    lockedAt: null,
    lockedBy: null,
  },
  playoffs: {
    bracketFormat: 'single_elimination',
    status: 'pending',
    publishedAt: null,
    publishedBy: null,
  },
};

test('Tiered Playoffs configuration accepts a complete versioned 24-team setup', async () => {
  const loaded = await import('../src/lib/tiered-playoffs/types.ts').catch(() => null);
  assert.ok(loaded, 'Tiered Playoffs configuration module must exist');
  assert.deepEqual(loaded.validateTieredPlayoffsConfig(validConfig, 24), { valid: true, errors: [] });
});

test('Tiered Playoffs configuration rejects unsafe ranking, division, cap, and schema values', async () => {
  const loaded = await import('../src/lib/tiered-playoffs/types.ts').catch(() => null);
  assert.ok(loaded, 'Tiered Playoffs configuration module must exist');

  const duplicateRules = structuredClone(validConfig);
  duplicateRules.standings.rankingRules = ['wins', 'wins'];
  assert.equal(loaded.validateTieredPlayoffsConfig(duplicateRules, 24).valid, false);

  const invalidSizes = structuredClone(validConfig);
  invalidSizes.divisions.definitions[3].size = 5;
  assert.equal(loaded.validateTieredPlayoffsConfig(invalidSizes, 24).valid, false);

  const negativeCap = structuredClone(validConfig);
  negativeCap.standings.maximumDifferentialPerGame = -1;
  assert.equal(loaded.validateTieredPlayoffsConfig(negativeCap, 24).valid, false);

  const unknownSchema = structuredClone(validConfig);
  unknownSchema.schemaVersion = 2;
  assert.equal(loaded.validateTieredPlayoffsConfig(unknownSchema, 24).valid, false);
});
