import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { adminDb } from '@/lib/firebase-admin';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';

const EMAIL_PATTERN = /^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/;

export async function POST(req: NextRequest) {
  try {
    const fingerprint = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';
    const limited = await enforceUserRateLimit(fingerprint, 'sports-hub-newsletter', 10, 60 * 60 * 1000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 4_000);
    const email = String(body.email || '').trim().toLowerCase();
    const name = String(body.name || '').trim().slice(0, 120);

    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }

    const subscriberId = createHash('sha256').update(email).digest('hex');
    await adminDb.collection('sports_hub_newsletter_subscribers').doc(subscriberId).set({
      email,
      name,
      subscribedAt: new Date().toISOString(),
      isActive: true,
      sports: [],
      source: 'sports_hub',
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[Sports Hub] Newsletter signup error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
