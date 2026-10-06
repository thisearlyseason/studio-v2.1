import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { NativeAuthError } from './protocol';

type Enforce = (key: string, scope: string, limit: number, windowMs: number) => Promise<Response | null>;
export function createNativeAuthLimiter(enforce: Enforce, vercelIngress: boolean) {
  const digest = (value: string) => createHash('sha256').update(value).digest('hex');
  const limit = async (key: string, scope: string, count: number) => {
    try {
      const denied = await enforce(key, scope, count, 300000);
      if (denied) throw new NativeAuthError(denied.status === 429 ? 'rate_limited' : 'unavailable');
    } catch (error) { throw error instanceof NativeAuthError ? error : new NativeAuthError('unavailable'); }
  };
  return {
    async publicLimit(request: Request, action: 'start' | 'complete' | 'redeem') {
      // Trust this overwritten ingress header only on Vercel, never on arbitrary hosts.
      const forwarded = vercelIngress ? (request.headers.get('x-forwarded-for') || '').trim() : '';
      const address = isIP(forwarded) ? forwarded : 'unknown';
      await limit(digest(address), `native-auth-${action}-source`, action === 'start' ? 10 : 20);
      if (action === 'start') await limit('global', 'native-auth-start-global', 300);
    },
    beforeComplete: (uid: string) => limit(digest(uid), 'native-auth-complete-uid', 10),
  };
}
