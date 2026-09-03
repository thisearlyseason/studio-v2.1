import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../scripts/qa/run-phase2-emulator-audit.mjs', import.meta.url), 'utf8');

test('emulator audit creates runtime-only credentials and redacts failures', () => {
  assert.match(source, /randomBytes\(24\)/);
  assert.match(source, /replaceAll\(password, '\[redacted\]'\)/);
  assert.doesNotMatch(source, /AUDIT_FIXTURE_PASSWORD:\s*['"][^'"]+['"]/);
});

test('emulator audit covers tenant, lifecycle, and trusted-claim boundaries', () => {
  assert.match(source, /Team A owner denied Team B chat context/);
  assert.match(source, /Team B owner denied Team A chat context/);
  assert.match(source, /removed member denied former team context/);
  assert.match(source, /deletion-pending account denied server API/);
  assert.match(source, /profile-only fake superadmin denied admin API/);
  assert.match(source, /fake superadmin browser route denial/);
});
