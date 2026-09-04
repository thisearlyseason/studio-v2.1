import process from 'node:process';
import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

import {
  buildFixtureCatalog,
  inspectFixtureMedia,
  materializeFixtureMediaBytes,
} from './certification/fixture-catalog.mjs';

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '';
const PASSWORD = process.env.AUDIT_FIXTURE_PASSWORD || '';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '';
const FIRESTORE_HOST = process.env.FIRESTORE_EMULATOR_HOST || '';
const STORAGE_HOST = process.env.FIREBASE_STORAGE_EMULATOR_HOST || '';
const RUN_SUFFIX = process.env.AUDIT_FIXTURE_RUN_SUFFIX || 'phase2';
const CATALOG = buildFixtureCatalog(RUN_SUFFIX);

function isLoopbackAuthority(value) {
  const match = value.match(/^(?:127\.0\.0\.1|localhost):(\d{1,5})$/) ||
    value.match(/^\[::1\]:(\d{1,5})$/);
  if (!match) return false;
  const port = Number(match[1]);
  return Number.isInteger(port) && port >= 1 && port <= 65_535;
}

function assertSafeEnvironment() {
  if (!PROJECT_ID.startsWith('demo-')) {
    throw new Error('Refusing to seed: GCLOUD_PROJECT must use a demo-* Firebase project ID.');
  }
  if (!isLoopbackAuthority(AUTH_HOST)) {
    throw new Error('Refusing to seed: FIREBASE_AUTH_EMULATOR_HOST must be loopback.');
  }
  if (!isLoopbackAuthority(FIRESTORE_HOST)) {
    throw new Error('Refusing to seed: FIRESTORE_EMULATOR_HOST must be loopback.');
  }
  if (!isLoopbackAuthority(STORAGE_HOST)) {
    throw new Error('Refusing to seed: FIREBASE_STORAGE_EMULATOR_HOST must be loopback.');
  }
  if (PASSWORD.length < 16) {
    throw new Error('AUDIT_FIXTURE_PASSWORD must be supplied at runtime and contain at least 16 characters.');
  }
  if (CATALOG.providers.stripe.livemode !== false || CATALOG.providers.stripeConnect.livemode !== false) {
    throw new Error('Refusing to seed: certification provider fixtures must have livemode=false.');
  }
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
  if (Object.keys(value).length === 1 && typeof value.__fixtureStorageObject === 'string') {
    const bucket = `${PROJECT_ID}.appspot.com`;
    return `http://${STORAGE_HOST}/v0/b/${bucket}/o/${encodeURIComponent(value.__fixtureStorageObject)}?alt=media`;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, materializeFixtureValue(child)]),
  );
}

async function cleanupFirestore(db) {
  for (const rootPath of CATALOG.cleanupSelectors.firestore.recursiveRoots) {
    await db.recursiveDelete(db.doc(rootPath));
  }
}

async function cleanupAuth(auth) {
  await Promise.all(CATALOG.cleanupSelectors.auth.uids.map(async uid => {
    try {
      await auth.deleteUser(uid);
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw error;
    }
  }));
}

async function cleanupStorage(bucket) {
  await Promise.all(CATALOG.cleanupSelectors.storage.objectPaths.map(path => (
    bucket.file(path).delete({ ignoreNotFound: true })
  )));
}

async function assertStorageAbsent(bucket) {
  for (const path of CATALOG.cleanupSelectors.storage.objectPaths) {
    const [exists] = await bucket.file(path).exists();
    if (exists) throw new Error(`Storage cleanup did not remove owned object ${path}.`);
  }
}

async function seedStorage(bucket) {
  for (const object of CATALOG.storageObjects) {
    if (object.payloadGenerator === 'exact-size-v1') continue;
    const bytes = materializeFixtureMediaBytes(object);
    const inspection = await inspectFixtureMedia(bytes);
    if (bytes.length !== object.sizeBytes || inspection.detectedMime !== object.detectedMime) {
      throw new Error(`Fixture media mismatch for ${object.alias}.`);
    }
    if (object.lifecycle === 'negative-upload-only') continue;
    await bucket.file(object.path).save(bytes, {
      resumable: false,
      metadata: {
        contentType: object.contentType,
        metadata: {
          fixtureRunId: CATALOG.runId,
          fixtureAlias: object.alias,
          cleanupOwner: 'fixture-batch',
        },
      },
    });
    if (object.lifecycle === 'delete-after-write') {
      await bucket.file(object.path).delete({ ignoreNotFound: false });
    }
  }
}

