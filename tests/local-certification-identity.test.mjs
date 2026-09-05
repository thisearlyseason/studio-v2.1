import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { CERTIFICATION_SCENARIOS } from '../scripts/qa/certification/scenario-catalog.mjs';
import {
  IDENTITY_EXECUTION_ORDER,
  LOCAL_IDENTITY_CASE_REQUIREMENTS,
  parseCertificationEvents,
  runIdentityBatch,
} from '../scripts/qa/certification/local/batches/identity.mjs';
import {
  DIMENSION_NAMES,
  createEvidenceRecorder,
  validateScenarioResults,
} from '../scripts/qa/certification/local/evidence.mjs';
import { selectLocalScenarios } from '../scripts/qa/certification/local/selection.mjs';

const scenarios = selectLocalScenarios({ batches: ['identity'], catalog: CERTIFICATION_SCENARIOS });
const now = '2026-09-04T18:00:00.000Z';

function eventLine(value) {
  return `CERTIFICATION_EVENT ${JSON.stringify(value)}`;
}

function caseEvent(scenarioId, dimension, caseId = LOCAL_IDENTITY_CASE_REQUIREMENTS[scenarioId][dimension][0]) {
  const scenario = scenarios.find(value => value.id === scenarioId);
  return {
    type: 'case', scenarioId, caseId, dimension,
    actorAliases: ['qa-synthetic-actor'],
    role: scenario.roles.join('/'), tenantAlias: scenario.roles.includes('V') ? 'not-applicable' : 'catalog-scoped',
    expected: `${caseId} expected local behavior`, observed: `${caseId} observed local behavior`, state: 'OBSERVED',
    startedAt: now, completedAt: '2026-09-04T18:00:01.000Z', artifacts: [`cases/${caseId}.json`],
  };
}

function successfulOutput(selected = scenarios) {
  const events = [];
  for (const scenario of selected) {
    for (const dimension of DIMENSION_NAMES) {
      for (const caseId of LOCAL_IDENTITY_CASE_REQUIREMENTS[scenario.id][dimension]) {
        events.push(caseEvent(scenario.id, dimension, caseId));
      }
    }
  }
  events.push({
    type: 'cleanup', cleanupId: 'shared-fixture-cleanup',
    selectors: ['auth:23-exact-uids', 'firestore:81-exact-roots', 'storage:7-exact-paths'],
    counts: { deleted: 250, restored: 0, retainedAuditRecords: 0 }, state: 'OBSERVED',
    proof: ['cleanup/shared-fixture-cleanup.json'],
  });
  return events.map(eventLine).join('\n');
}

function context(overrides = {}) {
  return {
    runId: 'final-cert-t3-identity-a1', runSuffix: 't3-identity-a1', browserEnabled: true,
    commit: '0123456789abcdef0123456789abcdef01234567',
    runLegacyIdentityAudit: async () => ({ code: 0, stdout: successfulOutput(), stderr: '', startedAt: now, completedAt: '2026-09-04T18:02:00.000Z' }),
    now: () => now,
    ...overrides,
  };
}

test('identity execution order keeps blocked-state checks before lifecycle mutations and purge last', () => {
  assert.ok(IDENTITY_EXECUTION_ORDER.indexOf('authentication-email-password-login') < IDENTITY_EXECUTION_ORDER.indexOf('account-lifecycle-disable-delete-cancel-purge'));
  assert.equal(IDENTITY_EXECUTION_ORDER.at(-1), 'account-lifecycle-disable-delete-cancel-purge');
  assert.deepEqual(new Set(IDENTITY_EXECUTION_ORDER), new Set(scenarios.map(scenario => scenario.id)));
});

test('every exact Task 3 scenario declares locally executable cases for all seven dimensions', () => {
  assert.deepEqual(Object.keys(LOCAL_IDENTITY_CASE_REQUIREMENTS), scenarios.map(scenario => scenario.id));
  for (const scenario of scenarios) {
    assert.deepEqual(Object.keys(LOCAL_IDENTITY_CASE_REQUIREMENTS[scenario.id]), DIMENSION_NAMES);
    for (const dimension of DIMENSION_NAMES) assert.ok(LOCAL_IDENTITY_CASE_REQUIREMENTS[scenario.id][dimension].length > 0);
  }
  assert.ok(Object.isFrozen(LOCAL_IDENTITY_CASE_REQUIREMENTS));
});

