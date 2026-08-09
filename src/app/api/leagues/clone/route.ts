import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, assertNonAnonymous } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { accountCreationLimit, normalizeCreationText } from '@/lib/account-creation-policy';
import { readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  const anonymousError = assertNonAnonymous(auth);
  if (anonymousError) return anonymousError;

  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 8_000);
    const sourceLeagueId = typeof body.leagueId === 'string' && ID_PATTERN.test(body.leagueId) ? body.leagueId : '';
    const name = normalizeCreationText(body.name, { field: 'name', max: 120 })!;
    if (!sourceLeagueId) return NextResponse.json({ error: 'Invalid source league.' }, { status: 400 });

    const sourceRef = adminDb.collection('leagues').doc(sourceLeagueId);
    const userRef = adminDb.collection('users').doc(auth.uid);
    const ownedLeaguesQuery = adminDb.collection('leagues').where('creatorId', '==', auth.uid);
    const [source, configs, profile, ownedLeagues] = await Promise.all([
      sourceRef.get(),
      sourceRef.collection('registration').get(),
      userRef.get(),
      ownedLeaguesQuery.get(),
    ]);
    if (!source.exists) return NextResponse.json({ error: 'Source league not found.' }, { status: 404 });
    if (auth.role !== 'superadmin' && source.data()?.creatorId !== auth.uid) {
      return NextResponse.json({ error: 'Only the league organizer can clone this league.' }, { status: 403 });
    }
    if (auth.role !== 'superadmin' && (!profile.exists || ownedLeagues.size >= accountCreationLimit(profile.data()))) {
      return NextResponse.json({ error: 'Your account has reached its league limit.' }, { status: 409 });
    }

    const generatedRef = adminDb.collection('leagues').doc();
    const leagueId = `league_${generatedRef.id}`;
    const destination = adminDb.collection('leagues').doc(leagueId);
    const sourceData = source.data() || {};
    const now = new Date().toISOString();
    const batch = adminDb.batch();
    batch.create(destination, {
      id: leagueId,
      name,
      sport: sourceData.sport || '',
      description: sourceData.description || '',
      startDate: sourceData.startDate || '',
      endDate: sourceData.endDate || '',
      ages: sourceData.ages || '',
      contactEmail: sourceData.contactEmail || '',
      contactPhone: sourceData.contactPhone || '',
      registrationCost: sourceData.registrationCost || '',
      paymentInstructions: sourceData.paymentInstructions || '',
      socialLinks: sourceData.socialLinks || {},
      slug: `${leagueId.slice(-6)}-clone`,
      requiredSquads: sourceData.requiredSquads || null,
      blackoutDaysOfWeek: sourceData.blackoutDaysOfWeek || [],
      divisions: sourceData.divisions || [],
      creatorId: auth.uid,
      createdAt: now,
      isArchived: false,
      is_active: false,
      teams: {},
      individualRecruits: {},
      schedule: [],
      memberTeamIds: [],
      memberUserIds: [auth.uid],
      memberIndivIds: [],
    });
    for (const config of configs.docs) {
      batch.set(destination.collection('registration').doc(config.id), config.data());
    }
    await batch.commit();
    return NextResponse.json({ leagueId }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const code = error instanceof Error ? error.message : '';
    if (code.endsWith('_REQUIRED') || code.endsWith('_INVALID')) {
      return NextResponse.json({ error: 'Enter a valid league name.' }, { status: 400 });
    }
    console.error('[leagues/clone] Error:', error);
    return NextResponse.json({ error: 'Unable to clone the league.' }, { status: 500 });
  }
}
