import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { CERTIFICATION_SCENARIOS } from '../scripts/qa/certification/scenario-catalog.mjs';
import { OPERATIONS_SCENARIO_IDS } from '../scripts/qa/certification/local/selection.mjs';
import {
  assertOperationsHandlerExactness,
  handlers,
  LOCAL_OPERATIONS_CASE_REQUIREMENTS,
  assertCaseOwnedOperationArtifacts,
  runOperationsBatch,
  selectCaseOwnedOperationAssertions,
} from '../scripts/qa/certification/local/batches/operations.mjs';

test('operations handler registry is an exact immutable match for the frozen Task 5 assignment', () => {
  assert.doesNotThrow(() => assertOperationsHandlerExactness(handlers));
  assert.deepEqual(Object.keys(handlers), OPERATIONS_SCENARIO_IDS);
  assert.ok(Object.isFrozen(handlers));
});

test('operations handler registry rejects missing, duplicate, and adjacent handlers before any lifecycle starts', () => {
  const missing = Object.fromEntries(Object.entries(handlers).slice(1));
  assert.throws(() => assertOperationsHandlerExactness(missing), /missing handler/);
  const extra = { ...handlers, 'sports-hub-rss-refresh-admin-publish': async () => undefined };
  assert.throws(() => assertOperationsHandlerExactness(extra), /unexpected handler/);
  assert.throws(() => assertOperationsHandlerExactness({ ...handlers, 'events-event-crud-recurrence': 'not-a-handler' }), /must be a function/);
});

test('every operations scenario has an explicit case contract for every local dimension', () => {
  const dimensions = ['happyPath', 'negativePath', 'permission', 'persistence', 'console', 'network', 'responsive'];
  assert.deepEqual(Object.keys(LOCAL_OPERATIONS_CASE_REQUIREMENTS), OPERATIONS_SCENARIO_IDS);
  for (const scenarioId of OPERATIONS_SCENARIO_IDS) {
    assert.deepEqual(Object.keys(LOCAL_OPERATIONS_CASE_REQUIREMENTS[scenarioId]), dimensions);
    for (const dimension of dimensions) {
      assert.ok(LOCAL_OPERATIONS_CASE_REQUIREMENTS[scenarioId][dimension].length >= 1);
    }
  }
});

test('all frozen Task 5 schedule case IDs are present exactly once across their scenario dimensions', () => {
  const expected = {
    'attendance-practice-event-member-attendance': ['att-staff-record', 'att-member-readonly', 'att-duplicate', 'att-race', 'att-removed', 'att-tenant-b', 'att-responsive'],
    'events-event-crud-recurrence': ['evt-crud', 'evt-series', 'evt-dst-spring', 'evt-dst-fall', 'evt-midnight', 'evt-invalid', 'evt-conflict', 'evt-double', 'evt-member-deny', 'evt-assistant-own', 'evt-team-b-deny', 'evt-responsive'],
    'events-rsvp-attendance-details': ['rsvp-self', 'rsvp-parent-child', 'rsvp-staff', 'rsvp-forged-uid', 'rsvp-replay', 'rsvp-race', 'rsvp-cancelled', 'rsvp-removed', 'rsvp-tenant-b', 'rsvp-responsive'],
    'calendar-team-family-views-and-filters': ['cal-team-a-b', 'cal-family-a-c', 'cal-filters', 'cal-empty', 'cal-invalid', 'cal-midnight', 'cal-dst-spring', 'cal-dst-fall', 'cal-rapid-switch', 'cal-outsider', 'cal-responsive'],
    'calendar-ics-create-fetch-revoke': ['ics-user', 'ics-team', 'ics-multi', 'ics-rfc', 'ics-invalid-type', 'ics-foreign-team', 'ics-too-many', 'ics-invalid-token', 'ics-inactive-token', 'ics-membership-revoke', 'ics-rotate', 'ics-secret'],
    'reminders-same-day-fcm-scheduler': ['rem-eligible', 'rem-time-boundary', 'rem-duplicate-run', 'rem-invalid-time', 'rem-no-token', 'rem-pref-off', 'rem-removed', 'rem-sender', 'rem-retry', 'rem-redaction'],
  };
  for (const [scenarioId, caseIds] of Object.entries(expected)) {
    const actual = Object.values(LOCAL_OPERATIONS_CASE_REQUIREMENTS[scenarioId]).flat();
    for (const caseId of caseIds) assert.equal(actual.filter(value => value === caseId).length, 1, `${scenarioId}/${caseId}`);
  }
});

