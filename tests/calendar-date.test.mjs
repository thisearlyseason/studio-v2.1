import assert from 'node:assert/strict';
import test from 'node:test';

import { calendarEventDate } from '../src/lib/calendar-event-date.ts';

test('calendar event date accepts canonical local calendar dates', () => {
  assert.equal(calendarEventDate('2026-10-15')?.getFullYear(), 2026);
  assert.equal(calendarEventDate('2026-10-15')?.getMonth(), 9);
  assert.equal(calendarEventDate('2026-10-15')?.getDate(), 15);
});

test('calendar event date rejects malformed or impossible legacy values safely', () => {
  for (const value of ['', '2026-02-30', '2026/10/15', 'not-a-date', null, undefined]) {
    assert.equal(calendarEventDate(value), null, `expected ${String(value)} to be rejected`);
  }
});
