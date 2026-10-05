import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { isAccountAccessBlocked } from '@/lib/account-access-policy';
import { memberLeague } from '@/lib/public-portal-data';
import { competitionScoringInput, submitCompetitionScore, openCompetitionDispute, resolveCompetitionDispute, readActiveScoringLeague, isActiveCompetitionTeam } from '@/lib/server-competition-scoring';
import { ScheduleDeploymentError } from '@/lib/server-schedule-deployment';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';

export const runtime = 'nodejs';
function errorResponse(error: unknown) {
  if (error instanceof ScheduleDeploymentError || error instanceof RequestBodyError) return NextResponse.json({ error: error.message }, { status: error.status });
  const message = error instanceof Error ? error.message : '';
  if (message === 'Request collision.') return NextResponse.json({ error: message }, { status: 409 });
  if (message.startsWith('Forbidden competition')) return NextResponse.json({ error: 'League access denied.' }, { status: 403 });
  if (message.startsWith('Invalid competition')) return NextResponse.json({ error: message }, { status: 400 });
  console.error('[leagues/scoring]', error);
  return NextResponse.json({ error: 'League scoring is temporarily unavailable.' }, { status: 500 });
}

export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof Response) return auth;
  try {
    const limited = await enforceUserRateLimit(auth.uid, 'league-scoring', 300, 3600000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(request, 20000);
    const service = body.action === 'score' ? submitCompetitionScore : body.action === 'dispute' ? openCompetitionDispute : body.action === 'resolve-dispute' ? resolveCompetitionDispute : null;
    if (!service) return NextResponse.json({ error: 'Invalid scoring action.' }, { status: 400 });
    return NextResponse.json(await service(competitionScoringInput(body, { uid: auth.uid, role: auth.role })));
  } catch (error) { return errorResponse(error); }
}

export async function GET(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof Response) return auth;
  try {
    const limited = await enforceUserRateLimit(auth.uid, 'league-member-discovery', 300, 3600000);
    if (limited) return limited;
    const teamId = request.nextUrl.searchParams.get('teamId') || '';
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(teamId)) return NextResponse.json({ error: 'A team context is required.' }, { status: 400 });
    const data = await adminDb.runTransaction(async transaction => {
      const teamRef = adminDb.collection('teams').doc(teamId);
      const [team, profile, direct] = await Promise.all([
        transaction.get(teamRef), transaction.get(adminDb.collection('users').doc(auth.uid)), transaction.get(teamRef.collection('members').doc(auth.uid)),
      ]);
      if (!team.exists || !isActiveCompetitionTeam(team.data()) || (profile.exists && (isAccountAccessBlocked(profile.data()) || profile.data()?.isDeleted === true))) throw new ScheduleDeploymentError('FORBIDDEN', 'Member access is inactive.', 403);
      const active = (member: Record<string, unknown> | undefined) => !!member && member.status === 'active' && member.isDeleted !== true && (!member.userId || member.userId === auth.uid);
      let isMember = active(direct.data());
      if (!isMember && team.data()?.ownerUserId !== auth.uid) {
        const linked = await transaction.get(teamRef.collection('members').where('userId', '==', auth.uid).limit(10));
        isMember = linked.docs.some(doc => active(doc.data()));
      }
      if (!isMember && team.data()?.ownerUserId !== auth.uid) throw new ScheduleDeploymentError('FORBIDDEN', 'Current team membership is required.', 403);
      const candidates = await transaction.get(adminDb.collection('leagues').where('memberTeamIds', 'array-contains', teamId).limit(50));
      const result = [];
      for (const candidate of candidates.docs) {
        try {
          const league = await readActiveScoringLeague(transaction, candidate.id);
          if (!['accepted', 'assigned'].includes(league.teams?.[teamId]?.status)) continue;
          result.push(memberLeague(candidate.id, league));
        } catch (error) {
          if (!(error instanceof ScheduleDeploymentError) || ![403, 404].includes(error.status)) throw error;
        }
      }
      return result;
    });
    return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return errorResponse(error); }
}
