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
import { getApps } from 'firebase-admin/app';
import { getAdminAuth } from '@/lib/firebase-admin';

interface DecodedToken {
  uid: string;
  email?: string;
  role?: string;
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
  req: NextRequest
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
    // Cryptographically verify the JWT signature and expiry.
    // This is the ONLY correct way to verify Firebase ID tokens server-side.
    const decodedToken = await getAdminAuth().verifyIdToken(idToken, true);

    const role = (decodedToken as any).role as string | undefined;

    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      role,
    };
  } catch (err: any) {
    // verifyIdToken throws for expired tokens, invalid signatures, revoked tokens, etc.
    if (
      err.code === 'auth/id-token-expired' ||
      err.code === 'auth/argument-error' ||
      err.code === 'auth/id-token-revoked'
    ) {
      return NextResponse.json(
        { error: 'Invalid or expired authentication token.' },
        { status: 401 }
      );
    }
    // Log full error detail for easier Vercel log diagnosis
    console.error(
      '[verifyFirebaseToken] Unexpected error — code:', err.code,
      '| message:', err.message,
      '| FIREBASE_SERVICE_ACCOUNT_JSON set:', !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      '| admin apps:', getApps().length
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
