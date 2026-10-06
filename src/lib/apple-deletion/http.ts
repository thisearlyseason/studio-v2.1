import { z } from 'zod';
import { readJsonBodyWithLimit, RequestBodyError } from '../bounded-json';
import { isSecret } from '../native-auth/protocol';
import { AccountDeletionError } from '../server-account-deletion';
import { AppleDeletionError, type createAppleDeletionService } from './service';

export type AppleDeletionAction = 'prepare' | 'challenge' | 'complete';
const handleSchema = z.string().refine(isSecret);
const schemas = {
  prepare: z.object({}).strict(),
  challenge: z.object({ handle: handleSchema }).strict(),
  complete: z.object({ handle: handleSchema, credential: z.string().min(1).max(2048).regex(/^\S+$/), credentialType: z.enum(['CODE', 'ACCESS_TOKEN']) }).strict(),
};
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export function createAppleDeletionHandler(deps: { origin: string; service: ReturnType<typeof createAppleDeletionService>; limit(request: Request, action: AppleDeletionAction): Promise<void> }) {
  return async (action: AppleDeletionAction, request: Request) => {
    try {
      const url = new URL(request.url), origin = request.headers.get('origin');
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      if (url.origin !== deps.origin || url.pathname !== `/api/account/apple-deletion/${action}` || url.search || (origin !== null && origin !== deps.origin) || (action === 'prepare' && origin !== deps.origin)) return json({ error: 'forbidden' }, 403);
      if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return json({ error: 'invalid_request' }, 415);
      const body = schemas[action].safeParse(await readJsonBodyWithLimit(request, 4096));
      if (!body.success) return json({ error: 'invalid_request' }, 400);
      const bearer = request.headers.get('authorization') || '';
      if (action !== 'challenge' && (bearer.length > 8192 || !/^Bearer [^\s]+$/.test(bearer))) return json({ error: 'invalid_identity' }, 401);
      await deps.limit(request, action);
      if (action === 'prepare') return json(await deps.service.prepare(bearer.slice(7)));
      if (action === 'challenge') return json(await deps.service.challenge(schemas.challenge.parse(body.data).handle));
      const value = schemas.complete.parse(body.data);
      return json(await deps.service.complete(value.handle, bearer.slice(7), value.credential, value.credentialType));
    } catch (error) {
      if (error instanceof RequestBodyError) return json({ error: 'invalid_request' }, error.status);
      if (error instanceof AccountDeletionError) return json({ error: error.message }, error.status);
      const code = error instanceof AppleDeletionError ? error.code : 'unavailable';
      return json({ error: code }, code === 'invalid_request' ? 400 : code === 'invalid_identity' ? 401 : code === 'invalid_intent' ? 409 : 503);
    }
  };
}

/** Same provider API used by the pinned Firebase SDK. No raw provider errors escape. */
export async function revokeAppleCredential(apiKey: string, idToken: string, credential: string, tokenType: 'CODE' | 'ACCESS_TOKEN', fetcher: typeof fetch = fetch): Promise<void> {
  if (!apiKey) throw new AppleDeletionError('unavailable');
  try {
    const response = await fetcher('https://identitytoolkit.googleapis.com/v2/accounts:revokeToken?key=' + encodeURIComponent(apiKey), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ providerId: 'apple.com', tokenType, token: credential, idToken }),
    });
    if (!response.ok) throw new Error('rejected');
    await response.body?.cancel();
  } catch { throw new Error('revocation_failed'); }
}
