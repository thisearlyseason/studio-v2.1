import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRecurringEventDates } from '../src/lib/team-event-recurrence.ts';

test('weekly recurrence preserves the submitted calendar date across a DST boundary', () => {
  assert.deepEqual(
    buildRecurringEventDates('2026-03-01', 'weekly', 3),
    ['2026-03-01', '2026-03-08', '2026-03-15'],
  );
});

test('recurrence rejects malformed dates, unsupported frequency, and unsafe series lengths', () => {
  assert.throws(() => buildRecurringEventDates('2026-02-30', 'weekly', 2), /valid calendar date/);
  assert.throws(() => buildRecurringEventDates('2026-03-01', 'hourly', 2), /Unsupported recurrence frequency/);
  assert.throws(() => buildRecurringEventDates('2026-03-01', 'weekly', 53), /between 2 and 52/);
});
