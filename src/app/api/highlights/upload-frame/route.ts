import { NextRequest, NextResponse } from 'next/server';
import { assertNonAnonymous, verifyFirebaseToken } from '@/lib/api-auth';
import { getPaidTeamFeatureAccess } from '@/lib/server-team-entitlements';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

/**
 * /api/highlights/upload-frame
 * REQUIRES: Firebase Auth token in Authorization header.
 *
 * Retired compatibility route. Athlete frames are now sent directly to the
 * authenticated analysis endpoint so they are never published as permanent,
 * third-party public URLs.
 */

export const dynamic = 'force-dynamic';

/** Max payload: 5MB — a single JPEG frame should be well under this. */
const MAX_BODY_BYTES = 5_000_000;

export async function POST(req: NextRequest) {
  // ── Auth guard: prevent anonymous use of our upload proxy ──────────────
  const authResult = await verifyFirebaseToken(req);
  if (authResult instanceof NextResponse) return authResult;
  const anonymousCheck = assertNonAnonymous(authResult);
  if (anonymousCheck) return anonymousCheck;

  try {
    const { teamId } = await readJsonBodyWithLimit<{
      teamId?: unknown;
    }>(req, MAX_BODY_BYTES);

    if (typeof teamId !== 'string' || !teamId.trim()) {
      return NextResponse.json({ error: 'A valid teamId is required.' }, { status: 400 });
    }
    const rateLimit = await enforceUserRateLimit(
      authResult.uid,
      'highlights-upload-frame',
      60,
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
    return NextResponse.json(
      { error: 'Frame proxy retired. Use the secure analysis endpoint.' },
      { status: 410 }
    );

  } catch (err: any) {
    if (err instanceof RequestBodyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error('[Upload Frame Error]:', err.message);
    return NextResponse.json({ error: 'Frame upload failed.' }, { status: 500 });
  }
}
