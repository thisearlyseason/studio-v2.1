/**
 * Server-side Firebase ID Token verification.
 * Uses the Firebase Admin SDK to cryptographically verify the JWT signature.
 * 
 * Call verifyFirebaseToken(request) at the top of every authenticated API route.
 * 
 * SECURITY NOTE: The previous implementation used the `accounts:lookup` REST
 * endpoint which does NOT verify the JWT signature — it only looks up a user by
 * token. This has been replaced with `admin.auth().verifyIdToken()` which performs
 * full cryptographic JWT signature verification against Firebase's public keys.
 */

import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { adminDb, ensureAdminInit, getAdminProjectId } from '@/lib/firebase-admin';
import { isAccountAccessBlocked } from '@/lib/account-access-policy';

export interface DecodedToken {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  role?: string;
  authTime?: number;
  signInProvider?: string;
}

export interface VerifyFirebaseTokenOptions {
  allowUnverifiedEmail?: boolean;
}

export function assertNonAnonymous(authResult: DecodedToken): NextResponse | null {
  if (authResult.signInProvider === 'anonymous') {
    return NextResponse.json(
      { error: 'This operation requires a registered account.' },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Verifies a Firebase ID Token from the Authorization header.
 * Returns the decoded token on success, or a NextResponse error on failure.
 * 
 * Usage:
 *   const authResult = await verifyFirebaseToken(req);
 *   if (authResult instanceof NextResponse) return authResult; // auth failed
 *   const { uid } = authResult;
 */
export async function verifyFirebaseToken(
  req: NextRequest,
  options: VerifyFirebaseTokenOptions = {}
): Promise<DecodedToken | NextResponse> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing or invalid Authorization header. Expected: Bearer <firebase-id-token>' },
      { status: 401 }
    );
  }

  const idToken = authHeader.slice(7); // Remove "Bearer "

  try {
    // Explicitly initialize the Admin SDK before calling admin.auth().
    // Call the initializer directly rather than relying on lazy Firestore access.
    ensureAdminInit();

    // Cryptographically verify the JWT signature and expiry.
    // This is the ONLY correct way to verify Firebase ID tokens server-side.
    const decodedToken = await admin.auth().verifyIdToken(idToken, true);

    const role = (decodedToken as any).role as string | undefined;
    const signInProvider = (decodedToken.firebase as { sign_in_provider?: string } | undefined)?.sign_in_provider;

    if (
      signInProvider !== 'anonymous' &&
      role !== 'superadmin' &&
      !options.allowUnverifiedEmail &&
      decodedToken.email_verified !== true
    ) {
      return NextResponse.json(
        {
          error: 'Verify your email address before accessing this account.',
          code: 'auth/email-not-verified',
        },
        { status: 403 }
      );
    }

    if (signInProvider !== 'anonymous') {
      const profile = await adminDb.collection('users').doc(decodedToken.uid).get();
      if (profile.exists && isAccountAccessBlocked(profile.data())) {
        return NextResponse.json(
          {
            error: 'This account is unavailable. Contact support if you believe this is an error.',
            code: 'auth/account-disabled',
          },
          { status: 403 },
        );
      }
    }

    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
      role,
      authTime: decodedToken.auth_time,
      signInProvider,
    };
  } catch (err: any) {
    let tokenProjectId: string | null = null;
    try {
      const encodedPayload = idToken.split('.')[1];
      const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
      tokenProjectId = typeof payload.aud === 'string' ? payload.aud : null;
    } catch {
      // The Admin SDK remains authoritative; this decode is diagnostics only.
    }
    let adminProjectId: string | null = null;
    try {
      adminProjectId = getAdminProjectId();
    } catch {
      // Initialization failures are reported by the generic service error below.
    }
    if (tokenProjectId && adminProjectId && tokenProjectId !== adminProjectId) {
      console.error('[verifyFirebaseToken] Firebase project mismatch.', {
        tokenProjectId,
        adminProjectId,
      });
      return NextResponse.json(
        {
          error: 'Your browser session belongs to a different Firebase environment. Sign out, refresh, and sign in again.',
          code: 'auth/project-mismatch',
        },
        { status: 401 }
      );
    }
    // verifyIdToken throws for expired tokens, invalid signatures, revoked tokens, etc.
    if (
      err.code === 'auth/id-token-expired' ||
      err.code === 'auth/argument-error' ||
      err.code === 'auth/id-token-revoked'
    ) {
      return NextResponse.json(
        { error: 'Invalid or expired authentication token. Sign out and sign in again.', code: err.code },
        { status: 401 }
      );
    }
    // Log full error detail for easier Vercel log diagnosis
    console.error(
      '[verifyFirebaseToken] Unexpected error — code:', err.code,
      '| message:', err.message,
      '| FIREBASE_SERVICE_ACCOUNT_JSON set:', !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      '| admin.apps.length:', admin.apps.length
    );
    return NextResponse.json(
      { error: `Authentication service error. Please try again. (code: ${err.code ?? 'unknown'})` },
      { status: 503 }
    );
  }
}

/**
 * Validates that the authenticated user is the same as the requested userId.
 * Prevents users from performing operations on other users' accounts.
 */
export function assertOwner(
  authResult: DecodedToken,
  requestedUserId: string
): NextResponse | null {
  if (authResult.uid !== requestedUserId) {
    return NextResponse.json(
      { error: 'Forbidden: You may only perform this action on your own account.' },
      { status: 403 }
    );
  }
  return null; // null = ownership verified
}
