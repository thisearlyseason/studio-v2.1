import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRecurringEventDates, shiftCalendarDate } from '../src/lib/team-event-recurrence.ts';

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

test('recurrence shifts a supplied end date by a calendar offset without crossing DST in UTC', () => {
  assert.equal(shiftCalendarDate('2026-03-08', 7), '2026-03-15');
  assert.equal(shiftCalendarDate('2026-10-25', 7), '2026-11-01');
  assert.throws(() => shiftCalendarDate('2026-02-30', 7), /valid calendar date/);
});

test('repeat schedules keep the original calendar anchor and only include chosen days', () => {
  assert.deepEqual(buildRecurringEventDates('2028-01-31', 'monthly', 3), ['2028-01-31','2028-02-29','2028-03-31']);
  assert.deepEqual(buildRecurringEventDates('2026-12-31', 'bimonthly', 3), ['2026-12-31','2027-02-28','2027-04-30']);
  assert.deepEqual(buildRecurringEventDates('2026-03-01', 'biweekly', 2), ['2026-03-01','2026-03-15']);
  assert.deepEqual(buildRecurringEventDates('2026-03-01', 'weekdays', 3, { weekdays: [1,3] }), ['2026-03-02','2026-03-04','2026-03-09']);
  assert.deepEqual(buildRecurringEventDates('2026-03-01', 'dates', 3, { dates: ['2026-05-01','2026-03-09'] }), ['2026-03-01','2026-03-09','2026-05-01']);
  assert.throws(() => buildRecurringEventDates('2026-03-01', 'weekdays', 2, { weekdays: [] }), /weekday/);
  assert.throws(() => buildRecurringEventDates('2026-03-01', 'dates', 2, { dates: ['2026-02-28'] }), /follow/);
});
