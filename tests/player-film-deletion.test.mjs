import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePlayerFilmDeletion } from '../src/lib/player-film-deletion.ts';

test('film metadata is deleted only after the exact Storage object is confirmed absent', async () => {
  let objectExists = true;
  let metadataExists = true;
  let deleteAttempts = 0;
  const order = [];

  await reconcilePlayerFilmDeletion({
    storagePath: 'players/player-a/videos/clip.webm',
    deleteStorageObject: async path => {
      assert.equal(path, 'players/player-a/videos/clip.webm');
      order.push('delete-storage');
      deleteAttempts += 1;
      // Reproduce the observed boundary: the first acknowledged delete has not
      // removed the exact object yet; the bounded retry does.
      if (deleteAttempts === 2) objectExists = false;
    },
    readStorageObject: async path => {
      assert.equal(path, 'players/player-a/videos/clip.webm');
      order.push('verify-storage');
      if (!objectExists) throw Object.assign(new Error('missing'), { code: 'storage/object-not-found' });
      return { fullPath: path, contentType: 'video/webm' };
    },
    deleteMetadata: async () => {
      order.push('delete-metadata');
      metadataExists = false;
    },
  });

  assert.equal(objectExists, false);
  assert.equal(metadataExists, false);
  assert.deepEqual(order, [
    'delete-storage', 'verify-storage',
    'delete-storage', 'verify-storage',
    'delete-metadata',
  ]);
});

test('film metadata remains intact when the exact Storage object cannot be reconciled', async () => {
  let metadataExists = true;
  await assert.rejects(() => reconcilePlayerFilmDeletion({
    storagePath: 'players/player-a/videos/clip.webm',
    deleteStorageObject: async () => {},
    readStorageObject: async path => ({ fullPath: path, contentType: 'video/webm' }),
    deleteMetadata: async () => { metadataExists = false; },
  }), /still exists after 3 delete attempts/);
  assert.equal(metadataExists, true);
});
