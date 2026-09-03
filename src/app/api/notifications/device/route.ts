import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { assertNonAnonymous, verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';
import {
  normalizeWebPushSubscription,
  webPushSubscriptionId,
  type WebPushSubscriptionRecord,
} from '@/lib/web-push-subscription';

const MAX_DEVICES_PER_ACCOUNT = 10;

function validToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 20 &&
    value.length <= 4_096 &&
    /^[A-Za-z0-9:_-]+$/.test(value)
  );
}

async function authenticate(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  const anonymousError = assertNonAnonymous(auth);
  if (anonymousError) return anonymousError;
  const rateLimit = await enforceUserRateLimit(
    auth.uid,
    'notification-device',
    30,
    60 * 60 * 1000
  );
  return rateLimit || auth;
}

type DeviceRequest = { token?: unknown; subscription?: unknown };

function savedWebPushSubscriptions(value: unknown): WebPushSubscriptionRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeWebPushSubscription)
    .filter((subscription): subscription is WebPushSubscriptionRecord => Boolean(subscription));
}

function fcmDeviceId(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

async function registerFcmToken(uid: string, token: string): Promise<void> {
  const tokenId = fcmDeviceId(token);
  const userRef = adminDb.collection('users').doc(uid);
  const deviceRef = adminDb.collection('notificationDeviceTokens').doc(tokenId);

  await adminDb.runTransaction(async transaction => {
    const [userSnapshot, deviceSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(deviceRef),
    ]);
    if (!userSnapshot.exists) throw new Error('PROFILE_MISSING');

    const previousUserId = deviceSnapshot.data()?.userId;
    const previousUserRef =
      typeof previousUserId === 'string' && previousUserId !== uid
        ? adminDb.collection('users').doc(previousUserId)
        : null;
    const previousUserSnapshot = previousUserRef
      ? await transaction.get(previousUserRef)
      : null;
    const existing: string[] = Array.isArray(userSnapshot.data()?.fcmTokens)
      ? userSnapshot.data()!.fcmTokens.filter((item: unknown): item is string => typeof item === 'string')
      : [];
    const nextTokens = [token, ...existing.filter(item => item !== token)]
      .slice(0, MAX_DEVICES_PER_ACCOUNT);

    if (previousUserRef && previousUserSnapshot?.exists) {
      transaction.update(previousUserRef, { fcmTokens: FieldValue.arrayRemove(token) });
    }
    transaction.update(userRef, { fcmTokens: nextTokens });
    transaction.set(deviceRef, { userId: uid, updatedAt: new Date().toISOString() });
  });
}

async function registerWebPushSubscription(
  uid: string,
  subscription: WebPushSubscriptionRecord
): Promise<void> {
  const subscriptionId = webPushSubscriptionId(subscription);
  const userRef = adminDb.collection('users').doc(uid);
  const deviceRef = adminDb.collection('notificationWebPushSubscriptions').doc(subscriptionId);

  await adminDb.runTransaction(async transaction => {
    const [userSnapshot, deviceSnapshot] = await Promise.all([
      transaction.get(userRef),
      transaction.get(deviceRef),
    ]);
    if (!userSnapshot.exists) throw new Error('PROFILE_MISSING');

    const previousUserId = deviceSnapshot.data()?.userId;
    const previousUserRef =
      typeof previousUserId === 'string' && previousUserId !== uid
        ? adminDb.collection('users').doc(previousUserId)
        : null;
    const previousUserSnapshot = previousUserRef
      ? await transaction.get(previousUserRef)
      : null;
    const existing = savedWebPushSubscriptions(userSnapshot.data()?.webPushSubscriptions);
    const nextSubscriptions = [subscription, ...existing.filter(item => item.endpoint !== subscription.endpoint)]
      .slice(0, MAX_DEVICES_PER_ACCOUNT);

    if (previousUserRef && previousUserSnapshot?.exists) {
      const previousSubscriptions = savedWebPushSubscriptions(
        previousUserSnapshot.data()?.webPushSubscriptions
      ).filter(item => item.endpoint !== subscription.endpoint);
      transaction.update(previousUserRef, { webPushSubscriptions: previousSubscriptions });
    }
    transaction.update(userRef, { webPushSubscriptions: nextSubscriptions });
    transaction.set(deviceRef, { userId: uid, updatedAt: new Date().toISOString() });
  });
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { token, subscription } = await readJsonBodyWithLimit<DeviceRequest>(req, 12_000);
    const normalizedSubscription = normalizeWebPushSubscription(subscription);
    if (validToken(token) === Boolean(normalizedSubscription)) {
      return NextResponse.json({ error: 'Submit one valid notification device.' }, { status: 400 });
    }

    if (validToken(token)) await registerFcmToken(auth.uid, token);
    else await registerWebPushSubscription(auth.uid, normalizedSubscription!);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Error && error.message === 'PROFILE_MISSING') {
      return NextResponse.json({ error: 'Account profile is incomplete.' }, { status: 409 });
    }
    console.error('[Notification Device] Registration failed:', error);
    return NextResponse.json({ error: 'Unable to register this device.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { token, subscription } = await readJsonBodyWithLimit<DeviceRequest>(req, 12_000);
    const normalizedSubscription = normalizeWebPushSubscription(subscription);
    if (validToken(token) === Boolean(normalizedSubscription)) {
      return NextResponse.json({ error: 'Submit one valid notification device.' }, { status: 400 });
    }

    if (validToken(token)) {
      const tokenId = fcmDeviceId(token);
      const userRef = adminDb.collection('users').doc(auth.uid);
      const deviceRef = adminDb.collection('notificationDeviceTokens').doc(tokenId);
      await adminDb.runTransaction(async transaction => {
        const deviceSnapshot = await transaction.get(deviceRef);
        transaction.update(userRef, { fcmTokens: FieldValue.arrayRemove(token) });
        if (deviceSnapshot.data()?.userId === auth.uid) transaction.delete(deviceRef);
      });
      return NextResponse.json({ success: true });
    }

    const subscriptionId = webPushSubscriptionId(normalizedSubscription!);
    const userRef = adminDb.collection('users').doc(auth.uid);
    const deviceRef = adminDb.collection('notificationWebPushSubscriptions').doc(subscriptionId);
    await adminDb.runTransaction(async transaction => {
      const [userSnapshot, deviceSnapshot] = await Promise.all([
        transaction.get(userRef),
        transaction.get(deviceRef),
      ]);
      if (!userSnapshot.exists) throw new Error('PROFILE_MISSING');
      const nextSubscriptions = savedWebPushSubscriptions(userSnapshot.data()?.webPushSubscriptions)
        .filter(item => item.endpoint !== normalizedSubscription!.endpoint);
      transaction.update(userRef, { webPushSubscriptions: nextSubscriptions });
      if (deviceSnapshot.data()?.userId === auth.uid) transaction.delete(deviceRef);
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[Notification Device] Removal failed:', error);
    return NextResponse.json({ error: 'Unable to remove this device.' }, { status: 500 });
  }
}
