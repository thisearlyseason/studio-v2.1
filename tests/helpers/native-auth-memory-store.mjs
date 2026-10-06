import { NativeAuthError } from '../../src/lib/native-auth/protocol.ts';
export function memoryAttemptStore(now) {
  const records = new Map();
  return {
    records,
    async create(handle, value) { if (records.has(handle)) throw new NativeAuthError('unavailable'); records.set(handle, structuredClone(value)); },
    async read(handle) { return structuredClone(records.get(handle) || null); },
    async markReady(handle, expected, identity) {
      const value = records.get(handle);
      if (!value || value.state !== 'pending' || value.expiresAt <= now() || JSON.stringify(value) !== JSON.stringify(expected)) return false;
      records.set(handle, { ...value, state: 'ready', uid: identity.uid, authTime: identity.authTime });
      return true;
    },
    async consume(handle, challenge, time, user) {
      const value = records.get(handle);
      if (!value || value.state !== 'ready' || value.webChallenge !== challenge || value.expiresAt <= time || value.uid !== user.uid) throw new NativeAuthError('invalid_attempt');
      records.set(handle, { state: 'consumed', uid: value.uid, expiresAt: value.expiresAt });
      return { uid: value.uid, returnPath: null };
    },
  };
}
