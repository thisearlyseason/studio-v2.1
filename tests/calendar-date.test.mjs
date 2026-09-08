import assert from 'node:assert/strict';
import test from 'node:test';

import * as calendarDates from '../src/lib/calendar-event-date.ts';

const { calendarEventDate } = calendarDates;

test('calendar event date accepts canonical local calendar dates', () => {
  assert.equal(calendarEventDate('2026-10-15')?.getFullYear(), 2026);
  assert.equal(calendarEventDate('2026-10-15')?.getMonth(), 9);
  assert.equal(calendarEventDate('2026-10-15')?.getDate(), 15);
});

test('legacy ISO event instants retain the local day they represented', () => {
  const parsed = calendarEventDate('2026-09-08T01:00:00.000Z');
  assert.equal(parsed?.getFullYear(), 2026);
  assert.equal(parsed?.getMonth(), 8);
  assert.equal(parsed?.getDate(), 7);
});

test('calendar event date rejects malformed or impossible legacy values safely', () => {
  for (const value of ['', '2026-02-30', '2026/10/15', 'not-a-date', null, undefined]) {
    assert.equal(calendarEventDate(value), null, `expected ${String(value)} to be rejected`);
  }
});

test('calendar dates are compared and labelled as local dates without a UTC day shift', () => {
  assert.equal(typeof calendarDates.isCalendarDateOnOrAfter, 'function');
  assert.equal(typeof calendarDates.calendarDateLabel, 'function');

  const middayOnSeptember8 = new Date(2026, 8, 8, 12, 0, 0);
  assert.equal(calendarDates.isCalendarDateOnOrAfter('2026-09-07', middayOnSeptember8), false);
  assert.equal(calendarDates.isCalendarDateOnOrAfter('2026-09-08', middayOnSeptember8), true);
  assert.deepEqual(calendarDates.calendarDateLabel('2026-09-08'), { month: 'Sep', day: '08' });
});

test('dashboard upcoming events exclude past dates and activities that already started today', () => {
  assert.equal(typeof calendarDates.calendarEventIsUpcoming, 'function');
  const noonOnSeptember8 = new Date(2026, 8, 8, 12, 0, 0);

  assert.equal(calendarDates.calendarEventIsUpcoming({ date: '2026-09-07', startTime: '18:00' }, noonOnSeptember8), false);
  assert.equal(calendarDates.calendarEventIsUpcoming({ date: '2026-09-08', startTime: '10:00 AM' }, noonOnSeptember8), false);
  assert.equal(calendarDates.calendarEventIsUpcoming({ date: '2026-09-08', startTime: '6:00 PM' }, noonOnSeptember8), true);
  assert.equal(calendarDates.calendarEventIsUpcoming({ date: '2026-09-08', endDate: '2026-09-09', startTime: '08:00' }, noonOnSeptember8), true);
});
