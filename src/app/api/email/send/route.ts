import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { getTeamAuthority } from '@/lib/server-team-access';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

const FROM = 'The Squad Pro <noreply@thesquad.pro>';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY env var not set');
  return new Resend(apiKey);
}

export interface SendEmailPayload {
  teamId: string;
  recipientUserIds: string[];
  subject: string;
  html: string;
  replyTo?: string;
}

/**
 * POST /api/email/send
 * Generic authenticated email sender. All template construction happens
 * on the client side or in a parent route; this is the delivery layer.
 *
 * Body: { teamId, recipientUserIds, subject, html, replyTo? }
 */
export async function POST(req: NextRequest) {
  const authResult = await verifyFirebaseToken(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const body = await readJsonBodyWithLimit<SendEmailPayload>(req, 256_000);
    const { teamId, recipientUserIds, subject, html, replyTo } = body;

    if (!teamId || !Array.isArray(recipientUserIds) || !recipientUserIds.length || !subject || !html) {
      return NextResponse.json({ error: 'Missing required fields.' }, { status: 400 });
    }
    if (recipientUserIds.length > 500) {
      return NextResponse.json({ error: 'Too many recipients.' }, { status: 400 });
    }
    if (
      typeof subject !== 'string' ||
      subject.length > 200 ||
      /[\r\n]/.test(subject) ||
      typeof html !== 'string' ||
      html.length > 200_000 ||
      (replyTo && !EMAIL_PATTERN.test(replyTo))
    ) {
      return NextResponse.json({ error: 'Invalid email content.' }, { status: 400 });
    }
    const rateLimit = await enforceUserRateLimit(
      authResult.uid,
      'email-send',
      30,
      60 * 60 * 1000
    );
    if (rateLimit) return rateLimit;

    const authority = await getTeamAuthority(teamId, authResult.uid, authResult.role);
    if (!authority?.isStaff) {
      return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
    }

    const uniqueRecipients = [...new Set(recipientUserIds.filter((id): id is string => typeof id === 'string'))];
    const memberSnaps = await Promise.all(uniqueRecipients.map(id =>
      adminDb.collection('teams').doc(teamId).collection('members').doc(id).get()
    ));
    if (memberSnaps.some(member =>
      !member.exists ||
      member.data()?.status === 'removed' ||
      member.data()?.isDeleted === true
    )) {
      return NextResponse.json({ error: 'Recipients must be current team members.' }, { status: 403 });
    }
    const to = memberSnaps.flatMap(member => {
      const email = typeof member.data()?.email === 'string' ? member.data()?.email.trim() : '';
      return EMAIL_PATTERN.test(email) ? [email] : [];
    });
    if (!to.length) return NextResponse.json({ error: 'No recipient email addresses are available.' }, { status: 400 });

    const { data, error } = await getResend().emails.send({
      from: FROM,
      to,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
    });

    if (error) {
      console.error('[Resend] Send error:', error);
      return NextResponse.json({ error: 'Email delivery failed.' }, { status: 502 });
    }

    return NextResponse.json({ id: data?.id });
  } catch (err: any) {
    if (err instanceof RequestBodyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[Resend] Unexpected error:', err);
    return NextResponse.json({ error: 'Unable to send email.' }, { status: 500 });
  }
}
