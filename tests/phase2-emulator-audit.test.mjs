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

test('emulator audit drives every seeded active persona and session boundary in a browser', () => {
  assert.match(source, /browserLogin\('qa-team-assistant'/);
  assert.match(source, /browserLogin\('qa-team-member'/);
  assert.match(source, /browserLogin\('qa-youth-active'/);
  assert.match(source, /owner billing browser route/);
  assert.match(source, /assistant staff route/);
  assert.match(source, /member staff route denial/);
  assert.match(source, /parent finance browser route/);
  assert.match(source, /player finance browser route denial/);
  assert.match(source, /protected deep link resumes after login/);
  assert.match(source, /logout revokes the browser session/);
  assert.match(source, /second tab observes logout/);
  assert.match(source, /wrong-password login uses generic failure copy/);
  assert.match(source, /disabled login uses generic failure copy/);
  assert.match(source, /unverified login reaches verification gate/);
  assert.match(source, /deletion-pending login is denied/);
});

test('emulator audit sweeps remaining role surfaces for rendering and route-policy failures', () => {
  assert.match(source, /surface-smoke-only/);
  assert.match(source, /owner remaining surface sweep/);
  assert.match(source, /assistant remaining surface sweep/);
  assert.match(source, /member remaining surface sweep/);
  assert.match(source, /parent remaining surface sweep/);
  assert.match(source, /trusted admin remaining surface sweep/);
  assert.match(source, /applicationError/);
  assert.match(source, /failedResponses/);
  assert.match(source, /mobileFits/);
});

test('emulator audit exercises remaining communication CRUD and cross-role persistence', () => {
  assert.match(source, /workflow-communication-only/);
  assert.match(source, /feed rejects incomplete poll/);
  assert.match(source, /owner feed post persists after reload/);
  assert.match(source, /member sees owner feed post/);
  assert.match(source, /member comment persists for owner/);
  assert.match(source, /owner poll persists after reload/);
  assert.match(source, /member poll vote persists after reload/);
  assert.match(source, /member chat message persists for owner/);
  assert.match(source, /Team B chat content is absent from Team A UI/);
});

test('emulator audit exercises event CRUD, RSVP persistence, and staff-only controls', () => {
  assert.match(source, /workflow-events-only/);
  assert.match(source, /event rejects incomplete activity/);
  assert.match(source, /owner event create persists after reload/);
  assert.match(source, /member sees owner event/);
  assert.match(source, /member cannot edit team event/);
  assert.match(source, /member RSVP persists after reload/);
  assert.match(source, /owner event edit persists after reload/);
  assert.match(source, /owner event delete persists after reload/);
});

test('emulator audit exercises facility and resource CRUD with destructive confirmation', () => {
  assert.match(source, /workflow-facilities-only/);
  assert.match(source, /facility requires name and address/);
  assert.match(source, /facility create persists after reload/);
  assert.match(source, /facility edit persists after reload/);
  assert.match(source, /resource rename persists after reload/);
  assert.match(source, /resource delete cancel preserves record/);
  assert.match(source, /resource delete persists after reload/);
  assert.match(source, /facility delete persists after reload/);
});

test('emulator audit exercises equipment stock, assignment, return, search, and guarded deletion', () => {
  assert.match(source, /workflow-equipment-only/);
  assert.match(source, /equipment create persists after reload/);
  assert.match(source, /equipment search filters inventory/);
  assert.match(source, /equipment edit persists after reload/);
  assert.match(source, /equipment rejects over-assignment/);
  assert.match(source, /equipment assignment persists after reload/);
  assert.match(source, /assigned equipment deletion is blocked/);
  assert.match(source, /equipment return restores availability/);
  assert.match(source, /equipment delete persists after reload/);
});
