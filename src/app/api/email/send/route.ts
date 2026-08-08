import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { findActiveTeamMember, getTeamAuthority } from '@/lib/server-team-access';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

const FROM = 'The Squad Pro <noreply@thesquad.pro>';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;
const RESEND_BATCH_SIZE = 100;

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

    const uniqueRecipients = [...new Set(recipientUserIds
      .filter((id): id is string => typeof id === 'string')
      .map(id => id.trim())
      .filter(Boolean))];
    if (!uniqueRecipients.length) {
      return NextResponse.json({ error: 'No valid recipients were provided.' }, { status: 400 });
    }
    const members = await Promise.all(uniqueRecipients.map(id =>
      findActiveTeamMember(teamId, id)
    ));
    if (members.some(member => !member)) {
      return NextResponse.json({ error: 'Recipients must be current team members.' }, { status: 403 });
    }
    const to = [...new Set(members.flatMap(member => {
      const email = typeof member?.data.email === 'string' ? member.data.email.trim().toLowerCase() : '';
      return EMAIL_PATTERN.test(email) ? [email] : [];
    }))];
    if (!to.length) return NextResponse.json({ error: 'No recipient email addresses are available.' }, { status: 400 });

    const resend = getResend();
    const ids: string[] = [];
    for (let offset = 0; offset < to.length; offset += RESEND_BATCH_SIZE) {
      const recipients = to.slice(offset, offset + RESEND_BATCH_SIZE);
      const { data, error } = await resend.batch.send(recipients.map(recipient => ({
        from: FROM,
        to: [recipient],
        subject,
        html,
        ...(replyTo ? { replyTo } : {}),
      })));

      if (error) {
        console.error('[Resend] Batch send error:', error);
        return NextResponse.json(
          { error: 'Email delivery failed.', acceptedCount: ids.length },
          { status: 502 }
        );
      }
      const batchIds = (data?.data || []).map(message => message.id).filter(Boolean);
      if (batchIds.length !== recipients.length) {
        console.error('[Resend] Batch response did not include every accepted email ID.');
        return NextResponse.json(
          { error: 'Email delivery could not be confirmed.', acceptedCount: ids.length },
          { status: 502 }
        );
      }
      ids.push(...batchIds);
    }

    return NextResponse.json({ id: ids[0], ids, acceptedCount: ids.length });
  } catch (err: any) {
    if (err instanceof RequestBodyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[Resend] Unexpected error:', err);
    return NextResponse.json({ error: 'Unable to send email.' }, { status: 500 });
  }
}
