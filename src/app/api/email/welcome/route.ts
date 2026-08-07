import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { welcomeEmail } from '@/lib/email-templates';
import { verifyFirebaseToken } from '@/lib/api-auth';
import * as admin from 'firebase-admin';
import { ensureAdminInit } from '@/lib/firebase-admin';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

const FROM = 'The Squad Pro <noreply@thesquad.pro>';

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY env var not set');
  return new Resend(apiKey);
}

/**
 * POST /api/email/welcome
 * Called from admin/page.tsx after successful beta user creation.
 * Requires a Firebase ID token with role === 'superadmin' claim in the Authorization header.
 *
 * Body: { name, email, password, planType }
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Verify caller is authenticated and is a superadmin
    const authResult = await verifyFirebaseToken(req);
    if (authResult instanceof NextResponse) {
      return authResult;
    }

    if (authResult.role !== 'superadmin') {
      return NextResponse.json({ error: 'Forbidden: Superadmin access required' }, { status: 403 });
    }

    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 16_000);
    const { name, email, planType } = body;

    if (
      typeof name !== 'string' ||
      name.length > 120 ||
      typeof email !== 'string' ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email) ||
      typeof planType !== 'string' ||
      planType.length > 40
    ) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }
    const rateLimit = await enforceUserRateLimit(
      authResult.uid,
      'welcome-email',
      20,
      60 * 60 * 1000
    );
    if (rateLimit) return rateLimit;

    ensureAdminInit();
    const normalizedEmail = email.trim().toLowerCase();
    const resetLink = await admin.auth().generatePasswordResetLink(normalizedEmail, {
      url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.thesquad.pro'}/login`,
    });
    const { subject, html } = welcomeEmail({
      name: name.trim(),
      email: normalizedEmail,
      resetLink,
      planType,
    });

    const { data, error } = await getResend().emails.send({
      from: FROM,
      to: [normalizedEmail],
      subject,
      html,
    });

    if (error) {
      console.error('[Resend] Welcome email error:', error);
      return NextResponse.json({ error: 'Email delivery failed.' }, { status: 502 });
    }

    return NextResponse.json({ id: data?.id });
  } catch (err: any) {
    if (err instanceof RequestBodyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[Welcome Email] Error:', err);
    return NextResponse.json({ error: 'Unable to send welcome email.' }, { status: 500 });
  }
}
