'use client';

import { getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { deleteFCMToken, initFCM } from '@/lib/fcm-client';
import { registerPrimaryServiceWorker } from '@/lib/service-worker-registration';

export type PushTransport = 'fcm' | 'web-push';

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

async function updateWebPushSubscription(
  userId: string,
  subscription: PushSubscriptionJSON,
  method: 'POST' | 'DELETE'
): Promise<void> {
  const currentUser = getAuth(getApp()).currentUser;
  if (!currentUser || currentUser.uid !== userId) {
    throw new Error('A signed-in account is required.');
  }

  const idToken = await currentUser.getIdToken();
  const response = await fetch('/api/notifications/device', {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ subscription }),
  });
  if (!response.ok) throw new Error('Unable to register this device for notifications.');
}

export async function registerPushDevice(userId: string): Promise<PushTransport | null> {
  const fcmToken = await initFCM(userId);
  if (fcmToken) return 'fcm';

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

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidPublicKey,
    }));
  await updateWebPushSubscription(userId, subscription.toJSON(), 'POST');
  return 'web-push';
}

export async function deleteWebPushSubscription(userId: string): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  await updateWebPushSubscription(userId, subscription.toJSON(), 'DELETE');
  await subscription.unsubscribe();
}

export async function deletePushDevice(userId: string): Promise<void> {
  await Promise.allSettled([deleteFCMToken(userId), deleteWebPushSubscription(userId)]);
}
