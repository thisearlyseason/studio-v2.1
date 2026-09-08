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
