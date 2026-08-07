import { NextRequest, NextResponse } from 'next/server';
import { getResend } from '@/lib/resend-client';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, getAdminMessaging } from '@/lib/firebase-admin';

const FROM = 'The Squad Pro <noreply@thesquad.pro>';
const EMAIL_PATTERN = /^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/;

function escapeHtml(value: unknown): string {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
}

export async function POST(req: NextRequest) {
  try {
    const fingerprint = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';
    const limited = await enforceUserRateLimit(fingerprint, 'notify-admin', 8, 60 * 60 * 1000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 12_000);
    const { type, name, email, role, organization, sports, scale, whyBeta, inquiry } = body;
    const notificationType = String(type);
    const emailValue = typeof email === 'string' ? email.trim().toLowerCase() : '';

    if (!['newsletter', 'beta', 'contact'].includes(notificationType) || !EMAIL_PATTERN.test(emailValue)) {
      return NextResponse.json({ error: 'Missing required fields: type, email' }, { status: 400 });
    }

    const db = adminDb;

    const emailLower = emailValue;
    const now = Date.now();
    const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
    // Verify an actual recent Firestore submission before sending any admin mail.
    const sourceCollection = notificationType === 'newsletter' ? 'newsletter_signups' : notificationType === 'beta' ? 'beta_applications' : 'contact_inquiries';
    let recentMatches = await db.collection(sourceCollection).where('email', '==', emailLower).limit(20).get();
    if (recentMatches.empty && typeof email === 'string' && email.trim() !== emailLower) {
      recentMatches = await db.collection(sourceCollection).where('email', '==', email.trim()).limit(20).get();
    }
    const recent = recentMatches.docs.find(snapshot => {
      const createdAt = snapshot.data().createdAt;
      const millis = typeof createdAt?.toMillis === 'function' ? createdAt.toMillis() : Date.parse(String(createdAt || ''));
      return Number.isFinite(millis) && millis >= fiveMinutesAgo.getTime();
    });
    if (!recent) {
      return NextResponse.json({ error: 'Verification failed: no matching recent submission found' }, { status: 400 });
    }
    if (notificationType === 'contact' && (typeof inquiry !== 'string' || inquiry.trim().length < 3)) {
      return NextResponse.json({ error: 'Contact inquiry is required' }, { status: 400 });
    }

    const claimed = await db.runTransaction(async transaction => {
      const current = await transaction.get(recent.ref);
      if (current.data()?.adminNotificationSentAt) return false;
      transaction.update(recent.ref, { adminNotificationSentAt: FieldValue.serverTimestamp() });
      return true;
    });
    if (!claimed) return NextResponse.json({ ok: true, alreadyNotified: true });

    // 2. Fetch all Super Admins
    const adminsSnap = await db.collection('users').where('role', '==', 'superadmin').get();
    if (adminsSnap.empty) {
      console.warn('[Notify Admin] No superadmin users found in database.');
      return NextResponse.json({ ok: true, message: 'No superadmins found to notify' });
    }

    const adminEmails: string[] = [];
    const fcmTokens: string[] = [];

    adminsSnap.docs.forEach(doc => {
      const data = doc.data();
      if (data.email) adminEmails.push(data.email);
      if (Array.isArray(data.fcmTokens)) {
        fcmTokens.push(...data.fcmTokens);
      }
    });

    // Make sure we have at least the default admin email as fallback if none found
    if (adminEmails.length === 0) {
      adminEmails.push('admin@thesquad.pro');
    }

    // 3. Prepare Notification Content
    const title = notificationType === 'beta' ? 'New Beta Application! 🚀' : notificationType === 'contact' ? 'New Contact Inquiry' : 'New Newsletter Signup! 🏆';
    const msgBody = notificationType === 'beta'
      ? `${name || 'Someone'} (${emailValue}) applied for Beta. Role: ${role || 'N/A'}, Org: ${organization || 'N/A'}`
      : notificationType === 'contact'
        ? `${name || 'Someone'} (${emailValue}) sent a contact inquiry.`
        : `${name ? `${name} (${emailValue})` : emailValue} signed up for the newsletter.`;

    const clickUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://www.thesquad.pro'}/admin`;

    // 4. Send Push Notifications asynchronously (catch and log errors)
    let pushSent = false;
    if (fcmTokens.length > 0) {
      try {
        const messaging = getAdminMessaging();
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

      const fieldRow = (label: string, val: unknown) => `
        <tr>
          <td style="padding:10px 16px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0.15em;color:#71717a;width:40%;">${escapeHtml(label)}</td>
          <td style="padding:10px 16px;font-size:13px;font-weight:700;color:#18181b;">${escapeHtml(val)}</td>
        </tr>
      `;

      const emailSubject = notificationType === 'beta'
        ? `[Beta Application] ${String(name || 'New applicant').slice(0, 100)} applied`
        : notificationType === 'contact' ? `[Contact Inquiry] ${String(name || 'New inquiry').slice(0, 100)}`
        : `[Newsletter Signup] ${emailValue}`;

      const emailHtml = notificationType === 'beta'
        ? htmlLayout('New Beta Application', `
            <p style="margin:0 0 8px;font-size:20px;font-weight:900;color:#18181b;">New Beta Application Received! 🚀</p>
            <p style="margin:0 0 24px;font-size:14px;color:#52525b;line-height:1.6;">
              A new user has submitted their application for early beta access. Here are their details:
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;border-radius:16px;overflow:hidden;margin-bottom:24px;">
              <tbody>
                ${fieldRow('Full Name', name || 'N/A')}
                ${fieldRow('Email', emailValue)}
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
        : notificationType === 'contact' ? htmlLayout('New Contact Inquiry', `
            <p style="margin:0 0 8px;font-size:20px;font-weight:900;color:#18181b;">New Contact Inquiry</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;border-radius:16px;overflow:hidden;margin-bottom:24px;">
              <tbody>
                ${fieldRow('Name', String(name || 'N/A'))}
                ${fieldRow('Email', emailValue)}
                ${fieldRow('Organization', String(organization || 'N/A'))}
                ${fieldRow('Inquiry', String(inquiry || ''))}
              </tbody>
            </table>
          `)
        : htmlLayout('New Newsletter Lead', `
            <p style="margin:0 0 8px;font-size:20px;font-weight:900;color:#18181b;">New Newsletter Signup! 🏆</p>
            <p style="margin:0 0 24px;font-size:14px;color:#52525b;line-height:1.6;">
              Someone subscribed to the newsletter mailing list.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;border-radius:16px;overflow:hidden;margin-bottom:24px;">
              <tbody>
                ${name ? fieldRow('Name', name) : ''}
                ${fieldRow('Email', emailValue)}
                ${fieldRow('Source', 'Landing Page')}
              </tbody>
            </table>
            <div style="text-align:center;margin:28px 0;">
              <a href="${clickUrl}" style="display:inline-block;background:#6d28d9;color:#fff;text-decoration:none;font-weight:900;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;padding:16px 40px;border-radius:100px;">
                Manage in Admin Portal
              </a>
            </div>
          `);

      const { error } = await getResend().emails.send({
        from: FROM,
        to: adminEmails,
        subject: emailSubject,
        html: emailHtml,
      });

      if (error) {
        console.error('[Notify Admin] Resend API error:', error);
      } else {
        emailSent = true;
      }
    } catch (resendErr) {
      console.error('[Notify Admin] Email dispatch failed:', resendErr);
    }

    return NextResponse.json({ ok: true, pushSent, emailSent });

  } catch (err: any) {
    if (err instanceof RequestBodyError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error('[Notify Admin] Route error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
