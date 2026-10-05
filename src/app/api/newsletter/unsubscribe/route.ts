import { NextRequest, NextResponse } from 'next/server';
import {
  unsubscribeNewsletterSubscriber,
  validNewsletterUnsubscribeToken,
} from '@/lib/server-newsletter';

function page(title: string, message: string, form?: string, status = 200) {
  return new NextResponse(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
  <body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#111118"><main style="max-width:560px;margin:72px auto;padding:36px;background:#fff;border-radius:24px;text-align:center;border-top:8px solid #c91f26"><div style="font-weight:900;letter-spacing:.2em;color:#c91f26">THE SQUAD</div><h1>${title}</h1><p style="line-height:1.6;color:#52525b">${message}</p>${form || ''}</main></body></html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function readSignedRequest(request: NextRequest) {
  const email = request.nextUrl.searchParams.get('email')?.trim().toLowerCase() || '';
  const token = request.nextUrl.searchParams.get('token') || '';
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
  return { email, token, valid: validEmail && validNewsletterUnsubscribeToken(email, token) };
}

export async function GET(request: NextRequest) {
  const { email, token, valid } = readSignedRequest(request);
  if (!valid) return page('Invalid unsubscribe link', 'This link is invalid or has expired.');
  const action = `/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
  return page(
    'Unsubscribe?',
    `Stop newsletter emails to ${email.replace(/</g, '&lt;').replace(/>/g, '&gt;')}?`,
    `<form method="post" action="${action}"><button type="submit" style="border:0;border-radius:999px;background:#c91f26;color:#fff;padding:14px 28px;font-weight:800;cursor:pointer">Confirm unsubscribe</button></form>`
  );
}

export async function POST(request: NextRequest) {
  const { email, valid } = readSignedRequest(request);
  if (!valid) return page('Invalid unsubscribe link', 'This link is invalid or has expired.');
  try {
    await unsubscribeNewsletterSubscriber(email);
    return page('You are unsubscribed', 'You will no longer receive The Squad newsletter. You can subscribe again at any time.');
  } catch (error) {
    console.error('[Newsletter] Unsubscribe failed:', error);
    return page('Unable to unsubscribe', 'We could not update your subscription right now. Please try again.', undefined, 500);
  }
}
