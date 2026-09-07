import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { resolveCompetitionAuthority } from '@/lib/server-competition-authority';
import { hashTournamentScorekeeperCode } from '@/lib/server-competition-credential';
import { canonicalCompetitionRequest, runCompetitionOperation } from '@/lib/server-competition-operation';
import { readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';

const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyFirebaseToken(request);
    if (auth instanceof NextResponse) return auth;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(request, 8 * 1024);
    const allowedFields = new Set(['requestId', 'teamId', 'eventId', 'scoringCode', 'expectedLifecycleVersion', 'expectedCredentialVersion']);
    if (Object.keys(body).some(key => !allowedFields.has(key))) return fail('Unsupported Tournament credential field.', 400);
    if (!id(body.teamId) || !id(body.eventId)) return fail('Invalid Tournament credential target.', 400);
    const code = typeof body.scoringCode === 'string' ? body.scoringCode.trim() : '';
    if (code.length < 4 || code.length > 128) return fail('Scorekeeper code must contain 4 to 128 characters.', 400);
    const expectedLifecycleVersion = Number(body.expectedLifecycleVersion);
    const expectedCredentialVersion = Number(body.expectedCredentialVersion);
    if (!Number.isInteger(expectedLifecycleVersion) || expectedLifecycleVersion < 0 || !Number.isInteger(expectedCredentialVersion) || expectedCredentialVersion < 0) {
      return fail('Valid Tournament lifecycle and credential versions are required.', 400);
    }
    const identity = canonicalCompetitionRequest({ requestId: String(body.requestId || ''), tenantId: body.teamId, kind: 'tournament-credential', payload: body });
    const hash = hashTournamentScorekeeperCode(body.teamId, body.eventId, code);
    const teamRef = adminDb.collection('teams').doc(body.teamId);
    const eventRef = teamRef.collection('events').doc(body.eventId);
    const credentialRef = eventRef.collection('private').doc('scoring');
    const result = await runCompetitionOperation({
      db: adminDb,
      actorUid: auth.uid,
      identity,
      authorizeTransaction: transaction => resolveCompetitionAuthority({ transaction, actorUid: auth.uid, actorRole: auth.role, teamId: body.teamId as string, domain: 'tournament' }).then(() => undefined),
    }, async ({ transaction }) => {
      const [event, credential] = await Promise.all([transaction.get(eventRef), transaction.get(credentialRef)]);
      const eventData = event.data() || {};
      if (!event.exists || eventData.isTournament !== true || eventData.isArchived === true || eventData.is_active === false || eventData.status === 'cancelled') throw Object.assign(new Error('Tournament is not active.'), { status: 409 });
      const lifecycleVersion = Number(eventData.lifecycleVersion || 0);
      const eventCredentialVersion = Number(eventData.credentialVersion || 0);
      const privateCredentialVersion = Number(credential.data()?.credentialVersion || 0);
      if (lifecycleVersion !== expectedLifecycleVersion) throw Object.assign(new Error('Tournament changed. Reload before saving the scorekeeper code.'), { status: 409 });
      if (eventCredentialVersion !== privateCredentialVersion || privateCredentialVersion !== expectedCredentialVersion) throw Object.assign(new Error('Scorekeeper credential changed. Reload before saving.'), { status: 409 });
      const credentialVersion = privateCredentialVersion + 1;
      transaction.set(credentialRef, { teamId: body.teamId, eventId: body.eventId, scorekeeperCodeHash: hash, credentialVersion, updatedAt: new Date().toISOString(), updatedBy: auth.uid });
      transaction.update(eventRef, { credentialVersion, scorekeeperConfigured: true, scoringCode: FieldValue.delete(), scoringCodeHash: FieldValue.delete() });
      return { success: true, scorekeeperConfigured: true, lifecycleVersion, credentialVersion };
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof RequestBodyError) return fail(error.message, error.status);
    const message = error instanceof Error ? error.message : '';
    const status = error instanceof Error && 'status' in error && typeof error.status === 'number'
      ? error.status
      : message.startsWith('Forbidden competition') ? 403
        : message === 'Request collision.' ? 409
          : message.startsWith('Invalid competition') ? 400
            : 500;
    if (status === 500) console.error('[tournament credential] Update failed:', message);
    return fail(status === 500 ? 'Tournament credential could not be saved.' : message, status);
  }
}
