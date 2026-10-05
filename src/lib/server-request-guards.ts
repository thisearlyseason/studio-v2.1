import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
export {
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/bounded-json';

export async function enforceUserRateLimit(
  userId: string,
  scope: string,
  limit: number,
  windowMs: number
): Promise<NextResponse | null> {
  const key = createHash('sha256').update(`${scope}:${userId}`).digest('hex');
  const ref = adminDb.collection('apiRateLimits').doc(key);
  const now = Date.now();

  const allowed = await adminDb.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() || {};
    const resetAt =
      typeof data.resetAt === 'number' && data.resetAt > now
        ? data.resetAt
        : now + windowMs;
    const count =
      typeof data.count === 'number' && data.resetAt > now
        ? data.count
        : 0;
    if (count >= limit) return false;

    transaction.set(ref, {
      userId,
      scope,
      count: count + 1,
      resetAt,
      updatedAt: now,
    });
    return true;
  });

  return allowed
    ? null
    : NextResponse.json(
        { error: 'Too many requests. Please wait and try again.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(windowMs / 1000)) } }
      );
}

export async function enforcePublicRateLimit(
  request: NextRequest,
  scope: string,
  limit: number,
  windowMs: number,
  discriminator = ''
): Promise<NextResponse | null> {
  const forwardedFor = request.headers.get('x-forwarded-for') || '';
  const clientAddress =
    forwardedFor.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const fingerprint = createHash('sha256')
    .update(`${clientAddress}:${userAgent}:${discriminator}`)
    .digest('hex');
  return enforceUserRateLimit(fingerprint, `public-${scope}`, limit, windowMs);
}

function getConfiguredAppOrigin(): string {
  const fallback = process.env.NODE_ENV === 'production'
    ? 'https://www.thesquad.pro'
    : 'http://localhost:9001';
  try {
    return new URL(process.env.NEXT_PUBLIC_APP_URL || fallback).origin;
  } catch {
    return new URL(fallback).origin;
  }
}

/** Return only a configured or explicitly allowed local origin for redirects. */
export function getTrustedAppOrigin(req: NextRequest): string {
  const configuredOrigin = getConfiguredAppOrigin();
  const requestOrigin = req.headers.get('origin');
  if (!requestOrigin) return configuredOrigin;
  try {
    const candidate = new URL(requestOrigin);
    if (candidate.origin === configuredOrigin) return candidate.origin;
    if (process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1', '[::1]'].includes(candidate.hostname)) {
      return candidate.origin;
    }
  } catch {
    // Invalid origins fall back to the configured value.
  }
  return configuredOrigin;
}

/** Validate a state-changing request against the configured application origin. */
export function isTrustedRequestOrigin(req: NextRequest): boolean {
  const requestOrigin = req.headers.get('origin');
  if (!requestOrigin) return true;
  try {
    return new URL(requestOrigin).origin === getConfiguredAppOrigin();
  } catch {
    return false;
  }
}