test('structured event parsing retains provenance and rejects non-event diagnostics', () => {
  const event = caseEvent('authentication-email-password-login', 'negativePath');
  assert.deepEqual(parseCertificationEvents(`${eventLine(event)}\npassword=discard\nPASS generic: true`), [event]);
});

test('identity batch dispatches only selected scenarios and records complete structured local dimensions', async () => {
  const selected = scenarios.filter(scenario => ['authentication-password-reset', 'signup-onboarding-youth-invitation-signup'].includes(scenario.id));
  const calls = [];
  const result = await runIdentityBatch(context({
    runLegacyIdentityAudit: async selectedIds => {
      calls.push(selectedIds);
      return { code: 0, stdout: successfulOutput(selected), stderr: '', startedAt: now, completedAt: '2026-09-04T18:02:00.000Z' };
    },
  }), selected);
  assert.deepEqual(calls, [[
    'signup-onboarding-youth-invitation-signup',
    'authentication-password-reset',
  ]]);
  assert.deepEqual(result.results.map(value => value.scenarioId), selected.map(scenario => scenario.id));
  assert.equal(result.results.every(value => DIMENSION_NAMES.every(name => value.dimensions[name].state === 'OBSERVED')), true);
  assert.equal(result.results.every(value => value.outcome === 'BLOCKED_PRECONDITION'), true);
  assert.equal(result.results.every(value => value.cases.every(item => item.role !== 'catalog alias')), true);
  assert.equal(result.runErrors.length, 0);
});

test('browser-disabled execution blocks browser dimensions without manufacturing observations', async () => {
  const selected = scenarios.filter(scenario => scenario.id === 'authentication-password-reset');
  const nonBrowserEvents = parseCertificationEvents(successfulOutput(selected)).filter(event =>
    event.type !== 'case' || !['console', 'responsive'].includes(event.dimension));
  const result = await runIdentityBatch(context({
    browserEnabled: false,
    runLegacyIdentityAudit: async () => ({ code: 0, stdout: nonBrowserEvents.map(eventLine).join('\n'), stderr: '', startedAt: now, completedAt: now }),
  }), selected);
  assert.equal(result.results[0].dimensions.console.state, 'BLOCKED_PRECONDITION');
  assert.equal(result.results[0].dimensions.responsive.state, 'BLOCKED_PRECONDITION');
  assert.match(result.results[0].dimensions.responsive.note, /browser capability/i);
});

test('case failure stays with its scenario and shared runner failure stays separate', async () => {
  const selected = scenarios.slice(0, 2);
  const failedCase = { ...caseEvent(selected[1].id, 'network'), state: 'FAIL', observed: 'sanitized HTTP mismatch', defectId: 'BUG-024' };
  const failed = await runIdentityBatch(context({
    runLegacyIdentityAudit: async () => ({ code: 1, stdout: eventLine(failedCase), stderr: 'sanitized child failure', startedAt: now, completedAt: now }),
  }), selected);
  assert.equal(failed.results[1].outcome, 'FAIL');
  assert.equal(failed.results[0].outcome, 'BLOCKED_PRECONDITION');
  assert.equal(failed.runErrors.length, 0);

  const shared = await runIdentityBatch(context({ runLegacyIdentityAudit: async () => { throw new Error('shared sanitized startup failure'); } }), selected);
  assert.equal(shared.results.every(value => value.outcome === 'BLOCKED_PRECONDITION'), true);
  assert.deepEqual(shared.runErrors, [{ stage: 'identity-child', diagnostic: 'shared sanitized startup failure' }]);
});