async function verifyStorageLifecycle(bucket) {
  for (const object of CATALOG.storageObjects) {
    const [exists] = await bucket.file(object.path).exists();
    const expected = object.lifecycle === 'present';
    if (exists !== expected) {
      throw new Error(`Storage lifecycle mismatch for ${object.alias}: expected exists=${expected}.`);
    }
  }
}

async function seedFirestore(db) {

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

function fixturePath(alias) {
  const document = CATALOG.firestoreDocuments.find(value => value.data.fixtureAlias === alias);
  if (!document) throw new Error(`Missing fixture descriptor ${alias}.`);
  return document.path;
}

async function verifySeededFirestoreReaders(db) {
  const teamA = CATALOG.teams.find(team => team.alias === 'qa-team-a');
  const schoolHub = CATALOG.teams.find(team => team.alias === 'qa-school-hub');
  const tournament = await db.doc(fixturePath('qa-tournament-a')).get();
  const tournamentData = tournament.data() || {};
  const tournamentGameIds = new Set((tournamentData.tournamentGames || []).map(game => game.id));
  if (!tournament.exists || tournamentData.isTournament !== true || tournamentData.isArchived === true ||
      !tournamentData.tournamentGames?.some(game => game.winnerTo && tournamentGameIds.has(game.winnerTo))) {
    throw new Error('Seeded tournament is not readable as a published bracket with an existing dependency.');
  }

  const [feed, games, volunteers, fundraisers, bookings, hub, squads, waiver] = await Promise.all([
    db.collection('teams').doc(teamA.id).collection('feedPosts').orderBy('createdAt', 'desc').limit(20).get(),
    db.collection('teams').doc(teamA.id).collection('games').orderBy('date', 'desc').limit(20).get(),
    db.collection('teams').doc(teamA.id).collection('volunteers').orderBy('date', 'asc').get(),
    db.collection('teams').doc(teamA.id).collection('fundraising').orderBy('deadline', 'asc').get(),
    db.collection('scheduleBookings').where('date', '==', '2026-10-15').get(),
    db.doc(`teams/${schoolHub.id}`).get(),
    db.collection('teams').where('schoolId', '==', schoolHub.id).get(),
    db.doc(fixturePath('qa-team-a-waiver')).get(),
  ]);

  if (feed.empty || games.empty || volunteers.empty || fundraisers.empty || bookings.size < 2) {
    throw new Error('One or more application list readers returned no seeded fixture records.');
  }
  if (!waiver.exists || waiver.data()?.type !== 'waiver' || waiver.data()?.isActive !== true) {
    throw new Error('The active waiver is not persisted at the signing reader path.');
  }
  const delegateId = CATALOG.identities.find(identity => identity.alias === 'qa-school-delegate').uid;
  if (!hub.exists || hub.data()?.type !== 'school_hub' || !hub.data()?.schoolAdminIds?.includes(delegateId) || squads.size !== 3) {
    throw new Error('The school hub, its three squads, or delegated authority is not readable.');
  }
}

async function main() {
  assertSafeEnvironment();
  if (process.argv.includes('--validate-environment-only')) {
    console.log(`Validated isolated fixture target ${PROJECT_ID}.`);
    return;
  }

  const app = getApps()[0] || initializeApp({
    projectId: PROJECT_ID,
    storageBucket: `${PROJECT_ID}.appspot.com`,
  });
  const auth = getAuth(app);
  const db = getFirestore(app);
  const bucket = getStorage(app).bucket();

  await cleanupFirestore(db);
  await cleanupAuth(auth);
  await cleanupStorage(bucket);

  if (process.argv.includes('--cleanup-only')) {
    await assertStorageAbsent(bucket);
    console.log(`Cleaned exact Auth, Firestore, and Storage selectors for ${CATALOG.runId}.`);
    await deleteApp(app);
    return;
  }

  for (const identity of identities) await upsertAuthUser(auth, identity);
  await seedFirestore(db);
  await verifySeededFirestoreReaders(db);
  await seedStorage(bucket);
  await verifyStorageLifecycle(bucket);

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
