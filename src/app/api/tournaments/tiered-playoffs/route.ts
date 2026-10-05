import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';
import { executeTieredPlayoffsCommand, TieredPlayoffsCommandError } from '@/lib/server-tiered-playoffs';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const limited = await enforceUserRateLimit(auth.uid, 'tiered-playoffs', 60, 60 * 60 * 1_000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(request, 500_000);
    const allowed = new Set(['action', 'requestId', 'teamId', 'eventId', 'expectedVersion', 'expectedScheduleVersion', 'payload']);
    if (Object.keys(body).some(key => !allowed.has(key))) return NextResponse.json({ error: 'Unsupported Tiered Playoffs field.' }, { status: 400 });
    const result = await executeTieredPlayoffsCommand({
      action: String(body.action || ''),
      requestId: String(body.requestId || ''),
      teamId: String(body.teamId || ''),
      eventId: String(body.eventId || ''),
      expectedVersion: Number(body.expectedVersion),
      expectedScheduleVersion: Number(body.expectedScheduleVersion),
      payload: body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? body.payload as Record<string, unknown> : {},
      actor: { uid: auth.uid, role: auth.role, email: auth.email },
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof RequestBodyError || error instanceof TieredPlayoffsCommandError) {
      return NextResponse.json({ error: error.message, ...('code' in error ? { code: error.code } : {}) }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : '';
    if (message.startsWith('Forbidden competition')) return NextResponse.json({ error: 'Only current authorized staff can manage Tiered Playoffs.' }, { status: 403 });
    if (message === 'Request collision.') return NextResponse.json({ error: message }, { status: 409 });
    if (message.startsWith('Invalid competition')) return NextResponse.json({ error: message }, { status: 400 });
    console.error('[tiered playoffs] Command failed:', message);
    return NextResponse.json({ error: 'Unable to complete the Tiered Playoffs operation.' }, { status: 500 });
  }
}
