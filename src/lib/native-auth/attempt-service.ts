import type { UserRecord } from 'firebase-admin/auth';
import { NativeAuthError, parseStart, parseComplete, parseRedeem, type Start, type Complete, type Redeem, type Provider, type NativeOnboarding } from './protocol';
import { hashSecret, matchesSecret } from './server-crypto';

export type Attempt = {
  provider: Provider; createdAt: number; expiresAt: number;
  state: 'pending' | 'ready' | 'consumed';
  webChallenge?: string; nativeChallenge?: string; uid?: string; authTime?: number;
};
export type VerifiedIdentity = { uid: string; provider: Provider; authTime: number; emailVerified: boolean };
export interface IdentityService {
  verify(idToken: string): Promise<VerifiedIdentity>;
  checkActive(uid: string): Promise<{ user: UserRecord; hasProfile: boolean }>;
  mint(uid: string): Promise<string>;
}
export interface AttemptStore {
  create(handle: string, value: Attempt): Promise<void>;
  read(handle: string): Promise<Attempt | null>;
  markReady(handle: string, expected: Attempt, identity: VerifiedIdentity): Promise<boolean>;
  consume(handle: string, webChallenge: string, now: number, currentUser: UserRecord, onboarding?: NativeOnboarding): Promise<{ uid: string; returnPath: string | null }>;
}
export type AttemptDependencies = {
  now: () => number; random: () => string; store: AttemptStore; identity: IdentityService;
  beforeComplete?: (uid: string) => Promise<void>;
  allowedProviders?: readonly Provider[];
};

export function assertCurrentIdentity(user: UserRecord, uid: string, authTime: number): void {
  const revokedAt = user.tokensValidAfterTime ? Date.parse(user.tokensValidAfterTime) : 0;
  if (user.uid !== uid || user.disabled || !user.emailVerified || !Number.isFinite(authTime) || !Number.isFinite(revokedAt) || revokedAt > authTime * 1000) {
    throw new NativeAuthError('account_unavailable');
  }
}

async function sanitized<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); }
  catch (error) { throw error instanceof NativeAuthError ? error : new NativeAuthError('unavailable'); }
}

export function createAttemptService(deps: AttemptDependencies) {
  const allowed = (provider: Provider) => (deps.allowedProviders ?? ['google.com', 'apple.com']).includes(provider);
  const active = (value: Attempt | null, state: Attempt['state']): value is Attempt =>
    !!value && allowed(value.provider) && value.state === state && Number.isFinite(value.expiresAt) && value.expiresAt > deps.now();
  return {
    start(input: Start) {
      return sanitized(async () => {
        const parsed = parseStart(input), createdAt = deps.now(), handle = deps.random();
        if (!allowed(parsed.provider)) throw new NativeAuthError('invalid_request');
        const expiresAt = createdAt + 300000;
        await deps.store.create(handle, { provider: parsed.provider, webChallenge: parsed.webChallenge, nativeChallenge: parsed.nativeChallenge, createdAt, expiresAt, state: 'pending' });
        return { handle, expiresAt };
      });
    },
    complete(input: Complete, idToken: string) {
      return sanitized(async () => {
        const parsed = parseComplete(input), attempt = await deps.store.read(parsed.handle);
        if (!active(attempt, 'pending') || !matchesSecret(parsed.nativeSecret, attempt.nativeChallenge || '')) throw new NativeAuthError('invalid_attempt');
        const identity = await deps.identity.verify(idToken);
        if (!identity.uid || identity.uid.length > 128 || /[/\u0000-\u001f\u007f]/.test(identity.uid) ||
            identity.provider !== attempt.provider || !['google.com', 'apple.com'].includes(identity.provider) ||
            !identity.emailVerified || !Number.isFinite(identity.authTime) ||
            identity.authTime * 1000 < attempt.createdAt - 60000 || identity.authTime * 1000 > deps.now() + 60000) {
          throw new NativeAuthError('invalid_identity');
        }
        const current = await deps.identity.checkActive(identity.uid);
        assertCurrentIdentity(current.user, identity.uid, identity.authTime);
        await deps.beforeComplete?.(identity.uid);
        if (!active(attempt, 'pending') || !await deps.store.markReady(parsed.handle, attempt, identity)) throw new NativeAuthError('invalid_attempt');
        return { needsOnboarding: !current.hasProfile };
      });
    },
    redeem(input: Redeem) {
      return sanitized(async () => {
        const parsed = parseRedeem(input), attempt = await deps.store.read(parsed.handle);
        if (!active(attempt, 'ready') || !attempt.uid || !matchesSecret(parsed.webVerifier, attempt.webChallenge || '')) throw new NativeAuthError('invalid_attempt');
        const current = await deps.identity.checkActive(attempt.uid);
        assertCurrentIdentity(current.user, attempt.uid, attempt.authTime ?? NaN);
        const consumed = await deps.store.consume(parsed.handle, hashSecret(parsed.webVerifier), deps.now(), current.user, parsed.onboarding);
        // A committed consume precedes minting; failures must never reopen it.
        const customToken = await deps.identity.mint(consumed.uid);
        if (!customToken || attempt.expiresAt <= deps.now()) throw new NativeAuthError('unavailable');
        return { customToken, ...consumed };
      });
    },
  };
}
export type AttemptService = ReturnType<typeof createAttemptService>;
