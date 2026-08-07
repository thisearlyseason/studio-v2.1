import { NextRequest, NextResponse } from 'next/server';
import { generateWithStraico, USE_STRAICO } from '@/lib/straico';
import { verifyFirebaseToken } from '@/lib/api-auth';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  // ── Auth guard: must be a signed-in user to use paid AI endpoints ──────
  const authResult = await verifyFirebaseToken(req);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const limited = await enforceUserRateLimit(authResult.uid, 'straico-code', 30, 60 * 60 * 1000);
    if (limited) return limited;

    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 12_000);
    const { prompt } = body as { prompt?: string };

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json(
        { error: 'Missing or empty "prompt" field.' },
        { status: 400 }
      );
    }
    if (prompt.length > 8_000) {
      return NextResponse.json(
        { error: 'Prompt must be 8000 characters or fewer.' },
        { status: 400 }
      );
    }

    if (!USE_STRAICO) {
      return NextResponse.json(
        { error: 'Straico is disabled (USE_STRAICO=false). Enable it to use this endpoint.' },
        { status: 503 }
      );
    }

    const response = await generateWithStraico(prompt);
    return NextResponse.json({ response });

  } catch (err: any) {
    if (err instanceof RequestBodyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // Distinguish "all failed" from other errors
    if (err?.message === 'STRAICO_ALL_FAILED') {
      return NextResponse.json(
        { error: 'Straico and all fallback models failed. Try again later.' },
        { status: 502 }
      );
    }
    if (err?.message === 'USE_STRAICO is false — use default model') {
      return NextResponse.json(
        { error: 'Straico is disabled.' },
        { status: 503 }
      );
    }
    console.error('[/api/straico-code] Unhandled error:', err);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
