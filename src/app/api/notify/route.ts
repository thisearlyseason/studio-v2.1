import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import type { Notification, WebpushConfig } from 'firebase-admin/messaging';
import { adminDb, getAdminMessaging } from '@/lib/firebase-admin';
import { timingSafeEqual } from 'node:crypto';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';
import { getTeamDeliveryTargets, isAuthorizedTeamNotifier, validNotificationUrl } from '@/lib/notification-targets';

function hasInternalSecret(req: NextRequest): boolean {
  const expected = process.env.INTERNAL_API_SECRET || '';
  const supplied = req.headers.get('x-internal-secret') || '';
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * POST /api/notify
 * Server-side FCM push notification sender.
 * Uses the shared Firebase Admin SDK instance from lib/firebase-admin.
 *
 * Body: {
 *   tokens: string[]          // FCM registration tokens to target
 *   title: string             // notification title
 *   body: string              // notification body
 *   url?: string              // optional click-through URL
 *   imageUrl?: string         // optional icon/image URL
 * }
 *
 * OR: {
 *   topic: string             // FCM topic (e.g. 'team_abc123_all')
 *   title, body, url?, imageUrl?
 * }
 */
export async function POST(req: NextRequest) {
  const internal = hasInternalSecret(req);
  const authResult = internal ? { uid: 'internal', role: 'superadmin' } : await verifyFirebaseToken(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const limited = await enforceUserRateLimit(authResult.uid, 'push-notify', internal ? 120 : 30, 60 * 60 * 1000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 40_000);
    const tokens = Array.isArray(body.tokens) ? body.tokens.filter((token): token is string => typeof token === 'string') : [];
    const recipientUserIds = Array.isArray(body.recipientUserIds) ? body.recipientUserIds.filter((uid): uid is string => typeof uid === 'string') : [];
    const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const msgBody = typeof body.body === 'string' ? body.body.trim() : '';
    const url = body.url;
    const imageUrl = body.imageUrl;
    const notificationUrl = typeof url === 'string' ? url : undefined;

    if (!title || !msgBody) {
      return NextResponse.json({ error: 'title and body are required' }, { status: 400 });
    }
    if (title.length > 120 || msgBody.length > 500 || !validNotificationUrl(url)) {
      return NextResponse.json({ error: 'Notification content is invalid or too large.' }, { status: 400 });
    }
    if (!tokens.length && !recipientUserIds.length && !topic) {
      return NextResponse.json({ error: 'tokens[] or topic is required' }, { status: 400 });
    }
    if (!internal && authResult.role !== 'superadmin') {
      const teamId = typeof body.teamId === 'string' ? body.teamId.trim() : '';
      if (!teamId || topic || !(await isAuthorizedTeamNotifier(teamId, authResult.uid, authResult.role))) {
        return NextResponse.json({ error: 'Only authorized team staff can send team notifications.' }, { status: 403 });
      }
      const targets = await getTeamDeliveryTargets(teamId);
      if (recipientUserIds.length && recipientUserIds.some(uid => !targets.userIds.has(uid))) {
        return NextResponse.json({ error: 'Notification recipients must belong to the selected team.' }, { status: 403 });
      }
      if (tokens.length && tokens.some(token => !targets.tokens.has(token))) {
        return NextResponse.json({ error: 'Notification tokens must belong to the selected team.' }, { status: 403 });
      }
    }
    if (!tokens.length && recipientUserIds.length) {
      const refs = [...recipientUserIds].map(uid => adminDb.collection('users').doc(uid));
      const snapshots = await adminDb.getAll(...refs);
      for (const snapshot of snapshots) {
        const userTokens = snapshot.data()?.fcmTokens;
        if (Array.isArray(userTokens)) tokens.push(...userTokens.filter((token: unknown): token is string => typeof token === 'string').slice(0, 20));
      }
    }
    if (tokens.length > 500) return NextResponse.json({ error: 'A maximum of 500 notification tokens is allowed.' }, { status: 400 });

    const messaging = getAdminMessaging();

    const notification: Notification = { title, body: msgBody };
    if (imageUrl) (notification as any).imageUrl = imageUrl;

    const webpush: WebpushConfig = {
      notification: {
        icon: '/favicon-192.png',
        badge: '/favicon-192.png',
      ...(notificationUrl ? { clickAction: notificationUrl } : {}),
      },
      fcmOptions: notificationUrl ? { link: notificationUrl } : undefined,
    };

    let result: Record<string, unknown> = { successCount: 0, failureCount: 0 };
    if (tokens.length) {
      // Chunk into groups of 500 (FCM multicast limit)
      const chunks: string[][] = [];
      for (let i = 0; i < tokens.length; i += 500) {
        chunks.push(tokens.slice(i, i + 500));
      }
      const responses = await Promise.all(
        chunks.map(chunk =>
          messaging.sendEachForMulticast({ tokens: chunk, notification, webpush })
        )
      );
      const successCount = responses.reduce((sum, r) => sum + r.successCount, 0);
      const failureCount = responses.reduce((sum, r) => sum + r.failureCount, 0);
      result = { successCount, failureCount };
    } else if (topic) {
      // Send to FCM topic
      const msgId = await messaging.send({ topic, notification, webpush });
      result = { messageId: msgId };
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    if (err instanceof RequestBodyError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[FCM] Notify error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
