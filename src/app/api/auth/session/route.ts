import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { ensureAdminInit } from '@/lib/firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';

const SESSION_COOKIE = '__session';
const SESSION_DURATION_MS = 5 * 24 * 60 * 60 * 1000;

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;
  const authorization = request.headers.get('authorization') || '';
  const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!idToken) {
    return NextResponse.json({ error: 'Authentication token is required.' }, { status: 401 });
  }

  try {
    ensureAdminInit();
    const sessionCookie = await admin.auth().createSessionCookie(idToken, {
      expiresIn: SESSION_DURATION_MS,
    });
    const response = NextResponse.json({ ok: true });
    response.cookies.set(
      SESSION_COOKIE,
      sessionCookie,
      cookieOptions(Math.floor(SESSION_DURATION_MS / 1000))
    );
    return response;
  } catch (error) {
    console.error('[auth/session] Unable to create session:', error);
    return NextResponse.json({ error: 'Unable to establish a secure session.' }, { status: 401 });
  }
}

export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionCookie) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
  try {
    ensureAdminInit();
    const decoded = await admin.auth().verifySessionCookie(sessionCookie, true);
    if (
      decoded.firebase?.sign_in_provider !== 'anonymous' &&
      decoded.email_verified !== true &&
      decoded.role !== 'superadmin'
    ) {
      return NextResponse.json({ authenticated: false }, { status: 403 });
    }
    return NextResponse.json({
      authenticated: true,
      uid: decoded.uid,
      role: decoded.role || null,
    });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', cookieOptions(0));
  return response;
}
