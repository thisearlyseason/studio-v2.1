import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('reminders deep-link to the exact tenant event with encoded identifiers', async () => {
  const links = await import('../functions/src/reminder-deep-link.ts').catch(() => ({}));
  assert.equal(typeof links.buildReminderDeepLink, 'function');
  assert.equal(
    links.buildReminderDeepLink({ teamId: 'team/a', eventId: 'event?one' }),
    '/calendar?teamId=team%2Fa&eventId=event%3Fone',
  );
});

test('calendar consumes a reminder deep link only after the authorized event loads', async () => {
  const calendar = await readFile(new URL('../src/app/(dashboard)/calendar/page.tsx', import.meta.url), 'utf8');
  assert.match(calendar, /URLSearchParams\(window\.location\.search\)/);
  assert.match(calendar, /params\.get\(['"]eventId['"]\)/);
  assert.match(calendar, /params\.get\(['"]teamId['"]\)/);
  assert.match(calendar, /allEvents\.find\(/);
  assert.match(calendar, /setActiveDetailedEventId\(linkedEvent\.id\)/);
});

test('scheduled Web Push and legacy FCM use the exact reminder deep link', async () => {
  const source = await readFile(new URL('../functions/src/index.ts', import.meta.url), 'utf8');
  assert.match(source, /buildReminderDeepLink\(entry\)/);
  assert.match(source, /sendReminderWebPush\([^)]*reminderUrl/s);
  assert.match(source, /fcmOptions:\s*\{\s*link:\s*reminderUrl\s*\}/s);
});
