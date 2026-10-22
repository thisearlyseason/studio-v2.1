import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NativeFreeOnboarding } from '../src/components/native-auth/NativeFreeOnboarding.tsx';
import { parseNativeOnboarding, profileWrites } from '../src/lib/native-auth/onboarding.ts';
import { createFirestoreAttemptStore } from '../src/lib/native-auth/firestore-attempt-store.ts';
const now = 1800000000000;
const identity = { uid: 'apple-fictional', emailVerified: true, email: 'RELAY@privaterelay.appleid.test', disabled: false };
const form = { role: 'adult_player', adultConfirmed: true, termsAccepted: true, joinCode: '' };
function fixture(existing) {
  const handle = Buffer.alloc(32, 7).toString('base64url');
  const docs = new Map([[`nativeAuthAttempts/${handle}`, { state: 'ready', provider: 'apple.com', uid: identity.uid, webChallenge: 'challenge', authTime: now / 1000, expiresAt: now + 10000 }]]);
  if (existing) docs.set(`users/${identity.uid}`, structuredClone(existing));
  const writes = [];
  const db = { collection: name => ({ doc: id => ({ path: `${name}/${id}` }) }), async runTransaction(work) {
    const pending = [];
    const result = await work({
      async get(ref) { const value = docs.get(ref.path); return { exists: value !== undefined, ref, data: () => value }; },
      create(ref, value) { assert.equal(docs.has(ref.path), false); pending.push([ref.path, value]); },
      set(ref, value) { pending.push([ref.path, value]); },
    });
    for (const [path, value] of pending) { docs.set(path, value); writes.push(path); }
    return result;
  } };
  return { docs, writes, consume: (user = identity, onboarding = form) => createFirestoreAttemptStore(db, () => now).consume(handle, 'challenge', now, user, onboarding) };
}
test('actual onboarding UI requests neither name nor email; consent remains explicit', () => {
  const html = renderToStaticMarkup(React.createElement(NativeFreeOnboarding, { initialJoinCode: '', onSubmit() {} }));
  assert.doesNotMatch(html, /native-name|Full name|type="email"|autocomplete="name"|autocomplete="email"/);
  assert.match(html, /18 or older/); assert.match(html, /Terms/); assert.match(html, /native-role/);
  assert.doesNotMatch(html, /checked=""/);
});
test('first Apple identity uses provider name and verified relay email over legacy name', async () => {
  const f = fixture(); await f.consume({ ...identity, displayName: '  Taylor   Example  ' }, { ...form, fullName: 'Browser Override' });
  const user = f.docs.get(`users/${identity.uid}`);
  assert.equal(user.fullName, 'Taylor Example'); assert.equal(user.email, 'relay@privaterelay.appleid.test');
  assert.equal(f.docs.get(`players/p_${identity.uid}`).firstName, 'Taylor');
  assert.equal('plan_type' in user, false); assert.equal('isStaff' in user, false);
});
test('repeat Apple identity without a name creates a free profile without extra collection', async () => {
  const f = fixture(); await f.consume();
  assert.equal(f.docs.get(`users/${identity.uid}`).fullName, '');
  assert.equal(f.docs.get(`players/p_${identity.uid}`).firstName, '');
  assert.equal(f.docs.get(`players/p_${identity.uid}`).lastName, '');
});
test('existing profile and player data remain untouched on Apple onboarding redemption', async () => {
  const original = { fullName: 'Original', role: 'coach', plan_type: 'team', subscription_status: 'active' };
  const f = fixture(original); const player = { firstName: 'Preserve', guardianIds: ['fictional-parent'] };
  f.docs.set(`players/p_${identity.uid}`, player);
  await f.consume({ ...identity, displayName: 'Replacement' });
  assert.deepEqual(f.docs.get(`users/${identity.uid}`), original);
  assert.deepEqual(f.docs.get(`players/p_${identity.uid}`), player);
  assert.equal(f.writes.some(path => /^(users|players)\//.test(path)), false);
});
test('optional legacy name remains compatible; malformed provider names do not persist', () => {
  assert.equal(parseNativeOnboarding(form).fullName, '');
  for (const displayName of [undefined, '', ' '.repeat(10), 'A'.repeat(121), 'Unsafe\u0000Name', 'Unsafe\nName']) {
    const writes = profileWrites({ ...identity, displayName }, { ...form, fullName: ' Legacy   Name ' }, now);
    assert.equal(writes.user.fullName, 'Legacy Name');
  }
  assert.equal(profileWrites(identity, form, now).user.fullName, '');
});
test('age consent role bounds and unknown identity fields remain rejected', () => {
  for (const change of [{ adultConfirmed: false }, { termsAccepted: false }, { role: 'superadmin' }, { fullName: 'A'.repeat(121) }, { fullName: 'A\u0000B' }, { email: 'untrusted@test.invalid' }, { displayName: 'Untrusted' }]) {
    assert.throws(() => parseNativeOnboarding({ ...form, ...change }), { code: 'invalid_request' });
  }
});
test('actual transaction rejects changed disabled unverified and revoked identities without writes', async () => {
  for (const change of [{ uid: 'different' }, { disabled: true }, { emailVerified: false }, { tokensValidAfterTime: new Date(now + 1000).toISOString() }]) {
    const f = fixture(); await assert.rejects(f.consume({ ...identity, ...change }), { code: change.uid ? 'invalid_attempt' : 'account_unavailable' });
    assert.equal(f.writes.length, 0); assert.equal(f.docs.has(`users/${identity.uid}`), false);
  }
});
test('missing verified email remains an account availability failure', () => {
  assert.throws(() => profileWrites({ ...identity, email: undefined }, form, now), { code: 'account_unavailable' });
});
