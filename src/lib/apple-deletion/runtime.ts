import { readNativeAuthConfig } from '../native-auth/config';
import { AppleDeletionError, createAppleDeletionService, type AppleDeletionIntent, type AppleDeletionStore } from './service';
import { createAppleDeletionHandler, revokeAppleCredential, type AppleDeletionAction } from './http';
import { appleDeletionAPIKey } from './config';

export async function appleDeletionRequest(action: AppleDeletionAction, request: Request): Promise<Response> {
  const config = readNativeAuthConfig(process.env);
  if (!config?.providers.includes('apple.com')) return Response.json({ error: 'unavailable' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  try {
    const [{ ensureAdminInit, adminDb, getAdminProjectId }, { getAuth }, { Timestamp }, { randomSecret }, { createAccountDeletionActions }, { isAccountAccessBlocked }, { enforceUserRateLimit }, { createNativeAuthLimiter }] = await Promise.all([
      import('../firebase-admin'), import('firebase-admin/auth'), import('firebase-admin/firestore'), import('../native-auth/server-crypto'),
      import('../server-account-deletion'), import('../account-access-policy'), import('../server-request-guards'), import('../native-auth/rate-limit'),
    ]);
    ensureAdminInit();
    const apiKey = appleDeletionAPIKey(process.env, getAdminProjectId());
    if (!apiKey) throw new AppleDeletionError('unavailable');
    const auth = getAuth(), lifecycle = createAccountDeletionActions(adminDb, auth);
    const ref = (key: string) => adminDb.collection('nativeAuthAttempts').doc(key);
    const readIntent = (raw: FirebaseFirestore.DocumentData | undefined): AppleDeletionIntent | undefined => raw?.purpose === 'apple-deletion' ? raw as AppleDeletionIntent : undefined;
    const store: AppleDeletionStore = {
      async create(key, intent) { await ref(key).create({ ...intent, purpose: 'apple-deletion', expireAt: Timestamp.fromMillis(intent.expiresAt) }); },
      async read(key) { return readIntent((await ref(key).get()).data()); },
      async claim(key, uid, now) { return adminDb.runTransaction(async transaction => {
        const target = ref(key), data = readIntent((await transaction.get(target)).data());
        if (!data || data.uid !== uid || data.status !== 'ready' || data.expiresAt <= now) return false;
        transaction.update(target, { status: 'processing' }); return true;
      }); },
      async finish(key, status, purgeAt) { await ref(key).update({ status, ...(purgeAt ? { purgeAt } : {}) }); },
    };
    const limiter = createNativeAuthLimiter(enforceUserRateLimit, process.env.VERCEL === '1');
    const service = createAppleDeletionService({
      store, now: Date.now, random: randomSecret, ...lifecycle,
      async identify(token, recovery = false) {
        try {
          // A server-proven revocation receipt may need to finish disabling this
          // same account after its tokens were already revoked. This exception
          // grants no session/access and is never used to prepare a new intent.
          const decoded = await auth.verifyIdToken(token, !recovery), user = await auth.getUser(decoded.uid);
          const profile = await adminDb.collection('users').doc(decoded.uid).get();
          const data = profile.data();
          const appleSubject = user.providerData.find(provider => provider.providerId === 'apple.com')?.uid;
          const deletionPending = recovery && ['pending', 'completed'].includes(data?.deletionStatus);
          if (user.disabled && !deletionPending || !user.emailVerified || !appleSubject || !profile.exists || isAccountAccessBlocked(deletionPending ? { ...data, deletionStatus: undefined } : data)) throw new AppleDeletionError('invalid_identity');
          if (decoded.firebase.sign_in_provider === 'apple.com' && !decoded.firebase.identities?.['apple.com']?.includes(appleSubject)) throw new AppleDeletionError('invalid_identity');
          await limiter.beforeComplete(decoded.uid);
          return { uid: decoded.uid, appleSubject, provider: decoded.firebase.sign_in_provider, authTime: decoded.auth_time };
        } catch { throw new AppleDeletionError('invalid_identity'); }
      },
      revoke: (token, code, type) => revokeAppleCredential(apiKey, token, code, type),
    });
    return createAppleDeletionHandler({ origin: config.origin, service, limit: (r, a) => limiter.publicLimit(r, a === 'prepare' ? 'start' : 'complete') })(action, request);
  } catch { return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
