import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../scripts/qa/seed-phase2-emulator-fixtures.mjs', import.meta.url), 'utf8');

test('Phase 2 fixture seeding is restricted to loopback demo projects', () => {
  assert.match(source, /PROJECT_ID\.startsWith\('demo-'\)/);
  assert.match(source, /FIREBASE_AUTH_EMULATOR_HOST must be loopback/);
  assert.match(source, /FIRESTORE_EMULATOR_HOST must be loopback/);
});

test('Phase 2 fixture credentials are runtime-only', () => {
  assert.match(source, /process\.env\.AUDIT_FIXTURE_PASSWORD/);
  assert.doesNotMatch(source, /const PASSWORD = ['"][^'"]+['"]/);
  assert.doesNotMatch(source, /console\.log\([^\n]*PASSWORD/);
});

test('Phase 2 fixtures include trusted and fake superadmin plus cross-tenant markers', () => {
  assert.match(source, /qa-superadmin.*claims: \{ role: 'superadmin' \}/);
  assert.match(source, /qa-fake-superadmin.*role: 'superadmin'.*verified: true \}/);
  assert.match(source, /FALCON-A/);
  assert.match(source, /BLUEBIRD-B/);
  assert.match(source, /qa-removed-member.*status: 'removed'/s);
});

test('Phase 2 fixtures include one paid squad for premium workflow coverage and one free control', () => {
  assert.match(source, /const isPaidFixture = teamId === 'qa-team-a'/);
  assert.match(source, /isPro: isPaidFixture/);
  assert.match(source, /planId: isPaidFixture \? 'team' : 'free'/);
});

test('Phase 2 fixture teams suppress outbound notification providers during local browser workflows', () => {
  assert.match(source, /isDemo:\s*true/);
});
