import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { generateIntelligentTournamentSchedule } from '../src/lib/intelligent-scheduler.ts';

test('tournament generation preserves zero turnaround and still defaults missing legacy values', async () => {
  const source = await readFile(new URL('../src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx', import.meta.url), 'utf8');
  const generation = source.slice(source.indexOf('const handleGenerateSchedule = async'));
  const expression = generation.match(/breakLength:\s*([^,\n]+)/)?.[1];
  assert.ok(expression, 'the actual generation config must supply turnaround');
  const turnaround = new Function('event', `return ${expression};`);
  assert.equal(turnaround({ breakLength: 0 }), 0);
  assert.equal(turnaround({ breakLength: 15 }), 15);
  assert.equal(turnaround({}), 15);
  const { games, report } = generateIntelligentTournamentSchedule({
    teams: ['Alpha', 'Bravo', 'Charlie', 'Delta'].map((name, i) => ({ id: `qa-${i}`, name })),
    fields: [{ id: 'qa-field-1', name: 'Field 1' }, { id: 'qa-field-2', name: 'Field 2' }],
    startDate: '2026-10-10', endDate: '2026-10-10', startTime: '08:00', endTime: '09:30',
    dailyWindows: [{ date: '2026-10-10', startTime: '08:00', endTime: '09:30' }],
    gameLength: 30, breakLength: turnaround({ breakLength: 0 }), gamesPerTeam: 3,
    maxDailyGamesPerTeam: 4, tournamentType: 'tiered_playoffs',
  });
  assert.equal(report.isValid, true, report.conflicts.join('; '));
  assert.equal(games.length, 6);
  assert.deepEqual([...new Set(games.map(game => game.time))].sort(), ['8:00 AM', '8:30 AM', '9:00 AM']);
});

test('Tournament architect creates Tiered Playoffs as a divisionless draft', async () => {
  const source = await readFile(new URL('../src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx', import.meta.url), 'utf8');
  assert.match(source, /SelectItem value="tiered_playoffs"/);
  assert.match(source, /Tiered Playoffs/);
  assert.match(source, /buildTieredPlayoffsDraftConfig/);
  assert.match(source, /Create Tournament Draft/);
  assert.match(source, /tieredPlayoffs:/);
});

test('Tournament operations expose the phased playoff transition and existing protected controls', async () => {
  const source = await readFile(new URL('../src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx', import.meta.url), 'utf8');
  assert.match(source, /tieredOrganizerState/);
  assert.match(source, /Preliminary results:/);
  assert.match(source, /Preliminary Round Complete/);
  assert.match(source, /Schedule Playoffs/);
  assert.match(source, /TieredPlayoffSetupDialog/);
  for (const action of ['preview-seeding', 'lock-seeding', 'generate-brackets', 'publish-playoffs']) assert.match(source, new RegExp(action));
});

test('playoff setup dialog submits only the configure-divisions payload fields', async () => {
  const source = await readFile(new URL('../src/components/tournaments/TieredPlayoffSetupDialog.tsx', import.meta.url), 'utf8');
  assert.match(source, /Configure Playoff Divisions/);
  assert.match(source, /divisionNames/);
  assert.match(source, /divisionSizes/);
  assert.match(source, /avoidPreliminaryRematches/);
  assert.doesNotMatch(source, /tournamentTeamsData|selectedFields|dailyWindows/);
});

test('Tournament Architect uses a light high-contrast dialog shell', async () => {
  const source = await readFile(new URL('../src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx', import.meta.url), 'utf8');
  assert.match(source, /data-testid="tournament-system-architect"/);
  assert.match(source, /bg-white text-black/);
});

test('public Tournament schedule renders date-only values in the viewer local calendar day', async () => {
  const source = await readFile(new URL('../src/app/tournaments/public/[teamId]/[eventId]/page.tsx', import.meta.url), 'utf8');
  const bracket = await readFile(new URL('../src/components/TournamentBracket.tsx', import.meta.url), 'utf8');
  assert.match(source, /parseISO\(String\(date\)\.split\('T'\)\[0\]\)/);
  assert.doesNotMatch(source, /format\(new Date\(date\), 'EEEE, MMM d'\)/);
  assert.match(bracket, /tournamentDisplayDate\(game\.date\)/);
  assert.doesNotMatch(bracket, /new Date\(game\.date\)/);
});

test('Tournament architect constrains Radix scroll content to the mobile viewport', async () => {
  const source = await readFile(new URL('../src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx', import.meta.url), 'utf8');
  assert.match(source, /\[&_\[data-radix-scroll-area-viewport\]>div\]:!block/);
  assert.match(source, /\[&_\[data-radix-scroll-area-viewport\]>div\]:!w-full/);
  assert.match(source, /\[&_\[data-radix-scroll-area-viewport\]>div\]:!min-w-0/);
  assert.match(source, /data-testid="daily-operational-windows"[^>]*className="min-w-0 bg-\[#0a0a0a\] p-5 sm:p-8/);
  assert.match(source, /data-testid="daily-window-row"[^>]*className="min-w-0 bg-white\/5 p-4[^\"]*sm:flex-row/);
  assert.match(source, /data-testid="daily-window-controls"[^>]*className="flex min-w-0 flex-wrap items-center gap-3/);
});
