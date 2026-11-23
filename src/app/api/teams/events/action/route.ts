import { ActivityConflictError, type ActivityConflict, type ActivityPublishOptions } from '@/lib/activity-publish';
import { teamEventRequestFingerprint } from '@/lib/team-event-request';
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, createHash } from 'node:crypto';
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
import { buildTeamEventBooking } from '@/lib/server-team-event-booking';
import { buildRecurringEventDates, calendarDayOffset, shiftCalendarDate, type TeamEventRecurrence } from '@/lib/team-event-recurrence';
import { normalizeTeamEventInterval, teamEventConflictDates, teamEventIntervalsOverlap } from '@/lib/team-event-interval';
import { validateTeamEventInput } from '@/lib/team-event-input';
import { eventActionNeedsGeneratedId } from '@/lib/team-event-action';
import { awaitLocalCertificationRequestBarrier } from '@/lib/local-certification-request-barrier';
import { sendNotificationToUsers } from '@/lib/server-notification-delivery';
import { teamEventCreatedNotification } from '@/lib/team-event-notification';

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

type AvailabilityRecords = {
  events: FirebaseFirestore.QueryDocumentSnapshot[];
  bookings: FirebaseFirestore.QueryDocumentSnapshot[];
};

async function readAvailability(teamId: string, dates: string[]): Promise<AvailabilityRecords> {
  const collection = adminDb.collection('scheduleBookings');
  const requests = [];
  for (let offset = 0; offset < dates.length; offset += 30) {
    requests.push(collection.where('date', 'in', dates.slice(offset, offset + 30)).get());
  }
  const [events, bookings] = await Promise.all([
    adminDb.collection('teams').doc(teamId).collection('events').get(),
    Promise.all(requests),
  ]);
  return { events: events.docs, bookings: bookings.flatMap(snapshot => snapshot.docs) };
}

