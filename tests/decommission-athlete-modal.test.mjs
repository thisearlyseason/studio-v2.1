import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('decommission athlete modal is centered with symmetric mobile-safe spacing', () => {
  const roster = fs.readFileSync(new URL('../src/app/(dashboard)/roster/page.tsx', import.meta.url), 'utf8');
  const start = roster.indexOf('>Remove Athlete</DialogTitle>');
  const modal = roster.slice(Math.max(0, start - 900), start + 3_500);
  assert.match(modal, /left-\[50%\] top-\[50%\] -translate-x-1\/2 -translate-y-1\/2/);
  assert.match(modal, /h-auto/);
  assert.match(modal, /w-\[calc\(100vw-1rem\)\]/);
  assert.match(modal, /max-h-\[calc\(100dvh-1rem\)\]/);
  assert.match(modal, /p-0/);
  assert.match(modal, /px-5[^"\n]*sm:px-8/);
});
