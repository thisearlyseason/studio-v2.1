import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeTeamEventInterval, teamEventIntervalsOverlap } from '../src/lib/team-event-interval.ts';

test('cross-midnight team events retain their real duration instead of dropping the booking interval', () => {
  assert.deepEqual(normalizeTeamEventInterval({
    date: '2026-09-20', startTime: '23:30', endTime: '00:30',
  }), {
    date: '2026-09-20', startMinute: 1410, endMinute: 1470,
  });
});

test('team event intervals reject malformed calendar input and durations beyond one day', () => {
  assert.equal(normalizeTeamEventInterval({ date: 'not-a-date', startTime: '18:00' }), null);
  assert.equal(normalizeTeamEventInterval({ date: '2026-09-20', startTime: '18:00', durationMinutes: 1441 }), null);
});

test('cross-day conflicts compare absolute calendar minutes instead of matching only start dates', () => {
  const overnight = normalizeTeamEventInterval({ date: '2026-09-20', startTime: '23:30', endTime: '00:30' });
  const nextDayOverlap = normalizeTeamEventInterval({ date: '2026-09-21', startTime: '00:15', durationMinutes: 30 });
  const nextDaySeparate = normalizeTeamEventInterval({ date: '2026-09-21', startTime: '00:30', durationMinutes: 30 });
  assert.equal(teamEventIntervalsOverlap(overnight, nextDayOverlap), true);
  assert.equal(teamEventIntervalsOverlap(overnight, nextDaySeparate), false);
});