async function assertEventAvailability(
  teamId: string,
  eventId: string,
  data: Record<string, unknown>,
  conflicts?: ActivityConflict[],
  records?: AvailabilityRecords,
) {
  const interval = normalizeTeamEventInterval(data);
  if (!interval) return null;
  const { bookings, events } = records || await readAvailability(teamId, teamEventConflictDates(interval));
  const resourceId = typeof data.resourceId === 'string' ? data.resourceId.trim() : '';
  const location = typeof data.location === 'string' ? data.location.trim().toLocaleLowerCase() : '';
  const ownedBookings = new Set(events.filter(doc =>
    teamEventIntervalsOverlap(interval, normalizeTeamEventInterval(doc.data()))
  ).map(doc => eventBookingId(teamId, doc.id)));
  for (const booking of bookings) {
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
      if (conflicts) {
        if (!ownedBookings.has(booking.id)) conflicts.push({ date: interval.date, title: 'Team or facility reservation' });
        continue;
      }
      throw new EventMutationError('This event conflicts with an existing team or facility reservation.', 409);
    }
  }
  for (const event of events) {
    if (event.id === eventId) continue;
    const other = normalizeTeamEventInterval(event.data());
    if (teamEventIntervalsOverlap(interval, other)) {
      if (conflicts) {
        const item = event.data();
        const managed = item.isTournament || item.eventType === 'tournament' || item.leagueId || item.sourceGameId || item.sourceType === 'league' || item.sourceType === 'tournament' || item.registrationCode;
        conflicts.push({ date: interval.date, title: String(item.title || 'Team activity'), time: String(item.startTime || ''),
          ...(managed ? {} : { replaceId: event.id, revision: createHash('sha256').update(teamEventRequestFingerprint(item)).digest('hex') }) });
        continue;
      }
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
  const directMember = membership.data();
  const isOwner = team.data()?.ownerUserId === uid;
  // Existing roster rows may predate login and use a generated document ID.
  // Their linked userId is the identity; removal still revokes that linkage.
  const linkedMembers = !isOwner && !isActiveTeamMembership(directMember)
    ? await teamRef.collection('members').where('userId', '==', uid).limit(10).get()
    : null;
  const member = isActiveTeamMembership(directMember)
    ? directMember
    : linkedMembers?.docs.find(candidate => isActiveTeamMembership(candidate.data()))?.data();
  const isActiveMember = isActiveTeamMembership(member);
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
    const requiresEventId = !needsGeneratedId && action !== 'list-drafts';
    if (!ID_PATTERN.test(teamId) || (requiresEventId && !ID_PATTERN.test(requestedEventId)) || (requestedCreateId && !ID_PATTERN.test(requestedCreateId))) {
      return NextResponse.json({ error: 'Invalid squad or event.' }, { status: 400 });
    }

    const submittedTournament = body.event && typeof body.event === 'object' && ((body.event as Record<string, unknown>).isTournament === true || (body.event as Record<string, unknown>).eventType === 'tournament');
    if (submittedTournament) return NextResponse.json({ error: 'Use /api/tournaments/lifecycle with requestId and expectedVersion.' }, { status: 410 });
    const requestId = body.requestId;
    if (requestId !== undefined && (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(requestId))) {
      return NextResponse.json({ error: 'Invalid event request identity.' }, { status: 400 });
    }
    const access = await teamAccess(teamId, auth.uid, auth.role);
    if (!access?.isMember) return NextResponse.json({ error: 'Squad membership required.' }, { status: 403 });
    const drafts = adminDb.collection('coachActivityDrafts').doc(auth.uid).collection('teams').doc(teamId).collection('items');
    if (action === 'list-drafts' || action === 'save-draft') {
      if (!access.isStaff) return NextResponse.json({ error: 'Squad staff access required.' }, { status: 403 });
      if (action === 'list-drafts') {
        const snapshot = await drafts.get();
        return NextResponse.json({ drafts: snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })) }, { headers: { 'Cache-Control': 'private, no-store' } });
      }
      const event = safeEventData(body.event);
      if (typeof event.title !== 'string' || !event.title.trim() || event.title.length > 200) throw new EventMutationError('Enter a draft title.');
      const version = randomBytes(16).toString('hex');
      await withScheduleMutationLock(async () => {
        const ref = drafts.doc(requestedEventId);
        const previous = await ref.get();
        if ((previous.data()?.version || null) !== (body.version || null)) throw new EventMutationError('This draft changed. Reopen it before saving.', 409);
        await ref.set({ event, recurrence: body.recurrence || null, version, updatedAt: new Date().toISOString() });
      });
      return NextResponse.json({ version });
    }
    const options = (body.publishOptions || {}) as ActivityPublishOptions;
    const draft = options.draft;
    if (draft && (!ID_PATTERN.test(draft.id) || !ID_PATTERN.test(draft.version))) throw new EventMutationError('Invalid draft.');
    const draftRef = draft ? drafts.doc(draft.id) : null;
    async function checkDraft() {
      if (draftRef && (await draftRef.get()).data()?.version !== draft?.version) throw new EventMutationError('This draft changed or has already been published. Reopen your drafts.', 409);
    }
    const eventRef = needsGeneratedId
      ? requestedCreateId
        ? access.teamRef.collection('events').doc(requestedCreateId)
        : access.teamRef.collection('events').doc()
      : access.teamRef.collection('events').doc(requestedEventId);
    const eventId = eventRef.id;

    const receiptUserId = auth.uid;
    const receiptRef = typeof requestId === 'string' && (action === 'create' || action === 'create-series')
      ? adminDb.collection('teamEventMutationReceipts').doc(createHash('sha256').update(teamEventRequestFingerprint([teamId, auth.uid, requestId])).digest('hex'))
      : null;
    const requestHash = receiptRef
      ? createHash('sha256').update(teamEventRequestFingerprint({ action, teamId, eventId: requestedCreateId, event: safeEventData(body.event), ...(body.publishOptions ? { publishOptions: options } : {}), ...(action === 'create-series' ? { recurrence: body.recurrence } : {}) })).digest('hex')
      : null;
    async function recoverCreateReceipt() {
      if (!receiptRef) return null;
      const snapshot = await receiptRef.get();
      if (!snapshot.exists) return null;
      const receipt = snapshot.data() || {};
      if (receipt.teamId !== teamId || receipt.userId !== receiptUserId || receipt.requestHash !== requestHash) throw new EventMutationError('This event request was already used with different details.', 409);
      return receipt;
    }
    function writeCreateReceipt(batch: FirebaseFirestore.WriteBatch, eventIds: string[]) {
      if (draftRef) batch.delete(draftRef);
      if (receiptRef) batch.set(receiptRef, { teamId, userId: receiptUserId, action, requestHash, eventIds, createdAt: new Date().toISOString() });
    }

    if (action === 'create-series') {
      if (!access.isStaff) return NextResponse.json({ error: 'Squad staff access required.' }, { status: 403 });
      const result = await withScheduleMutationLock(async () => {
        const receipt = await recoverCreateReceipt();
        if (receipt) return { eventIds: receipt.eventIds as string[], replayed: true };
        await checkDraft();
        const submitted = safeEventData(body.event);
        if (!body.recurrence || typeof body.recurrence !== 'object') throw new EventMutationError('Choose a repeat schedule.');
        const recurrence = body.recurrence as TeamEventRecurrence;
        const recurrenceStartDate = cleanDate(submitted.date);
        // Validate the submitted interval before deriving later occurrences.  Each
        // occurrence then carries the same calendar-day span as the source event.
        assertValidEventInput({ ...submitted, date: recurrenceStartDate });
        let dates: string[];
        try {
          dates = buildRecurringEventDates(recurrenceStartDate, recurrence.frequency, recurrence.count, recurrence);
        } catch (error) {
          throw new EventMutationError(error instanceof Error ? error.message : 'Invalid recurrence configuration.');
        }
        const now = new Date().toISOString();
        const seriesId = randomBytes(16).toString('hex');
        if (!Array.isArray(options.skipDates || []) || !Array.isArray(options.replace || [])) throw new EventMutationError('Invalid conflict choices.');
        dates = dates.filter(date => !options.skipDates?.includes(date));
        if (!dates.length) throw new EventMutationError('Keep at least one occurrence or save a draft.');
        const baseInterval = normalizeTeamEventInterval(submitted);
        const records = baseInterval ? await readAvailability(teamId, [...new Set(
          dates.flatMap(date => teamEventConflictDates({ ...baseInterval, date }))
        )]) : undefined;
        const unresolved: ActivityConflict[] = [];
        const replaceIds = new Set<string>();
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
              ? { endDate: shiftCalendarDate(submitted.endDate, calendarDayOffset(recurrenceStartDate, occurrence.date)) }
              : {}),
            recurrenceSeriesId: seriesId,
            recurrenceFrequency: recurrence.frequency,
            recurrenceIndex: prepared.length,
            recurrenceCount: dates.length,
            createdAt: now,
            updatedAt: now,
          };
          assertValidEventInput(event);
          const conflicts: ActivityConflict[] = [];
          const interval = await assertEventAvailability(teamId, occurrence.ref.id, event, conflicts, records);
          for (const conflict of conflicts) {
            if (conflict.replaceId && options.replace?.some(choice => choice.id === conflict.replaceId && choice.revision === conflict.revision)) replaceIds.add(conflict.replaceId);
            else unresolved.push(conflict);
          }
          if (prepared.some(other => teamEventIntervalsOverlap(other.interval, interval))) unresolved.push({ date: occurrence.date, title: 'Another occurrence in this series' });
          prepared.push({ ref: occurrence.ref, event, interval });
        }
        if (unresolved.length) throw new ActivityConflictError(unresolved);
        if (replaceIds.size > 150) throw new EventMutationError('Too many replacements. Publish a smaller series.');
        const batch = adminDb.batch();
        for (const id of replaceIds) {
          batch.delete(access.teamRef.collection('events').doc(id));
          batch.delete(adminDb.collection('scheduleBookings').doc(eventBookingId(teamId, id)));
        }
        for (const occurrence of prepared) {
          batch.set(occurrence.ref, occurrence.event);
          if (occurrence.interval) {
            batch.set(adminDb.collection('scheduleBookings').doc(eventBookingId(teamId, occurrence.ref.id)),
              buildTeamEventBooking({ bookingId: eventBookingId(teamId, occurrence.ref.id), teamId, eventId: occurrence.ref.id, event: occurrence.event, interval: occurrence.interval, now }));
          }
        }
        const eventIds = prepared.map(occurrence => occurrence.ref.id);
        writeCreateReceipt(batch, eventIds);
        await batch.commit();
        return { eventIds, replayed: false };
      });
      return NextResponse.json({ success: true, eventIds: result.eventIds, replayed: result.replayed });
    }

    if (action === 'update-series' || action === 'delete-series') {
      if (!access.isStaff) return NextResponse.json({ error: 'Squad staff access required.' }, { status: 403 });
      const result = await withScheduleMutationLock(async () => {
        const source = await eventRef.get();
        if (!source.exists) return { status: 'missing' as const };
        if (source.data()?.isTournament === true || source.data()?.eventType === 'tournament') throw new EventMutationError('Use /api/tournaments/lifecycle.', 410);
        const seriesId = typeof source.data()?.recurrenceSeriesId === 'string' ? source.data()?.recurrenceSeriesId : '';
        if (!seriesId) return { status: 'not-series' as const };
        const siblings = await access.teamRef.collection('events').where('recurrenceSeriesId', '==', seriesId).get();
        if (siblings.docs.some(sibling => sibling.data().isTournament === true || sibling.data().eventType === 'tournament')) throw new EventMutationError('Use /api/tournaments/lifecycle.', 410);
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
      return NextResponse.json({ error: 'Use /api/tournaments/lifecycle with requestId and expectedVersion.' }, { status: 410 });
    }

    if (action === 'create' || action === 'update' || action === 'delete') {
      if (!access.isStaff) return NextResponse.json({ error: 'Squad staff access required.' }, { status: 403 });
      const result = await withScheduleMutationLock(async () => {
        if (action === 'create') {
          const receipt = await recoverCreateReceipt();
          if (receipt) return { status: 'replayed' as const, eventId: (receipt.eventIds as string[])[0] };
          await checkDraft();
        }
        const existing = await eventRef.get();
        if (action !== 'create' && !existing.exists) return { status: 'missing' as const };
        if (action === 'create' && existing.exists) return { status: 'conflict' as const };
        const existingData = existing.data() || {};
        if (existingData.isTournament === true || existingData.eventType === 'tournament') throw new EventMutationError('Use /api/tournaments/lifecycle with requestId and expectedVersion.', 410);
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
        if (action === 'create') writeCreateReceipt(batch, [eventId]);
        await batch.commit();
        return { status: action === 'create' ? 'created' as const : 'updated' as const, eventId };
      });
      if (result.status === 'replayed') return NextResponse.json({ success: true, eventId: result.eventId, replayed: true });
      if (result.status === 'missing') return NextResponse.json({ error: 'Event not found.' }, { status: 404 });
      if (result.status === 'conflict') return NextResponse.json({ error: 'Event request already exists.' }, { status: 409 });
      if (result.status === 'managed') {
        return NextResponse.json({ error: 'Published schedule events must be changed through their schedule.' }, { status: 409 });
      }
      if (result.status === 'created' && access.teamData.isDemo !== true && access.teamData.outboundProvidersEnabled !== false) {
        try {
          const members = await access.teamRef.collection('members').get();
          const recipientUserIds = members.docs.flatMap(member => {
            const data = member.data();
            const userId = typeof data.userId === 'string' ? data.userId.trim() : '';
            return isActiveTeamMembership(data) && userId && userId !== auth.uid ? [userId] : [];
          });
          await sendNotificationToUsers({
            recipientUserIds,
            ...teamEventCreatedNotification(safeEventData(body.event)),
          });
        } catch (error) {
          console.warn('[teams/events/action] Event saved, but tactical alert delivery failed:', error);
        }
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
    if (error instanceof ActivityConflictError) return NextResponse.json({ error: error.message, conflicts: error.conflicts }, { status: 409 });
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
