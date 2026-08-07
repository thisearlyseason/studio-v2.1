import { NextRequest, NextResponse } from 'next/server';
import { welcomeEmail } from '@/lib/email-templates';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { getResend } from '@/lib/resend-client';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';

const FROM = 'The Squad Pro <noreply@thesquad.pro>';

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

    const limited = await enforceUserRateLimit(authResult.uid, 'welcome-email', 30, 60 * 60 * 1000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 8_000);
    const { name, email, password, planType } = body;

    if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string' ||
        !name.trim() || !/^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/.test(email.trim()) ||
        password.length < 8 || password.length > 200) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const { subject, html } = welcomeEmail({ name: name.trim().slice(0, 120), email: email.trim().toLowerCase(), password, planType: String(planType || '').slice(0, 50) });

    const { data, error } = await getResend().emails.send({
      from: FROM,
      to: [email.trim().toLowerCase()],
      subject,
      html,
    });

    if (error) {
      console.error('[Resend] Welcome email error:', error);
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    return NextResponse.json({ id: data?.id });
  } catch (err: any) {
    if (err instanceof RequestBodyError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
