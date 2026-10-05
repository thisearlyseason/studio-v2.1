import { parseBegin, parseReply, type Begin, type NativeReply, type Provider } from './protocol';
import type { NativeAuthTransport } from './client';

type AndroidBridge = { postMessage(message: string): void; onmessage?: (event: { data: string }) => void };
type NativeWindow = {
  squadNativeAuthCapabilities?: { version: unknown; providers: unknown };
  squadNativeAuth?: AndroidBridge;
  webkit?: { messageHandlers?: { squadNativeAuth?: { postMessage(message: unknown): Promise<unknown> } } };
};
export function nativeBrowserTransport(scope: NativeWindow): (NativeAuthTransport & { providers: Provider[]; dispose(): void }) | null {
  const capability = scope.squadNativeAuthCapabilities;
  if (capability?.version !== 1 || !Array.isArray(capability.providers) || !capability.providers.length ||
      capability.providers.some(provider => provider !== 'google.com' && provider !== 'apple.com')) return null;
  const providers = [...new Set(capability.providers)] as Provider[];
  const ios = scope.webkit?.messageHandlers?.squadNativeAuth, android = scope.squadNativeAuth;
  if (!ios && !android) return null;
  const pending = new Map<string, (value: NativeReply) => void>();
  const cancelled = (requestId: string): NativeReply => ({ version: 1, type: 'cancelled', requestId });
  if (android && !ios) android.onmessage = event => {
    if (typeof event.data !== 'string' || event.data.length > 4096) return;
    try {
      const reply = parseReply(JSON.parse(event.data)), resolve = pending.get(reply.requestId);
      if (resolve) { pending.delete(reply.requestId); resolve(reply); }
    } catch { /* Unsolicited or malformed native callbacks carry no authority. */ }
  };
  const cancel = (requestId: string) => {
    const message = { version: 1, type: 'cancel', requestId };
    const resolve = pending.get(requestId);
    pending.delete(requestId); resolve?.(cancelled(requestId));
    if (ios) void ios.postMessage(message).catch(() => undefined);
    else android?.postMessage(JSON.stringify(message));
  };
  return {
    providers,
    async begin(input: Begin) {
      const message = parseBegin(input);
      if (!providers.includes(message.provider)) throw new Error('Provider unavailable');
      if (ios) return parseReply(await ios.postMessage(message));
      return new Promise<NativeReply>((resolve, reject) => {
        pending.set(message.requestId, resolve);
        try { android!.postMessage(JSON.stringify(message)); }
        catch { pending.delete(message.requestId); reject(new Error('Provider unavailable')); }
      });
    },
    cancel,
    dispose() {
      for (const id of pending.keys()) cancel(id);
      if (android && !ios) android.onmessage = undefined;
    },
  };
}
