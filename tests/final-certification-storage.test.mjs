import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertStorageCleanup,
  assertStorageTargetSafety,
  buildStorageCleanupGraph,
  requiredStorageObservations,
} from '../scripts/qa/certification/run-storage-boundaries.mjs';

const safe = {
  projectId: 'the-squad-v2-staging',
  origin: 'https://studio--the-squad-v2-staging.us-east4.hosted.app',
  runId: 'storage-cert-test-run',
  bucketName: 'the-squad-v2-staging.firebasestorage.app',
};

test('storage certification refuses production and unowned targets', () => {
  assert.doesNotThrow(() => assertStorageTargetSafety(safe));
  assert.throws(() => assertStorageTargetSafety({ ...safe, projectId: 'the-squad-v2' }), /Refusing/);
  assert.throws(() => assertStorageTargetSafety({ ...safe, origin: 'https://thesquad.pro' }), /Refusing/);
  assert.throws(() => assertStorageTargetSafety({ ...safe, runId: 'manual' }), /Refusing/);
  assert.throws(() => assertStorageTargetSafety({ ...safe, bucketName: 'other.appspot.com' }), /Refusing/);
});

test('storage evidence covers private media, recruiting visibility, and team library boundaries', () => {
  assert.deepEqual(requiredStorageObservations(), [
    'private-media-owner-crud-and-range',
    'private-media-cross-tenant-and-signature-denied',
    'recruiting-public-visibility-and-revocation',
    'team-library-owner-crud-and-member-read',
    'team-library-cross-tenant-and-signature-denied',
  ]);
});

test('storage cleanup graph is run-owned and residue gate is exact', () => {
  const graph = buildStorageCleanupGraph(safe.runId);
  assert.equal(graph.userIds.length, 3);
  assert.equal(graph.teamIds.length, 2);
  assert.equal(graph.playerIds.length, 1);
  assert.equal(graph.firestorePaths.every(path => path.includes(safe.runId)), true);
  assert.equal(graph.storagePrefixes.every(path => path.includes(safe.runId)), true);
  assert.deepEqual(assertStorageCleanup({ firestore: 0, auth: 0, objects: 0 }), {
    firestore: 0, auth: 0, objects: 0, total: 0,
  });
  assert.throws(() => assertStorageCleanup({ firestore: 0, auth: 0, objects: 1 }), /residual/);
});
