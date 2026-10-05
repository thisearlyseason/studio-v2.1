import { safeReturnPath } from '../app-distribution';
import { parseBegin, parseReply, parseRedeem, type Begin, type NativeReply, type NativeOnboarding, type Provider, type Ready } from './protocol';

export type NativeAuthState = { phase: 'idle' | 'working' | 'onboarding' | 'verified' | 'failed'; returnPath?: string | null; locked?: boolean };
export type NativeAuthTransport = { begin(message: Begin): Promise<NativeReply>; cancel(requestId: string): void };
type Dependencies = {
  transport: NativeAuthTransport; fetcher: typeof fetch;
  auth: { signIn(token: string): Promise<{ uid: string }>; signOut(): Promise<void>; persist?(): Promise<void> };
  session: { establish(): Promise<void>; readUid(): Promise<string>; clear(): Promise<void> };
  random: { secret(): string; requestId(): string; hash(raw: string): Promise<string> };
  onState(state: NativeAuthState): void;
};
type Operation = {
  id: string; verifier: string; cancelled: boolean; expired: boolean; authStarted: boolean; verified: boolean;
  ready?: Ready; running?: Promise<void>; abort: AbortController; stop: Promise<void>; release(): void;
  timer?: ReturnType<typeof setTimeout>;
};

export function createNativeAuthClient(deps: Dependencies) {
  let active: Operation | null = null, disposed = false;
  const emit = (state: NativeAuthState) => { if (!disposed) deps.onState(state); };
  const assertCurrent = (op: Operation) => { if (active !== op || op.cancelled || disposed) throw new Error('cancelled'); };
  const finish = (op: Operation) => {
    clearTimeout(op.timer);
    op.verifier = '';
    op.ready = undefined;
    if (active === op) active = null;
  };
  const run = (op: Operation, work: () => Promise<void>): Promise<void> => {
    const operation = (async () => {
      try { await work(); }
      catch {
        if (op.authStarted && !op.verified) {
          const cleanup = await Promise.allSettled([deps.auth.signOut(), deps.session.clear()]);
          if (cleanup.some(result => result.status === 'rejected')) {
            // Keep the lock: accepting a new account before cleanup risks mixing identities.
            clearTimeout(op.timer);
            op.verifier = '';
            emit({ phase: 'failed', locked: true });
            return;
          }
        }
        emit({ phase: op.cancelled && !op.expired ? 'idle' : 'failed' });
        finish(op);
      } finally {
        op.running = undefined;
      }
    })();
    op.running = operation;
    return operation;
  };
  const exchange = async (op: Operation, onboarding?: NativeOnboarding) => {
    assertCurrent(op);
    if (!op.ready) throw new Error('No handoff');
    const payload = parseRedeem({ version: 1, handle: op.ready.handle, webVerifier: op.verifier, ...(onboarding ? { onboarding } : {}) });
    const response = await deps.fetcher('/api/native-auth/redeem', { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: op.abort.signal });
    assertCurrent(op);
    if (!response.ok) throw new Error('Exchange failed');
    const data: unknown = await response.json();
    assertCurrent(op);
    if (!data || typeof data !== 'object' || !('uid' in data) || typeof data.uid !== 'string' || !data.uid || data.uid.length > 128 ||
        !('customToken' in data) || typeof data.customToken !== 'string' || !data.customToken || data.customToken.length > 16384 ||
        !('returnPath' in data) || (data.returnPath !== null && typeof data.returnPath !== 'string')) throw new Error('Invalid exchange');
    op.authStarted = true;
    const user = await deps.auth.signIn(data.customToken);
    assertCurrent(op);
    if (user.uid !== data.uid) throw new Error('Wrong identity');
    await deps.session.establish();
    assertCurrent(op);
    if (await deps.session.readUid() !== data.uid) throw new Error('Wrong session');
    assertCurrent(op);
    await deps.auth.persist?.();
    assertCurrent(op);
    op.verified = true;
    const returnPath = data.returnPath === null ? null : safeReturnPath(data.returnPath, 'store');
    finish(op);
    emit({ phase: 'verified', returnPath });
  };
  const cancel = async (expired = false) => {
    const op = active;
    if (!op) return;
    op.cancelled = true; op.expired = expired;
    op.abort.abort(); op.release();
    try { deps.transport.cancel(op.id); } catch { /* Remote cancellation is best-effort; local generation is authoritative. */ }
    if (op.running) await op.running;
    else if (!op.authStarted) { finish(op); emit({ phase: expired ? 'failed' : 'idle' }); }
  };
  return {
    async begin(provider: Provider): Promise<void> {
      if (active) throw new Error('Sign-in already in progress');
      if (disposed) throw new Error('Sign-in unavailable');
      let release!: () => void;
      const stop = new Promise<void>(resolve => { release = resolve; });
      const op: Operation = { id: deps.random.requestId(), verifier: deps.random.secret(), cancelled: false, expired: false, authStarted: false, verified: false, abort: new AbortController(), stop, release };
      active = op;
      op.timer = setTimeout(() => { void cancel(true); }, 300000);
      emit({ phase: 'working' });
      return run(op, async () => {
        const challenge = await deps.random.hash(op.verifier);
        assertCurrent(op);
        const message = parseBegin({ version: 1, type: 'begin', requestId: op.id, provider, webChallenge: challenge });
        const raw = await Promise.race([deps.transport.begin(message), op.stop.then(() => null)]);
        assertCurrent(op);
        const reply = parseReply(raw);
        if (reply.requestId !== op.id) throw new Error('Replaced document');
        if (reply.type === 'cancelled') { finish(op); emit({ phase: 'idle' }); return; }
        if (reply.type !== 'ready') throw new Error('Provider failed');
        op.ready = reply;
        if (reply.needsOnboarding) { emit({ phase: 'onboarding' }); return; }
        await exchange(op);
      });
    },
    async submitOnboarding(input: NativeOnboarding): Promise<void> {
      const op = active;
      if (!op?.ready?.needsOnboarding || op.running || op.cancelled) throw new Error('No onboarding attempt');
      emit({ phase: 'working' });
      return run(op, () => exchange(op, input));
    },
    cancel: () => cancel(),
    async dispose(): Promise<boolean> { disposed = true; await cancel(); return active === null; },
  };
}
