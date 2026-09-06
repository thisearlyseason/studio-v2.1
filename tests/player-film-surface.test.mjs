import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../src/app/(dashboard)/roster/page.tsx', import.meta.url), 'utf8');
const coachesCornerSource = readFileSync(new URL('../src/app/(dashboard)/coaches-corner/page.tsx', import.meta.url), 'utf8');
const fixtureSource = readFileSync(new URL('../scripts/qa/certification/fixture-catalog.mjs', import.meta.url), 'utf8');

test('authorized player profile exposes film playback and self-keyed watch progress', () => {
  assert.match(source, /data-player-highlight-reel/);
  assert.match(source, /data-player-film-video/);
  assert.match(source, /watchProgress['"`],\s*user\.id/);
  assert.match(source, /userId:\s*user\.id/);
  assert.match(source, /isPlayer\s*&&\s*selectedMember\.userId\s*===\s*user\?\.id/);
});

test('adult player certification membership is linked to its player document', () => {
  assert.match(fixtureSource, /userAlias === 'qa-adult-player-a'[\s\S]{0,160}playerIdFor\('qa-player-adult-a'\)/);
});

test('legacy film without a type renders with a safe highlight label', () => {
  assert.match(coachesCornerSource, /\(v\.type\s*\|\|\s*['"]Highlight['"]\)\.toUpperCase\(\)/);
});
