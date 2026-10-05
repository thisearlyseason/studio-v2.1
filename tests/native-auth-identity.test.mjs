import assert from 'node:assert/strict';
import test from 'node:test';
import { createFirebaseIdentity } from '../src/lib/native-auth/firebase-identity.ts';
const user = { uid: 'qa-user', emailVerified: true, disabled: false };
const database = profile => ({ collection(name) { assert.equal(name, 'users'); return { doc(uid) { assert.equal(uid, 'qa-user'); return { async get() { return { exists: profile !== null, data: () => profile }; } }; } }; } });

test('native verification requests revocation checking and never trusts body claims', async () => {
  const auth = {
    async verifyIdToken(token, revoked) { assert.equal(token, 'fake-id-token'); assert.equal(revoked, true); return { uid: 'qa-user', auth_time: 1800000000, email_verified: true, firebase: { sign_in_provider: 'google.com' } }; },
    async getUser(uid) { assert.equal(uid, user.uid); return user; },
    async createCustomToken(...args) { assert.deepEqual(args, ['qa-user']); return 'fake-custom-token'; },
  };
  const service = createFirebaseIdentity(auth, database({ role: 'coach', subscription_status: 'active' }));
  assert.deepEqual(await service.verify('fake-id-token'), { uid: 'qa-user', authTime: 1800000000, emailVerified: true, provider: 'google.com' });
  assert.equal((await service.checkActive('qa-user')).hasProfile, true);
  assert.equal(await service.mint('qa-user'), 'fake-custom-token');
});
test('blocked/deleting profiles fail even if a role is elevated', async () => {
  for (const profile of [{ accountStatus: 'suspended' }, { accountStatus: 'disabled' }, { deletionStatus: 'processing' }, { accountStatus: 'pending_deletion' }]) {
    const service = createFirebaseIdentity({ getUser: async () => user }, database({ ...profile, role: 'superadmin' }));
    await assert.rejects(service.checkActive('qa-user'), { code: 'account_unavailable' });
  }
});
test('provider errors do not expose raw token diagnostics', async () => {
  for (const code of ['auth/id-token-expired', 'auth/id-token-revoked', 'auth/argument-error']) {
    const service = createFirebaseIdentity({ verifyIdToken: async () => { throw Object.assign(Error('secret-token-value'), { code }); } }, database(null));
    await assert.rejects(service.verify('fake-id-token'), error => error.code === 'invalid_identity' && !String(error).includes('secret-token-value'));
  }
});
