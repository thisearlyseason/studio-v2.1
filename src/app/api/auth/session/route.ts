import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { ensureAdminInit } from '@/lib/firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { resolveServerAccountSession } from '@/lib/server-account-session';
import {
  createSessionHandlers,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from '@/lib/session-route-handlers';

const handlers = createSessionHandlers({
  verifyFirebaseToken,
  ensureAdminInit,
  createSessionCookie: (idToken, options) => admin.auth().createSessionCookie(idToken, options),
  verifySessionCookie: (sessionCookie, checkRevoked) =>
    admin.auth().verifySessionCookie(sessionCookie, checkRevoked),
  resolveServerAccountSession,
  logUnavailable: () => console.error('[auth/session] Session establishment unavailable.'),
});

export const POST = handlers.POST;
export const GET = handlers.GET;

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, '', sessionCookieOptions(0));
  return response;
}
