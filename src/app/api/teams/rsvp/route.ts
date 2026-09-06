import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';
import { hasStaffRole } from '@/lib/staff-position';
import { buildTeamRsvpAuditRecord } from '@/lib/team-rsvp-audit';
import { canUpdateTeamRsvp } from '@/lib/team-rsvp-policy';

const RSVP_STATUSES = new Set(['going', 'maybe', 'declined', 'no_response']);
const SAFE_ID = /^[A-Za-z0-9_-]{1,200}$/;

function isActiveMember(data: FirebaseFirestore.DocumentData | undefined): boolean {
  return Boolean(data) && data?.status !== 'removed' && data?.isDeleted !== true;
}

export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;

  try {
    const { teamId, eventId, participantId, status } =
      await readJsonBodyWithLimit<{
        teamId?: unknown;
        eventId?: unknown;
        participantId?: unknown;
        status?: unknown;
      }>(request, 16_000);

    if (
      typeof teamId !== 'string' ||
      typeof eventId !== 'string' ||
      typeof participantId !== 'string' ||
      typeof status !== 'string' ||
      !SAFE_ID.test(teamId) ||
      !SAFE_ID.test(eventId) ||
      !SAFE_ID.test(participantId) ||
      !RSVP_STATUSES.has(status)
    ) {
      return NextResponse.json({ error: 'Invalid RSVP request.' }, { status: 400 });
    }
    const rateLimit = await enforceUserRateLimit(
      auth.uid,
      'team-rsvp',
      60,
      5 * 60 * 1000
    );
    if (rateLimit) return rateLimit;

    const teamRef = adminDb.collection('teams').doc(teamId);
    const eventRef = teamRef.collection('events').doc(eventId);
    const participantRef = teamRef.collection('members').doc(participantId);
    const directCallerRef = teamRef.collection('members').doc(auth.uid);
    const [teamSnapshot, eventSnapshot, participantSnapshot, directCallerSnapshot, callerProfileSnapshot] =
      await Promise.all([
        teamRef.get(),
        eventRef.get(),
        participantRef.get(),
        directCallerRef.get(),
        adminDb.collection('users').doc(auth.uid).get(),
      ]);

    if (!teamSnapshot.exists || !eventSnapshot.exists) {
      return NextResponse.json({ error: 'Team or event not found.' }, { status: 404 });
    }
    if (!participantSnapshot.exists || !isActiveMember(participantSnapshot.data())) {
      return NextResponse.json({ error: 'Participant is not an active team member.' }, { status: 404 });
    }

    const team = teamSnapshot.data() || {};
    const participant = participantSnapshot.data() || {};
    let callerMembership = directCallerSnapshot.data();
    if (!isActiveMember(callerMembership)) {
      const membershipQuery = await teamRef
        .collection('members')
        .where('userId', '==', auth.uid)
        .limit(10)
        .get();
      callerMembership = membershipQuery.docs
        .map(snapshot => snapshot.data())
        .find(isActiveMember);
    }

    const callerIsStaff =
      auth.role === 'superadmin' ||
      team.ownerUserId === auth.uid ||
      (
        isActiveMember(callerMembership) &&
        hasStaffRole(callerMembership)
      );
    const event = eventSnapshot.data() || {};
    if (event.isArchived === true || String(event.status || '').toLowerCase() === 'cancelled') {
      return NextResponse.json({ error: 'RSVPs are closed for this activity.' }, { status: 409 });
    }
    if (!canUpdateTeamRsvp({
      event,
      callerUid: auth.uid,
      // Most registered accounts carry their role in the protected profile,
      // while only privileged accounts need a custom token claim. Do not let a
      // missing optional claim bypass guardian-specific authorization.
      callerRole: auth.role || callerProfileSnapshot.data()?.role,
      callerIsStaff,
      callerHasActiveMembership: isActiveMember(callerMembership),
      participantId,
      participant,
    })) {
      return NextResponse.json(
        { error: 'You may only update your own household RSVP.' },
        { status: 403 }
      );
    }

    const occurredAt = new Date().toISOString();
    const result = await adminDb.runTransaction(async transaction => {
      const currentEvent = await transaction.get(eventRef);
      if (!currentEvent.exists) return 'missing' as const;
      const currentData = currentEvent.data() || {};
      if (currentData.isArchived === true || String(currentData.status || '').toLowerCase() === 'cancelled') {
        return 'closed' as const;
      }
      transaction.update(eventRef, {
        [`userRsvps.${participantId}`]: status,
        updatedAt: occurredAt,
      });
      transaction.create(eventRef.collection('rsvpAudit').doc(), buildTeamRsvpAuditRecord({
        actorId: auth.uid,
        participantId,
        status,
        occurredAt,
      }));
      return 'updated' as const;
    });
    if (result === 'missing') return NextResponse.json({ error: 'Team or event not found.' }, { status: 404 });
    if (result === 'closed') return NextResponse.json({ error: 'RSVPs are closed for this activity.' }, { status: 409 });
    return NextResponse.json({ ok: true, participantId, status });
  } catch (error: any) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[teams/rsvp] Error:', error?.message || error);
    return NextResponse.json({ error: 'Unable to update RSVP.' }, { status: 500 });
  }
}
