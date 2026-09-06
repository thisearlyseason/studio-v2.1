import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../src/app/(dashboard)/calendar/page.tsx', import.meta.url), 'utf8');
const fixtureSource = await readFile(new URL('../scripts/qa/certification/fixture-catalog.mjs', import.meta.url), 'utf8');

test('Calendar exposes semantic day, week, month, type, and household-athlete filter controls', () => {
  assert.match(source, />Day<\/span>/);
  assert.match(source, />Week<\/span>/);
  assert.match(source, />Month<\/span>/);
  assert.match(source, /Event Types/);
  assert.match(source, /Household Athletes/);
  assert.match(source, /selectedChildIds/);
  assert.match(source, /childTeamIds/);
  assert.match(source, /data-calendar-team-id/);
  assert.match(source, /data-calendar-child-id/);
  assert.match(source, /data-calendar-event-team-id/);
});

test('Calendar gives Agenda users a visible empty-filter result', () => {
  assert.match(source, /No scheduled events match these filters/);
});

test('Calendar view-mode buttons retain accessible names when their labels are visually hidden on mobile', () => {
  for (const label of ['Month', 'Week', 'Day', 'Agenda']) {
    assert.match(source, new RegExp(`aria-label=\\"${label}\\"`));
  }
});

test('Calendar filter trigger retains an accessible name when its label is visually hidden on mobile', () => {
  assert.match(source, /PopoverTrigger asChild><Button aria-label="Filters"/);
});

test('Calendar defaults a parent to every authorized household team, not only the active squad', () => {
  assert.match(source, /if \(!isParent && activeTeam\?\.id && discoveryTeamIds\.includes\(activeTeam\.id\)\)/);
  assert.match(source, /setSelectedTeamIds\(discoveryTeamIds\)/);
});

test('Calendar fixture child filter labels include the fixture surname marker', () => {
  assert.match(fixtureSource, /'qa-player-youth-a'.*'Youth A', visibleMarker\('FALCON-A'\)/);
  assert.match(fixtureSource, /'qa-player-youth-c'.*'Youth C', visibleMarker\('GOLDEN-C'\)/);
});
