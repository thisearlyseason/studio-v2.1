import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import {
  deleteNewsletterSubscriber,
  listNewsletterSubscribers,
} from '@/lib/server-newsletter';
import { readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';

async function requireSuperAdmin(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;
  return auth.role === 'superadmin'
    ? auth
    : NextResponse.json({ error: 'Super Admin access is required.' }, { status: 403 });
}

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const [subscribers, campaignsSnapshot] = await Promise.all([
      listNewsletterSubscribers(),
      adminDb.collection('newsletter_campaigns').orderBy('createdAt', 'desc').limit(20).get(),
    ]);
    const campaigns = campaignsSnapshot.docs.map(document => {
      const data = document.data();
      return {
        id: document.id,
        subject: data.subject || '',
        status: data.status || 'unknown',
        recipientCount: data.recipientCount || 0,
        sentCount: data.sentCount || 0,
        deliveredCount: data.deliveredCount || 0,
        openedCount: data.openedCount || 0,
        clickedCount: data.clickedCount || 0,
        bouncedCount: data.bouncedCount || 0,
        complainedCount: data.complainedCount || 0,
        failedCount: data.failedCount || 0,
        suppressedCount: data.suppressedCount || 0,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
        sentAt: data.sentAt?.toDate?.()?.toISOString?.() || null,
      };
    });
    return NextResponse.json({ subscribers, campaigns });
  } catch (error) {
    console.error('[Newsletter Admin] List failed:', error);
    return NextResponse.json({ error: 'Unable to load newsletter data.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await readJsonBodyWithLimit<{ email?: unknown }>(request, 4_000);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'A valid subscriber email is required.' }, { status: 400 });
    }
    await deleteNewsletterSubscriber(email);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[Newsletter Admin] Delete failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to delete subscriber.' }, { status: 500 });
  }
}
