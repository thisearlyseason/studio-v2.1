import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildFixtureCatalog } from '../scripts/qa/certification/fixture-catalog.mjs';

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
  const catalog = buildFixtureCatalog('phase2');
  const trusted = catalog.identities.find(identity => identity.alias === 'qa-superadmin');
  const fake = catalog.identities.find(identity => identity.alias === 'qa-fake-superadmin');
  const removed = catalog.fixtures.roster.find(fixture => fixture.alias === 'qa-team-a-qa-removed-member-member');

  assert.deepEqual(trusted.claims, { role: 'superadmin' });
  assert.equal(fake.role, 'superadmin');
  assert.equal(fake.verified, true);
  assert.equal(fake.claims, null);
  assert.ok(catalog.teams.some(team => team.visibleMarker === 'FALCON-A'));
  assert.ok(catalog.teams.some(team => team.visibleMarker === 'BLUEBIRD-B'));
  assert.equal(removed.data.status, 'removed');
});

test('Phase 2 fixtures include one paid squad for premium workflow coverage and one free control', () => {
  const catalog = buildFixtureCatalog('phase2');
  const paid = catalog.teams.find(team => team.alias === 'qa-pro-team');
  const free = catalog.teams.find(team => team.alias === 'qa-team-b');
  const paidOwner = catalog.firestoreDocuments.find(document => document.data.fixtureAlias === 'qa-pro-owner');

  assert.equal(paid.isPro, true);
  assert.equal(paid.planId, 'team');
  assert.equal(paidOwner.data.subscription_status, 'trialing');
  assert.equal(free.isPro, false);
  assert.equal(free.planId, 'free');
});

test('Phase 2 fixture teams suppress outbound notification providers during local browser workflows', () => {
  const catalog = buildFixtureCatalog('phase2');
  const profiles = catalog.firestoreDocuments.filter(document => /^users\/[^/]+$/.test(document.path));

  assert.ok(catalog.teams.every(team => team.outboundProvidersEnabled === false));
  assert.ok(profiles.every(profile => profile.data.notificationsEnabled === false));
  assert.ok(profiles.every(profile => profile.data.fcmTokens.length === 0));
  assert.ok(profiles.every(profile => profile.data.webPushSubscriptions.length === 0));
});

test('baseline cleanup attempts every exact selector and every provider stage with bounded verification retries', () => {
  assert.match(source, /async function cleanupExactResources/);
  assert.match(source, /for \(const resource of pending\)/);
  assert.match(source, /mutatedUnits\.set\(resource\.id, Math\.max/);
  assert.match(source, /Promise\.allSettled\(\[/);
  assert.match(source, /cleanupFirestore\(db\)/);
  assert.match(source, /cleanupAuth\(auth\)/);
  assert.match(source, /cleanupStorage\(bucket\)/);
});
