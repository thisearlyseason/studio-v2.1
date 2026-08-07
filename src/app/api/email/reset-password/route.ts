import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';
import { passwordResetEmail } from '@/lib/email-templates';
import { ensureAdminInit } from '@/lib/firebase-admin';
import {
  enforcePublicRateLimit,
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
 * POST /api/email/reset-password
 * Public route — no auth required (user is not logged in).
 * Generates a Firebase password reset link server-side using the Admin SDK,
 * then sends a branded email via Resend instead of Firebase's default template.
 *
 * Body: { email }
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await readJsonBodyWithLimit<{ email?: unknown }>(req, 4_000);

    if (
      typeof email !== 'string' ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email)
    ) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const rateLimit = await enforcePublicRateLimit(
      req,
      'reset-password',
      5,
      15 * 60 * 1000,
      normalizedEmail
    );
    if (rateLimit) return rateLimit;

    // Use Firebase Admin SDK to generate a password reset link
    // This avoids sending Firebase's ugly default email
    ensureAdminInit();
    let resetLink: string;
    try {
      resetLink = await admin.auth().generatePasswordResetLink(normalizedEmail, {
        url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.thesquad.pro'}/login`,
      });
    } catch (adminErr: any) {
      // Firebase Admin throws different errors for non-existent users depending on version:
      // - adminErr.code === 'auth/user-not-found'
      // - adminErr.message contains 'INTERNAL ASSERT FAILED' (user doesn't exist in project)
      const isUserNotFound =
        adminErr.code === 'auth/user-not-found' ||
        adminErr.message?.includes('INTERNAL ASSERT FAILED') ||
        adminErr.message?.includes('user-not-found') ||
        adminErr.message?.toLowerCase().includes('no user record');
      if (isUserNotFound) {
        // Return success silently — prevents email enumeration attacks
        return NextResponse.json({ success: true });
      }
      throw adminErr;
    }

    const { subject, html } = passwordResetEmail({ email: normalizedEmail, resetLink });

    const { error } = await getResend().emails.send({
      from: FROM,
      to: [normalizedEmail],
      subject,
      html,
    });

    if (error) {
      console.error('[Resend] Password reset email error:', error);
      return NextResponse.json({ error: 'Email delivery failed' }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof RequestBodyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[Reset Password] Error:', err);
    return NextResponse.json({ error: 'Unable to process password reset.' }, { status: 500 });
  }
}
