import assert from 'node:assert/strict';
import test from 'node:test';

import * as runner from '../scripts/qa/certification/run-background-batches.mjs';

test('background certification owns a unique staging-only projection graph', () => {
  const graph = runner.buildProjectionProbeGraph('bg-cert-123');
  assert.deepEqual(graph.paths, [
    'users/bg-cert-123-owner',
    'teams/bg-cert-123-team',
    'leagues/bg-cert-123-league',
    'publicLeagueViews/bg-cert-123-league',
    'leaguePublicProjectionState/bg-cert-123-league',
  ]);
  assert.equal(graph.owner.plan_type, 'league');
  assert.equal(graph.team.ownerUserId, 'bg-cert-123-owner');
  assert.equal(graph.league.tenantId, 'bg-cert-123-team');
});

test('background certification refuses unsafe run identifiers', () => {
  for (const runId of ['', 'production', '../escape', 'bg-cert-UPPER']) {
    assert.throws(() => runner.buildProjectionProbeGraph(runId), /refus/i);
  }
});
