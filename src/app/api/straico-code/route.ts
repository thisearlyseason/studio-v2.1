import { NextRequest, NextResponse } from 'next/server';
import { generateWithStraico, USE_STRAICO } from '@/lib/straico';
import { assertNonAnonymous, verifyFirebaseToken } from '@/lib/api-auth';
import { getPaidTeamFeatureAccess } from '@/lib/server-team-entitlements';
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
  const anonymousCheck = assertNonAnonymous(authResult);
  if (anonymousCheck) return anonymousCheck;

  try {
    const { prompt, teamId } = await readJsonBodyWithLimit<{
      prompt?: unknown;
      teamId?: unknown;
    }>(req, 32_000);

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json(
        { error: 'Missing or empty "prompt" field.' },
        { status: 400 }
      );
    }
    if (prompt.length > 10_000) {
      return NextResponse.json({ error: 'Prompt is too long.' }, { status: 400 });
    }
    if (typeof teamId !== 'string' || !teamId.trim()) {
      return NextResponse.json({ error: 'A valid teamId is required.' }, { status: 400 });
    }

    const rateLimit = await enforceUserRateLimit(
      authResult.uid,
      'straico-code',
      20,
      10 * 60 * 1000
    );
    if (rateLimit) return rateLimit;
    const access = await getPaidTeamFeatureAccess(
      authResult.uid,
      teamId,
      authResult.role === 'superadmin'
    );
    if (!access.allowed) {
      return NextResponse.json({ error: access.error }, { status: access.status });
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
