import assert from 'node:assert/strict';
import test from 'node:test';

import { eventActionNeedsGeneratedId } from '../src/lib/team-event-action.ts';

test('series creation allocates event document IDs instead of constructing an empty document reference', () => {
  assert.equal(eventActionNeedsGeneratedId('create'), true);
  assert.equal(eventActionNeedsGeneratedId('create-series'), true);
  assert.equal(eventActionNeedsGeneratedId('update-series'), false);
});
