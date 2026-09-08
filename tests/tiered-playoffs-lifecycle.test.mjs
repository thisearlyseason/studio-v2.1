import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileTieredAfterPreliminaryMutation } from '../src/lib/tiered-playoffs/lifecycle.ts';
import { tieredStandingsFingerprint } from '../src/lib/tiered-playoffs/seeding.ts';

const game = score1 => ({ id: 'g1', phase: 'preliminary', team1Id: 'a', team2Id: 'b', score1, score2: 0, isCompleted: true, isDisputed: false });
const base = status => ({
  schemaVersion: 1,
  preliminary: { gamesPerTeam: 1, gameDurationMinutes: 60, transitionMinutes: 15, minimumRestMinutes: 30, maximumGamesPerTeamPerDay: 2, schedulingMethod: 'automatic' },
  standings: { pointsEnabled: true, points: { win: 2, tie: 1, loss: 0 }, rankingRules: ['wins'], finalResolution: 'manual', maximumDifferentialPerGame: null },
  divisions: { sizing: 'custom', definitions: [{ id: 'a', name: 'A', size: 2 }], avoidPreliminaryRematches: false },
  seeding: { status, calculated: [{ teamId: 'a' }], approved: [{ teamId: 'a' }], standingsFingerprint: tieredStandingsFingerprint([game(1)], { pointsEnabled: true, points: { win: 2, tie: 1, loss: 0 }, rankingRules: ['wins'], finalResolution: 'manual', maximumDifferentialPerGame: null }), lockedAt: 'now', lockedBy: 'owner' },
  playoffs: { bracketFormat: 'single_elimination', status: 'ready', publishedAt: null, publishedBy: null },
});

test('changed preliminary result invalidates unlocked preview without altering playoff games', () => {
  const next = reconcileTieredAfterPreliminaryMutation(base('review'), [game(2), { id: 'p1', phase: 'playoff', isCompleted: true }]);
  assert.equal(next.seeding.status, 'pending');
  assert.deepEqual(next.seeding.approved, []);
  assert.equal(next.playoffs.status, 'ready');
});

test('changed preliminary result marks locked placement stale and preserves approved seeds', () => {
  const config = base('locked');
  const next = reconcileTieredAfterPreliminaryMutation(config, [game(2)]);
  assert.equal(next.seeding.status, 'stale');
  assert.deepEqual(next.seeding.approved, config.seeding.approved);
  assert.equal(next.playoffs.status, 'ready');
});
