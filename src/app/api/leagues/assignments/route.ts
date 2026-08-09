import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { getTeamAuthority } from '@/lib/server-team-access';
import {
  enforceUserRateLimit,
  readJsonBodyWithLimit,
  RequestBodyError,
} from '@/lib/server-request-guards';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;
const ASSIGNABLE_PROTOCOLS = new Set(['player_config', 'individual_config', 'team_config']);

function validId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

export async function GET(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  const teamId = req.nextUrl.searchParams.get('teamId');
  if (!validId(teamId)) return NextResponse.json({ error: 'Invalid squad.' }, { status: 400 });

  const authority = await getTeamAuthority(teamId, auth.uid, auth.role);
  if (!authority?.isStaff) {
    return NextResponse.json({ error: 'Only authorized squad staff can view assignments.' }, { status: 403 });
  }

  const snapshot = await adminDb.collectionGroup('registrationEntries')
    .where('assigned_team_id', '==', teamId)
    .limit(200)
    .get();
  const assignments = snapshot.docs
    .filter(document => document.data().status === 'assigned')
    .map(document => ({
      ...document.data(),
      id: document.id,
      league_id: document.data().league_id || document.ref.parent.parent?.id || '',
    }));

  return NextResponse.json({ assignments });
}

export async function PATCH(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const limited = await enforceUserRateLimit(auth.uid, 'league-assignment', 200, 60 * 60 * 1000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 10_000);
    const action = String(body.action || '');
    const leagueId = body.leagueId;
    const entryId = body.entryId;
    if (!validId(leagueId) || !validId(entryId)) {
      return NextResponse.json({ error: 'Invalid league assignment.' }, { status: 400 });
    }

    const leagueRef = adminDb.collection('leagues').doc(leagueId);
    const entryRef = leagueRef.collection('registrationEntries').doc(entryId);

    if (action === 'assign') {
      const teamId = body.teamId === null ? null : body.teamId;
      if (teamId !== null && !validId(teamId)) {
        return NextResponse.json({ error: 'Invalid squad.' }, { status: 400 });
      }
      const [league, entry, team] = await Promise.all([
        leagueRef.get(),
        entryRef.get(),
        teamId ? adminDb.collection('teams').doc(teamId).get() : Promise.resolve(null),
      ]);
      if (!league.exists || !entry.exists) {
        return NextResponse.json({ error: 'League registration not found.' }, { status: 404 });
      }
      if (auth.role !== 'superadmin' && league.data()?.creatorId !== auth.uid) {
        return NextResponse.json({ error: 'Only the league organizer can assign registrations.' }, { status: 403 });
      }
      const protocolId = String(entry.data()?.protocol_id || '');
      if (!ASSIGNABLE_PROTOCOLS.has(protocolId)) {
        return NextResponse.json({ error: 'This registration cannot be assigned to a squad.' }, { status: 409 });
      }
      if (teamId && (!team?.exists || !league.data()?.teams?.[teamId])) {
        return NextResponse.json({ error: 'Choose an enrolled platform squad.' }, { status: 409 });
      }

      const ownerId = teamId && team?.exists ? String(team.data()?.ownerUserId || '') || null : null;
      const teamName = teamId
        ? String(league.data()?.teams?.[teamId]?.teamName || team?.data()?.teamName || team?.data()?.name || '')
        : null;
      const inviteCode = teamId
        ? String(team?.data()?.inviteCode || team?.data()?.teamCode || team?.data()?.code || '')
        : null;
      const batch = adminDb.batch();
      batch.update(entryRef, {
        assigned_team_id: teamId,
        assigned_team_owner_id: ownerId,
        status: teamId ? 'assigned' : 'pending',
        assignmentUpdatedAt: new Date().toISOString(),
        assignmentUpdatedBy: auth.uid,
      });

      if (protocolId === 'player_config' || protocolId === 'individual_config') {
        const recruitId = `recruit_${entryId}`;
        batch.update(leagueRef, {
          [`individualRecruits.${recruitId}.status`]: teamId ? 'assigned' : 'pending',
          [`individualRecruits.${recruitId}.teamId`]: teamId,
          [`individualRecruits.${recruitId}.teamName`]: teamName,
          [`individualRecruits.${recruitId}.teamCode`]: inviteCode,
        });
      }

      if (teamId && team) {
        const answers = entry.data()?.answers || {};
        const applicant = answers.fullName || answers.name || answers.teamName || 'New applicant';
        const alertRef = team.ref.collection('alerts').doc();
        batch.set(alertRef, {
          id: alertRef.id,
          title: 'New League Assignment',
          message: `${applicant} has been assigned to your squad by the league organizer.`,
          audience: 'coaches',
          targetUserId: null,
          createdAt: new Date().toISOString(),
          createdBy: auth.uid,
        });
      }
      await batch.commit();
      return NextResponse.json({ success: true });
    }

    if (action === 'respond') {
      const teamId = body.teamId;
      const status = body.status;
      if (!validId(teamId) || (status !== 'accepted' && status !== 'declined')) {
        return NextResponse.json({ error: 'Invalid assignment response.' }, { status: 400 });
      }
      const authority = await getTeamAuthority(teamId, auth.uid, auth.role);
      if (!authority?.isStaff) {
        return NextResponse.json({ error: 'Only authorized squad staff can respond to assignments.' }, { status: 403 });
      }

      const result = await adminDb.runTransaction(async transaction => {
        const [league, entry] = await Promise.all([
          transaction.get(leagueRef),
          transaction.get(entryRef),
        ]);
        if (!league.exists || !entry.exists) return 'missing';
        if (entry.data()?.assigned_team_id !== teamId || entry.data()?.status !== 'assigned') return 'stale';

        const protocolId = String(entry.data()?.protocol_id || '');
        const recruitId = `recruit_${entryId}`;
        const teamName = String(authority.teamData.teamName || authority.teamData.name || 'Squad');
        const teamLogoUrl = String(authority.teamData.teamLogoUrl || '');
        const now = new Date().toISOString();
        transaction.update(entryRef, {
          status,
          assignmentRespondedAt: now,
          assignmentRespondedBy: auth.uid,
          assigned_team_owner_id: authority.teamData.ownerUserId || null,
        });

        if (protocolId === 'player_config' || protocolId === 'individual_config') {
          transaction.update(leagueRef, {
            [`individualRecruits.${recruitId}.status`]: status,
            [`individualRecruits.${recruitId}.teamId`]: teamId,
            [`individualRecruits.${recruitId}.teamName`]: teamName,
            [`individualRecruits.${recruitId}.teamCode`]: authority.teamData.inviteCode || authority.teamData.teamCode || authority.teamData.code || '',
          });
          if (status === 'accepted') {
            transaction.set(authority.teamRef, { [`leagueIds.${leagueId}`]: true }, { merge: true });
          }
          return 'updated';
        }

        if (protocolId !== 'team_config') return 'unsupported';
        const placeholder = league.data()?.teams?.[recruitId] || {};
        if (status === 'declined') {
          transaction.update(leagueRef, { [`teams.${recruitId}.status`]: 'declined' });
          return 'updated';
        }

        const memberTeamIds = Array.from(new Set(
          (Array.isArray(league.data()?.memberTeamIds) ? league.data()!.memberTeamIds : [])
            .filter((id: unknown) => id !== recruitId)
            .concat(teamId),
        ));
        const schedule = (Array.isArray(league.data()?.schedule) ? league.data()!.schedule : []).map((game: any) => ({
          ...game,
          team1Id: game.team1Id === recruitId ? teamId : game.team1Id,
          team2Id: game.team2Id === recruitId ? teamId : game.team2Id,
          team1: game.team1Id === recruitId ? teamName : game.team1,
          team2: game.team2Id === recruitId ? teamName : game.team2,
        }));
        transaction.update(leagueRef, {
          [`teams.${recruitId}`]: FieldValue.delete(),
          [`teams.${teamId}`]: { ...placeholder, status: 'accepted', teamName, teamLogoUrl: teamLogoUrl || placeholder.teamLogoUrl || '' },
          memberTeamIds,
          schedule,
        });
        transaction.set(authority.teamRef, { [`leagueIds.${leagueId}`]: true }, { merge: true });

        for (const game of schedule) {
          if (game.team1Id !== teamId && game.team2Id !== teamId) continue;
          const isHome = game.team1Id === teamId;
          const opponentId = isHome ? game.team2Id : game.team1Id;
          const opponentName = isHome ? game.team2 : game.team1;
          const eventId = `lg_${leagueId}_${game.id}`;
          transaction.set(authority.teamRef.collection('events').doc(eventId), withoutUndefined({
            id: eventId,
            teamId,
            title: `League Match vs ${opponentName || 'Opponent'}`,
            eventType: 'game',
            isLeagueGame: true,
            isHome,
            leagueId,
            date: game.date || '',
            startTime: game.time || '',
            location: game.location || '',
            description: `Official season fixture for ${league.data()?.name || 'league'}. Matchup: ${teamName} vs ${opponentName || 'Opponent'}`,
            matchTeamIds: [teamId, opponentId].filter(Boolean),
            createdAt: now,
          }), { merge: true });
        }
        return 'updated';
      });

      if (result === 'missing') return NextResponse.json({ error: 'League registration not found.' }, { status: 404 });
      if (result === 'stale') return NextResponse.json({ error: 'This assignment is no longer pending for your squad.' }, { status: 409 });
      if (result === 'unsupported') return NextResponse.json({ error: 'This registration cannot be accepted by a squad.' }, { status: 409 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid assignment action.' }, { status: 400 });
  } catch (error) {
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[leagues/assignments] Error:', error);
    return NextResponse.json({ error: 'Unable to update the league assignment.' }, { status: 500 });
  }
}
