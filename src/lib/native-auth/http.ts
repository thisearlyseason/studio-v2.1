import { readJsonBodyWithLimit, RequestBodyError } from '../bounded-json';
import { NativeAuthError, parseStart, parseComplete, parseRedeem, type NativeAuthErrorCode } from './protocol';
import type { NativeAuthConfig } from './config';
import type { AttemptService } from './attempt-service';

type Action = 'start' | 'complete' | 'redeem';
type Dependencies = { config: NativeAuthConfig | null; service: AttemptService; publicLimit: (request: Request, action: Action) => Promise<void> };
const statuses: Record<NativeAuthErrorCode, number> = { invalid_request: 400, invalid_attempt: 409, invalid_identity: 401, account_unavailable: 403, onboarding_required: 409, unavailable: 503, rate_limited: 429 };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', ...(status === 429 ? { 'Retry-After': '300' } : {}) } });

export function createNativeAuthHandlers(deps: Dependencies) {
  const handle = async (action: Action, request: Request): Promise<Response> => {
    if (!deps.config) return json({ error: 'unavailable' }, 404);
    try {
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      const url = new URL(request.url), origin = request.headers.get('Origin');
      if (url.origin !== deps.config.origin || url.pathname !== `/api/native-auth/${action}` || url.search ||
          (origin !== null && origin !== deps.config.origin) || (action === 'redeem' && origin !== deps.config.origin)) return json({ error: 'forbidden' }, 403);
      if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return json({ error: 'unsupported_media_type' }, 415);
      const payload = await readJsonBodyWithLimit(request, 4096);
      if (action === 'start') {
        const input = parseStart(payload);
        if (!deps.config.providers.includes(input.provider)) throw new NativeAuthError('invalid_request');
        await deps.publicLimit(request, action);
        return json(await deps.service.start(input));
      }
      if (action === 'complete') {
        const input = parseComplete(payload), authorization = request.headers.get('Authorization') || '';
        if (authorization.length > 8192 || !/^Bearer [^\s]+$/.test(authorization)) throw new NativeAuthError('invalid_identity');
        await deps.publicLimit(request, action);
        return json(await deps.service.complete(input, authorization.slice(7)));
      }
      const input = parseRedeem(payload);
      await deps.publicLimit(request, action);
      return json(await deps.service.redeem(input));
    } catch (error) {
      if (error instanceof RequestBodyError) return json({ error: 'invalid_request' }, error.status);
      const code = error instanceof NativeAuthError ? error.code : 'unavailable';
      return json({ error: code }, statuses[code]);
    }
  };
  return { start: (request: Request) => handle('start', request), complete: (request: Request) => handle('complete', request), redeem: (request: Request) => handle('redeem', request) };
}
