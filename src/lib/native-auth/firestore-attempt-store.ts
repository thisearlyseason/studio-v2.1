import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { isAccountAccessBlocked } from '../account-access-policy';
import { NativeAuthError, isSecret } from './protocol';
import { assertCurrentIdentity, type Attempt, type AttemptStore } from './attempt-service';
import { profileWrites } from './onboarding';

export function createFirestoreAttemptStore(db: Firestore, now: () => number = Date.now): AttemptStore {
  const ref = (handle: string) => {
    if (!isSecret(handle)) throw new NativeAuthError('invalid_attempt');
    return db.collection('nativeAuthAttempts').doc(handle);
  };
  return {
    async create(handle, value) {
      await ref(handle).create({ ...value, expireAt: Timestamp.fromMillis(value.expiresAt) });
    },
    async read(handle) {
      const snapshot = await ref(handle).get();
      return snapshot.exists ? snapshot.data() as Attempt : null;
    },
    async markReady(handle, expected, identity) {
      return db.runTransaction(async transaction => {
        const document = ref(handle), snapshot = await transaction.get(document);
        const value = snapshot.data() as Attempt | undefined;
        if (!value || value.state !== 'pending' || value.expiresAt <= now() ||
            value.provider !== expected.provider || value.createdAt !== expected.createdAt || value.expiresAt !== expected.expiresAt ||
            value.nativeChallenge !== expected.nativeChallenge || value.webChallenge !== expected.webChallenge) return false;
        transaction.update(document, { state: 'ready', uid: identity.uid, authTime: identity.authTime });
        return true;
      });
    },
    async consume(handle, challenge, time, user, onboarding) {
      return db.runTransaction(async transaction => {
        const document = ref(handle), snapshot = await transaction.get(document);
        const value = snapshot.data() as Attempt | undefined;
        if (!value || value.state !== 'ready' || value.webChallenge !== challenge || !value.uid ||
            value.expiresAt <= Math.max(time, now()) || value.uid !== user.uid) throw new NativeAuthError('invalid_attempt');
        assertCurrentIdentity(user, value.uid, value.authTime ?? NaN);
        const profile = await transaction.get(db.collection('users').doc(value.uid));
        if (profile.exists && isAccountAccessBlocked(profile.data())) throw new NativeAuthError('account_unavailable');
        let returnPath: string | null = null;
        if (!profile.exists) {
          if (!onboarding) throw new NativeAuthError('onboarding_required');
          const writes = profileWrites(user, onboarding, now());
          const playerRef = db.collection('players').doc(`p_${value.uid}`);
          if (writes.player && (await transaction.get(playerRef)).exists) throw new NativeAuthError('account_unavailable');
          transaction.create(profile.ref, writes.user);
          if (writes.player) transaction.create(playerRef, writes.player);
          returnPath = writes.returnPath;
        }
        transaction.set(document, { state: 'consumed', uid: value.uid, expiresAt: value.expiresAt, expireAt: Timestamp.fromMillis(value.expiresAt) });
        return { uid: value.uid, returnPath };
      });
    },
  };
}
