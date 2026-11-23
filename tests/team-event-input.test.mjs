import assert from 'node:assert/strict';
import test from 'node:test';

import { validateTeamEventInput } from '../src/lib/team-event-input.ts';

test('event input rejects missing title, malformed time, and explicitly reversed same-day interval', () => {
  assert.throws(() => validateTeamEventInput({ date: '2026-09-20', startTime: '18:00' }), /title/i);
  assert.throws(() => validateTeamEventInput({ title: 'Practice', date: '2026-09-20', startTime: '99:00' }), /date and time/i);
  assert.throws(() => validateTeamEventInput({ title: 'Practice', date: '2026-09-20', endDate: '2026-09-20', startTime: '18:00', endTime: '17:00' }), /end time/i);
});

test('event input permits explicit overnight events and bounded event titles', () => {
  assert.doesNotThrow(() => validateTeamEventInput({ title: 'Late practice', date: '2026-09-20', endDate: '2026-09-21', startTime: '23:30', endTime: '00:30' }));
  assert.throws(() => validateTeamEventInput({ title: 'x'.repeat(201), date: '2026-09-20', startTime: '18:00' }), /title/i);
});

test('activities can span multiple days with a known or pending start time', () => {
  const event = { title: 'Training camp', date: '2026-12-29', endDate: '2027-01-03' };
  for (const startTime of [undefined, '', '14:30']) {
    assert.doesNotThrow(() => validateTeamEventInput({ ...event, startTime }));
    assert.throws(() => validateTeamEventInput({ ...event, startTime, endDate: '2026-12-28' }), /end date/);
  }
  assert.throws(() => validateTeamEventInput({ ...event, startTime: '', endTime: '10:15' }), /start time/);
});
