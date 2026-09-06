import assert from 'node:assert/strict';
import test from 'node:test';

import { OPERATIONS_SCENARIO_IDS } from '../scripts/qa/certification/local/selection.mjs';
import {
  assertOperationsHandlerExactness,
  handlers,
  LOCAL_OPERATIONS_CASE_REQUIREMENTS,
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
      assert.equal(LOCAL_OPERATIONS_CASE_REQUIREMENTS[scenarioId][dimension].length, 1);
    }
  }
});

test('operations evidence assigns an assertion to only its declared exact case', () => {
  const assertions = [
    { label: 'owner event create persists after reload' },
    { label: 'member cannot edit team event' },
    { label: 'owner event create console errors' },
  ];
  const selected = selectCaseOwnedOperationAssertions(assertions, [/owner event create persists after reload/]);
  assert.deepEqual(selected, [assertions[0]]);
  assert.throws(
    () => selectCaseOwnedOperationAssertions(assertions, [/missing schedule assertion/]),
    /Missing required operation assertion/,
  );
});
