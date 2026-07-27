import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';
import { assertNonAnonymous, verifyFirebaseToken } from '@/lib/api-auth';
import { verificationEmail } from '@/lib/email-templates';
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

export async function POST(req: NextRequest) {
  const authResult = await verifyFirebaseToken(req, { allowUnverifiedEmail: true });
  if (authResult instanceof NextResponse) return authResult;
  const anonymousError = assertNonAnonymous(authResult);
  if (anonymousError) return anonymousError;
  if (!authResult.email || authResult.email.length > 254) {
    return NextResponse.json({ error: 'A valid account email is required.' }, { status: 400 });
  }

  try {
    const body = await readJsonBodyWithLimit<{ name?: unknown }>(req, 4_000);
    const name =
      typeof body.name === 'string' && body.name.trim().length <= 120
        ? body.name.trim()
        : '';
    const rateLimit = await enforceUserRateLimit(
      authResult.uid,
      'verification-email',
      5,
      15 * 60 * 1000
    );
    if (rateLimit) return rateLimit;

    ensureAdminInit();
    const account = await admin.auth().getUser(authResult.uid);
    if (account.email !== authResult.email) {
      return NextResponse.json({ error: 'Account email mismatch.' }, { status: 403 });
    }
    if (account.emailVerified) {
      return NextResponse.json({ success: true, alreadyVerified: true });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.thesquad.pro';
    const verificationLink = await admin.auth().generateEmailVerificationLink(authResult.email, {
      url: `${appUrl}/login?verified=1`,
    });
    const email = verificationEmail({
      name: name || account.displayName || '',
      email: authResult.email,
      verificationLink,
    });
    const { data, error } = await getResend().emails.send({
      from: FROM,
      to: [authResult.email],
      subject: email.subject,
      html: email.html,
    });
    if (error) {
      console.error('[Resend] Verification email error:', error);
      return NextResponse.json({ error: 'Email delivery failed.' }, { status: 502 });
    }
    return NextResponse.json({ success: true, id: data?.id });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[Verification Email] Error:', error);
    return NextResponse.json({ error: 'Unable to send verification email.' }, { status: 500 });
  }
}