test('operations evidence assigns an assertion to only its declared exact case', () => {
  const assertions = [
    { label: 'owner event create persists after reload' },
    { label: 'member cannot edit team event' },
    { label: 'owner event create console errors' },
    { label: 'weekly recurrence controls fit the mobile viewport' },
  ];
  const selected = selectCaseOwnedOperationAssertions(assertions, [/owner event create persists after reload/]);
  assert.deepEqual(selected, [assertions[0]]);
  assert.deepEqual(
    selectCaseOwnedOperationAssertions(assertions, [/weekly recurrence controls fit the mobile viewport/]),
    [assertions[3]],
  );
  assert.throws(
    () => selectCaseOwnedOperationAssertions(assertions, [/missing schedule assertion/]),
    /Missing required operation assertion/,
  );
});

test('operations evidence rejects reused assertion IDs and incomplete named-case records', () => {
  const complete = (caseId, assertionId) => ({
    caseId,
    assertions: [{ id: assertionId, label: `${caseId} exact assertion` }],
    execution: {
      actor: 'qa-coach-owner-a',
      operation: 'POST /api/test',
      requests: [{ method: 'POST', pathname: '/api/test', status: 200, actorAlias: 'qa-coach-owner-a' }],
      reconciliation: 'exact emulator record',
      observer: 'authenticated API response and emulator read',
      timeBound: '20s request deadline',
      cleanupReference: `cleanup-${caseId}`,
    },
  });
  assert.doesNotThrow(() => assertCaseOwnedOperationArtifacts([
    complete('one', 'assertion-one'),
    complete('two', 'assertion-two'),
  ]));
  assert.throws(() => assertCaseOwnedOperationArtifacts([
    complete('one', 'shared-assertion'),
    complete('two', 'shared-assertion'),
  ]), /shared assertion ID/i);
  const missingRequest = complete('three', 'assertion-three');
  delete missingRequest.execution.requests;
  assert.throws(() => assertCaseOwnedOperationArtifacts([missingRequest]), /requests/i);
});

test('operations evidence rejects synthesized request records and requires the exact fixture actor', () => {
  const complete = request => ({
    caseId: 'synthetic-request',
    assertions: [{ id: 'synthetic-request-assertion', label: 'exact assertion' }],
    execution: {
      actor: 'qa-coach-owner-a',
      operation: 'observed browser action',
      requests: [request],
      reconciliation: 'exact emulator record',
      observer: 'authenticated API response and emulator read',
      timeBound: '20s request deadline',
      cleanupReference: 'cleanup-synthetic-request',
    },
  });

  for (const synthetic of [
    { method: 'BROWSER', pathname: '/calendar', status: 200, actorAlias: 'qa-coach-owner-a' },
    { method: 'POST', pathname: 'POST RSVP', status: 200, actorAlias: 'qa-coach-owner-a' },
    { method: 'POST', pathname: '/api/rsvp', status: 'observed', actorAlias: 'qa-coach-owner-a' },
    { method: 'POST', pathname: '/api/rsvp', status: 200, actorAlias: 'catalog-scenario-actor' },
  ]) {
    assert.throws(
      () => assertCaseOwnedOperationArtifacts([complete(synthetic)]),
      /actual same-origin HTTP request evidence|exact actor alias/i,
    );
  }

  assert.throws(
    () => assertCaseOwnedOperationArtifacts([complete({
      method: 'POST', pathname: '/api/rsvp', status: 200, actorAlias: 'qa-team-member',
    })]),
    /does not match the case actor/i,
  );
});

