import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('authenticated API routes reject revoked Firebase ID tokens', () => {
  const source = readFileSync('src/lib/api-auth.ts', 'utf8');
  assert.match(source, /verifyIdToken\(idToken, true\)/);
});
