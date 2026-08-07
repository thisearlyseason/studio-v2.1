import { NextRequest, NextResponse } from 'next/server';
import { passwordResetEmail } from '@/lib/email-templates';
import { getResend } from '@/lib/resend-client';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';
import { getAdminAuth } from '@/lib/firebase-admin';

const FROM = 'The Squad Pro <noreply@thesquad.pro>';

/**
 * POST /api/email/reset-password
 * Public route — no auth required (user is not logged in).
 * Generates a Firebase password reset link server-side using the Admin SDK,
 * then sends a branded email via Resend instead of Firebase's default template.
 *
 * Body: { email }
 */
export async function POST(req: NextRequest) {
  try {
    const fingerprint = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';
    const limited = await enforceUserRateLimit(fingerprint, 'password-reset', 8, 60 * 60 * 1000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 2_000);
    const email = String(body.email || '').trim().toLowerCase();

    if (!/^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/.test(email) || email.length > 254) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Use Firebase Admin SDK to generate a password reset link
    // This avoids sending Firebase's ugly default email
    let resetLink: string;
    try {
      resetLink = await getAdminAuth().generatePasswordResetLink(email, {
        url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.thesquad.pro'}/login`,
      });
    } catch (adminErr: any) {
      // Firebase Admin throws different errors for non-existent users depending on version:
      // - adminErr.code === 'auth/user-not-found'
      // - adminErr.message contains 'INTERNAL ASSERT FAILED' (user doesn't exist in project)
      const isUserNotFound =
        adminErr.code === 'auth/user-not-found' ||
        adminErr.message?.includes('INTERNAL ASSERT FAILED') ||
        adminErr.message?.includes('user-not-found');
      if (isUserNotFound) {
        // Return success silently — prevents email enumeration attacks
        return NextResponse.json({ success: true });
      }
      throw adminErr;
    }

    const { subject, html } = passwordResetEmail({ email, resetLink });

    const { error } = await getResend().emails.send({
      from: FROM,
      to: [email],
      subject,
      html,
    });

    if (error) {
      console.error('[Resend] Password reset email error:', error);
      return NextResponse.json({ error: 'Email delivery failed' }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof RequestBodyError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[Reset Password] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
