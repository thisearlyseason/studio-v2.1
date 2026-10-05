import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';
import { parsePublicSubmission } from '@/lib/public-submissions';

export async function POST(req: NextRequest) {
  try {
    const fingerprint = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';
    const limited = await enforceUserRateLimit(fingerprint, 'public-submission', 6, 60 * 60 * 1000);
    if (limited) return limited;

    const body = await readJsonBodyWithLimit<unknown>(req, 24_000);
    const parsed = parsePublicSubmission(body);
    let collectionName: 'contact_inquiries' | 'newsletter_signups' | 'beta_applications';
    let document: Record<string, unknown>;

    if (parsed.type === 'newsletter') {
      document = {
        ...parsed.values,
        source: 'landing_page',
        status: 'new',
        createdAt: FieldValue.serverTimestamp(),
      };
      collectionName = 'newsletter_signups';
    } else if (parsed.type === 'contact') {
      document = {
        ...parsed.values,
        source: 'landing_page_contact',
        status: 'new',
        createdAt: FieldValue.serverTimestamp(),
      };
      collectionName = 'contact_inquiries';
    } else {
      document = {
        ...parsed.values,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
      };
      collectionName = 'beta_applications';
    }

    await adminDb.collection(collectionName).add(document);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[Public Submissions] Error:', error);
    return NextResponse.json({ error: 'Unable to submit right now.' }, { status: 500 });
  }
}
