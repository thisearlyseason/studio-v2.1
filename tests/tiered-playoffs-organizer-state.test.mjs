import assert from 'node:assert/strict';
import test from 'node:test';

const { tieredOrganizerState } = await import('../src/lib/tiered-playoffs/organizer-state.ts');

const team = id => ({ id, name: id.toUpperCase() });
const game = (id, changes = {}) => ({
  id, team1Id: 'a', team2Id: 'b', phase: 'preliminary', isCompleted: false, isDisputed: false, ...changes,
});
const event = changes => ({
  tournamentTeamsData: [team('a'), team('b')], tournamentGames: [], selectedFields: [], dailyWindows: [],
  tieredPlayoffs: {
    divisions: { definitions: [] },
    seeding: { status: 'pending' },
    playoffs: { status: 'pending' },
  },
  ...changes,
});

test('zero-team Tiered draft remains in enrollment', () => {
  assert.deepEqual(tieredOrganizerState(event({ tournamentTeamsData: [] })), {
    stage: 'enrollment', completed: 0, total: 0, blockingGameIds: [], primaryAction: null,
  });
});

test('configured teams and logistics expose preliminary generation', () => {
  assert.equal(tieredOrganizerState(event({ selectedFields: ['field'], dailyWindows: [{ date: '2026-09-10', startTime: '08:00', endTime: '18:00' }] })).primaryAction, 'generate_preliminaries');
  assert.equal(tieredOrganizerState(event()).stage, 'preliminary_setup');
});

test('only final undisputed preliminary games unlock playoff scheduling', () => {
  const incomplete = tieredOrganizerState(event({ tournamentGames: [game('g1')] }));
  assert.equal(incomplete.stage, 'preliminary_in_progress');
  assert.equal(incomplete.primaryAction, null);
  assert.deepEqual(incomplete.blockingGameIds, ['g1']);

  const complete = tieredOrganizerState(event({ tournamentGames: [game('g1', { isCompleted: true })] }));
  assert.equal(complete.stage, 'playoff_setup');
  assert.equal(complete.primaryAction, 'schedule_playoffs');

  const disputed = tieredOrganizerState(event({ tournamentGames: [game('g1', { isCompleted: true, isDisputed: true })] }));
  assert.equal(disputed.primaryAction, null);
  assert.deepEqual(disputed.blockingGameIds, ['g1']);
});

test('configured divisions advance into seeding and published playoff stages', () => {
  const preliminary = [game('g1', { isCompleted: true })];
  const configured = event({ tournamentGames: preliminary });
  configured.tieredPlayoffs.divisions.definitions = [{ id: 'tier_1', name: 'A', size: 2 }];
  assert.equal(tieredOrganizerState(configured).primaryAction, 'review_seeding');
  configured.tieredPlayoffs.seeding.status = 'locked';
  assert.equal(tieredOrganizerState(configured).stage, 'playoffs_ready');
  configured.tieredPlayoffs.playoffs.status = 'ready';
  assert.equal(tieredOrganizerState(configured).primaryAction, 'publish_playoffs');
  configured.tieredPlayoffs.playoffs.status = 'published';
  configured.tournamentGames.push({ id: 'p1', phase: 'playoff', isCompleted: false });
  assert.equal(tieredOrganizerState(configured).stage, 'playoffs_in_progress');
  configured.tournamentGames[1].isCompleted = true;
  assert.equal(tieredOrganizerState(configured).stage, 'complete');
});
