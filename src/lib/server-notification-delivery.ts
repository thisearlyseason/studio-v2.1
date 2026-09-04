import * as admin from 'firebase-admin';
import * as webpush from 'web-push';
import { adminDb } from '@/lib/firebase-admin';
import {
  normalizeWebPushSubscription,
  webPushSubscriptionId,
  type WebPushSubscriptionRecord,
} from '@/lib/web-push-subscription';

type DeliveryInput = {
  recipientUserIds: string[];
  title: string;
  body: string;
  url?: string;
  imageUrl?: string;
};

type StoredWebPushSubscription = WebPushSubscriptionRecord & { userId: string };

export type NotificationDeliveryResult = {
  fcmSuccessCount: number;
  fcmFailureCount: number;
  webPushSuccessCount: number;
  webPushFailureCount: number;
};

function validFcmToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 20 &&
    value.length <= 4_096 &&
    /^[A-Za-z0-9:_-]+$/.test(value)
  );
}

function readWebPushSubscriptions(userId: string, value: unknown): StoredWebPushSubscription[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    const subscription = normalizeWebPushSubscription(item);
    return subscription ? [{ ...subscription, userId }] : [];
  });
}

function notificationPayload({ title, body, url, imageUrl }: DeliveryInput) {
  return { webPush: { title, body, url, imageUrl } };
}

function webPushConfiguration(): { subject: string; publicKey: string; privateKey: string } | null {
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT?.trim();
  const publicKey = process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY?.trim();
  if (!subject || !publicKey || !privateKey) return null;
  return { subject, publicKey, privateKey };
}

function isExpiredWebPushError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'statusCode' in error &&
    ((error as { statusCode?: unknown }).statusCode === 404 ||
      (error as { statusCode?: unknown }).statusCode === 410)
  );
}

async function removeExpiredWebPushSubscription(subscription: StoredWebPushSubscription): Promise<void> {
  const subscriptionId = webPushSubscriptionId(subscription);
  const userRef = adminDb.collection('users').doc(subscription.userId);
  const deviceRef = adminDb.collection('notificationWebPushSubscriptions').doc(subscriptionId);

  await adminDb.runTransaction(async transaction => {
    const [userSnapshot, deviceSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(deviceRef),
    ]);
    if (!userSnapshot.exists) return;
    const nextSubscriptions = readWebPushSubscriptions(
      subscription.userId,
      userSnapshot.data()?.webPushSubscriptions
    ).filter(item => item.endpoint !== subscription.endpoint)
      .map(({ endpoint, keys }) => ({ endpoint, keys }));
    transaction.update(userRef, { webPushSubscriptions: nextSubscriptions });
    if (deviceSnapshot.data()?.userId === subscription.userId) transaction.delete(deviceRef);
  });
}

async function sendFcmNotifications(
  tokens: string[],
  input: DeliveryInput
): Promise<Pick<NotificationDeliveryResult, 'fcmSuccessCount' | 'fcmFailureCount'>> {
  if (!tokens.length) return { fcmSuccessCount: 0, fcmFailureCount: 0 };

  const notification: admin.messaging.Notification = { title: input.title, body: input.body };
  if (input.imageUrl) notification.imageUrl = input.imageUrl;
  const webpushConfig: admin.messaging.WebpushConfig = {
    notification: {
      icon: '/app-icon-192-v2.png',
      badge: '/notification-badge.png',
      ...(input.url ? { clickAction: input.url } : {}),
    },
    fcmOptions: input.url ? { link: input.url } : undefined,
  };
  const responses = await Promise.all(
    Array.from({ length: Math.ceil(tokens.length / 500) }, (_, index) =>
      admin.messaging().sendEachForMulticast({
        tokens: tokens.slice(index * 500, (index + 1) * 500),
        notification,
        webpush: webpushConfig,
      })
    )
  );
  return {
    fcmSuccessCount: responses.reduce((sum, result) => sum + result.successCount, 0),
    fcmFailureCount: responses.reduce((sum, result) => sum + result.failureCount, 0),
  };
}

async function sendWebPushNotifications(
  subscriptions: StoredWebPushSubscription[],
  input: DeliveryInput
): Promise<Pick<NotificationDeliveryResult, 'webPushSuccessCount' | 'webPushFailureCount'>> {
  if (!subscriptions.length) return { webPushSuccessCount: 0, webPushFailureCount: 0 };
  const configuration = webPushConfiguration();
  if (!configuration) {
    console.warn('[Web Push] Delivery skipped because VAPID configuration is unavailable.');
    return { webPushSuccessCount: 0, webPushFailureCount: subscriptions.length };
  }

  webpush.setVapidDetails(configuration.subject, configuration.publicKey, configuration.privateKey);
  const payload = JSON.stringify(notificationPayload(input));
  const attempts = await Promise.allSettled(
    subscriptions.map(subscription => webpush.sendNotification(subscription, payload, { TTL: 60 }))
  );
  const expiredSubscriptions = attempts.flatMap((attempt, index) =>
    attempt.status === 'rejected' && isExpiredWebPushError(attempt.reason)
      ? [subscriptions[index]]
      : []
  );
  await Promise.all(
    expiredSubscriptions.map(subscription =>
      removeExpiredWebPushSubscription(subscription).catch(error =>
        console.warn('[Web Push] Expired subscription cleanup failed:', error instanceof Error ? error.message : 'unknown error')
      )
    )
  );
  return {
    webPushSuccessCount: attempts.filter(attempt => attempt.status === 'fulfilled').length,
    webPushFailureCount: attempts.filter(attempt => attempt.status === 'rejected').length,
  };
}

export async function sendNotificationToUsers(input: DeliveryInput): Promise<NotificationDeliveryResult> {
  const recipientUserIds = [...new Set(input.recipientUserIds.filter(id => typeof id === 'string' && id))];
  if (!recipientUserIds.length) {
    return { fcmSuccessCount: 0, fcmFailureCount: 0, webPushSuccessCount: 0, webPushFailureCount: 0 };
  }

  const profiles = await Promise.all(
    recipientUserIds.map(userId => adminDb.collection('users').doc(userId).get())
  );
  const fcmTokens = [...new Set(profiles.flatMap(snapshot => {
    const profile = snapshot.data();
    if (!snapshot.exists || profile?.notificationsEnabled === false) return [];
    return Array.isArray(profile?.fcmTokens) ? profile.fcmTokens.filter(validFcmToken) : [];
  }))];
  const webPushSubscriptions = profiles.flatMap(snapshot => {
    const profile = snapshot.data();
    if (!snapshot.exists || profile?.notificationsEnabled === false) return [];
    return readWebPushSubscriptions(snapshot.id, profile?.webPushSubscriptions);
  });

  const [fcm, webPush] = await Promise.all([
    sendFcmNotifications(fcmTokens, input),
    sendWebPushNotifications(webPushSubscriptions, input),
  ]);
  return { ...fcm, ...webPush };
}
