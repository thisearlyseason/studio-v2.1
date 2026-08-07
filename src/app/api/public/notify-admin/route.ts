import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';
import { adminDb, ensureAdminInit } from '@/lib/firebase-admin';
import { escapeHtml } from '@/lib/html-escape';
import {
  enforcePublicRateLimit,
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

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 32_000);
    const type = body.type;
    const name = cleanText(body.name, 120);
    const email = cleanText(body.email, 254).toLowerCase();
    const role = cleanText(body.role, 120);
    const organization = cleanText(body.organization, 200);
    const sports = Array.isArray(body.sports)
      ? body.sports.map(value => cleanText(value, 80)).filter(Boolean).slice(0, 20).join(', ')
      : cleanText(body.sports, 500);
    const scale = cleanText(body.scale, 120);
    const whyBeta = cleanText(body.whyBeta, 2_000);

    if (
      (type !== 'newsletter' && type !== 'beta') ||
      !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email)
    ) {
      return NextResponse.json({ error: 'Missing required fields: type, email' }, { status: 400 });
    }
    const rateLimit = await enforcePublicRateLimit(
      req,
      'notify-admin',
      10,
      15 * 60 * 1000,
      email
    );
    if (rateLimit) return rateLimit;

    ensureAdminInit();
    const db = adminDb;

    const emailLower = email.trim().toLowerCase();
    const now = Date.now();
    const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
    const tsThreshold = admin.firestore.Timestamp.fromDate(fiveMinutesAgo);

    // 1. Security check: verify there is an actual matching document in Firestore created recently
    if (type === 'newsletter') {
      const subscriberId = createHash('sha256').update(emailLower).digest('hex');
      const [legacySnap, currentSnap] = await Promise.all([
        db.collection('newsletter_signups')
          .where('email', '==', emailLower)
          .limit(10)
          .get(),
        db.collection('newsletter_subscribers')
          .doc(subscriberId)
          .get(),
      ]);
      const isRecentLegacy = legacySnap.docs.some(document => {
        const createdAt = document.data().createdAt;
        return createdAt?.toMillis?.() >= tsThreshold.toMillis();
      });
      const currentUpdatedAt = currentSnap.data()?.updatedAt;
      const isRecentCurrent = currentSnap.exists &&
        currentUpdatedAt?.toMillis?.() >= tsThreshold.toMillis();

      if (!isRecentLegacy && !isRecentCurrent) {
        return NextResponse.json({ error: 'Verification failed: No matching recent newsletter signup found' }, { status: 400 });
      }
    } else if (type === 'beta') {
      const snap = await db.collection('beta_applications')
        .where('email', '==', emailLower)
        .where('createdAt', '>=', tsThreshold)
        .limit(1)
        .get();

      if (snap.empty) {
        return NextResponse.json({ error: 'Verification failed: No matching recent beta application found' }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 });
    }

    // 2. Fetch all Super Admins
    const adminsSnap = await db.collection('users').where('role', '==', 'superadmin').get();
    if (adminsSnap.empty) {
      console.warn('[Notify Admin] No superadmin users found in database.');
    }

    const adminEmails = new Set<string>(['team@thesquad.pro']);
    const fcmTokens: string[] = [];

    adminsSnap.docs.forEach(doc => {
      const data = doc.data();
      if (typeof data.email === 'string' && EMAIL_PATTERN.test(data.email.trim())) {
        adminEmails.add(data.email.trim().toLowerCase());
      }
      if (Array.isArray(data.fcmTokens)) {
        fcmTokens.push(...data.fcmTokens);
      }
    });

    // 3. Prepare Notification Content
    const title = type === 'beta' ? 'New Beta Application! 🚀' : 'New Newsletter Signup! 🏆';
    const msgBody = type === 'beta'
      ? `${name || 'Someone'} (${email}) applied for Beta. Role: ${role || 'N/A'}, Org: ${organization || 'N/A'}`
      : `${name ? `${name} (${email})` : email} signed up for the newsletter.`;

    const clickUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.thesquad.pro'}/admin`;

    // 4. Send Push Notifications asynchronously (catch and log errors)
    let pushSent = false;
    if (fcmTokens.length > 0) {
      try {
        const messaging = admin.messaging();
        const webpush = {
          notification: {
            icon: '/favicon-192.png',
            badge: '/favicon-192.png',
            click_action: clickUrl,
          },
          fcmOptions: { link: clickUrl },
        };

        // De-duplicate tokens
        const uniqueTokens = Array.from(new Set(fcmTokens));
        
        // FCM multicast allows sending up to 500 tokens at once
        await messaging.sendEachForMulticast({
          tokens: uniqueTokens,
          notification: { title, body: msgBody },
          webpush,
        });
        pushSent = true;
      } catch (fcmErr) {
        console.error('[Notify Admin] FCM send failed:', fcmErr);
      }
    }

    // 5. Send Email Notifications using Resend (catch and log errors)
    let emailSent = false;
    try {
      // Build HTML
      const htmlLayout = (titleText: string, contentHtml: string) => `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${escapeHtml(titleText)}</title>
        </head>
        <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
            <tr><td align="center">
              <table width="100%" style="max-width:560px;">
                <tr><td style="background:#6d28d9;border-radius:20px 20px 0 0;padding:32px 40px;text-align:center;">
                  <p style="margin:0;color:rgba(255,255,255,0.7);font-size:10px;font-weight:900;letter-spacing:0.25em;text-transform:uppercase;">THE SQUAD PRO</p>
                  <h1 style="margin:8px 0 0;color:#fff;font-size:26px;font-weight:900;letter-spacing:-0.5px;">${escapeHtml(titleText)}</h1>
                </td></tr>
                <tr><td style="background:#fff;padding:40px;border-radius:0 0 20px 20px;">
                  ${contentHtml}
                  <hr style="border:none;border-top:1px solid #e4e4e7;margin:32px 0;" />
                  <p style="margin:0;color:#a1a1aa;font-size:11px;text-align:center;">
                    © ${new Date().getFullYear()} The Squad Pro · <a href="https://www.thesquad.pro" style="color:#6d28d9;text-decoration:none;">thesquad.pro</a>
                  </p>
                </td></tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `;

      const fieldRow = (label: string, val: string) => `
        <tr>
          <td style="padding:10px 16px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0.15em;color:#71717a;width:40%;">${escapeHtml(label)}</td>
          <td style="padding:10px 16px;font-size:13px;font-weight:700;color:#18181b;">${escapeHtml(val)}</td>
        </tr>
      `;

      const emailSubject = (type === 'beta'
        ? `[Beta Application] ${name || 'New applicant'} applied`
        : `[Newsletter Signup] ${email}`).replace(/[\r\n]/g, ' ');

      const emailHtml = type === 'beta'
        ? htmlLayout('New Beta Application', `
            <p style="margin:0 0 8px;font-size:20px;font-weight:900;color:#18181b;">New Beta Application Received! 🚀</p>
            <p style="margin:0 0 24px;font-size:14px;color:#52525b;line-height:1.6;">
              A new user has submitted their application for early beta access. Here are their details:
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;border-radius:16px;overflow:hidden;margin-bottom:24px;">
              <tbody>
                ${fieldRow('Full Name', name || 'N/A')}
                ${fieldRow('Email', email)}
                ${fieldRow('Role', role || 'N/A')}
                ${fieldRow('Organization', organization || 'N/A')}
                ${sports ? fieldRow('Sports Managed', sports) : ''}
                ${scale ? fieldRow('Scale', scale) : ''}
                ${whyBeta ? fieldRow('Why Beta?', whyBeta) : ''}
              </tbody>
            </table>
            <div style="text-align:center;margin:28px 0;">
              <a href="${clickUrl}" style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;font-weight:900;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;padding:16px 40px;border-radius:100px;">
                Review in Admin Portal
              </a>
            </div>
          `)
        : htmlLayout('New Newsletter Lead', `
            <p style="margin:0 0 8px;font-size:20px;font-weight:900;color:#18181b;">New Newsletter Signup! 🏆</p>
            <p style="margin:0 0 24px;font-size:14px;color:#52525b;line-height:1.6;">
              Someone subscribed to the newsletter mailing list.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;border-radius:16px;overflow:hidden;margin-bottom:24px;">
              <tbody>
                ${name ? fieldRow('Name', name) : ''}
                ${fieldRow('Email', email)}
                ${fieldRow('Source', 'Landing Page')}
              </tbody>
            </table>
            <div style="text-align:center;margin:28px 0;">
              <a href="${clickUrl}" style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;font-weight:900;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;padding:16px 40px;border-radius:100px;">
                Manage in Admin Portal
              </a>
            </div>
          `);

      const recipients = [...adminEmails];
      const resend = getResend();
      emailSent = true;
      for (let offset = 0; offset < recipients.length; offset += 100) {
        const chunk = recipients.slice(offset, offset + 100);
        const { data, error } = await resend.batch.send(chunk.map(recipient => ({
          from: FROM,
          to: [recipient],
          subject: emailSubject,
          html: emailHtml,
        })));

        if (error || data?.data.length !== chunk.length) {
          console.error('[Notify Admin] Resend API error:', error);
          emailSent = false;
          break;
        }
      }
    } catch (resendErr) {
      emailSent = false;
      console.error('[Notify Admin] Email dispatch failed:', resendErr);
    }

    if (!emailSent) {
      return NextResponse.json(
        { error: 'Admin email notification failed.', pushSent, emailSent: false },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, pushSent, emailSent: true });

  } catch (err: any) {
    if (err instanceof RequestBodyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[Notify Admin] Route error:', err);
    return NextResponse.json({ error: 'Unable to send notification.' }, { status: 500 });
  }
}
