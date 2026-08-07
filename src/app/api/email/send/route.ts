import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { getResend } from '@/lib/resend-client';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';
import { getTeamDeliveryTargets, isAuthorizedTeamNotifier } from '@/lib/notification-targets';

const FROM = 'The Squad Pro <noreply@thesquad.pro>';

export interface SendEmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

/**
 * POST /api/email/send
 * Generic authenticated email sender. All template construction happens
 * on the client side or in a parent route; this is the delivery layer.
 *
 * Body: { to, subject, html, replyTo? }
 */
export async function POST(req: NextRequest) {
  const authResult = await verifyFirebaseToken(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const limited = await enforceUserRateLimit(authResult.uid, 'email-send', 30, 60 * 60 * 1000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<SendEmailPayload & { teamId?: string }>(req, 200_000);
    const { to, subject, html, replyTo } = body;

    if (!to || !subject || !html || typeof subject !== 'string' || typeof html !== 'string') {
      return NextResponse.json({ error: 'Missing required fields: to, subject, html' }, { status: 400 });
    }
    if (subject.trim().length > 200 || html.length > 150_000 || /<\s*(script|iframe|object|embed|form|meta|link)\b|\bon\w+\s*=/i.test(html)) {
      return NextResponse.json({ error: 'Email content exceeds the allowed format or size.' }, { status: 400 });
    }
    const recipients = (Array.isArray(to) ? to : [to]).filter((email): email is string => typeof email === 'string')
      .map(email => email.trim().toLowerCase());
    if (!recipients.length || recipients.length > 200 || recipients.some(email => !/^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/.test(email))) {
      return NextResponse.json({ error: 'Recipients must be valid email addresses (maximum 200).' }, { status: 400 });
    }
    const teamId = typeof body.teamId === 'string' ? body.teamId.trim() : '';
    if (authResult.role !== 'superadmin') {
      if (!teamId || !(await isAuthorizedTeamNotifier(teamId, authResult.uid, authResult.role))) {
        return NextResponse.json({ error: 'Only authorized team staff can send team notifications.' }, { status: 403 });
      }
      const targets = await getTeamDeliveryTargets(teamId);
      if (recipients.some(email => !targets.emails.has(email))) {
        return NextResponse.json({ error: 'Recipients must belong to the selected team.' }, { status: 403 });
      }
    }
    if (replyTo && (typeof replyTo !== 'string' || !/^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/.test(replyTo.trim()))) {
      return NextResponse.json({ error: 'replyTo must be a valid email address.' }, { status: 400 });
    }

    const { data, error } = await getResend().emails.send({
      from: FROM,
      to: recipients,
      subject: subject.trim(),
      html,
      ...(replyTo ? { replyTo } : {}),
    });

    if (error) {
      console.error('[Resend] Send error:', error);
      return NextResponse.json({ error: error.message }, { status: 502 });
    }

    return NextResponse.json({ id: data?.id });
  } catch (err: any) {
    if (err instanceof RequestBodyError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[Resend] Unexpected error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