test('ICS rotation audit issues and rotates the same owner-scoped feed token', () => {
  const audit = readFileSync(new URL('../scripts/qa/run-phase2-emulator-audit.mjs', import.meta.url), 'utf8');
  assert.match(audit, /const ownerRotationToken = await issue\(\{ caseId: 'ics-rotate', actorAlias: 'qa-coach-owner-a', token: ownerToken,/);
  assert.match(audit, /token: ownerRotationToken \}\);/);
});

test('fully observed operation dimensions describe completion instead of missing cases', async () => {
  const scenario = CERTIFICATION_SCENARIOS.find(item => item.id === 'reminders-same-day-fcm-scheduler');
  const events = Object.entries(LOCAL_OPERATIONS_CASE_REQUIREMENTS[scenario.id]).flatMap(([dimension, caseIds]) =>
    caseIds.map(caseId => ({
      type: 'case', scenarioId: scenario.id, caseId, dimension, state: 'OBSERVED',
      startedAt: '2026-09-06T04:00:00.000Z', completedAt: '2026-09-06T04:00:01.000Z', artifacts: [],
    }))
  );
  const output = await runOperationsBatch({
    commit: '0123456789abcdef0123456789abcdef01234567',
    browserEnabled: true,
    now: () => '2026-09-06T04:00:02.000Z',
    certificationObservation: {
      code: 0,
      startedAt: '2026-09-06T04:00:00.000Z', completedAt: '2026-09-06T04:00:02.000Z',
      stdout: events.map(event => `CERTIFICATION_EVENT ${JSON.stringify(event)}`).join('\n'),
    },
    operations: { execute: ({ handler, ...input }) => handler(input) },
  }, [scenario]);
  assert.equal(output.runErrors.length, 0);
  for (const dimension of Object.values(output.results[0].dimensions)) {
    assert.equal(dimension.state, 'OBSERVED');
    assert.equal(dimension.note, 'All exact operational cases observed locally.');
  }
});

test('operations preserves selected-row runtime errors and a failed child exit despite NOT_OBSERVED cases', async () => {
  const scenario = CERTIFICATION_SCENARIOS.find(item => item.id === 'events-event-crud-recurrence');
  const output = await runOperationsBatch({
    now: () => '2026-09-06T04:00:00.000Z',
    certificationObservation: { code: 1, stderr: 'private diagnostic', stdout: 'CERTIFICATION_EVENT ' + JSON.stringify({
      type: 'scenario-error', scenarioId: scenario.id, stage: 'operations-runtime', diagnostic: 'Event member visibility timeout',
    }) },
    redact: value => value.replace('private diagnostic', 'sanitized child diagnostic'),
    operations: { execute: async () => ({ scenarioId: scenario.id, outcome: 'BLOCKED_PRECONDITION' }) },
  }, [scenario]);
  assert.ok(output.runErrors.some(error => error.scenarioId === scenario.id && error.diagnostic === 'Event member visibility timeout'));
  assert.ok(output.runErrors.some(error => error.stage === 'operations-child' && error.diagnostic === 'sanitized child diagnostic'));
});

for (const observation of [undefined, { code: 1 }, { code: null, signal: 'SIGTERM' }, { code: 0, signal: 'SIGTERM' }]) {
  test(`operations rejects missing/unsuccessful child evidence (${JSON.stringify(observation)})`, async () => {
    const result = await runOperationsBatch({
      now: () => '2026-09-06T04:00:00.000Z', certificationObservation: observation,
      operations: { execute: async () => ({ outcome: 'BLOCKED_PRECONDITION' }) },
    }, [CERTIFICATION_SCENARIOS.find(item => item.id === 'events-event-crud-recurrence')]);
    assert.equal(result.runErrors[0]?.stage, 'operations-child');
    assert.ok(result.runErrors[0]?.diagnostic);
  });
}
