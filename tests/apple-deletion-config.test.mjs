import assert from 'node:assert/strict';
import test from 'node:test';
import { appleDeletionAPIKey } from '../src/lib/apple-deletion/config.ts';
test('revocation key comes only from the explicitly configured matching Firebase project', () => {
  const env = { NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG: JSON.stringify({ projectId: 'qa-project', apiKey: 'configured-key' }) };
  assert.equal(appleDeletionAPIKey(env, 'qa-project'), 'configured-key');
  assert.equal(appleDeletionAPIKey(env, 'different-project'), null);
  assert.equal(appleDeletionAPIKey({}, 'qa-project'), null);
  assert.equal(appleDeletionAPIKey({ NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG: 'invalid' }, 'qa-project'), null);
});
