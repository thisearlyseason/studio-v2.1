import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export class RequestBodyError extends Error {
  constructor(message: string, public readonly status: number = 400) {
    super(message);
    this.name = 'RequestBodyError';
  }
}

type RateLimitEntry = { count: number; resetAt: number };

// This protects a single running instance. Durable rate limiting should be
// added at the edge or backed by a shared store before horizontal scaling.
const rateLimitStore = new Map<string, RateLimitEntry>();

export async function enforceUserRateLimit(
  userId: string,
  bucket: string,
  limit: number,
  windowMs: number,
): Promise<NextResponse | null> {
  const now = Date.now();
  const key = `${bucket}:${userId}`;
  const current = rateLimitStore.get(key);
  const entry = current && current.resetAt > now
    ? current
    : { count: 0, resetAt: now + windowMs };

  entry.count += 1;
  rateLimitStore.set(key, entry);

  if (entry.count > limit) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((entry.resetAt - now) / 1000)) } },
    );
  }

  return null;
}

export async function readJsonBodyWithLimit<T>(
  req: NextRequest,
  maxBytes: number,
): Promise<T> {
  const declaredLength = Number.parseInt(req.headers.get('content-length') || '', 10);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestBodyError(`Request body is too large (maximum ${maxBytes} bytes).`, 413);
  }

  const raw = await req.text();
  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    throw new RequestBodyError(`Request body is too large (maximum ${maxBytes} bytes).`, 413);
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new RequestBodyError('Request body must be valid JSON.', 400);
  }
}

/**
 * Returns an application origin suitable for redirects sent to third parties.
 * Never trusts an arbitrary Origin/Host header in production.
 */
export function getTrustedAppOrigin(req: NextRequest): string {
  const fallback = process.env.NODE_ENV === 'production'
    ? 'https://www.thesquad.pro'
    : 'http://localhost:9002';
  const configuredValue = process.env.NEXT_PUBLIC_APP_URL || fallback;

  let configured: URL;
  try {
    configured = new URL(configuredValue);
  } catch {
    configured = new URL(fallback);
  }

  const requestOrigin = req.headers.get('origin');
  if (!requestOrigin) return configured.origin;

  try {
    const candidate = new URL(requestOrigin);
    if (candidate.origin === configured.origin) return candidate.origin;
    if (
      process.env.NODE_ENV !== 'production' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(candidate.hostname) &&
      ['http:', 'https:'].includes(candidate.protocol)
    ) {
      return candidate.origin;
    }
  } catch {
    // Fall through to the configured origin.
  }

  return configured.origin;
}
