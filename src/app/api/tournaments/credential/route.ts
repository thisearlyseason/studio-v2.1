import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { resolveCompetitionAuthority } from '@/lib/server-competition-authority';
import { hashTournamentScorekeeperCode } from '@/lib/server-competition-credential';
import { readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';

const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyFirebaseToken(request);
    if (auth instanceof NextResponse) return auth;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(request, 8 * 1024);
    if (!id(body.teamId) || !id(body.eventId)) return fail('Invalid Tournament credential target.', 400);
    const code = typeof body.scoringCode === 'string' ? body.scoringCode.trim() : '';
    if (code.length < 4 || code.length > 128) return fail('Scorekeeper code must contain 4 to 128 characters.', 400);
    const hash = hashTournamentScorekeeperCode(body.teamId, body.eventId, code);
    const teamRef = adminDb.collection('teams').doc(body.teamId);
    const eventRef = teamRef.collection('events').doc(body.eventId);
    await adminDb.runTransaction(async transaction => {
      await resolveCompetitionAuthority({ transaction, actorUid: auth.uid, actorRole: auth.role, teamId: body.teamId as string, domain: 'tournament' });
      const event = await transaction.get(eventRef);
      if (!event.exists || event.data()?.isTournament !== true || event.data()?.isArchived === true || event.data()?.is_active === false || event.data()?.status === 'cancelled') throw Object.assign(new Error('Tournament is not active.'), { status: 409 });
      transaction.set(eventRef.collection('private').doc('scoring'), { teamId: body.teamId, eventId: body.eventId, scorekeeperCodeHash: hash, updatedAt: new Date().toISOString(), updatedBy: auth.uid });
      transaction.update(eventRef, { scoringCode: FieldValue.delete(), scoringCodeHash: FieldValue.delete() });
    });
    return NextResponse.json({ success: true, scorekeeperConfigured: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof RequestBodyError) return fail(error.message, error.status);
    const message = error instanceof Error ? error.message : '';
    const status = error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : message.startsWith('Forbidden competition') ? 403 : 500;
    if (status === 500) console.error('[tournament credential] Update failed:', message);
    return fail(status === 500 ? 'Tournament credential could not be saved.' : message, status);
  }
}
