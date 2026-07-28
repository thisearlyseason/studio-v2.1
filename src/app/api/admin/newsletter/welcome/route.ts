import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { parseNewsletterDraft } from '@/lib/newsletter-draft-validation';
import { readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';

const WELCOME_REF = () => adminDb.collection('newsletter_system').doc('welcome_email');

const defaultWelcome = {
  enabled: true,
  subject: 'Welcome to The Squad',
  previewText: 'You are officially on The Squad newsletter list.',
  title: 'Welcome to The Squad',
  blocks: [
    {
      id: 'welcome-intro',
      type: 'paragraph' as const,
      text: 'Thanks for subscribing. You will now receive product news, sports insights, and updates from **The Squad**.',
    },
    {
      id: 'welcome-hub',
      type: 'button' as const,
      label: 'Explore the Sports Hub',
      url: 'https://www.thesquad.pro/sports-hub',
    },
  ],
};

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
  const snapshot = await WELCOME_REF().get();
  const data = snapshot.data();
  return NextResponse.json({
    welcome: snapshot.exists ? {
      enabled: data?.enabled === true,
      subject: data?.subject || defaultWelcome.subject,
      previewText: data?.previewText || '',
      title: data?.title || defaultWelcome.title,
      blocks: Array.isArray(data?.blocks) ? data.blocks : defaultWelcome.blocks,
    } : defaultWelcome,
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(request, 256_000);
    const draft = parseNewsletterDraft(body);
    if (!draft) {
      return NextResponse.json({ error: 'A valid subject, title, and 1–40 content blocks are required.' }, { status: 400 });
    }
    const enabled = body.enabled === true;
    await WELCOME_REF().set({
      ...draft,
      enabled,
      updatedBy: auth.uid,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ success: true, welcome: { ...draft, enabled } });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[Newsletter Welcome] Save failed:', error);
    return NextResponse.json({ error: 'Unable to save the welcome email.' }, { status: 500 });
  }
}
