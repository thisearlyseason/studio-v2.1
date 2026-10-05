import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertEmailIdentityCleanup,
  assertEmailIdentitySafety,
  buildEmailIdentityCleanupGraph,
  deliveryRecipientForRole,
  deriveApprovedAliases,
  emailHasDelivered,
  requiredEmailIdentityObservations,
  resolveRedeemedYouthUid,
} from '../scripts/qa/certification/run-email-identity-lifecycle.mjs';

const safe = {
  projectId: 'the-squad-v2-staging',
  origin: 'https://studio--the-squad-v2-staging.us-east4.hosted.app',
  runId: 'email-cert-test-run',
  approvedRecipient: 'qa@example.com',
  resendKey: 're_test_example',
};

test('email identity lifecycle refuses production, unapproved recipients, and live-looking credentials', () => {
  assert.doesNotThrow(() => assertEmailIdentitySafety(safe));
  assert.throws(() => assertEmailIdentitySafety({ ...safe, projectId: 'the-squad-v2' }), /Refusing/);
  assert.throws(() => assertEmailIdentitySafety({ ...safe, approvedRecipient: '' }), /Refusing/);
  assert.throws(() => assertEmailIdentitySafety({ ...safe, resendKey: 'secret' }), /Refusing/);
});

test('role delivery reuses the exact approved mailbox without assuming plus-address support', () => {
  for (const role of ['adult_player', 'parent', 'coach', 'admin', 'league_creator', 'youth_player']) {
    assert.equal(deliveryRecipientForRole(safe.approvedRecipient, role), safe.approvedRecipient);
  }
  assert.throws(() => deliveryRecipientForRole(safe.approvedRecipient, 'unknown'), /Refusing/);
});

test('all role mailbox aliases stay inside the explicitly approved mailbox', () => {
  const aliases = deriveApprovedAliases(safe.approvedRecipient, safe.runId);
  assert.deepEqual(Object.keys(aliases), ['adult_player', 'parent', 'coach', 'admin', 'league_creator', 'youth_player', 'unknown']);
  assert.equal(new Set(Object.values(aliases)).size, 7);
  assert.equal(Object.values(aliases).every(email => email.endsWith('@example.com') && email.startsWith('qa+')), true);
});

test('email identity evidence closes role delivery, reset, sessions, youth, and Resend boundaries', () => {
  assert.deepEqual(requiredEmailIdentityObservations(), [
    'five-role-verification-delivered',
    'known-reset-delivered-unknown-neutral',
    'durable-session-block-and-revocation',
    'youth-invitation-delivered-and-consumed-once',
    'resend-unknown-message-isolated-and-replay-safe',
  ]);
});

test('provider delivery accepts delivered, opened, or clicked but not queued or failed', () => {
  for (const status of ['delivered', 'opened', 'clicked']) assert.equal(emailHasDelivered(status), true);
  for (const status of ['queued', 'sent', 'failed', 'bounced', undefined]) assert.equal(emailHasDelivered(status), false);
});

test('email identity cleanup graph and residue gate are exact', () => {
  const graph = buildEmailIdentityCleanupGraph(safe.runId);
  assert.equal(graph.userIds.length, 6);
  assert.equal(graph.firestorePaths.every(path => path.includes(safe.runId)), true);
  assert.deepEqual(assertEmailIdentityCleanup({ firestore: 0, auth: 0, syntheticLedgers: 0 }), {
    firestore: 0, auth: 0, syntheticLedgers: 0, total: 0,
  });
  assert.throws(() => assertEmailIdentityCleanup({ firestore: 1, auth: 0, syntheticLedgers: 0 }), /residual/);
});

test('redeemed youth cleanup resolves the server-created Auth identity by approved alias', async () => {
  assert.equal(await resolveRedeemedYouthUid({ uid: 'returned' }, {}, 'a@example.com'), 'returned');
  assert.equal(await resolveRedeemedYouthUid({}, { getUserByEmail: async () => ({ uid: 'looked-up' }) }, 'a@example.com'), 'looked-up');
});
