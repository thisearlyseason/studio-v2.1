import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

import { materializeFixtureMediaBytes } from './fixture-catalog.mjs';

const STAGING_PROJECT_ID = 'the-squad-v2-staging';
const STAGING_ORIGIN = 'https://studio--the-squad-v2-staging.us-east4.hosted.app';
const STAGING_BUCKET = 'the-squad-v2-staging.firebasestorage.app';
const RUN_ID_PATTERN = /^storage-cert-[a-z0-9-]{3,64}$/;

function refuse(reason) { throw new Error(`Refusing storage certification: ${reason}`); }

export function assertStorageTargetSafety({ projectId, origin, runId, bucketName }) {
  if (projectId !== STAGING_PROJECT_ID || origin !== STAGING_ORIGIN) refuse('target is not isolated staging');
  if (!RUN_ID_PATTERN.test(String(runId))) refuse('run identifier is not staging-owned');
  if (bucketName !== STAGING_BUCKET) refuse('bucket is not isolated staging');
}

export function requiredStorageObservations() {
  return [
    'private-media-owner-crud-and-range',
    'private-media-cross-tenant-and-signature-denied',
    'recruiting-public-visibility-and-revocation',
    'team-library-owner-crud-and-member-read',
    'team-library-cross-tenant-and-signature-denied',
  ];
}

export function buildStorageCleanupGraph(runId) {
  if (!RUN_ID_PATTERN.test(String(runId))) refuse('run identifier is not staging-owned');
  const userIds = [`${runId}-owner`, `${runId}-member`, `${runId}-outsider`];
  const teamIds = [`${runId}-team`, `${runId}-other-team`];
  const playerIds = [`${runId}-player`];
  return {
    userIds, teamIds, playerIds,
    firestorePaths: [
      ...userIds.map(uid => `users/${uid}`),
      ...teamIds.map(teamId => `teams/${teamId}`),
      ...playerIds.map(playerId => `players/${playerId}`),
      `certificationStorageRuns/${runId}`,
    ],
    storagePrefixes: [`players/${playerIds[0]}/`, `teams/${teamIds[0]}/`],
  };
}

export function assertStorageCleanup({ firestore, auth, objects }) {
  const result = { firestore, auth, objects, total: firestore + auth + objects };
  if (result.total !== 0) throw new Error(`Storage cleanup left ${result.total} residual resource(s)`);
  return result;
}

function hash(value) { return createHash('sha256').update(value).digest('hex'); }

function readSdkConfig() {
  const raw = execFileSync('npx', [
    'firebase', 'apps:sdkconfig', 'WEB', '1:100620894746:web:936e8e921c9c41851d87a3',
    `--project=${STAGING_PROJECT_ID}`, '--json',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 });
  return JSON.parse(raw).result.sdkConfig;
}

function services(storageBucket) {
  if (getApps().length === 0) initializeApp({ projectId: STAGING_PROJECT_ID, storageBucket, credential: applicationDefault() });
  return { auth: getAuth(), db: getFirestore(), bucket: getStorage().bucket(storageBucket) };
}

async function ensureUser(auth, uid, email, password) {
  try { await auth.deleteUser(uid); } catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }
  await auth.createUser({ uid, email, password, emailVerified: true });
}

async function signIn(apiKey, email, password) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }), signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json();
  if (!response.ok || typeof payload.idToken !== 'string') throw new Error(`Staging sign-in failed with ${response.status}`);
  return payload.idToken;
}

