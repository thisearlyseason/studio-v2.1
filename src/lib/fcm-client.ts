/**
 * FCM Client Utilities
 * Handles requesting push notification permission, getting the FCM token,
 * and storing it in Firestore under users/{uid}.fcmTokens (array).
 *
 * Usage: call initFCM(userId) after the user signs in.
 */

import { getApp } from 'firebase/app';
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging';
import { getAuth } from 'firebase/auth';
import { registerPrimaryServiceWorker } from '@/lib/service-worker-registration';

const VAPID_KEY = process.env.NEXT_PUBLIC_FCM_VAPID_KEY;

async function updateRegisteredDevice(
  token: string,
  method: 'POST' | 'DELETE'
): Promise<void> {
  const currentUser = getAuth(getApp()).currentUser;
  if (!currentUser) throw new Error('A signed-in account is required.');
  const idToken = await currentUser.getIdToken();
  const response = await fetch('/api/notifications/device', {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ token }),
  });
  if (!response.ok) throw new Error('Unable to register this device for notifications.');
}

/**
 * Request notification permission, get FCM token, store in Firestore.
 * Safe to call multiple times — only stores if token changed.
 * Returns the FCM token or null if permission denied / not supported.
 */
export async function initFCM(userId: string): Promise<string | null> {
  // Only works in browser, not in SSR
  if (typeof window === 'undefined') return null;
  if (!('Notification' in window)) return null;

  try {
    if (!(await isSupported())) return null;
    const currentUser = getAuth(getApp()).currentUser;
    if (!currentUser || currentUser.uid !== userId) return null;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('[FCM] Notification permission denied');
      return null;
    }

    const app = getApp();
    const messaging = getMessaging(app);

    // Register service worker for FCM
    const registration = await registerPrimaryServiceWorker();
    if (!registration) return null;

    const token = await getToken(messaging, {
      ...(VAPID_KEY ? { vapidKey: VAPID_KEY } : {}),
      serviceWorkerRegistration: registration,
    });

    if (token) {
      await updateRegisteredDevice(token, 'POST');
    }

    return token ?? null;
  } catch (err) {
    console.warn('[FCM] Init failed:', err);
    return null;
  }
}

/**
 * Remove the current device's FCM token from Firebase Messaging and from
 * the user's Firestore document. Call this during sign-out to prevent
 * stale tokens accumulating across sessions and devices.
 */
export async function deleteFCMToken(userId: string): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if (!(await isSupported())) return;
    const app = getApp();
    if (getAuth(app).currentUser?.uid !== userId) return;
    const messaging = getMessaging(app);
    // Get current token before deleting
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) return;

    const currentToken = await getToken(messaging, {
      ...(VAPID_KEY ? { vapidKey: VAPID_KEY } : {}),
      serviceWorkerRegistration: registration,
    }).catch(() => null);

    // Delete from Firebase Messaging (deregisters this device)
    await import('firebase/messaging').then(({ deleteToken }) =>
      deleteToken(messaging)
    ).catch(() => {});

    // Remove from Firestore token array
    if (currentToken) {
      await updateRegisteredDevice(currentToken, 'DELETE').catch(() => {});
    }
  } catch (err) {
    // Non-critical — don't block logout
    console.warn('[FCM] Token cleanup failed (non-critical):', err);
  }
}

/**
 * Listen for FCM messages received while app is in foreground.
 * Shows a toast-style notification since the service worker only handles
 * messages when the app is backgrounded.
 * Returns an unsubscribe function.
 */
export function onForegroundMessage(
  callback: (payload: { title?: string; body?: string; url?: string }) => void
): () => void {
  if (typeof window === 'undefined') return () => {};
  try {
    const app = getApp();
    const messaging = getMessaging(app);
    return onMessage(messaging, (payload) => {
      const { title, body } = payload.notification ?? {};
      const url = payload.fcmOptions?.link;
      callback({ title, body, url });
    });
  } catch {
    return () => {};
  }
}

/**
 * Helper: send a push notification to a list of FCM tokens via our /api/notify route.
 * Call this server-side or from an authenticated client action.
 */
export async function sendPushToTokens({
  tokens,
  title,
  body,
  url,
  idToken,
}: {
  tokens: string[];
  title: string;
  body: string;
  url?: string;
  idToken: string;
}) {
  if (!tokens.length) return;
  await fetch('/api/notify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ tokens, title, body, url }),
  });
}

/**
 * Helper: send a Resend email notification via /api/email/send.
 */
export async function sendEmailNotification({
  to,
  subject,
  html,
  idToken,
}: {
  to: string | string[];
  subject: string;
  html: string;
  idToken: string;
}) {
  await fetch('/api/email/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ to, subject, html }),
  });
}
