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
import { ScheduleDeploymentError, withScheduleMutationLock } from '@/lib/server-schedule-deployment';
import { buildTournamentReplicationEvent } from '@/lib/server-tournament-replication';
import { buildTeamEventBooking } from '@/lib/server-team-event-booking';
import { buildRecurringEventDates, shiftCalendarDate } from '@/lib/team-event-recurrence';
import { normalizeTeamEventInterval, teamEventConflictDates, teamEventIntervalsOverlap } from '@/lib/team-event-interval';
import { validateTeamEventInput } from '@/lib/team-event-input';
import { eventActionNeedsGeneratedId } from '@/lib/team-event-action';
import { awaitLocalCertificationRequestBarrier } from '@/lib/local-certification-request-barrier';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const REGISTRATION_CODE_PATTERN = /^[A-Z0-9_-]{4,32}$/;
const RSVP_STATUSES = new Set(['going', 'maybe', 'declined', 'no', 'no_response']);

function recurrenceInput(value: unknown): { frequency: 'weekly'; count: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new EventMutationError('A weekly recurrence configuration is required.');
  }
  const input = value as Record<string, unknown>;
  if (input.frequency !== 'weekly' || !Number.isInteger(input.count)) {
    throw new EventMutationError('A valid weekly recurrence configuration is required.');
  }
  return { frequency: 'weekly', count: input.count as number };
}

