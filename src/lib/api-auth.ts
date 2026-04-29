/**
 * Server-side Firebase ID Token verification.
 * Uses Firebase's public REST endpoint — no firebase-admin SDK required.
 * 
 * Call verifyFirebaseToken(request) at the top of every authenticated API route.
 */

import { NextRequest, NextResponse } from 'next/server';

interface DecodedToken {
  uid: string;
  email?: string;
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

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'studio-6850142148-fe343';

  try {
    // Use Google's secure token verification endpoint
    const verifyUrl = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyA8G2_7gu0WK8efQ9sl7UJG6tsrC7iOCdU'
    }`;

    const response = await fetch(verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('[verifyFirebaseToken] Token verification failed:', err);
      return NextResponse.json(
        { error: 'Invalid or expired authentication token.' },
        { status: 401 }
      );
    }

    const data = await response.json();
    const userInfo = data?.users?.[0];

    if (!userInfo?.localId) {
      return NextResponse.json(
        { error: 'Could not extract user identity from token.' },
        { status: 401 }
      );
    }

    return { uid: userInfo.localId, email: userInfo.email };
  } catch (err: any) {
    console.error('[verifyFirebaseToken] Network error during verification:', err.message);
    return NextResponse.json(
      { error: 'Authentication service unavailable. Please try again.' },
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
