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
