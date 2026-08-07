import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function identifiers(req: NextRequest) {
  const teamId = req.nextUrl.searchParams.get('teamId') || '';
  const opportunityId = req.nextUrl.searchParams.get('opportunityId') || '';
  return { teamId, opportunityId };
}

function requestKey(req: NextRequest, suffix: string) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return `${(forwarded || 'local').slice(0, 100)}:${suffix}`;
}

function publicOpportunity(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    title: String(data.title || 'Volunteer Opportunity'),
    description: String(data.description || ''),
    date: data.date || null,
    endDate: data.endDate || null,
    location: String(data.location || ''),
    spots: Math.max(0, Number(data.spots || 0)),
    points: Math.max(0, Number(data.points || 0)),
    hoursPerSlot: Math.max(0, Number(data.hoursPerSlot || 0)),
    signupCount: Object.keys(data.signups || {}).length,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { teamId, opportunityId } = identifiers(req);
    if (!ID_PATTERN.test(teamId) || !ID_PATTERN.test(opportunityId)) {
      return NextResponse.json({ error: 'Invalid volunteer link.' }, { status: 400 });
    }

    const snapshot = await adminDb.collection('teams').doc(teamId).collection('volunteers').doc(opportunityId).get();
    const data = snapshot.data();
    if (!snapshot.exists || data?.isShareable !== true || data?.status === 'closed') {
      return NextResponse.json({ error: 'Volunteer opportunity not found or inactive.' }, { status: 404 });
    }

    return NextResponse.json({ data: publicOpportunity(snapshot.id, data) });
  } catch (error) {
    console.error('[public/volunteer] Read error:', error);
    return NextResponse.json({ error: 'Volunteer portal is temporarily unavailable.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 8_000);
    const teamId = String(body.teamId || '').trim();
    const opportunityId = String(body.opportunityId || '').trim();
    const name = String(body.name || '').trim().slice(0, 120);
    const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
    const phone = String(body.phone || '').trim().slice(0, 40);
    if (!ID_PATTERN.test(teamId) || !ID_PATTERN.test(opportunityId) || name.length < 2 ||
        !EMAIL_PATTERN.test(email) || phone.length < 7) {
      return NextResponse.json({ error: 'Valid contact details are required.' }, { status: 400 });
    }

    const limited = await enforceUserRateLimit(
      requestKey(req, `${teamId}:${opportunityId}`),
      'public-volunteer',
      10,
      60 * 60 * 1000,
    );
    if (limited) return limited;

    const ref = adminDb.collection('teams').doc(teamId).collection('volunteers').doc(opportunityId);
    const signupId = `public_${createHash('sha256').update(`${opportunityId}:${email}`).digest('hex').slice(0, 24)}`;
    const result = await adminDb.runTransaction(async transaction => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.data();
      if (!snapshot.exists || data?.isShareable !== true || data?.status === 'closed') return 'inactive';
      const signups = data.signups || {};
      const spots = Math.max(0, Number(data.spots || 0));
      if (!signups[signupId] && spots > 0 && Object.keys(signups).length >= spots) return 'full';
      transaction.update(ref, {
        [`signups.${signupId}`]: {
          userId: signupId,
          userName: name,
          email,
          phone,
          isConfirmed: false,
          status: 'pending',
          createdAt: new Date().toISOString(),
          source: 'public-portal',
        },
      });
      return 'saved';
    });

    if (result === 'inactive') {
      return NextResponse.json({ error: 'Volunteer opportunity not found or inactive.' }, { status: 404 });
    }
    if (result === 'full') {
      return NextResponse.json({ error: 'This volunteer opportunity is already full.' }, { status: 409 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[public/volunteer] Submission error:', error);
    return NextResponse.json({ error: 'Volunteer signup could not be completed.' }, { status: 500 });
  }
}
