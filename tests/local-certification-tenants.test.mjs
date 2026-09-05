import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFixtureCatalog } from '../scripts/qa/certification/fixture-catalog.mjs';
import { DIMENSION_NAMES } from '../scripts/qa/certification/local/evidence.mjs';
import { selectLocalScenarios } from '../scripts/qa/certification/local/selection.mjs';
import {
  LOCAL_TENANT_CASE_REQUIREMENTS,
  LOCAL_TENANT_OPERATION_CONTRACTS,
  TENANT_EXECUTION_ORDER,
  runTenantsBatch,
  tenantCaseAssociationFor,
} from '../scripts/qa/certification/local/batches/tenants.mjs';

const scenarios = selectLocalScenarios({ batches: ['tenants'] });
const fixtures = buildFixtureCatalog('tenant-runner');
const instant = '2026-09-05T18:00:00.000Z';

function context(stdout = '', overrides = {}) {
  return {
    commit: '0123456789abcdef0123456789abcdef01234567',
    browserEnabled: true,
    fixtures,
    now: () => instant,
    certificationObservation: { code: 0, stdout, stderr: '', startedAt: instant, completedAt: instant },
    ...overrides,
  };
}

test('tenant batch owns exactly 16 scenarios and a complete seven-dimension case contract', () => {
  assert.equal(TENANT_EXECUTION_ORDER.length, 16);
  assert.equal(new Set(TENANT_EXECUTION_ORDER).size, 16);
  assert.deepEqual(new Set(TENANT_EXECUTION_ORDER), new Set(scenarios.map(item => item.id)));
  for (const scenario of scenarios) {
    assert.deepEqual(Object.keys(LOCAL_TENANT_CASE_REQUIREMENTS[scenario.id]), DIMENSION_NAMES);
    assert.ok(Object.values(LOCAL_TENANT_CASE_REQUIREMENTS[scenario.id]).every(value => value.length >= 1));
    assert.ok(['happyPath', 'negativePath', 'permission', 'persistence']
      .every(dimension => LOCAL_TENANT_CASE_REQUIREMENTS[scenario.id][dimension].length >= 2));
  }
});

test('tenant contracts require explicit executed assertions instead of case-name fragments or counts', () => {
  assert.deepEqual(new Set(Object.keys(LOCAL_TENANT_OPERATION_CONTRACTS)), new Set(TENANT_EXECUTION_ORDER));
  for (const scenarioId of TENANT_EXECUTION_ORDER) {
    const assertions = LOCAL_TENANT_OPERATION_CONTRACTS[scenarioId];
    assert.ok(assertions.length >= 2, `${scenarioId} must require multiple executed assertions`);
    assert.equal(new Set(assertions).size, assertions.length, `${scenarioId} assertion requirements must be unique`);
    assert.equal(assertions.some(label => /workflow|lifecycle graph cardinality|consumer graph cardinality/i.test(label)), false);
  }
});

test('youth browser evidence is attributed to the activated youth session', () => {
  for (const dimension of ['console', 'responsive']) {
    assert.deepEqual(
      tenantCaseAssociationFor('family-enable-youth-login', dimension, `family-youth-login-${dimension}`),
      { actorAlias: 'qa-youth-invite', targetAlias: 'qa-player-youth-c', operation: 'read' },
    );
  }
});

test('scenario workflow evidence records the mutation operation rather than a generic read', () => {
  for (const [scenarioId, caseId] of [
    ['teams-profile-branding-settings', 'team-settings-owner-settings-and-branding-edit'],
    ['organization-create-allocate-remove-squads', 'organization-squads-seat-release-and-reallocation'],
    ['recruiting-private-profile-crud', 'recruiting-private-profile-metrics-contact-media-edit'],
    ['family-children-invites-team-cards', 'family-children-child-edit-and-two-card-refresh'],
  ]) {
    assert.equal(tenantCaseAssociationFor(scenarioId, 'happyPath', caseId).operation, 'update');
  }
});

test('renamed cross-tenant cases retain their actual runtime executors', () => {
  assert.deepEqual(
    tenantCaseAssociationFor('teams-create-and-capacity', 'permission', 'team-create-cross-tenant-created-team-denial'),
    { actorAlias: 'qa-coach-owner-b', targetAlias: 'run-created-squad', operation: 'permission' },
  );
  assert.deepEqual(
    tenantCaseAssociationFor('recruiting-public-scout-projection', 'permission', 'recruiting-public-cross-tenant-private-root-denial'),
    { actorAlias: 'qa-coach-owner-a', targetAlias: 'qa-player-adult-b', operation: 'permission' },
  );
});

