import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/app/(dashboard)/calendar/page.tsx', import.meta.url), 'utf8');

test('Calendar exposes semantic day, week, month, type, and household-athlete filter controls', () => {
  assert.match(source, />Day<\/span>/);
  assert.match(source, />Week<\/span>/);
  assert.match(source, />Month<\/span>/);
  assert.match(source, /Event Types/);
  assert.match(source, /Household Athletes/);
  assert.match(source, /selectedChildIds/);
  assert.match(source, /childTeamIds/);
});

test('Calendar gives Agenda users a visible empty-filter result', () => {
  assert.match(source, /No scheduled events match these filters/);
});
