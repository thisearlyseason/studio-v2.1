import assert from 'node:assert/strict';
import test from 'node:test';

async function load() {
  const loaded = await import('../src/lib/tiered-playoffs/schedule.ts').catch(() => null);
  assert.ok(loaded, 'Tiered schedule module must exist');
  return loaded;
}

const teams = count => Array.from({ length: count }, (_, index) => ({ id: `team_${index + 1}`, name: `Team ${index + 1}` }));
const config = overrides => ({
  teams: teams(6),
  gamesPerTeam: 2,
  fields: [{ id: 'field_1', name: 'Field 1' }, { id: 'field_2', name: 'Field 2' }],
  dailyWindows: [
    { date: '2026-09-10', startTime: '08:00', endTime: '16:00' },
    { date: '2026-09-11', startTime: '08:00', endTime: '16:00' },
  ],
  gameDurationMinutes: 60,
  transitionMinutes: 15,
  minimumRestMinutes: 60,
  maximumGamesPerTeamPerDay: 2,
  ...overrides,
});

function startMinutes(value) {
  const match = /^(\d+):(\d+)\s(AM|PM)$/.exec(value);
  assert.ok(match, `invalid rendered time ${value}`);
  let hour = Number(match[1]);
  if (match[3] === 'PM' && hour !== 12) hour += 12;
  if (match[3] === 'AM' && hour === 12) hour = 0;
  return hour * 60 + Number(match[2]);
}

test('Tiered preliminary scheduling allocates every matchup without team or resource conflicts', async () => {
  const { generateTieredPreliminarySchedule } = await load();
  const result = generateTieredPreliminarySchedule(config());
  assert.equal(result.games.length, 6);
  assert.equal(result.validation.valid, true, result.validation.conflicts.join('\n'));
  assert.equal(result.health.hardConstraintViolations, 0);
  assert.equal(result.health.gamesPerTeam.minimum, 2);
  assert.equal(result.health.gamesPerTeam.maximum, 2);
  for (let left = 0; left < result.games.length; left++) for (let right = left + 1; right < result.games.length; right++) {
    const a = result.games[left], b = result.games[right];
    if (a.date !== b.date) continue;
    const overlap = Math.abs(startMinutes(a.time) - startMinutes(b.time)) < 60;
    if (!overlap) continue;
    assert.notEqual(a.resourceId, b.resourceId);
    assert.equal([a.team1Id, a.team2Id].some(id => [b.team1Id, b.team2Id].includes(id)), false);
  }
});

test('Tiered validation rejects manual team, resource, window, and missing-reference conflicts', async () => {
  const { generateTieredPreliminarySchedule, validateTieredSchedule } = await load();
  const base = generateTieredPreliminarySchedule(config()).games;

  const teamConflict = structuredClone(base);
  teamConflict[1].team1Id = teamConflict[0].team1Id;
  teamConflict[1].team1 = teamConflict[0].team1;
  teamConflict[1].date = teamConflict[0].date;
  teamConflict[1].time = teamConflict[0].time;
  assert.equal(validateTieredSchedule(teamConflict, config()).valid, false);

  const resourceConflict = structuredClone(base);
  resourceConflict[1].resourceId = resourceConflict[0].resourceId;
  resourceConflict[1].location = resourceConflict[0].location;
  resourceConflict[1].date = resourceConflict[0].date;
  resourceConflict[1].time = resourceConflict[0].time;
  assert.equal(validateTieredSchedule(resourceConflict, config()).valid, false);

  const outsideWindow = structuredClone(base);
  outsideWindow[0].time = '7:00 AM';
  assert.equal(validateTieredSchedule(outsideWindow, config()).valid, false);

  const missingTeam = structuredClone(base);
  missingTeam[0].team1Id = 'unknown';
  assert.equal(validateTieredSchedule(missingTeam, config()).valid, false);
});

test('Tiered schedule health reports transparent fairness metrics', async () => {
  const { generateTieredPreliminarySchedule } = await load();
  const result = generateTieredPreliminarySchedule(config());
  assert.deepEqual(Object.keys(result.health).sort(), [
    'fieldDistributionSpread', 'gamesPerTeam', 'hardConstraintViolations',
    'opponentVariety', 'restBalanceMinutes', 'startTimeDistributionSpread',
  ]);
  assert.equal(result.health.opponentVariety, 'Good');
  assert.ok(result.health.restBalanceMinutes.maximum >= result.health.restBalanceMinutes.minimum);
});

test('Tiered scheduling fails instead of returning a partial schedule when constraints cannot be allocated', async () => {
  const { generateTieredPreliminarySchedule, TieredScheduleAllocationError } = await load();
  assert.throws(() => generateTieredPreliminarySchedule(config({
    dailyWindows: [{ date: '2026-09-10', startTime: '08:00', endTime: '10:00' }],
    fields: [{ id: 'field_1', name: 'Field 1' }],
  })), TieredScheduleAllocationError);
});
