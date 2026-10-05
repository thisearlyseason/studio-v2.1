import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import {
  enforcePublicRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';
import { validFirestoreDocumentId } from '@/lib/firestore-document-id';

const KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;
const RELATIONSHIPS = new Set(['parent', 'family_member', 'friend', 'other']);

function cleanId(value: string | null) {
  return validFirestoreDocumentId(value);
}

async function getOpportunity(req: NextRequest) {
  const teamId = cleanId(req.nextUrl.searchParams.get('teamId'));
  const oppId = cleanId(req.nextUrl.searchParams.get('oppId'));
  if (!teamId || !oppId) return null;
  const ref = adminDb.collection('teams').doc(teamId).collection('volunteers').doc(oppId);
  const snapshot = await ref.get();
  const data = snapshot.data() || {};
  if (!snapshot.exists || data.isShareable !== true) return null;
  const end = typeof data.endDate === 'string' && data.endDate ? new Date(data.endDate) : null;
  if (end && !Number.isNaN(end.getTime()) && end.getTime() < Date.now()) return null;
  return { teamId, oppId, ref, snapshot };
}

export async function GET(req: NextRequest) {
  const limited = await enforcePublicRateLimit(req, 'volunteer-read', 60, 10 * 60 * 1000);
  if (limited) return limited;
  try {
    const opportunity = await getOpportunity(req);
    if (!opportunity) {
      return NextResponse.json({ error: 'This volunteer opportunity is unavailable.' }, { status: 404 });
    }
    const data = opportunity.snapshot.data() || {};
    return NextResponse.json({
      opportunity: {
        id: opportunity.oppId,
        title: String(data.title || 'Volunteer Opportunity'),
        description: String(data.description || ''),
        date: String(data.date || ''),
        endDate: String(data.endDate || ''),
        location: String(data.location || ''),
        spots: Number(data.spots) || 0,
        hoursPerSlot: Number(data.hoursPerSlot) || 0,
      },
    });
  } catch (error) {
    console.error('[public/volunteer GET] Error:', error);
    return NextResponse.json({ error: 'Unable to load this volunteer opportunity.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const limited = await enforcePublicRateLimit(req, 'volunteer-submit', 10, 60 * 60 * 1000);
  if (limited) return limited;
  try {
    const opportunity = await getOpportunity(req);
    if (!opportunity) {
      return NextResponse.json({ error: 'This volunteer opportunity is unavailable.' }, { status: 404 });
    }
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 12_000);
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 120) : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 40) : '';
    const relationship = typeof body.relationship === 'string' ? body.relationship : '';
    const key = req.headers.get('idempotency-key') || '';
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.length < 7) {
      return NextResponse.json({ error: 'Enter a valid name, email address, and phone number.' }, { status: 400 });
    }
    if (!RELATIONSHIPS.has(relationship)) {
      return NextResponse.json({ error: 'Select how you are connected to the participant.' }, { status: 400 });
    }
    if (!KEY_PATTERN.test(key)) {
      return NextResponse.json({ error: 'A valid submission key is required.' }, { status: 400 });
    }

    const signupId = createHash('sha256')
      .update(`${opportunity.teamId}:${opportunity.oppId}:${key}`)
      .digest('hex');
    await adminDb.runTransaction(async transaction => {
      const fresh = await transaction.get(opportunity.ref);
      const data = fresh.data() || {};
      if (!fresh.exists || data.isShareable !== true) throw new Error('CLOSED');
      const signups = data.signups || {};
      const confirmed = Object.values(signups).filter((signup: any) => signup?.status !== 'cancelled').length;
      if (Number(data.spots) > 0 && confirmed >= Number(data.spots)) throw new Error('FULL');
      transaction.update(opportunity.ref, {
        [`signups.${signupId}`]: {
          userId: `public_${signupId}`,
          userName: name,
          name,
          email,
          phone,
          relationship,
          isConfirmed: false,
          status: 'pending',
          source: 'public_portal',
          createdAt: new Date().toISOString(),
        },
      });
    });
    return NextResponse.json({ ok: true, signupId });
  } catch (error: any) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error?.message === 'FULL') {
      return NextResponse.json({ error: 'This opportunity is already full.' }, { status: 409 });
    }
    if (error?.message === 'CLOSED') {
      return NextResponse.json({ error: 'This opportunity is no longer public.' }, { status: 404 });
    }
    console.error('[public/volunteer POST] Error:', error);
    return NextResponse.json({ error: 'Unable to submit this volunteer request.' }, { status: 500 });
  }
}
