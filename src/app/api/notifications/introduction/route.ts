import { NextRequest, NextResponse } from 'next/server';
import { assertNonAnonymous, verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  const anonymous = assertNonAnonymous(auth);
  if (anonymous) return anonymous;
  try {
    const body = await readJsonBodyWithLimit<{choice?: string; reminders?: boolean}>(req, 512);
    if (!['enable','skip','guide'].includes(body.choice || '') || typeof body.reminders !== 'boolean') {
      return NextResponse.json({ error: 'Invalid notification choice.' }, { status: 400 });
    }
    const ref = adminDb.doc('users/' + auth.uid);
    await adminDb.runTransaction(async tx => {
      const profile = (await tx.get(ref)).data();
      if (!profile?.notificationInvitationPending) return;
      if (body.choice === 'guide') tx.update(ref, { notificationGuideSeen: true });
      else tx.update(ref, { notificationInvitationPending: false, ...(body.choice === 'enable' ? { notificationsEnabled: true, upcomingEventNotificationsEnabled: body.reminders } : {}) });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Could not save notification choice.' }, { status: error instanceof RequestBodyError ? error.status : 500 });
  }
}
