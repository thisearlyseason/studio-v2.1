import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { isActiveTeamMembership } from '@/lib/team-membership-security';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const RSVP_STATUSES = new Set(['going', 'maybe', 'declined', 'no', 'no_response']);
const STAFF_POSITIONS = new Set([
  'coach', 'head coach', 'assistant coach', 'manager',
  'squad leader', 'athletic director', 'staff',
]);

async function teamAccess(teamId: string, uid: string) {
  const teamRef = adminDb.collection('teams').doc(teamId);
  const [team, membership] = await Promise.all([
    teamRef.get(),
    teamRef.collection('members').doc(uid).get(),
  ]);
  if (!team.exists) return null;
  const member = membership.data() || {};
  const isActiveMember = membership.exists && isActiveTeamMembership(member);
  const position = String(member.position || '').trim().toLowerCase();
  const isOwner = team.data()?.ownerUserId === uid;
  const isStaff = isOwner || (isActiveMember && (member.role === 'Admin' || STAFF_POSITIONS.has(position)));
  return { teamRef, isMember: isActiveMember || isOwner, isStaff };
}

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const limited = await enforceUserRateLimit(auth.uid, 'team-event-action', 120, 60 * 60 * 1000);
    if (limited) return limited;

    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 10_000);
    const action = String(body.action || '');
    const teamId = String(body.teamId || '');
    const eventId = String(body.eventId || '');
    if (!ID_PATTERN.test(teamId) || !ID_PATTERN.test(eventId)) {
      return NextResponse.json({ error: 'Invalid squad or event.' }, { status: 400 });
    }

    const access = await teamAccess(teamId, auth.uid);
    if (!access?.isMember) return NextResponse.json({ error: 'Squad membership required.' }, { status: 403 });
    const eventRef = access.teamRef.collection('events').doc(eventId);

    if (action === 'rsvp') {
      const participantId = String(body.participantId || auth.uid);
      const status = String(body.status || '');
      if (!ID_PATTERN.test(participantId) || !RSVP_STATUSES.has(status)) {
        return NextResponse.json({ error: 'Invalid RSVP request.' }, { status: 400 });
      }

      if (!access.isStaff && participantId !== auth.uid) {
        const participant = await access.teamRef.collection('members').doc(participantId).get();
        const participantData = participant.data() || {};
        const isLinkedParticipant = participant.exists && isActiveTeamMembership(participantData) &&
          (participantData.userId === auth.uid || participantData.parentId === auth.uid);
        if (!isLinkedParticipant) {
          return NextResponse.json({ error: 'You can only RSVP for yourself or a linked athlete.' }, { status: 403 });
        }
      }

      if (!(await eventRef.get()).exists) {
        return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
      }
      await eventRef.update({ [`userRsvps.${participantId}`]: status });
      return NextResponse.json({ success: true });
    }

    if (action === 'claim-assignment') {
      const assignmentId = String(body.assignmentId || '');
      if (!ID_PATTERN.test(assignmentId)) {
        return NextResponse.json({ error: 'Invalid assignment.' }, { status: 400 });
      }
      const user = await adminDb.collection('users').doc(auth.uid).get();
      const assigneeName = user.data()?.fullName || user.data()?.name || auth.email || 'Squad Member';

      const result = await adminDb.runTransaction(async transaction => {
        const event = await transaction.get(eventRef);
        if (!event.exists) return 'missing';
        const assignments = Array.isArray(event.data()?.assignments) ? event.data()!.assignments : [];
        const index = assignments.findIndex((assignment: any) => assignment.id === assignmentId);
        if (index < 0) return 'missing-assignment';
        const assignment = assignments[index];
        if (assignment.assigneeId && assignment.status !== 'open') return 'claimed';
        assignments[index] = {
          ...assignment,
          assigneeId: auth.uid,
          assigneeName,
          status: 'claimed',
        };
        transaction.update(eventRef, { assignments });
        return 'updated';
      });

      if (result === 'missing') return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
      if (result === 'missing-assignment') return NextResponse.json({ error: 'Assignment not found.' }, { status: 404 });
      if (result === 'claimed') return NextResponse.json({ error: 'Assignment was already claimed.' }, { status: 409 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid event action.' }, { status: 400 });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[teams/events/action] Error:', error);
    return NextResponse.json({ error: 'Unable to update this event.' }, { status: 500 });
  }
}
