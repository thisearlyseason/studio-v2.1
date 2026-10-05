import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { getTeamAuthority } from '@/lib/server-team-access';
import { readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

export async function PATCH(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 8_000);
    const teamId = typeof body.teamId === 'string' && ID_PATTERN.test(body.teamId) ? body.teamId : '';
    if (!teamId) return NextResponse.json({ error: 'Invalid squad.' }, { status: 400 });
    const authority = await getTeamAuthority(teamId, auth.uid, auth.role);
    if (!authority?.isStaff) {
      return NextResponse.json({ error: 'Only authorized squad staff can change parent access.' }, { status: 403 });
    }
    const updates: Record<string, boolean> = {};
    if (typeof body.parentChatEnabled === 'boolean') updates.parentChatEnabled = body.parentChatEnabled;
    if (typeof body.parentFeedEnabled === 'boolean') updates.parentFeedEnabled = body.parentFeedEnabled;
    if (typeof body.parentCommentsEnabled === 'boolean') updates.parentCommentsEnabled = body.parentCommentsEnabled;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No parent access setting was supplied.' }, { status: 400 });
    }
    await authority.teamRef.update({ ...updates, parentAccessUpdatedAt: new Date().toISOString(), parentAccessUpdatedBy: auth.uid });
    return NextResponse.json({ ok: true, settings: updates });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[teams/parent-access] Error:', error);
    return NextResponse.json({ error: 'Unable to update parent access.' }, { status: 500 });
  }
}