test('multiple diagnostics for one failed case are retained without duplicate case IDs', async () => {
  const [selected] = scenarios.filter(item => item.id === 'authentication-email-password-login');
  const first = { ...caseEvent(selected.id, 'console'), state: 'FAIL', observed: 'browser assertion failed' };
  const second = { ...first, observed: 'browser cleanup also failed', completedAt: '2026-09-04T18:00:02.000Z' };
  const result = await runIdentityBatch(context({
    runLegacyIdentityAudit: async () => ({
      code: 1, stdout: [eventLine(first), eventLine(second)].join('\n'), stderr: '',
      startedAt: now, completedAt: '2026-09-04T18:02:00.000Z',
    }),
  }), [selected]);
  assert.equal(result.results[0].cases.length, 1);
  assert.deepEqual(result.results[0].cases[0].diagnostics, ['browser assertion failed', 'browser cleanup also failed']);
  assert.equal(result.results[0].outcome, 'FAIL');
});

test('failure aggregation retains event-level artifact provenance across observed and cleanup failures', async () => {
  const [selected] = scenarios.filter(item => item.id === 'authentication-email-password-login');
  const observed = caseEvent(selected.id, 'console');
  const firstFailure = {
    ...observed, state: 'FAIL', observed: 'browser assertion failed',
    artifacts: ['cases/login-console-failure-1.json'],
  };
  const cleanupFailure = {
    ...observed, state: 'FAIL', observed: 'browser cleanup also failed',
    completedAt: '2026-09-04T18:00:02.000Z',
    artifacts: ['cases/login-console-failure-2.json'],
  };
  const result = await runIdentityBatch(context({
    runLegacyIdentityAudit: async () => ({
      code: 1,
      stdout: [eventLine(observed), eventLine(firstFailure), eventLine(cleanupFailure)].join('\n'),
      stderr: '', startedAt: now, completedAt: '2026-09-04T18:02:00.000Z',
    }),
  }), [selected]);
  const [caseRecord] = result.results[0].cases;
  assert.equal(caseRecord.state, 'FAIL');
  assert.deepEqual(caseRecord.diagnostics, [
    observed.observed, firstFailure.observed, cleanupFailure.observed,
  ]);
  assert.deepEqual(caseRecord.artifactEvents.map(item => item.observed), [
    observed.observed, firstFailure.observed, cleanupFailure.observed,
  ]);
});

