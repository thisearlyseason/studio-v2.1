import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCalendarFeed } from '../functions/src/calendar-feed.ts';

const teams = {
  squad_a: { name: 'North, Stars', timeZone: 'America/Edmonton' },
  squad_b: { name: 'East Club', timeZone: 'America/Toronto' },
};

test('calendar feed preserves squad-local wall times and overnight rollover', () => {
  const feed = buildCalendarFeed([{
    id: 'event_1',
    teamId: 'squad_a',
    title: 'Late Match',
    date: '2026-08-08',
    startTime: '11:30 PM',
    endTime: '12:30 AM',
  }], teams, 'North Stars', new Date('2026-08-01T12:00:00Z'));

  assert.match(feed, /DTSTART;TZID=America\/Edmonton:20260808T233000/);
  assert.match(feed, /DTEND;TZID=America\/Edmonton:20260809T003000/);
  assert.doesNotMatch(feed, /DTSTART:.*Z/);
});

test('calendar feed escapes text and scopes stable event IDs by squad', () => {
  const feed = buildCalendarFeed([{
    id: 'shared',
    teamId: 'squad_a',
    title: 'Match, review; notes\r\nINJECTED:VALUE',
    date: '2026-08-08',
    startTime: '18:00',
    location: 'Field \\ One',
  }, {
    id: 'shared',
    teamId: 'squad_b',
    title: 'Second Match',
    date: '2026-08-09',
    startTime: '18:00',
  }], teams, 'Family, Schedule', new Date('2026-08-01T12:00:00Z'));

  assert.match(feed, /X-WR-CALNAME:Family\\, Schedule/);
  assert.match(feed, /UID:squad_a-shared@thesquad\.pro/);
  assert.match(feed, /UID:squad_b-shared@thesquad\.pro/);
  assert.match(feed, /SUMMARY:\[North\\, Stars\] Match\\, review\\; notes\\nINJECTED:VALUE/);
  assert.match(feed, /LOCATION:Field \\\\ One/);
  assert.doesNotMatch(feed, /\r\nINJECTED:VALUE\r\n/);
});

test('calendar feed skips malformed dates and falls back to the default timezone', () => {
  const feed = buildCalendarFeed([{
    id: 'bad-date',
    teamId: 'squad_a',
    title: 'Invalid',
    date: 'not-a-date',
    startTime: '10:00',
  }, {
    id: 'valid',
    teamId: 'unknown',
    title: 'Valid',
    date: '2026-08-08',
    startTime: '10:00',
    timeZone: 'not/a-zone',
  }], teams, 'Schedule', new Date('2026-08-01T12:00:00Z'));

  assert.doesNotMatch(feed, /bad-date/);
  assert.match(feed, /UID:unknown-valid@thesquad\.pro/);
  assert.match(feed, /DTSTART;TZID=America\/Edmonton:20260808T100000/);
});
