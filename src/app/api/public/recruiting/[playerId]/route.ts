import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { buildPublicRecruitingProfile } from '@/lib/public-recruiting-profile';
import { enforcePublicRateLimit } from '@/lib/server-request-guards';
import { isValidFirestoreDocumentId } from '@/lib/firestore-document-id';
import { isProspectActivated } from '@/lib/prospect-activation';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const { playerId } = await params;
  if (!isValidFirestoreDocumentId(playerId)) {
    return NextResponse.json({ error: 'A valid profile ID is required.' }, { status: 400 });
  }

  const rateLimit = await enforcePublicRateLimit(request, 'recruiting-profile', 120, 15 * 60 * 1000, playerId);
  if (rateLimit) return rateLimit;

  try {
    const playerRef = adminDb.collection('players').doc(playerId);
    const [playerSnap, profileSnap, metricsSnap, statsSnap, videosSnap] = await Promise.all([
      playerRef.get(),
      playerRef.collection('recruitingProfile').doc('profile').get(),
      playerRef.collection('recruitingProfile').doc('metrics').get(),
      playerRef.collection('stats').orderBy('createdAt', 'desc').limit(50).get(),
      playerRef.collection('videos').orderBy('createdAt', 'desc').limit(50).get(),
    ]);
    const player = playerSnap.data() || {};
    const profile = profileSnap.data() || {};
    if (!playerSnap.exists || !isProspectActivated(profile)) {
      return NextResponse.json({ error: 'Profile not found.' }, { status: 404 });
    }

    return NextResponse.json(buildPublicRecruitingProfile({
      player,
      profile,
      metrics: metricsSnap.data() || {},
      stats: statsSnap.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() })),
      videos: videosSnap.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() })),
    }), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[Public recruiting profile] Failed to load profile.', error);
    return NextResponse.json({ error: 'Profile unavailable.' }, { status: 503 });
  }
}