test('multiple failure artifacts validate and still produce the structured summary', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'task3-multi-failure-'));
  const [selected] = scenarios.filter(item => item.id === 'authentication-email-password-login');
  const caseId = LOCAL_IDENTITY_CASE_REQUIREMENTS[selected.id].console[0];
  const artifactPaths = [
    `cases/${caseId}-failure-1.json`,
    `cases/${caseId}-failure-2.json`,
  ];
  const failures = ['browser assertion failed', 'browser cleanup also failed'];
  try {
    await mkdir(path.join(directory, 'cases'));
    await mkdir(path.join(directory, 'cleanup'));
    for (let index = 0; index < artifactPaths.length; index += 1) {
      await writeFile(path.join(directory, artifactPaths[index]), JSON.stringify({
        runId: 'final-cert-t3-multi-failure',
        commit: context().commit,
        scenarioId: selected.id,
        caseId,
        dimension: 'console',
        actorAliases: ['qa-synthetic-actor'],
        expected: `${caseId} expected local behavior`,
        observed: failures[index],
        diagnostic: failures[index],
        capturedAt: `2026-09-04T18:00:0${index + 1}.000Z`,
      }));
    }
    await writeFile(path.join(directory, 'cleanup/marker.json'), JSON.stringify({
      runId: 'final-cert-t3-multi-failure', commit: context().commit,
      state: 'OBSERVED', counts: { deleted: 2, restored: 0, retainedAuditRecords: 0 },
      capturedAt: '2026-09-04T18:01:00.000Z',
    }));
    const events = failures.map((observed, index) => ({
      ...caseEvent(selected.id, 'console', caseId),
      observed,
      state: 'FAIL',
      completedAt: `2026-09-04T18:00:0${index + 1}.000Z`,
      artifacts: [artifactPaths[index]],
    }));
    events.push({
      type: 'cleanup', cleanupId: 'multi-failure-cleanup', selectors: ['auth:owned'],
      counts: { deleted: 2, restored: 0, retainedAuditRecords: 0 }, state: 'OBSERVED',
      proof: ['cleanup/marker.json'],
    });
    const batch = await runIdentityBatch(context({
      runId: 'final-cert-t3-multi-failure',
      runLegacyIdentityAudit: async () => ({
        code: 1, stdout: events.map(eventLine).join('\n'), stderr: '',
        startedAt: now, completedAt: '2026-09-04T18:02:00.000Z',
      }),
    }), [selected]);
    const validationOptions = {
      artifactRoot: directory,
      caseRequirements: LOCAL_IDENTITY_CASE_REQUIREMENTS,
      expectedRunId: 'final-cert-t3-multi-failure',
      expectedCommit: context().commit,
    };
    validateScenarioResults([selected], batch.results, validationOptions);
    const recorder = createEvidenceRecorder({
      scenarios: [selected], runId: 'final-cert-t3-multi-failure',
      commit: context().commit, outputDir: directory,
      caseRequirements: LOCAL_IDENTITY_CASE_REQUIREMENTS,
    });
    recorder.recordScenario(batch.results[0]);
    await recorder.writeSummary({ markdownPath: path.join(directory, '02-identity.md') });
    assert.match(await readFile(path.join(directory, '02-identity.md'), 'utf8'), /FAIL/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('artifact event provenance accepts only artifact-free NOT_OBSERVED events', async () => {
  const [selected] = scenarios.filter(item => item.id === 'demo-seed-use-exit-expiry-cleanup');
  const caseId = LOCAL_IDENTITY_CASE_REQUIREMENTS[selected.id].negativePath[0];
  const event = {
    ...caseEvent(selected.id, 'negativePath', caseId),
    state: 'NOT_OBSERVED', observed: 'worker seam unavailable', artifacts: [],
  };
  const cleanup = {
    type: 'cleanup', cleanupId: 'not-observed-cleanup', selectors: ['fixture:exact'],
    counts: { deleted: 0, restored: 0, retainedAuditRecords: 0 }, state: 'OBSERVED',
    proof: ['cleanup/marker.json'],
  };
  const batch = await runIdentityBatch(context({
    runLegacyIdentityAudit: async () => ({
      code: 0, stdout: [eventLine(event), eventLine(cleanup)].join('\n'), stderr: '',
      startedAt: now, completedAt: '2026-09-04T18:02:00.000Z',
    }),
  }), [selected]);
  assert.equal(batch.results[0].cases[0].state, 'NOT_OBSERVED');
  assert.deepEqual(batch.results[0].cases[0].artifactEvents, [{
    expected: event.expected, observed: event.observed, state: 'NOT_OBSERVED', artifacts: [],
  }]);
  validateScenarioResults([selected], batch.results, {
    caseRequirements: LOCAL_IDENTITY_CASE_REQUIREMENTS,
  });
});

test('scenario timestamps span every case instead of depending on case emission order', async () => {
  const [selected] = scenarios;
  const events = parseCertificationEvents(successfulOutput([selected]));
  const caseEvents = events.filter(event => event.type === 'case').map(event => ({
    ...event,
    startedAt: '2026-09-04T18:00:05.000Z',
    completedAt: '2026-09-04T18:00:06.000Z',
  }));
  caseEvents[1] = { ...caseEvents[1], startedAt: '2026-09-04T18:00:01.000Z', completedAt: '2026-09-04T18:00:09.000Z' };
  const cleanup = events.find(event => event.type === 'cleanup');
  const result = await runIdentityBatch(context({
    runLegacyIdentityAudit: async () => ({
      code: 0,
      stdout: [...caseEvents, cleanup].map(eventLine).join('\n'),
      stderr: '',
      startedAt: now,
      completedAt: '2026-09-04T18:02:00.000Z',
    }),
  }), [selected]);
  assert.equal(result.results[0].startedAt, '2026-09-04T18:00:01.000Z');
  assert.equal(result.results[0].completedAt, '2026-09-04T18:00:09.000Z');
});
