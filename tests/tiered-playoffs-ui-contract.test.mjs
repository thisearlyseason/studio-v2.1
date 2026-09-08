import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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
