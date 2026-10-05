import { isSecret } from '../native-auth/protocol';
import { nativeBrowserAuthGate } from '../native-auth/browser-gate';

type Scope = {
  squadNativeAuthCapabilities?: { version?: unknown; providers?: unknown; appleDeletion?: unknown };
  webkit?: { messageHandlers?: { squadNativeAuth?: { postMessage(value: unknown): Promise<unknown> } } };
};
export async function requestNativeAppleDeletion(scope: Scope, token: string, fetcher: typeof fetch = fetch, requestID = () => crypto.randomUUID()): Promise<{ purgeAt: string }> {
  const capabilities = scope.squadNativeAuthCapabilities, bridge = scope.webkit?.messageHandlers?.squadNativeAuth;
  if (capabilities?.version !== 1 || capabilities.appleDeletion !== true || !Array.isArray(capabilities.providers) || !capabilities.providers.includes('apple.com') || !bridge) throw Error('Update The Squad on your iPhone to confirm Apple account deletion. No deletion was started.');
  const release = nativeBrowserAuthGate.acquire();
  if (!release) throw Error('Finish the current account operation before trying again.');
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const id = requestID();
  try {
    const response = await fetcher('/api/account/apple-deletion/prepare', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: '{}', cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const value = await response.json();
    if (!response.ok || !isSecret(value.handle) || !Number.isFinite(value.expiresAt) || value.expiresAt <= Date.now()) throw Error('Apple deletion confirmation is unavailable. Please try again.');
    const result = await Promise.race([
      bridge.postMessage({ version: 1, type: 'deleteAppleAccount', requestId: id, handle: value.handle }),
      new Promise((_, reject) => { timeout = setTimeout(() => {
        void bridge.postMessage({ version: 1, type: 'cancel', requestId: id }).catch(() => undefined);
        reject(Error('Deletion could not be confirmed. Refresh before trying again.'));
      }, Math.min(300000, value.expiresAt - Date.now())); }),
    ]) as { version?: unknown; requestId?: unknown; type?: unknown; purgeAt?: unknown } | null;
    if (result?.version !== 1 || result.requestId !== id || result.type !== 'deleted' || typeof result.purgeAt !== 'string' || !Number.isFinite(Date.parse(result.purgeAt))) {
      if (result?.requestId === id && result.type === 'cancelled') throw Error('Apple confirmation was cancelled.');
      throw Error('Deletion could not be confirmed. Refresh before trying again.');
    }
    return { purgeAt: result.purgeAt };
  } finally { clearTimeout(timeout); release(); }
}