class EventMutationError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function cleanDate(value: unknown): string {
  const candidate = typeof value === 'string' ? value.trim().split('T')[0] : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : '';
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

function assertValidEventInput(data: Record<string, unknown>) {
  try {
    validateTeamEventInput(data);
  } catch (error) {
    throw new EventMutationError(error instanceof Error ? error.message : 'A valid event payload is required.');
  }
}

async function assertEventAvailability(
  teamId: string,
  eventId: string,
  data: Record<string, unknown>
) {
  const interval = normalizeTeamEventInterval(data);
  if (!interval) return null;
  const [bookings, events] = await Promise.all([
    adminDb.collection('scheduleBookings').where('date', 'in', teamEventConflictDates(interval)).get(),
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
    if (!Number.isFinite(other.startMinute) || !Number.isFinite(other.endMinute) || !teamEventIntervalsOverlap(interval, other)) continue;
    const teamIds = Array.isArray(bookingData.teamIds) ? bookingData.teamIds : [];
    const sameResource = resourceId && bookingData.resourceId === resourceId;
    const sameLocation = location && String(bookingData.location || '').trim().toLocaleLowerCase() === location;
    if (teamIds.includes(teamId) || sameResource || sameLocation) {
      throw new EventMutationError('This event conflicts with an existing team or facility reservation.', 409);
    }
  }
  for (const event of events.docs) {
    if (event.id === eventId) continue;
    const other = normalizeTeamEventInterval(event.data());
    if (teamEventIntervalsOverlap(interval, other)) {
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
  await awaitLocalCertificationRequestBarrier(req.headers);

  try {
    const limited = await enforceUserRateLimit(auth.uid, 'team-event-action', 120, 60 * 60 * 1000);
    if (limited) return limited;

    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 100_000);
    const action = String(body.action || '');
    const teamId = String(body.teamId || '');
    const requestedEventId = String(body.eventId || '');
    const needsGeneratedId = eventActionNeedsGeneratedId(action);
    const requestedCreateId = action === 'create' && requestedEventId ? requestedEventId : '';
    const requiresEventId = !needsGeneratedId;
    if (!ID_PATTERN.test(teamId) || (requiresEventId && !ID_PATTERN.test(requestedEventId)) || (requestedCreateId && !ID_PATTERN.test(requestedCreateId))) {
      return NextResponse.json({ error: 'Invalid squad or event.' }, { status: 400 });
    }

    const access = await teamAccess(teamId, auth.uid, auth.role);
    if (!access?.isMember) return NextResponse.json({ error: 'Squad membership required.' }, { status: 403 });
    const eventRef = needsGeneratedId
      ? requestedCreateId
        ? access.teamRef.collection('events').doc(requestedCreateId)
        : access.teamRef.collection('events').doc()
      : access.teamRef.collection('events').doc(requestedEventId);
    const eventId = eventRef.id;

    if (action === 'create-series') {
      if (!access.isStaff) return NextResponse.json({ error: 'Squad staff access required.' }, { status: 403 });
      const result = await withScheduleMutationLock(async () => {
        const submitted = safeEventData(body.event);
        const recurrence = recurrenceInput(body.recurrence);
        const recurrenceStartDate = cleanDate(submitted.date);
        // Validate the submitted interval before deriving later occurrences.  Each
        // occurrence then carries the same calendar-day span as the source event.
        assertValidEventInput({ ...submitted, date: recurrenceStartDate });
        let dates: string[];
        try {
          dates = buildRecurringEventDates(recurrenceStartDate, recurrence.frequency, recurrence.count);
        } catch (error) {
          throw new EventMutationError(error instanceof Error ? error.message : 'Invalid recurrence configuration.');
        }
        const now = new Date().toISOString();
        const seriesId = randomBytes(16).toString('hex');
        const occurrences = dates.map(date => ({ ref: access.teamRef.collection('events').doc(), date }));
        const prepared = [] as Array<{ ref: FirebaseFirestore.DocumentReference; event: Record<string, unknown>; interval: ReturnType<typeof normalizeTeamEventInterval> }>;
        for (const occurrence of occurrences) {
          const event = {
            ...submitted,
            id: occurrence.ref.id,
            teamId,
            ownerUserId: access.teamData.ownerUserId || auth.uid,
            date: occurrence.date,
            ...(typeof submitted.endDate === 'string'
              ? { endDate: shiftCalendarDate(submitted.endDate, prepared.length * 7) }
              : {}),
            recurrenceSeriesId: seriesId,
            recurrenceFrequency: recurrence.frequency,
            recurrenceIndex: prepared.length,
            recurrenceCount: recurrence.count,
            createdAt: now,
            updatedAt: now,
          };
          assertValidEventInput(event);
          const interval = await assertEventAvailability(teamId, occurrence.ref.id, event);
          prepared.push({ ref: occurrence.ref, event, interval });
        }
        const batch = adminDb.batch();
        for (const occurrence of prepared) {
          batch.set(occurrence.ref, occurrence.event);
          if (occurrence.interval) {
            batch.set(adminDb.collection('scheduleBookings').doc(eventBookingId(teamId, occurrence.ref.id)),
              buildTeamEventBooking({ bookingId: eventBookingId(teamId, occurrence.ref.id), teamId, eventId: occurrence.ref.id, event: occurrence.event, interval: occurrence.interval, now }));
          }
        }
        await batch.commit();
        return { eventIds: prepared.map(occurrence => occurrence.ref.id) };
      });
      return NextResponse.json({ success: true, eventIds: result.eventIds });
    }

    if (action === 'update-series' || action === 'delete-series') {
      if (!access.isStaff) return NextResponse.json({ error: 'Squad staff access required.' }, { status: 403 });
      const result = await withScheduleMutationLock(async () => {
        const source = await eventRef.get();
        if (!source.exists) return { status: 'missing' as const };
        const seriesId = typeof source.data()?.recurrenceSeriesId === 'string' ? source.data()?.recurrenceSeriesId : '';
        if (!seriesId) return { status: 'not-series' as const };
        const siblings = await access.teamRef.collection('events').where('recurrenceSeriesId', '==', seriesId).get();
        if (siblings.empty) return { status: 'missing' as const };
        const now = new Date().toISOString();
        const batch = adminDb.batch();
        if (action === 'delete-series') {
          for (const sibling of siblings.docs) {
            batch.delete(sibling.ref);
            batch.delete(adminDb.collection('scheduleBookings').doc(eventBookingId(teamId, sibling.id)));
          }
          await batch.commit();
          return { status: 'deleted' as const };
        }
        const submitted = safeEventData(body.event);
        const updates = siblings.docs.map(sibling => ({ ref: sibling.ref, id: sibling.id, event: { ...sibling.data(), ...submitted, updatedAt: now } }));
        for (const update of updates) {
          assertValidEventInput(update.event);
          await assertEventAvailability(teamId, update.id, update.event);
        }
        for (const update of updates) {
          batch.set(update.ref, update.event, { merge: true });
          const interval = normalizeTeamEventInterval(update.event);
          const bookingRef = adminDb.collection('scheduleBookings').doc(eventBookingId(teamId, update.id));
          if (interval) batch.set(bookingRef, buildTeamEventBooking({ bookingId: bookingRef.id, teamId, eventId: update.id, event: update.event, interval, now }));
          else batch.delete(bookingRef);
        }
        await batch.commit();
        return { status: 'updated' as const };
      });
      if (result.status === 'missing') return NextResponse.json({ error: 'Event series not found.' }, { status: 404 });
      if (result.status === 'not-series') return NextResponse.json({ error: 'This event is not part of a recurrence series.' }, { status: 400 });
      return NextResponse.json({ success: true });
    }

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
        const interval = await assertEventAvailability(teamId, newEventRef.id, replicated);
        const bookingRef = adminDb.collection('scheduleBookings').doc(eventBookingId(teamId, newEventRef.id));
        const sourceConfig = await eventRef.collection('registration').doc('team_config').get();
        const mapping = { teamId, eventId: newEventRef.id, updatedAt: now };
        const batch = adminDb.batch();
        batch.set(newEventRef, replicated);
        batch.set(directory.doc(newEventRef.id), mapping);
        batch.set(directory.doc(registrationCode), mapping);
        if (interval) {
          const booking = buildTeamEventBooking({
            bookingId: bookingRef.id,
            teamId,
            eventId: newEventRef.id,
            event: replicated,
            interval,
            now,
          });
          batch.set(bookingRef, booking);
        }
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
        if (action === 'create' && existing.exists) return { status: 'conflict' as const };
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
        assertValidEventInput(eventData);
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
          const booking = buildTeamEventBooking({
            bookingId: bookingRef.id,
            teamId,
            eventId,
            event: eventData,
            interval,
            now,
          });
          batch.set(bookingRef, booking);
        } else {
          batch.delete(bookingRef);
        }
        await batch.commit();
        return { status: action === 'create' ? 'created' as const : 'updated' as const, eventId };
      });
      if (result.status === 'missing') return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
      if (result.status === 'conflict') return NextResponse.json({ error: 'Event request already exists.' }, { status: 409 });
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
    if (error instanceof ScheduleDeploymentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[teams/events/action] Error:', error);
    return NextResponse.json({ error: 'Unable to update this event.' }, { status: 500 });
  }
}
