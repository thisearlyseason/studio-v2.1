import { createHash } from 'node:crypto';
import { isSecret } from '../native-auth/protocol';

export type AppleDeletionIdentity = { uid: string; appleSubject: string; provider: string; authTime: number };
export type AppleDeletionIntent = { uid: string; appleSubject: string; expiresAt: number; status: 'ready' | 'processing' | 'revoked' | 'completed' | 'failed'; purgeAt?: string };
export type AppleDeletionStore = {
  create(key: string, intent: AppleDeletionIntent): Promise<void>;
  read(key: string): Promise<AppleDeletionIntent | undefined>;
  claim(key: string, uid: string, now: number): Promise<boolean>;
  finish(key: string, status: AppleDeletionIntent['status'], purgeAt?: string): Promise<void>;
};
type Dependencies = {
  now(): number; random(): string; store: AppleDeletionStore;
  identify(token: string, recovery?: boolean): Promise<AppleDeletionIdentity>;
  eligible(uid: string): Promise<void>;
  revoke(token: string, credential: string, type: 'CODE' | 'ACCESS_TOKEN'): Promise<void>;
  schedule(uid: string): Promise<string>;
};
export class AppleDeletionError extends Error {
  constructor(readonly code: 'invalid_request' | 'invalid_intent' | 'invalid_identity' | 'revocation_failed' | 'unavailable') { super(code); }
}
const keyFor = (handle: string) => {
  if (!isSecret(handle)) throw new AppleDeletionError('invalid_request');
  return 'delete_' + createHash('sha256').update(handle).digest('hex');
};

export function createAppleDeletionService(deps: Dependencies) {
  const read = async (handle: string, recovery = false) => {
    const key = keyFor(handle), intent = await deps.store.read(key);
    if (!intent || !(intent.status === 'ready' || recovery && ['revoked', 'completed'].includes(intent.status)) || intent.expiresAt <= deps.now()) throw new AppleDeletionError('invalid_intent');
    return { key, intent };
  };
  return {
    async prepare(token: string) {
      const identity = await deps.identify(token);
      if (!identity.uid || !identity.appleSubject) throw new AppleDeletionError('invalid_identity');
      await deps.eligible(identity.uid);
      const handle = deps.random(), expiresAt = deps.now() + 300000;
      await deps.store.create(keyFor(handle), { uid: identity.uid, appleSubject: identity.appleSubject, expiresAt, status: 'ready' });
      return { handle, expiresAt };
    },
    async challenge(handle: string) {
      const { intent } = await read(handle);
      return { uid: intent.uid, appleSubject: intent.appleSubject };
    },
    async complete(handle: string, token: string, credential: string, type: string) {
      if (typeof credential !== 'string' || !credential.length || credential.length > 2048 || /\s/.test(credential) || !['CODE', 'ACCESS_TOKEN'].includes(type)) throw new AppleDeletionError('invalid_request');
      const { key, intent } = await read(handle, true);
      const recovering = intent.status === 'revoked' || intent.status === 'completed';
      const identity = await deps.identify(token, recovering);
      const age = deps.now() - identity.authTime * 1000;
      if (identity.uid !== intent.uid || identity.appleSubject !== intent.appleSubject || identity.provider !== 'apple.com' || !Number.isFinite(age) || age < -60000 || age > 300000) throw new AppleDeletionError('invalid_identity');
      if (intent.status === 'completed' && intent.purgeAt) return { purgeAt: intent.purgeAt };
      await deps.eligible(intent.uid);
      if (!recovering) {
        if (!await deps.store.claim(key, intent.uid, deps.now())) throw new AppleDeletionError('invalid_intent');
        try { await deps.revoke(token, credential, type as 'CODE' | 'ACCESS_TOKEN'); }
        catch {
          await deps.store.finish(key, 'failed');
          throw new AppleDeletionError('revocation_failed');
        }
        // Only this durable provider-success receipt allows recovery. Never infer
        // successful revocation from a timeout or a processing/failed attempt.
        await deps.store.finish(key, 'revoked');
        // The provider round trip is not an authorization lock. Recheck changes
        // to ownership/billing before committing the existing deletion lifecycle.
        await deps.eligible(intent.uid);
      }
      const purgeAt = await deps.schedule(intent.uid);
      await deps.store.finish(key, 'completed', purgeAt);
      return { purgeAt };
    },
  };
}
