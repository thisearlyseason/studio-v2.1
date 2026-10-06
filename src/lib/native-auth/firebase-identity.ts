import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { isAccountAccessBlocked } from '../account-access-policy';
import { NativeAuthError, type Provider } from './protocol';
import type { IdentityService } from './attempt-service';

type NativeAuthAdmin = Pick<Auth, 'verifyIdToken' | 'getUser' | 'createCustomToken'>;
const errorCode = (error: unknown): string => typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';

export function createFirebaseIdentity(auth: NativeAuthAdmin, db: Firestore): IdentityService {
  return {
    async verify(idToken) {
      try {
        const decoded = await auth.verifyIdToken(idToken, true);
        return { uid: decoded.uid, provider: decoded.firebase.sign_in_provider as Provider, authTime: decoded.auth_time, emailVerified: decoded.email_verified === true };
      } catch (error) {
        const code = errorCode(error);
        throw new NativeAuthError(['auth/id-token-expired', 'auth/id-token-revoked', 'auth/argument-error', 'auth/invalid-id-token', 'auth/user-disabled', 'auth/user-not-found'].includes(code) ? 'invalid_identity' : 'unavailable');
      }
    },
    async checkActive(uid) {
      try {
        const user = await auth.getUser(uid);
        const profile = await db.collection('users').doc(uid).get();
        if (user.disabled || !user.emailVerified || (profile.exists && isAccountAccessBlocked(profile.data()))) throw new NativeAuthError('account_unavailable');
        return { user, hasProfile: profile.exists };
      } catch (error) {
        if (error instanceof NativeAuthError) throw error;
        throw new NativeAuthError(errorCode(error) === 'auth/user-not-found' ? 'account_unavailable' : 'unavailable');
      }
    },
    async mint(uid) {
      try { return await auth.createCustomToken(uid); }
      catch { throw new NativeAuthError('unavailable'); }
    },
  };
}
