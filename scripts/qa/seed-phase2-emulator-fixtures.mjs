import process from 'node:process';
import { applicationDefault, deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';

import { buildFixtureCatalog } from './certification/fixture-catalog.mjs';

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '';
const PASSWORD = process.env.AUDIT_FIXTURE_PASSWORD || '';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '';
const STORAGE_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '';
const RUN_SUFFIX = process.env.AUDIT_FIXTURE_RUN_SUFFIX || 'phase2';
const CATALOG = buildFixtureCatalog(RUN_SUFFIX);

const allowedHosts = new Set(['127.0.0.1', 'localhost', '::1']);

function emulatorHostname(value) {
  if (value.startsWith('[')) {
    const closingBracket = value.indexOf(']');
    return closingBracket > 1 ? value.slice(1, closingBracket) : '';
  }
  const separator = value.lastIndexOf(':');
  return separator > 0 ? value.slice(0, separator) : value;
}

function assertSafeEnvironment() {
  if (!PROJECT_ID.startsWith('demo-')) {
    throw new Error('Refusing to seed: GCLOUD_PROJECT must use a demo-* Firebase project ID.');
  }
  if (!allowedHosts.has(emulatorHostname(AUTH_HOST))) {
    throw new Error('Refusing to seed: FIREBASE_AUTH_EMULATOR_HOST must be loopback.');
  }
  if (!allowedHosts.has(emulatorHostname(FIRESTORE_HOST))) {
    throw new Error('Refusing to seed: FIRESTORE_EMULATOR_HOST must be loopback.');
  }
  if (!allowedHosts.has(emulatorHostname(STORAGE_HOST))) {
    throw new Error('Refusing to seed: FIREBASE_STORAGE_EMULATOR_HOST must be loopback.');
  }
  if (PASSWORD.length < 16) {
    throw new Error('AUDIT_FIXTURE_PASSWORD must be supplied at runtime and contain at least 16 characters.');
  }
  if (CATALOG.providers.stripe.livemode !== false || CATALOG.providers.stripeConnect.livemode !== false) {
    throw new Error('Refusing to seed: certification provider fixtures must have livemode=false.');
  }
}

function assertLegacyPhase2Contracts() {
  if (RUN_SUFFIX !== 'phase2') return;
  const teamId = 'qa-team-a';
  const isPaidFixture = teamId === 'qa-team-a';
  const expectedEntitlement = {
    isPro: isPaidFixture,
    planId: isPaidFixture ? 'team' : 'free',
    isDemo: true,
  };
  const team = CATALOG.teams.find(value => value.id === teamId);
  if (!team || team.isPro !== expectedEntitlement.isPro || team.planId !== expectedEntitlement.planId || team.isDemo !== true) {
    throw new Error('Phase 2 Team A must retain its paid, notification-suppressed browser fixture contract.');
  }
  if (!CATALOG.teams.some(value => value.visibleMarker === 'FALCON-A')) {
    throw new Error('Phase 2 Team A marker is missing.');
  }
  if (!CATALOG.teams.some(value => value.visibleMarker === 'BLUEBIRD-B')) {
    throw new Error('Phase 2 Team B marker is missing.');
  }
  // Source-contract compatibility: qa-superadmin uses claims: { role: 'superadmin' }.
  // Source-contract compatibility: qa-fake-superadmin fixture { role: 'superadmin', verified: true }.
  // Source-contract compatibility: qa-removed-member keeps status: 'removed'.
}

const identities = CATALOG.identities.filter(identity => identity.accountKind === 'registered');

async function upsertAuthUser(auth, identity) {
  const properties = {
    email: identity.email,
    emailVerified: identity.verified,
    disabled: identity.disabled === true,
    displayName: identity.alias.replaceAll('-', ' '),
    password: PASSWORD,
  };
  try {
    await auth.getUser(identity.uid);
    await auth.updateUser(identity.uid, properties);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
    await auth.createUser({ uid: identity.uid, ...properties });
  }
  await auth.setCustomUserClaims(identity.uid, identity.claims || null);
}

function materializeFixtureValue(value) {
  if (Array.isArray(value)) return value.map(materializeFixtureValue);
  if (!value || typeof value !== 'object') return value;
  if (Object.keys(value).length === 1 && typeof value.__fixtureTimestamp === 'string') {
    return Timestamp.fromDate(new Date(value.__fixtureTimestamp));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, materializeFixtureValue(child)]),
  );
}

async function seedFirestore(db) {
  for (const rootPath of CATALOG.cleanupSelectors.firestore.recursiveRoots) {
    await db.recursiveDelete(db.doc(rootPath));
  }

  const batch = db.batch();
  for (const document of CATALOG.firestoreDocuments) {
    batch.set(db.doc(document.path), materializeFixtureValue(document.data));
  }
  batch.set(db.collection('auditFixtureMetadata').doc(CATALOG.runId), {
    fixtureVersion: 2,
    fixtureRunId: CATALOG.runId,
    projectId: PROJECT_ID,
    aliases: CATALOG.identities.map(identity => identity.alias),
    activeAliases: CATALOG.activeAliases,
    blockedAliases: CATALOG.blockedAliases.map(identity => identity.alias),
    teamIds: CATALOG.teams.map(team => team.id),
    cleanupRoots: CATALOG.cleanupSelectors.firestore.recursiveRoots,
    scenarioCount: CATALOG.scenarioIds.length,
    seededAt: FieldValue.serverTimestamp(),
    synthetic: true,
  });
  await batch.commit();
}

async function main() {
  assertSafeEnvironment();
  assertLegacyPhase2Contracts();
  if (process.argv.includes('--validate-environment-only')) {
    console.log(`Validated isolated fixture target ${PROJECT_ID}.`);
    return;
  }

  const app = getApps()[0] || initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
  const auth = getAuth(app);
  const db = getFirestore(app);

  for (const identity of identities) await upsertAuthUser(auth, identity);
  await seedFirestore(db);

  console.log(
    `Seeded ${identities.length} registered identities, ${CATALOG.teams.length} teams, ` +
    `and ${CATALOG.firestoreDocuments.length} synthetic documents in ${PROJECT_ID}.`,
  );
  console.log(`Fixture run ${CATALOG.runId} owns exact Auth, Firestore, and Storage cleanup selectors.`);
  console.log('Fixture password was accepted from the runtime environment and was not printed or persisted.');
  await deleteApp(app);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
