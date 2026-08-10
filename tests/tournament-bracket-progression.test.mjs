import assert from 'node:assert/strict';
import test from 'node:test';

const scheduler = await import('../src/lib/scheduler-utils.ts');
const {
  advanceBracketMatch,
  hasCompletedBracketDescendant,
  isTournamentGameScorable,
  recordTournamentScore,
  validateBracketScoreSubmission,
} = scheduler;

const game = (overrides = {}) => ({
  id: 'game',
  team1: 'Alpha',
  team2: 'Bravo',
  team1Id: 'alpha',
  team2Id: 'bravo',
  score1: 0,
  score2: 0,
  date: '2026-08-10',
  time: '10:00 AM',
  location: 'Field 1',
  isCompleted: false,
  updatedAt: '2026-08-01T00:00:00.000Z',
  round: 'Semi-Finals',
  stage: 'Main',
  ...overrides,
});

test('elimination scoring rejects ties and unresolved or conditional participants', () => {
  const resolved = game();
  assert.equal(validateBracketScoreSubmission([resolved], resolved.id, 1, 1).code, 'ELIMINATION_TIE');
  assert.throws(() => advanceBracketMatch([resolved], resolved.id, 1, 1), { name: 'BracketProgressionError' });

  const unresolved = game({ team2: 'TBD (Semi Winner)', team2Id: 'tbd' });
  assert.equal(isTournamentGameScorable(unresolved), false);
  assert.equal(validateBracketScoreSubmission([unresolved], unresolved.id, 2, 1).code, 'MATCH_UNRESOLVED');

  const bye = game({ team2: 'BYE', team2Id: 'bye' });
  assert.equal(validateBracketScoreSubmission([bye], bye.id, 2, 0).code, 'MATCH_UNRESOLVED');

  const conditional = game({ isResetMatch: true, isConditional: true, stage: 'GF', round: 'Championship Decider' });
  assert.equal(validateBracketScoreSubmission([conditional], conditional.id, 2, 1).code, 'MATCH_CONDITIONAL');
});

test('pool-play ties remain valid', () => {
  const poolGame = game({ round: 'Pool A', stage: 'Pool' });
  assert.deepEqual(validateBracketScoreSubmission([poolGame], poolGame.id, 1, 1), { valid: true });
});

test('losers-bracket champion win activates and populates the championship reset', () => {
  const championship = game({ id: 'gf', round: 'Championship', stage: 'GF', team1: 'WB Champ', team1Id: 'wb', team2: 'LB Champ', team2Id: 'lb' });
  const reset = game({ id: 'reset', round: 'Championship Decider', stage: 'GF', team1: 'TBD (Championship Team 1)', team1Id: 'tbd', team2: 'TBD (Championship Team 2)', team2Id: 'tbd', isResetMatch: true, isConditional: true });
  const advanced = advanceBracketMatch([championship, reset], championship.id, 1, 2);
  assert.deepEqual(
    { team1: advanced[1].team1, team1Id: advanced[1].team1Id, team2: advanced[1].team2, team2Id: advanced[1].team2Id, isConditional: advanced[1].isConditional },
    { team1: 'WB Champ', team1Id: 'wb', team2: 'LB Champ', team2Id: 'lb', isConditional: false }
  );
});

test('winners-bracket champion win leaves the championship reset inactive', () => {
  const championship = game({ id: 'gf', round: 'Championship', stage: 'GF', team1: 'WB Champ', team1Id: 'wb', team2: 'LB Champ', team2Id: 'lb' });
  const reset = game({ id: 'reset', round: 'Championship Decider', stage: 'GF', team1: 'WB Champ', team1Id: 'wb', team2: 'LB Champ', team2Id: 'lb', isResetMatch: true, isConditional: false });
  const advanced = advanceBracketMatch([championship, reset], championship.id, 2, 1);
  assert.equal(advanced[1].isConditional, true);
  assert.equal(advanced[1].team1Id, 'tbd');
  assert.equal(advanced[1].team2Id, 'tbd');
});

test('upstream results cannot be changed after a dependent match is complete', () => {
  const semifinal = game({ id: 'semi', winnerTo: 'final', winnerToSlot: 'team1' });
  const final = game({ id: 'final', round: 'Championship', team1: 'Alpha', team1Id: 'alpha', team2: 'Charlie', team2Id: 'charlie', isCompleted: true });
  assert.equal(hasCompletedBracketDescendant([semifinal, final], semifinal.id), true);
  assert.equal(validateBracketScoreSubmission([semifinal, final], semifinal.id, 3, 1).code, 'DOWNSTREAM_COMPLETE');
});

test('pool results lock as soon as knockout qualifiers are seeded', () => {
  const pool = game({ id: 'pool-a-1', round: 'Pool A', stage: 'Pool' });
  const knockout = game({
    id: 'semi', round: 'Semi-Finals', stage: 'Knockout',
    team1: 'Alpha', team1Id: 'alpha', team2: 'Charlie', team2Id: 'charlie',
  });
  assert.equal(validateBracketScoreSubmission([pool, knockout], pool.id, 2, 1).code, 'POOL_RESULTS_LOCKED');

  const completedKnockout = { ...knockout, isCompleted: true };
  assert.equal(hasCompletedBracketDescendant([pool, completedKnockout], pool.id), true);
});

test('organizer tiebreak selection is persisted and drives bracket progression', () => {
  const semifinal = game({ id: 'semi', winnerTo: 'final', winnerToSlot: 'team1' });
  const final = game({ id: 'final', round: 'Championship', team1: 'TBD', team1Id: 'tbd', team2: 'Charlie', team2Id: 'charlie' });
  const scored = recordTournamentScore([semifinal, final], semifinal.id, 2, 2, 'team1');
  assert.equal(scored[0].score1, 2);
  assert.equal(scored[0].score2, 2);
  assert.equal(scored[0].winnerId, 'alpha');
  assert.equal(scored[0].explicitWinner, 'team1');
  assert.equal(scored[1].team1Id, 'alpha');
});
