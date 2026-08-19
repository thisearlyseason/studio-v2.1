import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { adminDb } from '@/lib/firebase-admin';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { isActiveTeamMembership } from '@/lib/team-membership-security';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';
import { hasStaffRole } from '@/lib/staff-position';
import { withScheduleMutationLock } from '@/lib/server-schedule-deployment';
import { buildTournamentReplicationEvent } from '@/lib/server-tournament-replication';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const REGISTRATION_CODE_PATTERN = /^[A-Z0-9_-]{4,32}$/;
const RSVP_STATUSES = new Set(['going', 'maybe', 'declined', 'no', 'no_response']);

class EventMutationError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function cleanDate(value: unknown): string {
  const candidate = typeof value === 'string' ? value.trim().split('T')[0] : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : '';
}

function parseTime(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().toUpperCase().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  if (minute > 59) return null;
  if (match[3]) {
    if (hour < 1 || hour > 12) return null;
    if (match[3] === 'PM' && hour !== 12) hour += 12;
    if (match[3] === 'AM' && hour === 12) hour = 0;
  } else if (hour > 23) return null;
  return hour * 60 + minute;
}

function eventInterval(data: Record<string, unknown>) {
  const date = cleanDate(data.date);
  const startMinute = parseTime(data.startTime ?? data.time);
  if (!date || startMinute === null) return null;
  const explicitEnd = parseTime(data.endTime);
  const requestedDuration = Number(data.durationMinutes);
  const duration = Number.isInteger(requestedDuration) && requestedDuration > 0 && requestedDuration <= 24 * 60
    ? requestedDuration
    : 60;
  const endMinute = explicitEnd !== null && explicitEnd > startMinute
    ? explicitEnd
    : startMinute + duration;
  if (endMinute > 24 * 60) return null;
  return { date, startMinute, endMinute };
}

function overlaps(
  left: { date: string; startMinute: number; endMinute: number },
  right: { date: string; startMinute: number; endMinute: number }
) {
  return left.date === right.date && left.startMinute < right.endMinute && right.startMinute < left.endMinute;
}

function eventBookingId(teamId: string, eventId: string) {
  return `team_event_${teamId}_${eventId}`;
}

function safeEventData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new EventMutationError('A valid event payload is required.');
  }
  const data = { ...(value as Record<string, unknown>) };
  for (const key of ['id', 'teamId', 'ownerUserId', 'sourceId', 'sourceType', 'sourceGameId', 'leagueId']) {
    delete data[key];
  }
  return data;
}

async function assertEventAvailability(
  teamId: string,
  eventId: string,
  data: Record<string, unknown>
) {
  const interval = eventInterval(data);
  if (!interval) return null;
  const [bookings, events] = await Promise.all([
    adminDb.collection('scheduleBookings').where('date', '==', interval.date).get(),
    adminDb.collection('teams').doc(teamId).collection('events').get(),
  ]);
  const resourceId = typeof data.resourceId === 'string' ? data.resourceId.trim() : '';
  const location = typeof data.location === 'string' ? data.location.trim().toLocaleLowerCase() : '';
  for (const booking of bookings.docs) {
    const bookingData = booking.data();
    if (booking.id === eventBookingId(teamId, eventId)) continue;
    const other = {
      date: cleanDate(bookingData.date),
      startMinute: Number(bookingData.startMinute),
      endMinute: Number(bookingData.endMinute),
    };
    if (!Number.isFinite(other.startMinute) || !Number.isFinite(other.endMinute) || !overlaps(interval, other)) continue;
    const teamIds = Array.isArray(bookingData.teamIds) ? bookingData.teamIds : [];
    const sameResource = resourceId && bookingData.resourceId === resourceId;
    const sameLocation = location && String(bookingData.location || '').trim().toLocaleLowerCase() === location;
    if (teamIds.includes(teamId) || sameResource || sameLocation) {
      throw new EventMutationError('This event conflicts with an existing team or facility reservation.', 409);
    }
  }
  for (const event of events.docs) {
    if (event.id === eventId) continue;
    const other = eventInterval(event.data());
    if (other && overlaps(interval, other)) {
      throw new EventMutationError('This squad already has an event during the selected time.', 409);
    }
  }
  return interval;
}

