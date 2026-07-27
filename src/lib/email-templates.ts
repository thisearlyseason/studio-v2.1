import { escapeHtml } from '@/lib/html-escape';

/**
 * Email Templates — The Squad Pro
 * Pure HTML strings (no JSX deps) for maximum compatibility with Resend.
 * All templates are mobile-responsive with inline styles.
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://studio-6850142148-fe343.web.app';
const BRAND_COLOR = '#6d28d9'; // primary purple
const BRAND_NAME = 'The Squad Pro';

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;">

        <!-- Header -->
        <tr><td style="background:${BRAND_COLOR};border-radius:20px 20px 0 0;padding:32px 40px;text-align:center;">
          <p style="margin:0;color:rgba(255,255,255,0.7);font-size:10px;font-weight:900;letter-spacing:0.25em;text-transform:uppercase;">${BRAND_NAME}</p>
          <h1 style="margin:8px 0 0;color:#fff;font-size:26px;font-weight:900;letter-spacing:-0.5px;">${title}</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="background:#fff;padding:40px;border-radius:0 0 20px 20px;">
          ${body}
          <hr style="border:none;border-top:1px solid #e4e4e7;margin:32px 0;" />
          <p style="margin:0;color:#a1a1aa;font-size:11px;text-align:center;">
            © ${new Date().getFullYear()} ${BRAND_NAME} · <a href="${BASE_URL}" style="color:${BRAND_COLOR};text-decoration:none;">thesquad.pro</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(text: string, url: string): string {
  return `<div style="text-align:center;margin:28px 0;">
    <a href="${url}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;text-decoration:none;font-weight:900;font-size:13px;letter-spacing:0.1em;text-transform:uppercase;padding:16px 40px;border-radius:100px;">
      ${text}
    </a>
  </div>`;
}

function field(label: string, value: string): string {
  return `<tr>
    <td style="padding:10px 16px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0.15em;color:#71717a;width:40%;">${escapeHtml(label)}</td>
    <td style="padding:10px 16px;font-size:13px;font-weight:700;color:#18181b;">${escapeHtml(value)}</td>
  </tr>`;
}

// ── Template 1: Welcome / Beta Approved ─────────────────────────────────────
export function welcomeEmail({ name, email, resetLink, planType }: {
  name: string;
  email: string;
  resetLink: string;
  planType: string;
}): { subject: string; html: string } {
  const planLabel = planType === 'elite' ? 'Elite Club' : planType === 'school' ? 'School Hub' : planType === 'team' ? 'Pro Team' : 'Beta';
  return {
    subject: `Welcome to ${BRAND_NAME} — Your account is ready`,
    html: layout('Your Account is Ready', `
      <p style="margin:0 0 8px;font-size:22px;font-weight:900;color:#18181b;">Welcome, ${escapeHtml(name)}! 🎉</p>
      <p style="margin:0 0 28px;font-size:15px;color:#52525b;line-height:1.6;">
        Your <strong>${escapeHtml(planLabel)}</strong> beta access has been approved. Set your private password to activate the account:
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;border-radius:16px;overflow:hidden;margin-bottom:28px;">
        <tbody>
          ${field('Email', email)}
          ${field('Plan', planLabel)}
        </tbody>
      </table>

      <p style="margin:0 0 4px;font-size:12px;color:#a1a1aa;text-align:center;">This secure setup link expires automatically.</p>
      ${btn('Set Your Password', resetLink)}

      <p style="margin:24px 0 0;font-size:13px;color:#71717a;line-height:1.7;">
        Need help getting started? Check out the <a href="${BASE_URL}/how-to" style="color:${BRAND_COLOR};font-weight:700;">User Manual</a> or reply to this email — we're here.
      </p>
    `),
  };
}

// ── Template 2: Password Reset ───────────────────────────────────────────────
export function passwordResetEmail({ email, resetLink }: {
  email: string;
  resetLink: string;
}): { subject: string; html: string } {
  return {
    subject: `Reset your ${BRAND_NAME} password`,
    html: layout('Password Reset', `
      <p style="margin:0 0 20px;font-size:15px;color:#52525b;line-height:1.6;">
        We received a request to reset the password for <strong>${email}</strong>.
        Click the button below — this link expires in <strong>1 hour</strong>.
      </p>
      ${btn('Reset My Password', resetLink)}
      <p style="margin:24px 0 0;font-size:13px;color:#71717a;text-align:center;">
        If you didn't request this, you can safely ignore this email. Your password won't change.
      </p>
    `),
  };
}

// ── Template 3: Email Verification ──────────────────────────────────────────
export function verificationEmail({ name, email, verificationLink }: {
  name?: string;
  email: string;
  verificationLink: string;
}): { subject: string; html: string } {
  const greeting = name?.trim() ? `Hi ${escapeHtml(name.trim())},` : 'Welcome to The Squad Pro,';
  return {
    subject: `Verify your ${BRAND_NAME} email`,
    html: layout('Verify Your Email', `
      <p style="margin:0 0 10px;font-size:20px;font-weight:900;color:#18181b;">${greeting}</p>
      <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.65;">
        Confirm <strong>${escapeHtml(email)}</strong> to activate your account and securely open your team or league workspace.
      </p>
      <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:16px;padding:18px 20px;margin:0 0 8px;">
        <p style="margin:0;color:#6d28d9;font-size:11px;font-weight:900;letter-spacing:0.12em;text-transform:uppercase;">Secure account activation</p>
        <p style="margin:8px 0 0;color:#52525b;font-size:13px;line-height:1.55;">This one-time link verifies your address. The Squad Pro will never ask you to send a password by email.</p>
      </div>
      ${btn('Verify My Email', verificationLink)}
      <p style="margin:0;font-size:12px;color:#71717a;text-align:center;line-height:1.6;">
        If you didn't create this account, you can safely ignore this message.
      </p>
    `),
  };
}

// ── Template 4: New Event / Game Notification ────────────────────────────────
export function eventNotificationEmail({ recipientName, teamName, eventTitle, eventDate, eventTime, location, eventType }: {
  recipientName: string;
  teamName: string;
  eventTitle: string;
  eventDate: string;
  eventTime?: string;
  location?: string;
  eventType?: string;
}): { subject: string; html: string } {
  const typeLabel = eventType === 'game' ? '⚽ Game Day' : eventType === 'practice' ? '🏃 Practice' : eventType === 'tournament' ? '🏆 Tournament' : '📅 Event';
  return {
    subject: `${typeLabel}: ${eventTitle} — ${eventDate}`,
    html: layout(`${typeLabel}: ${eventTitle}`, `
      <p style="margin:0 0 8px;font-size:15px;color:#52525b;">Hi ${recipientName},</p>
      <p style="margin:0 0 28px;font-size:15px;color:#52525b;line-height:1.6;">
        A new ${eventType || 'event'} has been added to <strong>${teamName}</strong>'s calendar.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;border-radius:16px;overflow:hidden;margin-bottom:28px;">
        <tbody>
          ${field('Event', eventTitle)}
          ${field('Date', eventDate)}
          ${eventTime ? field('Time', eventTime) : ''}
          ${location ? field('Location', location) : ''}
          ${field('Team', teamName)}
        </tbody>
      </table>
      ${btn('View Schedule', `${BASE_URL}/dashboard/team`)}
    `),
  };
}

// ── Template 4: Document Signature Required ──────────────────────────────────
export function documentSignatureEmail({ recipientName, teamName, docTitle, deadline }: {
  recipientName: string;
  teamName: string;
  docTitle: string;
  deadline?: string;
}): { subject: string; html: string } {
  return {
    subject: `Action Required: "${docTitle}" needs your signature`,
    html: layout('Signature Required', `
      <p style="margin:0 0 8px;font-size:15px;color:#52525b;">Hi ${recipientName},</p>
      <p style="margin:0 0 28px;font-size:15px;color:#52525b;line-height:1.6;">
        <strong>${teamName}</strong> has sent a document that requires your signature.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf5ff;border:2px solid #e9d5ff;border-radius:16px;overflow:hidden;margin-bottom:28px;">
        <tbody>
          ${field('Document', docTitle)}
          ${field('From', teamName)}
          ${deadline ? field('Deadline', deadline) : ''}
        </tbody>
      </table>
      ${btn('Sign Document', `${BASE_URL}/dashboard/team`)}
      <p style="margin:0;font-size:13px;color:#71717a;text-align:center;">
        You can find and sign this document in your Team dashboard under Documents.
      </p>
    `),
  };
}

// ── Template 5: New Drill Added ──────────────────────────────────────────────
export function drillNotificationEmail({ recipientName, teamName, drillTitle, drillDescription }: {
  recipientName: string;
  teamName: string;
  drillTitle: string;
  drillDescription?: string;
}): { subject: string; html: string } {
  return {
    subject: `New drill added to ${teamName} playbook: ${drillTitle}`,
    html: layout('New Drill Added', `
      <p style="margin:0 0 8px;font-size:15px;color:#52525b;">Hi ${recipientName},</p>
      <p style="margin:0 0 28px;font-size:15px;color:#52525b;line-height:1.6;">
        Your coach has added a new drill to the <strong>${teamName}</strong> playbook.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;border-radius:16px;overflow:hidden;margin-bottom:28px;">
        <tbody>
          ${field('Drill', drillTitle)}
          ${drillDescription ? field('Description', drillDescription) : ''}
          ${field('Team', teamName)}
        </tbody>
      </table>
      ${btn('View Playbook', `${BASE_URL}/dashboard/team`)}
    `),
  };
}

// ── Template 6: Equipment Assigned ──────────────────────────────────────────
export function equipmentAssignedEmail({ recipientName, teamName, itemName, quantity, assignedAt }: {
  recipientName: string;
  teamName: string;
  itemName: string;
  quantity: number;
  assignedAt: string;
}): { subject: string; html: string } {
  return {
    subject: `Equipment assigned to you: ${itemName}`,
    html: layout('Equipment Assigned', `
      <p style="margin:0 0 8px;font-size:15px;color:#52525b;">Hi ${recipientName},</p>
      <p style="margin:0 0 28px;font-size:15px;color:#52525b;line-height:1.6;">
        Equipment has been checked out to you from <strong>${teamName}</strong>. Please confirm receipt with your coach.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;border-radius:16px;overflow:hidden;margin-bottom:28px;">
        <tbody>
          ${field('Item', itemName)}
          ${field('Quantity', String(quantity))}
          ${field('Checked Out', assignedAt)}
          ${field('Team', teamName)}
        </tbody>
      </table>
      ${btn('View Equipment', `${BASE_URL}/dashboard/equipment`)}
    `),
  };
}

// ── Template 7: General / Alert Notification ─────────────────────────────────
export function generalNotificationEmail({ recipientName, title, message, teamName, ctaLabel, ctaUrl }: {
  recipientName: string;
  title: string;
  message: string;
  teamName?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): { subject: string; html: string } {
  return {
    subject: `${title}${teamName ? ` — ${teamName}` : ''}`,
    html: layout(title, `
      <p style="margin:0 0 8px;font-size:15px;color:#52525b;">Hi ${recipientName},</p>
      <p style="margin:0 0 28px;font-size:15px;color:#52525b;line-height:1.6;">${message}</p>
      ${teamName ? `<p style="margin:0 0 28px;font-size:12px;color:#a1a1aa;text-transform:uppercase;letter-spacing:0.1em;font-weight:700;">From: ${teamName}</p>` : ''}
      ${ctaLabel && ctaUrl ? btn(ctaLabel, ctaUrl) : btn('Open The Squad Pro', `${BASE_URL}/dashboard/team`)}
    `),
  };
}
// ── Template 8: SaaS Owner — New Registration / Subscription Created ─────────
export function ownerNewRegistrationEmail({ planName, planId, customerEmail, userId, amount, interval }: {
  planName: string;
  planId: string;
  customerEmail: string;
  userId: string;
  amount: number;
  interval: string;
}): { subject: string; html: string } {
  const amountStr = amount > 0 ? `$${(amount / 100).toFixed(2)} / ${interval}` : 'Free';
  return {
    subject: `🎉 New Registration — ${planName} (${customerEmail})`,
    html: layout('New Subscription', `
      <p style="margin:0 0 8px;font-size:22px;font-weight:900;color:#18181b;">New customer signed up! 🎉</p>
      <p style="margin:0 0 28px;font-size:15px;color:#52525b;line-height:1.6;">
        A new account has been created and a subscription is now active.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;border-radius:16px;overflow:hidden;margin-bottom:28px;">
        <tbody>
          ${field('Customer', customerEmail)}
          ${field('Plan', planName)}
          ${field('Plan ID', planId)}
          ${field('Amount', amountStr)}
          ${field('User ID', userId)}
          ${field('Timestamp', new Date().toLocaleString('en-US', { timeZoneName: 'short' }))}
        </tbody>
      </table>
      ${btn('View in Admin Dashboard', `${BASE_URL}/admin`)}
    `),
  };
}

// ── Template 9: SaaS Owner — Payment Received ────────────────────────────────
export function ownerPaymentReceivedEmail({ customerEmail, planName, amount, currency, invoiceId }: {
  customerEmail: string;
  planName: string;
  amount: number;
  currency: string;
  invoiceId: string;
}): { subject: string; html: string } {
  const amountStr = `${currency.toUpperCase()} $${(amount / 100).toFixed(2)}`;
  return {
    subject: `💰 Payment Received — ${amountStr} from ${customerEmail}`,
    html: layout('Payment Received', `
      <p style="margin:0 0 8px;font-size:22px;font-weight:900;color:#18181b;">Payment confirmed ✅</p>
      <p style="margin:0 0 28px;font-size:15px;color:#52525b;line-height:1.6;">
        A subscription payment has been successfully processed.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:2px solid #bbf7d0;border-radius:16px;overflow:hidden;margin-bottom:28px;">
        <tbody>
          ${field('Customer', customerEmail)}
          ${field('Plan', planName)}
          ${field('Amount', amountStr)}
          ${field('Invoice ID', invoiceId)}
          ${field('Date', new Date().toLocaleString('en-US', { timeZoneName: 'short' }))}
        </tbody>
      </table>
      ${btn('View Stripe Dashboard', 'https://dashboard.stripe.com/payments')}
    `),
  };
}

// ── Template 10: SaaS Owner — Subscription Cancelled ────────────────────────
export function ownerCancellationEmail({ customerEmail, planName, userId, cancelledAt }: {
  customerEmail: string;
  planName: string;
  userId: string;
  cancelledAt: string;
}): { subject: string; html: string } {
  return {
    subject: `⚠️ Subscription Cancelled — ${customerEmail} (${planName})`,
    html: layout('Subscription Cancelled', `
      <p style="margin:0 0 8px;font-size:22px;font-weight:900;color:#18181b;">Subscription cancelled</p>
      <p style="margin:0 0 28px;font-size:15px;color:#52525b;line-height:1.6;">
        A customer has cancelled their subscription. Their account has been downgraded to Free.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:2px solid #fed7aa;border-radius:16px;overflow:hidden;margin-bottom:28px;">
        <tbody>
          ${field('Customer', customerEmail)}
          ${field('Plan', planName)}
          ${field('User ID', userId)}
          ${field('Cancelled At', cancelledAt)}
        </tbody>
      </table>
      ${btn('View in Admin Dashboard', `${BASE_URL}/admin`)}
    `),
  };
}

// ── Template 11: SaaS Owner — Payment Failed ────────────────────────────────
export function ownerPaymentFailedEmail({ customerEmail, planName, amount, currency, failureReason }: {
  customerEmail: string;
  planName: string;
  amount: number;
  currency: string;
  failureReason?: string;
}): { subject: string; html: string } {
  const amountStr = `${currency.toUpperCase()} $${(amount / 100).toFixed(2)}`;
  return {
    subject: `🚨 Payment Failed — ${amountStr} from ${customerEmail}`,
    html: layout('Payment Failed', `
      <p style="margin:0 0 8px;font-size:22px;font-weight:900;color:#ef4444;">Payment failed 🚨</p>
      <p style="margin:0 0 28px;font-size:15px;color:#52525b;line-height:1.6;">
        A subscription payment attempt has failed. The customer may need to update their payment method.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#fef2f2;border:2px solid #fecaca;border-radius:16px;overflow:hidden;margin-bottom:28px;">
        <tbody>
          ${field('Customer', customerEmail)}
          ${field('Plan', planName)}
          ${field('Amount', amountStr)}
          ${failureReason ? field('Reason', failureReason) : ''}
          ${field('Date', new Date().toLocaleString('en-US', { timeZoneName: 'short' }))}
        </tbody>
      </table>
      ${btn('View in Stripe', 'https://dashboard.stripe.com/payments')}
    `),
  };
}
