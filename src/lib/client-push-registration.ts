'use client';

import { getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { registerPrimaryServiceWorker } from '@/lib/service-worker-registration';
import { clearDeviceNotifications } from '@/lib/device-notification-presentation';

export type PushTransport = 'web-push';

function decodeVapidPublicKey(value: string | undefined): ArrayBuffer | null {
  if (!value) return null;
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(base64 + padding);
    const bytes = Uint8Array.from(decoded, character => character.charCodeAt(0));
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return buffer;
  } catch {
    return null;
  }
}

function applicationServerKeysMatch(actual: ArrayBuffer | null, expected: ArrayBuffer): boolean {
  if (!actual || actual.byteLength !== expected.byteLength) return false;
  const actualBytes = new Uint8Array(actual);
  const expectedBytes = new Uint8Array(expected);
  return actualBytes.every((value, index) => value === expectedBytes[index]);
}

// Device cleanup must not hold logout indefinitely when token refresh or the
// network stalls. Expired work also cannot send a late registration request.
const DEVICE_REQUEST_TIMEOUT_MS = 5_000;

async function requestDeviceUpdate(
  userId: string,
  method: 'POST' | 'DELETE',
  body: Record<string, unknown>,
): Promise<void> {
  const auth = getAuth(getApp());
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== userId) {
    throw new Error('A signed-in account is required.');
  }
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error('Notification device request timed out.'));
    }, DEVICE_REQUEST_TIMEOUT_MS);
  });
  try {
    await Promise.race([
      (async () => {
        const idToken = await currentUser.getIdToken();
        // Account switching or a finished timeout invalidates the old async
        // operation before it can reclaim the browser endpoint for that user.
        if (auth.currentUser?.uid !== userId) throw new Error('A signed-in account is required.');
        if (controller.signal.aborted) throw new Error('Notification device request timed out.');
        const response = await fetch('/api/notifications/device', {
          method,
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error('Unable to update this device for notifications.');
      })(),
      deadline,
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function updateWebPushSubscription(
  userId: string,
  subscription: PushSubscriptionJSON,
  method: 'POST' | 'DELETE'
): Promise<void> {
  await requestDeviceUpdate(userId, method, { subscription });
}

async function clearLegacyFcmRegistrations(userId: string): Promise<void> {
  await requestDeviceUpdate(userId, 'DELETE', { clearLegacyFcmRegistrations: true });
}

export async function registerPushDevice(userId: string): Promise<PushTransport | null> {
  if (
    typeof window === 'undefined' ||
    !('Notification' in window) ||
    !('PushManager' in window)
  ) {
    return null;
  }

  const vapidPublicKey = decodeVapidPublicKey(process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY);
  if (!vapidPublicKey) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const registration = await registerPrimaryServiceWorker();
  if (!registration) return null;

  let existingSubscription = await registration.pushManager.getSubscription();
  if (
    !existingSubscription ||
    !applicationServerKeysMatch(
      existingSubscription.options.applicationServerKey,
      vapidPublicKey
    )
  ) {
    await clearLegacyFcmRegistrations(userId);
    if (existingSubscription) {
      await updateWebPushSubscription(userId, existingSubscription.toJSON(), 'DELETE').catch(() => {});
      await existingSubscription.unsubscribe();
      existingSubscription = null;
    }
  }

  const subscription = existingSubscription ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidPublicKey,
    }));
  await updateWebPushSubscription(userId, subscription.toJSON(), 'POST');
  return 'web-push';
}

export async function deleteWebPushSubscription(userId: string): Promise<void> {
  const auth = getAuth(getApp());
  if (auth.currentUser && auth.currentUser.uid !== userId) throw new Error('A signed-in account is required.');
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  if (auth.currentUser && auth.currentUser.uid !== userId) throw new Error('A signed-in account is required.');

  try {
    await updateWebPushSubscription(userId, subscription.toJSON(), 'DELETE');
  } finally {
    // Even if the server is temporarily unreachable, invalidate this browser's
    // endpoint so the signed-out device cannot receive future Web Push.
    if (!auth.currentUser || auth.currentUser.uid === userId) await subscription.unsubscribe();
  }
}

export async function deletePushDevice(userId: string): Promise<void> {
  const auth = getAuth(getApp());
  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== userId) {
    throw new Error('A signed-in account is required.');
  }

  const failures: unknown[] = [];
  await clearLegacyFcmRegistrations(userId).catch(error => failures.push(error));
  // A completed old logout must not remove the next account's device/cards.
  if (auth.currentUser && auth.currentUser.uid !== userId) return;
  await deleteWebPushSubscription(userId).catch(error => failures.push(error));
  if (auth.currentUser && auth.currentUser.uid !== userId) return;
  await clearDeviceNotifications();
  if (failures.length > 0) {
    console.warn('[Web Push] Device cleanup was partially unavailable; sign-out will continue.');
  }
}
