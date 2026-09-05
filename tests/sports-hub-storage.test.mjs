import assert from 'node:assert/strict';
import test from 'node:test';

import {
  readSportsHubArray,
  readSportsHubPreferences,
  sportsHubStorageKey,
} from '../src/lib/sports-hub-storage.ts';

function storage(values = {}) {
  const data = new Map(Object.entries(values));
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test('Sports Hub keys are namespaced by authenticated user and never reuse anonymous state', () => {
  assert.equal(sportsHubStorageKey('bookmarks', 'user-a'), 'sh:bookmarks:user-a');
  assert.equal(sportsHubStorageKey('bookmarks', 'user-b'), 'sh:bookmarks:user-b');
  assert.equal(sportsHubStorageKey('bookmarks'), 'sh:bookmarks:anonymous');
  assert.notEqual(sportsHubStorageKey('bookmarks'), sportsHubStorageKey('bookmarks', 'user-a'));
});

test('Sports Hub local state rejects corrupted or wrong-shaped values without throwing', () => {
  assert.deepEqual(readSportsHubArray(storage({ 'sh:bookmarks:user-a': '{bad' }), 'bookmarks', 'user-a'), []);
  assert.deepEqual(readSportsHubArray(storage({ 'sh:bookmarks:user-a': '["ok",3,null]' }), 'bookmarks', 'user-a'), ['ok']);
  assert.deepEqual(readSportsHubPreferences(storage({ 'sh:preferences:user-a': '["wrong"]' }), 'user-a'), {});
});
