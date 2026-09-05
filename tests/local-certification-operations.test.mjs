import assert from 'node:assert/strict';
import test from 'node:test';

import { OPERATIONS_SCENARIO_IDS } from '../scripts/qa/certification/local/selection.mjs';
import { assertOperationsHandlerExactness, handlers } from '../scripts/qa/certification/local/batches/operations.mjs';

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