async function teamAccess(teamId: string, uid: string, role?: string) {
  const teamRef = adminDb.collection('teams').doc(teamId);
  if (role === 'superadmin') {
    const team = await teamRef.get();
    return team.exists
      ? { teamRef, teamData: team.data() || {}, isMember: true, isStaff: true }
      : null;
  }
  const [team, membership] = await Promise.all([
    teamRef.get(),
    teamRef.collection('members').doc(uid).get(),
  ]);
  if (!team.exists) return null;
  const member = membership.data() || {};
  const isActiveMember = membership.exists && isActiveTeamMembership(member);
  const isOwner = team.data()?.ownerUserId === uid;
  const isStaff = isOwner || (isActiveMember && hasStaffRole(member));
  return { teamRef, teamData: team.data() || {}, isMember: isActiveMember || isOwner, isStaff };
}

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const limited = await enforceUserRateLimit(auth.uid, 'team-event-action', 120, 60 * 60 * 1000);
    if (limited) return limited;

    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 100_000);
    const action = String(body.action || '');
    const teamId = String(body.teamId || '');
    const requestedEventId = String(body.eventId || '');
    if (!ID_PATTERN.test(teamId) || (action !== 'create' && !ID_PATTERN.test(requestedEventId))) {
      return NextResponse.json({ error: 'Invalid squad or event.' }, { status: 400 });
    }

    const access = await teamAccess(teamId, auth.uid, auth.role);
    if (!access?.isMember) return NextResponse.json({ error: 'Squad membership required.' }, { status: 403 });
    const eventRef = action === 'create'
      ? access.teamRef.collection('events').doc()
      : access.teamRef.collection('events').doc(requestedEventId);
    const eventId = eventRef.id;

    if (action === 'replicate') {
      if (!access.isStaff) return NextResponse.json({ error: 'Squad staff access required.' }, { status: 403 });
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      if (!title || title.length > 200) {
        return NextResponse.json({ error: 'A valid tournament title is required.' }, { status: 400 });
      }
      const result = await withScheduleMutationLock(async () => {
        const source = await eventRef.get();
        if (!source.exists || source.data()?.isTournament !== true) return { status: 'missing' as const };

        const directory = adminDb.collection('tournamentRegistrationCodes');
        let registrationCode = '';
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const candidate = randomBytes(5).toString('hex').toUpperCase();
          if (!(await directory.doc(candidate).get()).exists) {
            registrationCode = candidate;
            break;
          }
        }
        if (!registrationCode) {
          throw new EventMutationError('Unable to allocate a unique tournament code. Try again.', 503);
        }

        const newEventRef = access.teamRef.collection('events').doc();
        const now = new Date().toISOString();
        const replicated = buildTournamentReplicationEvent({
          source: source.data() || {},
          title,
          eventId: newEventRef.id,
          teamId,
          actorUid: auth.uid,
          ownerUserId: String(access.teamData.ownerUserId || auth.uid),
          registrationCode,
          now,
        });
        const sourceConfig = await eventRef.collection('registration').doc('team_config').get();
        const mapping = { teamId, eventId: newEventRef.id, updatedAt: now };
        const batch = adminDb.batch();
        batch.set(newEventRef, replicated);
        batch.set(directory.doc(newEventRef.id), mapping);
        batch.set(directory.doc(registrationCode), mapping);
        if (sourceConfig.exists) {
          batch.set(newEventRef.collection('registration').doc('team_config'), sourceConfig.data() || {});
        }
        await batch.commit();
        return { status: 'created' as const, eventId: newEventRef.id };
      });
      if (result.status === 'missing') return NextResponse.json({ error: 'Tournament not found.' }, { status: 404 });
      return NextResponse.json({ success: true, eventId: result.eventId });
    }

    if (action === 'create' || action === 'update' || action === 'delete') {
      if (!access.isStaff) return NextResponse.json({ error: 'Squad staff access required.' }, { status: 403 });
      const result = await withScheduleMutationLock(async () => {
        const existing = await eventRef.get();
        if (action !== 'create' && !existing.exists) return { status: 'missing' as const };
        const existingData = existing.data() || {};
        if (existingData.sourceType === 'league' || existingData.sourceType === 'tournament' ||
            existingData.leagueId || existingData.sourceGameId) {
          return { status: 'managed' as const };
        }
        const bookingRef = adminDb.collection('scheduleBookings').doc(eventBookingId(teamId, eventId));
        if (action === 'delete') {
          const batch = adminDb.batch();
          batch.delete(eventRef);
          batch.delete(bookingRef);
          batch.delete(adminDb.collection('tournamentRegistrationCodes').doc(eventId));
          const registrationCode = typeof existingData.registrationCode === 'string'
            ? existingData.registrationCode.trim().toUpperCase()
            : '';
          if (registrationCode) batch.delete(adminDb.collection('tournamentRegistrationCodes').doc(registrationCode));
          await batch.commit();
          return { status: 'deleted' as const };
        }

        const submitted = safeEventData(body.event);
        const eventData = action === 'update' ? { ...existingData, ...submitted } : submitted;
        const interval = await assertEventAvailability(teamId, eventId, eventData);
        const now = new Date().toISOString();
        const registrationCode = action === 'create' && submitted.isTournament === true
          ? randomBytes(5).toString('hex').toUpperCase()
          : typeof submitted.registrationCode === 'string'
            ? submitted.registrationCode.trim().toUpperCase()
            : '';
        if (registrationCode && !REGISTRATION_CODE_PATTERN.test(registrationCode)) {
          throw new EventMutationError('Tournament codes must be 4–32 letters, numbers, dashes, or underscores.');
        }
        if (registrationCode) {
          const existingMapping = await adminDb.collection('tournamentRegistrationCodes').doc(registrationCode).get();
          const mappedTeamId = String(existingMapping.data()?.teamId || '');
          const mappedEventId = String(existingMapping.data()?.eventId || '');
          if (existingMapping.exists && (mappedTeamId !== teamId || mappedEventId !== eventId)) {
            throw new EventMutationError('That tournament code is already in use. Generate another code.', 409);
          }
        }
        const persisted = {
          ...submitted,
          id: eventId,
          teamId,
          ownerUserId: access.teamData.ownerUserId || auth.uid,
          updatedAt: now,
          ...(action === 'create' ? { createdAt: now } : {}),
          ...(registrationCode ? { registrationCode } : {}),
        };
        const batch = adminDb.batch();
        batch.set(eventRef, persisted, { merge: action === 'update' });
        if (eventData.isTournament === true) {
          const directory = adminDb.collection('tournamentRegistrationCodes');
          const mapping = { teamId, eventId, updatedAt: now };
          batch.set(directory.doc(eventId), mapping);
          if (registrationCode) batch.set(directory.doc(registrationCode), mapping);
          const previousCode = typeof existingData.registrationCode === 'string'
            ? existingData.registrationCode.trim().toUpperCase()
            : '';
          if (previousCode && registrationCode && previousCode !== registrationCode) {
            batch.delete(directory.doc(previousCode));
          }
        }
        if (interval) {
          const resourceId = typeof eventData.resourceId === 'string' ? eventData.resourceId.trim() : '';
          const location = typeof eventData.location === 'string' ? eventData.location.trim() : '';
          batch.set(bookingRef, {
            id: bookingRef.id,
            sourceType: 'team-event',
            sourceId: `team-event:${teamId}:${eventId}`,
            sourceGameId: eventId,
            hostTeamId: teamId,
            teamIds: [teamId],
            resourceId,
            location,
            date: interval.date,
            startMinute: interval.startMinute,
            endMinute: interval.endMinute,
            updatedAt: now,
          });
        } else {
          batch.delete(bookingRef);
        }
        await batch.commit();
        return { status: action === 'create' ? 'created' as const : 'updated' as const, eventId };
      });
      if (result.status === 'missing') return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
      if (result.status === 'managed') {
        return NextResponse.json({ error: 'Published schedule events must be changed through their schedule.' }, { status: 409 });
      }
      return NextResponse.json({ success: true, eventId: 'eventId' in result ? result.eventId : eventId });
    }

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
    if (error instanceof EventMutationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[teams/events/action] Error:', error);
    return NextResponse.json({ error: 'Unable to update this event.' }, { status: 500 });
  }
}
