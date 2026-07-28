import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { adminDb } from '@/lib/firebase-admin';
import { escapeHtml } from '@/lib/html-escape';
import {
  enforcePublicRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

const CONTACT_RECIPIENT = 'team@thesquad.pro';
const FROM = 'The Squad Pro <noreply@thesquad.pro>';

function cleanText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function resendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY is not configured.');
  return new Resend(apiKey);
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(request, 16_000);
    const name = cleanText(body.name, 120);
    const email = cleanText(body.email, 254).toLowerCase();
    const organization = cleanText(body.organization, 200);
    const inquiry = cleanText(body.inquiry, 4_000);
    const submissionId = cleanText(body.submissionId, 100);

    if (!name || !inquiry || !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email)) {
      return NextResponse.json(
        { error: 'Enter your name, a valid email address, and your inquiry.' },
        { status: 400 }
      );
    }
    if (!/^[a-zA-Z0-9-]{16,100}$/.test(submissionId)) {
      return NextResponse.json({ error: 'Invalid submission identifier.' }, { status: 400 });
    }

    const rateLimit = await enforcePublicRateLimit(
      request,
      'contact-inquiry',
      5,
      60 * 60 * 1000,
      email
    );
    if (rateLimit) return rateLimit;

    const documentId = createHash('sha256')
      .update(`${email}:${submissionId}`)
      .digest('hex');
    const inquiryRef = adminDb.collection('contact_inquiries').doc(documentId);
    const now = Date.now();

    const reservation = await adminDb.runTransaction(async transaction => {
      const snapshot = await transaction.get(inquiryRef);
      const existing = snapshot.data();
      if (['accepted', 'delivered'].includes(existing?.deliveryStatus)) return 'accepted';
      if (
        existing?.deliveryStatus === 'pending' &&
        typeof existing?.deliveryStartedAt === 'number' &&
        now - existing.deliveryStartedAt < 5 * 60 * 1000
      ) {
        return 'pending';
      }

      transaction.set(inquiryRef, {
        name,
        email,
        organization,
        inquiry,
        source: 'landing_page_contact',
        status: 'new',
        deliveryStatus: 'pending',
        deliveryStartedAt: now,
        createdAt: existing?.createdAt || new Date(),
        updatedAt: new Date(),
      }, { merge: true });
      return 'reserved';
    });

    if (reservation === 'accepted') {
      return NextResponse.json({ success: true, duplicate: true });
    }
    if (reservation === 'pending') {
      return NextResponse.json(
        { error: 'This inquiry is already being sent. Please wait a moment.' },
        { status: 409 }
      );
    }

    const subjectName = name.replace(/[\r\n]/g, ' ');
    try {
      const { data, error } = await resendClient().emails.send({
        from: FROM,
        to: CONTACT_RECIPIENT,
        replyTo: email,
        subject: `[Website Inquiry] ${subjectName}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#171717;">
            <h1 style="font-size:24px;margin:0 0 24px;">New website inquiry</h1>
            <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
              <tr><td style="padding:8px 0;font-weight:700;width:140px;">Name</td><td>${escapeHtml(name)}</td></tr>
              <tr><td style="padding:8px 0;font-weight:700;">Email</td><td>${escapeHtml(email)}</td></tr>
              <tr><td style="padding:8px 0;font-weight:700;">Organization</td><td>${escapeHtml(organization || 'Not provided')}</td></tr>
            </table>
            <div style="padding:20px;border-radius:16px;background:#f5f5f5;white-space:pre-wrap;line-height:1.6;">${escapeHtml(inquiry)}</div>
          </div>
        `,
        text: `New website inquiry\n\nName: ${name}\nEmail: ${email}\nOrganization: ${organization || 'Not provided'}\n\n${inquiry}`,
      }, { idempotencyKey: documentId });
      if (error) throw new Error(error.message || 'Resend rejected the inquiry email.');
      if (!data?.id) throw new Error('Resend did not return an email identifier.');

      await inquiryRef.set({
        deliveryStatus: 'accepted',
        resendEmailId: data.id,
        acceptedBy: 'resend',
        acceptedAt: new Date(),
        deliveredTo: CONTACT_RECIPIENT,
        deliveryError: null,
        updatedAt: new Date(),
      }, { merge: true });
    } catch (deliveryError) {
      await inquiryRef.set({
        deliveryStatus: 'failed',
        deliveryError: deliveryError instanceof Error ? deliveryError.message.slice(0, 500) : 'Unknown delivery error',
        updatedAt: new Date(),
      }, { merge: true });
      throw deliveryError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[Contact] Inquiry delivery failed:', error);
    return NextResponse.json(
      { error: 'Unable to send your inquiry. Please email team@thesquad.pro.' },
      { status: 500 }
    );
  }
}