test('absent application observations stay blocked and never become PASS', async () => {
  const result = await runTenantsBatch(context(), scenarios);
  assert.equal(result.results.length, 16);
  assert.deepEqual(result.runErrors, []);
  assert.ok(result.results.every(item => item.outcome === 'BLOCKED_PRECONDITION'));
  assert.ok(result.results.every(item => Object.values(item.dimensions).every(dimension => dimension.state === 'BLOCKED_PRECONDITION')));
  assert.ok(result.results.every(item => item.environmentGaps.includes('staging')));
});

test('one cross-tenant failure is case-owned while every other scenario remains explicit', async () => {
  const scenario = scenarios.find(item => item.id === 'teams-join-by-code');
  const caseId = LOCAL_TENANT_CASE_REQUIREMENTS[scenario.id].permission[0];
  const event = {
    type: 'case', scenarioId: scenario.id, caseId, dimension: 'permission', state: 'FAIL',
    actorAliases: ['qa-parent-b'], role: scenario.roles.join('/'), tenantAlias: 'qa-team-a+qa-team-b',
    expected: 'Parent B is denied Team A child membership.', observed: 'Cross-tenant request unexpectedly succeeded.',
    startedAt: instant, completedAt: instant, artifacts: [],
  };
  const cleanup = { type: 'cleanup', cleanupId: 'tenant-cleanup', selectors: ['dynamic:1'], counts: { deleted: 1, restored: 0, retainedAuditRecords: 0 }, state: 'OBSERVED', proof: ['cleanup/proof.json'] };
  const stdout = [event, cleanup].map(item => `CERTIFICATION_EVENT ${JSON.stringify(item)}`).join('\n');
  const result = await runTenantsBatch(context(stdout), scenarios);
  assert.equal(result.results.find(item => item.scenarioId === scenario.id).outcome, 'FAIL');
  assert.equal(result.results.filter(item => item.outcome === 'FAIL').length, 1);
  assert.equal(result.results.length, 16);
  assert.equal(result.results.every(item => item.cleanup.reference === 'tenant-cleanup'), true);
});

test('a missing capability is named as a blocked precondition before mutation evidence', async () => {
  const result = await runTenantsBatch(context('', { fixtures: { ...fixtures, youthInvite: null } }), [
    scenarios.find(item => item.id === 'family-enable-youth-login'),
  ]);
  assert.match(result.results[0].dimensions.happyPath.note, /youth-invite/);
  assert.equal(result.results[0].cases.length, 0);
});

test('a nonzero tenant child without a structured failure is retained as a redacted run error', async () => {
  const result = await runTenantsBatch(context('', {
    certificationObservation: {
      code: 1,
      stdout: '',
      stderr: 'tenant execution failed token=secret-value',
      startedAt: instant,
      completedAt: instant,
    },
    redact: value => String(value).replace(/token=\S+/g, '[redacted]'),
  }), scenarios);
  assert.deepEqual(result.runErrors, [{
    stage: 'tenant-child',
    diagnostic: 'tenant execution failed [redacted]',
  }]);
});

test('scenario infrastructure errors preserve original and restoration diagnostics without inventing case ownership', async () => {
  const scenario = scenarios[0];
  const event = {
    type: 'scenario-error', scenarioId: scenario.id, stage: 'scenario-cleanup-or-runner',
    diagnostic: 'operation failed; cleanup also failed',
    originalDiagnostic: 'operation failed', restorationDiagnostics: ['restore team failed', 'verify object failed'],
  };
  const result = await runTenantsBatch(context(`CERTIFICATION_EVENT ${JSON.stringify(event)}`), [scenario]);
  assert.deepEqual(result.runErrors, [{
    stage: 'scenario-cleanup-or-runner',
    diagnostic: 'operation failed; cleanup also failed',
    originalDiagnostic: 'operation failed',
    restorationDiagnostics: ['restore team failed', 'verify object failed'],
  }]);
  assert.equal(result.results[0].cases.length, 0);
});

test('a nonzero tenant child with structured case failure does not duplicate it as a global error', async () => {
  const scenario = scenarios.find(item => item.id === 'teams-join-by-code');
  const event = {
    type: 'case', scenarioId: scenario.id, caseId: LOCAL_TENANT_CASE_REQUIREMENTS[scenario.id].network[0],
    dimension: 'network', state: 'FAIL', actorAliases: ['qa-parent-a'], role: 'P', tenantAlias: 'qa-team-a',
    expected: 'Request succeeds.', observed: 'Request failed.', startedAt: instant, completedAt: instant, artifacts: [],
  };
  const result = await runTenantsBatch(context(`CERTIFICATION_EVENT ${JSON.stringify(event)}`, {
    certificationObservation: { code: 1, stdout: `CERTIFICATION_EVENT ${JSON.stringify(event)}`, stderr: 'structured failure', startedAt: instant, completedAt: instant },
  }), scenarios);
  assert.deepEqual(result.runErrors, []);
});
