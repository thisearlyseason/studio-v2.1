import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { deleteAnonymousDemo } from '@/lib/server-demo-cleanup';

const SESSION_COOKIE = '__session';

function clearedSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: 'Cross-origin demo cleanup is not allowed.' }, { status: 403 });
  }

  const sessionCookie = request.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionCookie) return clearedSessionCookie(new NextResponse(null, { status: 204 }));

  try {
    const decoded = await getAdminAuth().verifySessionCookie(sessionCookie, true);
    if (decoded.firebase?.sign_in_provider !== 'anonymous') {
      return NextResponse.json({ error: 'Only anonymous demos can be reset here.' }, { status: 403 });
    }
    await deleteAnonymousDemo(decoded.uid);
    return clearedSessionCookie(new NextResponse(null, { status: 204 }));
  } catch (error: unknown) {
    const code = (error as { code?: string }).code;
    if (code?.startsWith('auth/')) {
      return clearedSessionCookie(new NextResponse(null, { status: 204 }));
    }
    console.error('[demo/exit] Immediate demo cleanup failed:', error);
    return NextResponse.json({ error: 'Demo cleanup will be retried automatically.' }, { status: 503 });
  }
}
