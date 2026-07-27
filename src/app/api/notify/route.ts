import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import * as admin from 'firebase-admin';
import { adminDb } from '@/lib/firebase-admin'; // Ensures admin app is initialized
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

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
  try {
    const body = await readJsonBodyWithLimit<Record<string, any>>(req, 128_000);
    const { recipientUserIds, topic, title, body: msgBody, url, imageUrl, teamId } = body;
    const internalSecret = process.env.INTERNAL_API_SECRET;
    const isInternal = !!internalSecret && req.headers.get('x-internal-secret') === internalSecret;
    const authResult = isInternal ? null : await verifyFirebaseToken(req);
    if (authResult instanceof NextResponse) return authResult;
    if (!isInternal) {
      const rateLimit = await enforceUserRateLimit(
        authResult!.uid,
        'push-notify',
        60,
        60 * 60 * 1000
      );
      if (rateLimit) return rateLimit;
    }

    if (
      typeof title !== 'string' ||
      typeof msgBody !== 'string' ||
      !title.trim() ||
      !msgBody.trim() ||
      title.length > 160 ||
      msgBody.length > 2_000
    ) {
      return NextResponse.json({ error: 'title and body are required' }, { status: 400 });
    }
    if (!isInternal && (!teamId || !Array.isArray(recipientUserIds) || recipientUserIds.length === 0)) {
      return NextResponse.json({ error: 'teamId and recipientUserIds are required' }, { status: 400 });
    }
    if (!isInternal && topic) {
      return NextResponse.json({ error: 'Topic notifications are restricted to trusted server callers.' }, { status: 403 });
    }

    let tokens: string[] = [];
    if (!isInternal) {
      if (recipientUserIds.length > 500) return NextResponse.json({ error: 'Too many recipients.' }, { status: 400 });
      const teamSnap = await adminDb.collection('teams').doc(teamId).get();
      if (!teamSnap.exists || (authResult!.role !== 'superadmin' && teamSnap.data()!.ownerUserId !== authResult!.uid)) {
        return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
      }

      const uniqueRecipients: string[] = [...new Set(
        (recipientUserIds as unknown[]).filter((id): id is string => typeof id === 'string')
      )];
      const memberSnaps = await Promise.all(uniqueRecipients.map(id =>
        adminDb.collection('teams').doc(teamId).collection('members').doc(id).get()
      ));
      const allowedRecipients = uniqueRecipients.filter((_, index) => {
        const member = memberSnaps[index];
        return member.exists &&
          member.data()?.status !== 'removed' &&
          member.data()?.isDeleted !== true;
      });
      if (allowedRecipients.length !== uniqueRecipients.length) {
        return NextResponse.json({ error: 'Recipients must be current team members.' }, { status: 403 });
      }
      const userSnaps = await Promise.all(allowedRecipients.map(id => adminDb.collection('users').doc(id).get()));
      tokens = userSnaps.flatMap(snap => {
        // A token can remain briefly after a user disables notifications or signs
        // out in another tab. The saved preference is authoritative for delivery.
        if (snap.data()?.notificationsEnabled === false) return [];
        const savedTokens = snap.data()?.fcmTokens;
        return Array.isArray(savedTokens) ? savedTokens.filter((token: unknown): token is string => typeof token === 'string') : [];
      });
    }
    if (isInternal && !topic && !Array.isArray(body.tokens)) {
      return NextResponse.json({ error: 'tokens[] or topic is required' }, { status: 400 });
    }
    if (isInternal && Array.isArray(body.tokens)) tokens = body.tokens.filter((token: unknown): token is string => typeof token === 'string');
    if (!tokens.length && !topic) {
      return NextResponse.json({ ok: true, successCount: 0, failureCount: 0 });
    }

    // Use shared admin instance (initialized in lib/firebase-admin.ts)
    void adminDb; // trigger lazy init
    const messaging = admin.messaging();

    const notification: admin.messaging.Notification = { title, body: msgBody };
    if (imageUrl) (notification as any).imageUrl = imageUrl;

    const webpush: admin.messaging.WebpushConfig = {
      notification: {
        icon: '/favicon-192.png',
        badge: '/favicon-192.png',
        ...(url ? { clickAction: url } : {}),
      },
      fcmOptions: url ? { link: url } : undefined,
    };

    let result: Record<string, unknown>;
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
    } else {
      // Send to FCM topic
      const msgId = await messaging.send({ topic, notification, webpush });
      result = { messageId: msgId };
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    if (err instanceof RequestBodyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[FCM] Notify error:', err);
    return NextResponse.json({ error: 'Unable to send notification.' }, { status: 500 });
  }
}
