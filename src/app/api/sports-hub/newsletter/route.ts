import { NextRequest, NextResponse } from 'next/server';
import { subscribeToNewsletter } from '@/lib/server-newsletter';
import {
  enforcePublicRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

export async function POST(req: NextRequest) {
  try {
    const { email, name } = await readJsonBodyWithLimit<{
      email?: unknown;
      name?: unknown;
    }>(req, 8_000);

    if (
      typeof email !== 'string' ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email)
    ) {
      return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
    }
    if (name !== undefined && (typeof name !== 'string' || name.length > 120)) {
      return NextResponse.json({ error: 'Invalid name' }, { status: 400 });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const rateLimit = await enforcePublicRateLimit(
      req,
      'sports-newsletter',
      5,
      60 * 60 * 1000,
      normalizedEmail
    );
    if (rateLimit) return rateLimit;

    await subscribeToNewsletter({
      email: normalizedEmail,
      name: typeof name === 'string' ? name.trim() : '',
      source: 'sports_hub',
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[Sports Hub] Newsletter signup error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to save subscription.',
    }, { status: 503 });
  }
}
