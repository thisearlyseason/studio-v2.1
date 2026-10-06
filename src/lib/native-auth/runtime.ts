import { readNativeAuthConfig } from './config';
import { createNativeAuthHandlers } from './http';

/** Config denial precedes Admin imports/initialization, including on the web build. */
export async function nativeAuthRequest(action: 'start' | 'complete' | 'redeem', request: Request): Promise<Response> {
  const config = readNativeAuthConfig(process.env);
  if (!config) return Response.json({ error: 'unavailable' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  try {
    const [{ ensureAdminInit, adminDb }, { getAuth }, { enforceUserRateLimit }, { createNativeAuthLimiter }, { createAttemptService }, { createFirestoreAttemptStore }, { createFirebaseIdentity }, { randomSecret }] = await Promise.all([
      import('../firebase-admin'), import('firebase-admin/auth'), import('../server-request-guards'),
      import('./rate-limit'), import('./attempt-service'), import('./firestore-attempt-store'), import('./firebase-identity'), import('./server-crypto'),
    ]);
    ensureAdminInit();
    const limiter = createNativeAuthLimiter(enforceUserRateLimit, process.env.VERCEL === '1');
    const service = createAttemptService({ now: Date.now, random: randomSecret, store: createFirestoreAttemptStore(adminDb), identity: createFirebaseIdentity(getAuth(), adminDb), beforeComplete: limiter.beforeComplete, allowedProviders: config.providers });
    return createNativeAuthHandlers({ config, service, publicLimit: limiter.publicLimit })[action](request);
  } catch {
    return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
