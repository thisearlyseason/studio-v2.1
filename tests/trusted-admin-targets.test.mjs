import assert from 'node:assert/strict';
import test from 'node:test';
import { collectTrustedAdminTargets } from '../src/lib/trusted-admin-targets.ts';

test('admin notification targets exclude profile-only elevated identities', () => {
  const targets = collectTrustedAdminTargets([
    {
      uid: 'trusted-admin',
      email: 'Admin@Example.com',
      fcmTokens: ['trusted-token-1234567890'],
    },
    {
      uid: 'profile-only-fake',
      email: 'attacker@example.com',
      fcmTokens: ['attacker-token-123456789'],
    },
  ], new Set(['trusted-admin']));

  assert.deepEqual([...targets.emails], ['admin@example.com']);
  assert.deepEqual([...targets.tokens], ['trusted-token-1234567890']);
});

test('admin notification targets reject malformed addresses and tokens', () => {
  const targets = collectTrustedAdminTargets([
    {
      uid: 'trusted-admin',
      email: 'not-an-email',
      fcmTokens: ['', 'short', 'valid-token-1234567890', 42],
    },
  ], new Set(['trusted-admin']));

  assert.deepEqual([...targets.emails], []);
  assert.deepEqual([...targets.tokens], ['valid-token-1234567890']);
});
