import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { permitsLegacyOrPaidPortals } from '@/lib/public-portal-data';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELD_TYPES = new Set(['short_text', 'long_text', 'checkbox']);

function requestKey(req: NextRequest, suffix: string) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return `${(forwarded || 'local').slice(0, 100)}:${suffix}`;
}

function identifiers(req: NextRequest) {
  return {
    teamId: req.nextUrl.searchParams.get('teamId') || '',
    eventId: req.nextUrl.searchParams.get('eventId') || '',
  };
}

function publicFields(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).flatMap(raw => {
    const field = raw as Record<string, unknown>;
    const id = String(field.id || '').trim();
    const type = String(field.type || '').trim();
    const label = String(field.label || '').trim().slice(0, 120);
    if (!ID_PATTERN.test(id) || !FIELD_TYPES.has(type) || !label) return [];
    return [{ id, type, label, required: field.required === true }];
  });
}

function registrationAvailable(team: FirebaseFirestore.DocumentData, event: FirebaseFirestore.DocumentData) {
  if (!permitsLegacyOrPaidPortals(team.planId, team.plan_type)) return false;
  if (team.isArchived === true || team.isActive === false || event.isArchived === true || event.registrationOpen === false) return false;
  const eventDate = new Date(event.endDate || event.date);
  return Number.isNaN(eventDate.getTime()) || eventDate.getTime() + 24 * 60 * 60 * 1000 >= Date.now();
}

function publicEvent(id: string, event: FirebaseFirestore.DocumentData) {
  return {
    id,
    title: String(event.title || 'Event'),
    date: event.date || null,
    startTime: String(event.startTime || ''),
    location: String(event.location || ''),
    customFormFields: publicFields(event.customFormFields),
  };
}

async function loadRegistration(teamId: string, eventId: string) {
  const teamRef = adminDb.collection('teams').doc(teamId);
  const eventRef = teamRef.collection('events').doc(eventId);
  const [team, event] = await Promise.all([teamRef.get(), eventRef.get()]);
  if (!team.exists || !event.exists || !registrationAvailable(team.data() || {}, event.data() || {})) return null;
  return { team, event, eventRef };
}

export async function GET(req: NextRequest) {
  try {
    const { teamId, eventId } = identifiers(req);
    if (!ID_PATTERN.test(teamId) || !ID_PATTERN.test(eventId)) {
      return NextResponse.json({ error: 'Invalid event registration link.' }, { status: 400 });
    }
    const limited = await enforceUserRateLimit(requestKey(req, `${teamId}:${eventId}`), 'public-event-read', 120, 60 * 60 * 1000);
    if (limited) return limited;

    const registration = await loadRegistration(teamId, eventId);
    if (!registration) return NextResponse.json({ error: 'Event registration is unavailable.' }, { status: 404 });
    return NextResponse.json({ data: publicEvent(registration.event.id, registration.event.data() || {}) });
  } catch (error) {
    console.error('[public/event-registration] Read error:', error);
    return NextResponse.json({ error: 'Event registration is temporarily unavailable.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 16_000);
    const teamId = String(body.teamId || '').trim();
    const eventId = String(body.eventId || '').trim();
    const name = String(body.name || '').trim().slice(0, 120);
    const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
    const phone = String(body.phone || '').trim().slice(0, 40);
    const suppliedResponses = body.responses && typeof body.responses === 'object' && !Array.isArray(body.responses)
      ? body.responses as Record<string, unknown>
      : {};

    if (!ID_PATTERN.test(teamId) || !ID_PATTERN.test(eventId) || name.length < 2 ||
        !EMAIL_PATTERN.test(email) || phone.length < 7) {
      return NextResponse.json({ error: 'Valid contact details are required.' }, { status: 400 });
    }
    const limited = await enforceUserRateLimit(requestKey(req, `${teamId}:${eventId}`), 'public-event-submit', 10, 60 * 60 * 1000);
    if (limited) return limited;

    const registration = await loadRegistration(teamId, eventId);
    if (!registration) return NextResponse.json({ error: 'Event registration is unavailable.' }, { status: 404 });

    const eventData = registration.event.data() || {};
    const fields = publicFields(eventData.customFormFields);
    const responses: Record<string, string | boolean> = {};
    for (const field of fields) {
      const value = suppliedResponses[field.id];
      if (field.type === 'checkbox') {
        responses[field.id] = value === true;
        if (field.required && value !== true) {
          return NextResponse.json({ error: `${field.label} is required.` }, { status: 400 });
        }
      } else {
        const text = String(value || '').trim().slice(0, field.type === 'long_text' ? 2_000 : 300);
        responses[field.id] = text;
        if (field.required && !text) {
          return NextResponse.json({ error: `${field.label} is required.` }, { status: 400 });
        }
      }
    }

    const registrationId = createHash('sha256').update(`${teamId}:${eventId}:${email}`).digest('hex');
    const registrationRef = registration.eventRef.collection('registrations').doc(registrationId);
    const result = await adminDb.runTransaction(async transaction => {
      const [freshEvent, existing] = await Promise.all([
        transaction.get(registration.eventRef),
        transaction.get(registrationRef),
      ]);
      if (existing.exists) return 'duplicate';
      const freshData = freshEvent.data() || {};
      if (!freshEvent.exists || !registrationAvailable(registration.team.data() || {}, freshData)) return 'inactive';

      const capacity = Math.max(0, Number(freshData.registrationCapacity || freshData.maxRegistrations || freshData.capacity || 0));
      if (capacity > 0) {
        const existingRegistrations = await transaction.get(registration.eventRef.collection('registrations').limit(capacity));
        if (existingRegistrations.size >= capacity) return 'full';
      }

      transaction.create(registrationRef, {
        name,
        email,
        phone,
        responses,
        source: 'public-event-registration',
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
      });
      return 'saved';
    });

    if (result === 'inactive') return NextResponse.json({ error: 'Event registration is unavailable.' }, { status: 404 });
    if (result === 'full') return NextResponse.json({ error: 'This event is already at capacity.' }, { status: 409 });
    return NextResponse.json({ success: true, alreadyRegistered: result === 'duplicate' });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[public/event-registration] Submission error:', error);
    return NextResponse.json({ error: 'Registration could not be completed.' }, { status: 500 });
  }
}
