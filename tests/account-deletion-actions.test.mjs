import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccountDeletionActions } from '../src/lib/server-account-deletion.ts';

function fixture(profile = {}, owned = false) {
  const docs = new Map([['users/u', profile]]), effects = [];
  const ref = path => ({ path, get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }) });
  const db = {
    collection: name => ({ doc: uid => ref(name + '/' + uid), where: () => ({ limit: () => ({ get: async () => ({ empty: !owned }) }) }) }),
    runTransaction: async callback => callback({ get: r => r.get(), set: (r, data) => docs.set(r.path, { ...docs.get(r.path), ...data }) }),
  };
  const auth = { revokeRefreshTokens: async uid => effects.push(['revoke', uid]), updateUser: async (uid, data) => effects.push(['update', uid, data]) };
  return { actions: createAccountDeletionActions(db, auth, () => 1800000000000), docs, effects };
}

test('existing deletion keeps seven-day retention, revokes sessions, disables user and is idempotent', async () => {
  const f = fixture(); await f.actions.eligible('u');
  const first = await f.actions.schedule('u'), second = await f.actions.schedule('u');
  assert.equal(first, new Date(1800000000000 + 7 * 86400000).toISOString());
  assert.equal(second, first);
  assert.equal(f.docs.get('users/u').deletionStatus, 'pending');
  assert.equal(f.docs.get('accountDeletionRequests/u').uid, 'u');
  assert.deepEqual(f.effects.slice(0, 2), [['revoke', 'u'], ['update', 'u', { disabled: true }]]);
});

test('scheduling rechecks ownership and billing rather than trusting an earlier eligibility result', async () => {
  for (const [profile, owns] of [[{}, true], [{ subscriptionStatus: 'active' }, false], [{ isDemo: true }, false]]) {
    const f = fixture(profile, owns);
    await assert.rejects(f.actions.schedule('u'), error => error.status === (profile.isDemo ? 400 : 409));
    assert.equal(f.effects.length, 0);
    assert.equal(f.docs.has('accountDeletionRequests/u'), false);
    assert.equal(f.docs.get('users/u').deletionStatus, undefined);
  }
});

test('scheduling never recreates a missing account profile', async () => {
  const f = fixture(); f.docs.delete('users/u');
  await assert.rejects(f.actions.schedule('u'), error => error.status === 409);
  assert.equal(f.docs.has('users/u'), false);
  assert.equal(f.effects.length, 0);
});

test('demo, unresolved billing and owned organizations reject before any account mutation', async () => {
  for (const [profile, owns] of [[{ isDemo: true }, false], [{ subscriptionStatus: 'active', stripeSubscriptionId: 'sub_real' }, false], [{}, true]]) {
    const f = fixture(profile, owns);
    await assert.rejects(f.actions.eligible('u'), error => error.status === (profile.isDemo ? 400 : 409));
    assert.equal(f.effects.length, 0);
    assert.equal(f.docs.has('accountDeletionRequests/u'), false);
  }
});
