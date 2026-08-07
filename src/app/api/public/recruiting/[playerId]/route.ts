import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { buildPublicRecruitingDto } from '@/lib/public-recruiting-data';
import { enforceUserRateLimit } from '@/lib/server-request-guards';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

export async function GET(req: NextRequest, context: { params: Promise<{ playerId: string }> }) {
  const { playerId } = await context.params;
  if (!ID_PATTERN.test(playerId)) {
    return NextResponse.json({ error: 'Invalid athlete identifier.' }, { status: 400 });
  }

  const fingerprint = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';
  const limited = await enforceUserRateLimit(fingerprint, 'public-recruiting', 120, 60 * 60 * 1000);
  if (limited) return limited;

  const playerRef = adminDb.collection('players').doc(playerId);
  const [player, profile, metrics, contact, stats, evaluations, videos] = await Promise.all([
    playerRef.get(),
    playerRef.collection('recruitingProfile').doc('profile').get(),
    playerRef.collection('recruitingProfile').doc('metrics').get(),
    playerRef.collection('recruitingContact').doc('contact').get(),
    playerRef.collection('stats').limit(50).get(),
    playerRef.collection('evaluations').orderBy('createdAt', 'desc').limit(50).get(),
    playerRef.collection('videos').orderBy('createdAt', 'desc').limit(50).get(),
  ]);

  if (!player.exists || player.data()?.recruitingProfileEnabled === false) {
    return NextResponse.json({ error: 'Recruiting profile not found or inactive.' }, { status: 404 });
  }

  const dto = buildPublicRecruitingDto({
    playerId,
    player: player.data() || {},
    profile: profile.data(),
    metrics: metrics.data(),
    contact: contact.data(),
    stats: stats.docs.map(doc => ({ id: doc.id, data: doc.data() })),
    evaluations: evaluations.docs.map(doc => ({ id: doc.id, data: doc.data() })),
    videos: videos.docs.map(doc => ({ id: doc.id, data: doc.data() })),
  });

  return NextResponse.json(dto, {
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
  });
}