async function request(pathname, token, { method = 'GET', body, type, range, expectedStatus = 200 } = {}) {
  const response = await fetch(`${STAGING_ORIGIN}${pathname}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(type ? { 'content-type': type } : {}),
      ...(range ? { range } : {}),
      'user-agent': 'TheSquadFinalCertification/1.0',
      'x-forwarded-for': '192.0.2.45',
    },
    ...(body === undefined ? {} : { body }),
    signal: AbortSignal.timeout(120_000),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  if (response.status !== expectedStatus) {
    let detail = bytes.toString('utf8').slice(0, 180);
    try { detail = JSON.parse(detail).error || detail; } catch {}
    throw new Error(`${method} ${pathname} returned ${response.status}, expected ${expectedStatus}: ${detail}`);
  }
  return { bytes, headers: response.headers };
}

async function countPrefix(bucket, prefix) {
  const [files] = await bucket.getFiles({ prefix });
  return files.length;
}

export async function main({ projectId = STAGING_PROJECT_ID, origin = STAGING_ORIGIN, runId = `storage-cert-${Date.now()}` } = {}) {
  const sdk = readSdkConfig();
  const bucketName = sdk.storageBucket;
  assertStorageTargetSafety({ projectId, origin, runId, bucketName });
  const { auth, db, bucket } = services(bucketName);
  const graph = buildStorageCleanupGraph(runId);
  const [ownerUid, memberUid, outsiderUid] = graph.userIds;
  const [teamId, otherTeamId] = graph.teamIds;
  const [playerId] = graph.playerIds;
  const password = 'Staging-Storage-QA!4096';
  const emails = graph.userIds.map((uid, index) => `${uid}-${index}@example.invalid`);
  const mediaPath = `players/${playerId}/avatar/${runId}.png`;
  const png = materializeFixtureMediaBytes({ payloadGenerator: 'solid-png-v1' });
  const pdf = Buffer.from(`%PDF-1.4\n${runId}\n%%EOF\n`);
  const observations = [];
  let evidence;
  const knownPaths = new Set(graph.firestorePaths);
  try {
    await Promise.all(graph.userIds.map((uid, index) => ensureUser(auth, uid, emails[index], password)));
    await Promise.all([
      db.doc(`users/${ownerUid}`).set({ id: ownerUid, email: emails[0], fullName: 'Storage QA Owner', role: 'coach', accountStatus: 'active', fixtureRunId: runId }),
      db.doc(`users/${memberUid}`).set({ id: memberUid, email: emails[1], fullName: 'Storage QA Member', role: 'adult_player', accountStatus: 'active', fixtureRunId: runId }),
      db.doc(`users/${outsiderUid}`).set({ id: outsiderUid, email: emails[2], fullName: 'Storage QA Outsider', role: 'coach', accountStatus: 'active', fixtureRunId: runId }),
      db.doc(`teams/${teamId}`).set({ id: teamId, name: runId, ownerUserId: ownerUid, isPro: true, features: { files: true }, fixtureRunId: runId }),
      db.doc(`teams/${otherTeamId}`).set({ id: otherTeamId, name: `${runId} other`, ownerUserId: outsiderUid, isPro: true, fixtureRunId: runId }),
      db.doc(`teams/${teamId}/members/${memberUid}`).set({ id: memberUid, userId: memberUid, position: 'Player', status: 'active', fixtureRunId: runId }),
      db.doc(`players/${playerId}`).set({ id: playerId, userId: memberUid, primaryTeamId: teamId, recruitingProfileEnabled: false, fixtureRunId: runId }),
      db.doc(`certificationStorageRuns/${runId}`).set({ runId, projectId, createdAt: new Date().toISOString() }),
    ]);
    const [ownerToken, memberToken, outsiderToken] = await Promise.all(emails.map(email => signIn(sdk.apiKey, email, password)));
    knownPaths.add(`apiRateLimits/${hash(`media-upload:${ownerUid}`)}`);
    knownPaths.add(`apiRateLimits/${hash(`library-upload:${ownerUid}`)}`);

    const mediaUrl = `/api/media?path=${encodeURIComponent(mediaPath)}`;
    await request(mediaUrl, ownerToken, { method: 'POST', body: png, type: 'image/png', expectedStatus: 201 });
    const [mediaMetadata] = await bucket.file(mediaPath).getMetadata();
    if (mediaMetadata.metadata?.firebaseStorageDownloadTokens) throw new Error('Private media received a download token');
    await request(mediaUrl, null, { expectedStatus: 403 });
    await request(mediaUrl, outsiderToken, { expectedStatus: 403 });
    const range = await request(mediaUrl, ownerToken, { range: 'bytes=2-9', expectedStatus: 206 });
    if (!range.bytes.equals(png.subarray(2, 10)) || range.headers.get('content-range') !== `bytes 2-9/${png.length}`) throw new Error('Private media range response was not exact');
    observations.push('private-media-owner-crud-and-range');
    await request(`/api/media?path=${encodeURIComponent(`players/${playerId}/avatar/forged.png`)}`, ownerToken, {
      method: 'POST', body: Buffer.from('not a PNG'), type: 'image/png', expectedStatus: 400,
    });
    await request(`/api/media?path=${encodeURIComponent(`users/${memberUid}/avatar.jpg`)}`, ownerToken, {
      method: 'POST', body: png, type: 'image/png', expectedStatus: 403,
    });
    observations.push('private-media-cross-tenant-and-signature-denied');

    const recruitingBody = enabled => Buffer.from(JSON.stringify({ playerId, enabled }));
    await request('/api/media/recruiting', ownerToken, { method: 'POST', body: recruitingBody(true), type: 'application/json' });
    const publicRead = await request(mediaUrl, null);
    if (!publicRead.bytes.equals(png)) throw new Error('Public recruiting media bytes were not exact');
    await request('/api/media/recruiting', ownerToken, { method: 'POST', body: recruitingBody(false), type: 'application/json' });
    await request(mediaUrl, null, { expectedStatus: 403 });
    const [revokedMetadata] = await bucket.file(mediaPath).getMetadata();
    if (revokedMetadata.metadata?.firebaseStorageDownloadTokens) throw new Error('Recruiting revocation left a download token');
    observations.push('recruiting-public-visibility-and-revocation');

    const createLibraryUrl = `/api/teams/library?teamId=${teamId}&name=${encodeURIComponent(`${runId}.pdf`)}&category=Documents`;
    const created = await request(createLibraryUrl, ownerToken, { method: 'POST', body: pdf, type: 'application/pdf', expectedStatus: 201 });
    const fileId = JSON.parse(created.bytes.toString('utf8')).fileId;
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(fileId || '')) throw new Error('Library file identity missing');
    const libraryDocPath = `teams/${teamId}/files/${fileId}`;
    const libraryObjectPath = `teams/${teamId}/library/${fileId}/content`;
    knownPaths.add(libraryDocPath);
    const libraryUrl = `/api/teams/library?teamId=${teamId}&fileId=${fileId}`;
    const memberRead = await request(libraryUrl, memberToken);
    if (!memberRead.bytes.equals(pdf) || !memberRead.headers.get('content-disposition')?.includes(`${runId}.pdf`)) throw new Error('Member Library download was not exact');
    await request(libraryUrl, outsiderToken, { expectedStatus: 403 });
    await request(createLibraryUrl, memberToken, { method: 'POST', body: pdf, type: 'application/pdf', expectedStatus: 403 });
    observations.push('team-library-owner-crud-and-member-read');
    await request(createLibraryUrl, ownerToken, { method: 'POST', body: Buffer.from('not a PDF'), type: 'application/pdf', expectedStatus: 400 });
    await request(`/api/teams/library?teamId=${otherTeamId}&name=x.pdf&category=Documents`, ownerToken, { method: 'POST', body: pdf, type: 'application/pdf', expectedStatus: 403 });
    observations.push('team-library-cross-tenant-and-signature-denied');

    await request(libraryUrl, ownerToken, { method: 'DELETE' });
    await request(libraryUrl, memberToken, { expectedStatus: 404 });
    if ((await bucket.file(libraryObjectPath).exists())[0]) throw new Error('Deleted Library object still exists');
    await request(mediaUrl, ownerToken, { method: 'DELETE' });
    await request(mediaUrl, ownerToken, { expectedStatus: 404 });
    if (!requiredStorageObservations().every(item => observations.includes(item))) throw new Error('Storage evidence is incomplete');
    evidence = { runId, projectId, origin, bucketName, observations, exactBytes: { media: png.length, library: pdf.length } };
  } finally {
    for (const prefix of graph.storagePrefixes) {
      const [files] = await bucket.getFiles({ prefix });
      await Promise.all(files.map(file => file.delete({ ignoreNotFound: true })));
    }
    await Promise.all([...knownPaths].map(path => db.recursiveDelete(db.doc(path)).catch(() => {})));
    await Promise.all(graph.userIds.map(async uid => {
      try { await auth.deleteUser(uid); } catch (error) { if (error?.code !== 'auth/user-not-found') throw error; }
    }));
    const firestoreResiduals = (await Promise.all([...knownPaths].map(path => db.doc(path).get()))).filter(snapshot => snapshot.exists).length;
    const authResiduals = (await Promise.all(graph.userIds.map(async uid => {
      try { await auth.getUser(uid); return true; } catch (error) { if (error?.code === 'auth/user-not-found') return false; throw error; }
    }))).filter(Boolean).length;
    const objectResiduals = (await Promise.all(graph.storagePrefixes.map(prefix => countPrefix(bucket, prefix)))).reduce((sum, count) => sum + count, 0);
    const cleanup = assertStorageCleanup({ firestore: firestoreResiduals, auth: authResiduals, objects: objectResiduals });
    if (evidence) evidence.cleanup = { ...cleanup, checkedFirestorePaths: knownPaths.size };
  }
  return evidence;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(result => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch(error => {
    process.stderr.write(`Storage certification failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
