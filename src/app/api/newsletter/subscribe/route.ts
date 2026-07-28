import { NextRequest, NextResponse } from 'next/server';
import { subscribeToNewsletter } from '@/lib/server-newsletter';
import {
  enforcePublicRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBodyWithLimit<{
      email?: unknown;
      name?: unknown;
      source?: unknown;
    }>(request, 8_000);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const source = body.source === 'sports_hub' ? 'sports_hub' : 'landing_page';

    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (name.length > 120) {
      return NextResponse.json({ error: 'Name is too long.' }, { status: 400 });
    }
    const rateLimit = await enforcePublicRateLimit(
      request,
      'newsletter-subscribe',
      5,
      60 * 60 * 1000,
      email
    );
    if (rateLimit) return rateLimit;

    await subscribeToNewsletter({ email, name, source });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[Newsletter] Signup failed:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to save your subscription.',
    }, { status: 503 });
  }
}
