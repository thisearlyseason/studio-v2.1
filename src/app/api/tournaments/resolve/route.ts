import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { enforceUserRateLimit } from '@/lib/server-request-guards';

const LOOKUP_PATTERN = /^[A-Z0-9_-]{4,200}$/;
const DIRECT_ID_PATTERN = /^([A-Za-z0-9_-]{1,200}):([A-Za-z0-9_-]{1,200})$/;

export async function GET(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  const rawLookup = req.nextUrl.searchParams.get('code')?.trim() || '';
  const normalizedCode = rawLookup.toUpperCase();
  const directId = rawLookup.match(DIRECT_ID_PATTERN);
  if (!directId && !LOOKUP_PATTERN.test(normalizedCode)) {
    return NextResponse.json({ error: 'Enter a valid tournament code or ID.' }, { status: 400 });
  }
  const limited = await enforceUserRateLimit(auth.uid, 'tournament-registration-resolve', 30, 10 * 60 * 1000);
  if (limited) return limited;

  const directory = adminDb.collection('tournamentRegistrationCodes');
  let teamId = directId?.[1] || '';
  let eventId = directId?.[2] || '';
  if (!directId) {
    let mapping = await directory.doc(normalizedCode).get();
    if (!mapping.exists && rawLookup !== normalizedCode) mapping = await directory.doc(rawLookup).get();
    teamId = String(mapping.data()?.teamId || '');
    eventId = String(mapping.data()?.eventId || '');
    if (!mapping.exists || !LOOKUP_PATTERN.test(teamId.toUpperCase()) || !LOOKUP_PATTERN.test(eventId.toUpperCase())) {
      return NextResponse.json({ error: 'Tournament code or ID not found.' }, { status: 404 });
    }
  }
  const tournament = await adminDb.collection('teams').doc(teamId).collection('events').doc(eventId).get();
  if (!tournament.exists || tournament.data()?.isTournament !== true) {
    return NextResponse.json({ error: 'Tournament code or ID not found.' }, { status: 404 });
  }
  const tournamentData = tournament.data() || {};
  const config = await tournament.ref.collection('registration').doc('team_config').get();
  if (!config.exists || config.data()?.is_active !== true || tournamentData.isArchived === true) {
    return NextResponse.json({ error: 'Tournament registration is not active.' }, { status: 409 });
  }

  return NextResponse.json({
    tournament: {
      teamId,
      eventId,
      title: String(tournamentData.title || 'Tournament'),
    },
  });
}
