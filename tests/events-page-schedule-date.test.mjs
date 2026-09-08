import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { eventMutationFailureMessage } from '../src/lib/event-mutation-feedback.ts';

const source = readFileSync(new URL('../src/app/(dashboard)/events/page.tsx', import.meta.url), 'utf8');

test('event creation preserves the date selected in the calendar instead of converting it through UTC', () => {
  const createHandler = source.slice(source.indexOf('const handleCreateEvent = async () =>'), source.indexOf('const resetForm = () =>'));
  assert.match(createHandler, /date: newDate,/);
  assert.match(createHandler, /endDate: newEndDate \|\| newDate,/);
  assert.doesNotMatch(createHandler, /new Date\(`\$\{newDate\}T\$\{newTime/);
});

test('event creation shows the server schedule-conflict reason', () => {
  assert.equal(
    eventMutationFailureMessage(new Error('This squad already has an event during the selected time.')),
    'This squad already has an event during the selected time.',
  );
  assert.equal(eventMutationFailureMessage('unknown'), 'Unable to save this activity. Please try again.');
  assert.match(source, /title: "Activity Not Scheduled"/);
  assert.match(source, /description: eventMutationFailureMessage\(e\)/);
});

test('launch activity keeps mobile actions visible and defers two-column layout to wide screens', () => {
  assert.match(source, /data-testid="launch-activity-form"/);
  assert.match(source, /flex flex-col xl:flex-row/);
  assert.match(source, /data-testid="launch-activity-scroll-region"/);
  assert.match(source, /data-testid="launch-activity-actions"/);
});
