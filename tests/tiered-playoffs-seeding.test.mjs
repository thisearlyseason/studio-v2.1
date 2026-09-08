import assert from 'node:assert/strict';
import test from 'node:test';

async function load() {
  const module = await import('../src/lib/tiered-playoffs/seeding.ts').catch(() => null);
  assert.ok(module, 'Tiered seeding module must exist');
  return module;
}

const ranked = count => Array.from({ length: count }, (_, index) => ({ id: `team_${index + 1}`, name: `Team ${index + 1}` }));
const divisions = count => Array.from({ length: count }, (_, index) => ({
  id: `division_${index + 1}`,
  name: `Division ${String.fromCharCode(65 + index)}`,
  size: 1,
}));

test('automatic division sizing is contiguous, predictable, and includes every team once', async () => {
  const { allocateTieredDivisions } = await load();
  const twenty = allocateTieredDivisions(ranked(20), divisions(4), 'automatic');
  assert.deepEqual(twenty.filter(row => row.divisionId === 'division_1').map(row => row.overallSeed), [1, 2, 3, 4, 5]);
  assert.deepEqual(twenty.filter(row => row.divisionId === 'division_4').map(row => row.overallSeed), [16, 17, 18, 19, 20]);

  const twentyTwo = allocateTieredDivisions(ranked(22), divisions(4), 'automatic');
  assert.deepEqual(['division_1', 'division_2', 'division_3', 'division_4'].map(id => twentyTwo.filter(row => row.divisionId === id).length), [6, 6, 5, 5]);
  assert.equal(new Set(twentyTwo.map(row => row.teamId)).size, 22);
});

test('custom 6/6/6/4 divisions assign every one of 22 teams exactly once', async () => {
  const { allocateTieredDivisions } = await load();
  const custom = divisions(4).map((division, index) => ({ ...division, size: [6, 6, 6, 4][index] }));
  const placements = allocateTieredDivisions(ranked(22), custom, 'custom');
  assert.deepEqual(custom.map(division => placements.filter(row => row.divisionId === division.id).length), [6, 6, 6, 4]);
  assert.deepEqual(placements.slice(18).map(row => row.divisionSeed), [1, 2, 3, 4]);
});

test('invalid custom totals and duplicate team or division identities fail closed', async () => {
  const { allocateTieredDivisions, TieredSeedingError } = await load();
  assert.throws(() => allocateTieredDivisions(ranked(5), [{ id: 'a', name: 'A', size: 2 }, { id: 'b', name: 'B', size: 2 }], 'custom'), TieredSeedingError);
  assert.throws(() => allocateTieredDivisions([...ranked(4), ranked(1)[0]], divisions(2), 'automatic'), TieredSeedingError);
  assert.throws(() => allocateTieredDivisions(ranked(4), [{ id: 'a', name: 'A', size: 2 }, { id: 'a', name: 'B', size: 2 }], 'custom'), TieredSeedingError);
});

test('manual overrides preserve calculated seeds and reset cleanly', async () => {
  const { allocateTieredDivisions, applyTieredSeedOverride, resetTieredSeedOverrides } = await load();
  const calculated = allocateTieredDivisions(ranked(8), divisions(2), 'automatic');
  const approved = applyTieredSeedOverride(calculated, calculated, {
    teamId: 'team_6',
    targetOverallSeed: 3,
    actorUid: 'organizer_1',
    timestamp: '2026-09-08T12:00:00.000Z',
  });
  assert.equal(calculated.find(row => row.teamId === 'team_6').overallSeed, 6);
  const moved = approved.find(row => row.teamId === 'team_6');
  assert.deepEqual({ approved: moved.approvedOverallSeed, calculated: moved.calculatedOverallSeed, division: moved.divisionId, by: moved.overriddenBy }, {
    approved: 3,
    calculated: 6,
    division: 'division_1',
    by: 'organizer_1',
  });
  assert.deepEqual(resetTieredSeedOverrides(calculated), calculated);
});

test('standings fingerprint changes only for preliminary results or ranking configuration', async () => {
  const { tieredStandingsFingerprint } = await load();
  const preliminary = { id: 'g1', phase: 'preliminary', team1Id: 'a', team2Id: 'b', score1: 3, score2: 1, isCompleted: true, isDisputed: false };
  const playoff = { id: 'p1', phase: 'playoff', team1Id: 'a', team2Id: 'b', score1: 2, score2: 0, isCompleted: true };
  const rules = { pointsEnabled: true, points: { win: 2, tie: 1, loss: 0 }, rankingRules: ['wins', 'differential'], maximumDifferentialPerGame: 7, finalResolution: 'manual' };
  const initial = tieredStandingsFingerprint([preliminary, playoff], rules);
  assert.notEqual(tieredStandingsFingerprint([{ ...preliminary, score1: 4 }, playoff], rules), initial);
  assert.equal(tieredStandingsFingerprint([preliminary, { ...playoff, score1: 9 }], rules), initial);
  assert.notEqual(tieredStandingsFingerprint([preliminary, playoff], { ...rules, maximumDifferentialPerGame: 5 }), initial);
});
