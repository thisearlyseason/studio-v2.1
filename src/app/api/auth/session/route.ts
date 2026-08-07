import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { SESSION_COOKIE_NAME } from '@/lib/server-dashboard-auth';

const SESSION_DURATION_MS = 12 * 60 * 60 * 1000;

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

function safeReturnPath(value: string | null): string {
  return value?.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && value.length <= 2_000
    ? value
    : '/dashboard';
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'A Firebase ID token is required.' }, { status: 401 });
  }

  try {
    const idToken = authHeader.slice(7);
    await getAdminAuth().verifyIdToken(idToken, true);
    const sessionCookie = await getAdminAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_DURATION_MS,
    });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, cookieOptions(SESSION_DURATION_MS / 1000));
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    console.error('[auth/session] Unable to create session:', error);
    return NextResponse.json({ error: 'Unable to create a secure session.' }, { status: 401 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, '', cookieOptions(0));
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function GET(req: NextRequest) {
  const returnTo = safeReturnPath(req.nextUrl.searchParams.get('returnTo'));
  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('reason', 'session');
  loginUrl.searchParams.set('returnTo', returnTo);
  const response = NextResponse.redirect(loginUrl);
  response.cookies.set(SESSION_COOKIE_NAME, '', cookieOptions(0));
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
