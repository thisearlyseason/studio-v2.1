import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Tournament architect exposes Tiered Playoffs and persists a complete additive configuration', async () => {
  const source = await readFile(new URL('../src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx', import.meta.url), 'utf8');
  assert.match(source, /SelectItem value="tiered_playoffs"/);
  assert.match(source, /Tiered Playoffs/);
  assert.match(source, /tieredDivisionNames/);
  assert.match(source, /tieredDivisionSizes/);
  assert.match(source, /buildTieredPlayoffsConfig/);
  assert.match(source, /tieredPlayoffs:/);
});

test('Tournament operations expose review, lock, generate, and publish Tiered controls', async () => {
  const source = await readFile(new URL('../src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx', import.meta.url), 'utf8');
  for (const action of ['preview-seeding', 'lock-seeding', 'generate-brackets', 'publish-playoffs']) assert.match(source, new RegExp(action));
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
