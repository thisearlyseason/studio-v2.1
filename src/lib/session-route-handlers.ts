import { NextRequest, NextResponse } from 'next/server';
import type * as admin from 'firebase-admin';
import type { DecodedToken } from '@/lib/api-auth';
import type { AccountSessionDecision } from '@/lib/account-session-policy';

export const SESSION_COOKIE_NAME = '__session';
export const SESSION_DURATION_MS = 5 * 24 * 60 * 60 * 1000;

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  };
}

type SessionRouteDependencies = {
  verifyFirebaseToken(request: NextRequest): Promise<DecodedToken | NextResponse>;
  ensureAdminInit(): void;
  createSessionCookie(idToken: string, options: { expiresIn: number }): Promise<string>;
  verifySessionCookie(sessionCookie: string, checkRevoked: boolean): Promise<admin.auth.DecodedIdToken>;
  resolveServerAccountSession(identity: {
    uid: string;
    role?: string;
    signInProvider?: string;
  }): Promise<AccountSessionDecision>;
  logUnavailable?(): void;
};

function clearSession(response: NextResponse): NextResponse {
  response.cookies.set(SESSION_COOKIE_NAME, '', sessionCookieOptions(0));
  return response;
}

export function createSessionHandlers(dependencies: SessionRouteDependencies) {
  async function POST(request: NextRequest) {
    const auth = await dependencies.verifyFirebaseToken(request);
    if (auth instanceof NextResponse) return auth;
    const authorization = request.headers.get('authorization') || '';
    const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!idToken) {
      return NextResponse.json({ error: 'Authentication token is required.' }, { status: 401 });
    }

    try {
      const access = await dependencies.resolveServerAccountSession({
        uid: auth.uid,
        role: auth.role,
        signInProvider: auth.signInProvider,
      });
      if (!access.allowed) {
        return NextResponse.json(
          { error: 'This account is unavailable.', code: access.code },
          { status: 403 },
        );
      }

      dependencies.ensureAdminInit();
      const sessionCookie = await dependencies.createSessionCookie(idToken, {
        expiresIn: SESSION_DURATION_MS,
      });
      const response = NextResponse.json({ ok: true, redirectTo: access.redirectTo });
      response.cookies.set(
        SESSION_COOKIE_NAME,
        sessionCookie,
        sessionCookieOptions(Math.floor(SESSION_DURATION_MS / 1000)),
      );
      return response;
    } catch {
      dependencies.logUnavailable?.();
      return NextResponse.json(
        { error: 'Authentication service is temporarily unavailable.' },
        { status: 503 },
      );
    }
  }

  async function GET(request: NextRequest) {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!sessionCookie) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    let decoded: admin.auth.DecodedIdToken;
    try {
      dependencies.ensureAdminInit();
      decoded = await dependencies.verifySessionCookie(sessionCookie, true);
    } catch {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    if (
      decoded.firebase?.sign_in_provider !== 'anonymous' &&
      decoded.email_verified !== true &&
      decoded.role !== 'superadmin'
    ) {
      return NextResponse.json({ authenticated: false }, { status: 403 });
    }

    try {
      const access = await dependencies.resolveServerAccountSession({
        uid: decoded.uid,
        role: typeof decoded.role === 'string' ? decoded.role : undefined,
        signInProvider: decoded.firebase?.sign_in_provider,
      });
      if (!access.allowed) {
        return clearSession(NextResponse.json(
          { authenticated: false, code: access.code },
          { status: 403 },
        ));
      }
      return NextResponse.json({
        authenticated: true,
        uid: decoded.uid,
        role: decoded.role || null,
        redirectTo: access.redirectTo,
      });
    } catch {
      return NextResponse.json(
        { authenticated: false, error: 'Authentication service is temporarily unavailable.' },
        { status: 503 },
      );
    }
  }

  return { POST, GET };
}
