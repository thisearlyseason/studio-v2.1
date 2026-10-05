export type StorePackage = { id: string; productId: string; title: string; price: string; period: string };
export type BillingReply = { requestId: string; packages?: StorePackage[]; existingSubscription?: boolean; cancelled?: boolean; error?: string };
type Bridge = { postMessage(message: string): void; onmessage?: (event: { data: string }) => void };
type BillingWindow = Window & {
  squadNativeBilling?: Bridge;
  webkit?: { messageHandlers?: { squadNativeBilling?: { postMessage(message: unknown): Promise<BillingReply> } } };
};
let pending = false;
export function hasNativeBilling() {
  if (typeof window === 'undefined') return false;
  const scope = window as BillingWindow;
  return Boolean(scope.webkit?.messageHandlers?.squadNativeBilling || scope.squadNativeBilling);
}
export async function nativeBilling(action: 'catalog' | 'purchase' | 'restore' | 'manage', token: string, packageId?: string): Promise<BillingReply> {
  if (pending) throw new Error('Another store operation is in progress.');
  const scope = window as BillingWindow;
  const ios = scope.webkit?.messageHandlers?.squadNativeBilling, android = scope.squadNativeBilling;
  if (!ios && !android) throw new Error('Update The Squad from your app store to use in-app subscriptions.');
  const requestId = crypto.randomUUID();
  const message = { version: 1, requestId, action, token, packageId };
  pending = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const operation = ios ? ios.postMessage(message) : new Promise<BillingReply>((resolve, reject) => {
      android!.onmessage = event => {
        try {
          const value = JSON.parse(event.data);
          if (value.requestId === requestId) resolve(value);
        } catch { /* Ignore malformed replies and responses to retired requests. */ }
      };
      try { android!.postMessage(JSON.stringify(message)); } catch (error) { reject(error); }
    });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('The store has not responded. Check your subscriptions or restore purchases before trying again.')), 180000);
    });
    const reply = await Promise.race([operation, timeout]);
    if (reply.requestId !== requestId) throw new Error('Invalid store response.');
    if (reply.error) throw new Error(reply.error);
    return reply;
  } finally {
    clearTimeout(timer);
    if (android) android.onmessage = undefined;
    pending = false;
  }
}
