import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken, assertNonAnonymous } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import {
  accountCreationLimit,
  normalizeCreationText,
} from '@/lib/account-creation-policy';
import { readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';

export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;
  const anonymousError = assertNonAnonymous(auth);
  if (anonymousError) return anonymousError;

  try {
    const input = await readJsonBodyWithLimit<Record<string, unknown>>(request, 8_000);
    const name = normalizeCreationText(input.name, { field: 'name', max: 120 })!;
    const divisionTitle = normalizeCreationText(input.divisionTitle, {
      field: 'divisionTitle',
      max: 120,
      optional: true,
    });
    const sport = normalizeCreationText(input.sport, {
      field: 'sport',
      max: 80,
      optional: true,
    });
    const teamId =
      typeof input.teamId === 'string' && input.teamId ? input.teamId : undefined;
    let team: FirebaseFirestore.DocumentSnapshot | undefined;
    if (teamId) {
      team = await adminDb.collection('teams').doc(teamId).get();
      if (!team.exists || team.data()?.ownerUserId !== auth.uid) {
        return NextResponse.json(
          { error: 'Only the team owner can create a league for this team.' },
          { status: 403 }
        );
      }
    }

    const userRef = adminDb.collection('users').doc(auth.uid);
    const leaguesQuery = adminDb.collection('leagues').where('creatorId', '==', auth.uid);
    const leagueRef = adminDb.collection('leagues').doc();
    const leagueId = `league_${leagueRef.id}`;
    const actualLeagueRef = adminDb.collection('leagues').doc(leagueId);
    const now = new Date().toISOString();

    await adminDb.runTransaction(async transaction => {
      const [profile, leagues] = await Promise.all([
        transaction.get(userRef),
        transaction.get(leaguesQuery),
      ]);
      if (!profile.exists) throw new Error('OWNER_PROFILE_MISSING');
      if (leagues.size >= accountCreationLimit(profile.data())) {
        throw new Error('LEAGUE_LIMIT_REACHED');
      }
      transaction.create(actualLeagueRef, {
        id: leagueId,
        name,
        divisionTitle: divisionTitle || '',
        creatorId: auth.uid,
        sport: sport || team?.data()?.sport || 'General',
        teams: teamId
          ? {
              [teamId]: {
                teamName: team?.data()?.teamName || 'Team',
                teamLogoUrl: team?.data()?.teamLogoUrl || '',
                wins: 0,
                losses: 0,
                ties: 0,
                points: 0,
                status: 'accepted',
              },
            }
          : {},
        memberTeamIds: teamId ? [teamId] : [],
        memberUserIds: [auth.uid],
        finances: {},
        inviteCode: leagueId.slice(-6).toUpperCase(),
        createdAt: now,
      });
      if (teamId) {
        transaction.update(adminDb.collection('teams').doc(teamId), {
          [`leagueIds.${leagueId}`]: true,
        });
      }
    });
    return NextResponse.json({ leagueId }, { status: 201 });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const code = error instanceof Error ? error.message : 'LEAGUE_CREATE_FAILED';
    if (code === 'LEAGUE_LIMIT_REACHED') {
      return NextResponse.json(
        { error: 'Your account has reached its league limit.' },
        { status: 409 }
      );
    }
    if (code === 'OWNER_PROFILE_MISSING') {
      return NextResponse.json({ error: 'Account profile is incomplete.' }, { status: 409 });
    }
    if (code.endsWith('_REQUIRED') || code.endsWith('_INVALID')) {
      return NextResponse.json({ error: 'One or more league fields are invalid.' }, { status: 400 });
    }
    console.error('[leagues/create] Failed:', error);
    return NextResponse.json({ error: 'Unable to create the league.' }, { status: 500 });
  }
}
