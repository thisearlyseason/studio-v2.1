import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { validFirestoreDocumentId } from '@/lib/firestore-document-id';
import { permitsLegacyOrPaidPortals, publicTournament } from '@/lib/public-portal-data';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ teamId: string; eventId: string }> }
) {
  try {
    const params = await context.params;
    const teamId = validFirestoreDocumentId(params.teamId);
    const eventId = validFirestoreDocumentId(params.eventId);
    if (!teamId || !eventId) {
      return NextResponse.json({ error: 'Valid team and tournament IDs are required.' }, { status: 400 });
    }

    const teamRef = adminDb.collection('teams').doc(teamId);
    const [team, snapshot] = await Promise.all([
      teamRef.get(),
      teamRef.collection('events').doc(eventId).get(),
    ]);
    const data = snapshot.data() || {};
    if (!team.exists || !snapshot.exists || data.isTournament !== true) {
      return NextResponse.json({ error: 'Tournament not found.' }, { status: 404 });
    }
    const teamData = team.data() || {};
    if (!permitsLegacyOrPaidPortals(teamData.planId, teamData.plan_type, teamData.subscriptionPlanId)) {
      return NextResponse.json({ error: 'This subscription does not include public portals.' }, { status: 403 });
    }
    const tournament = { ...publicTournament(eventId, data), teamId };
    if (!tournament.isActive) {
      return NextResponse.json({ error: 'Tournament not found.' }, { status: 404 });
    }

    return NextResponse.json({ tournament });
  } catch (error: any) {
    console.error('[public/tournaments GET] Error:', error?.message || error);
    return NextResponse.json(
      { error: 'Unable to load this tournament.' },
      { status: 500 }
    );
  }
}
