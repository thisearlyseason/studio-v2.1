import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as publicPortalModule from '../src/lib/public-portal-data.ts';
const {
  permitsLegacyOrPaidPortals,
  publicLeague,
  publicRegistrationConfig,
  publicTournament,
  supportsPublicPortals,
} = publicPortalModule;
const securityModule = await import('../src/lib/score-action-security.ts');
const { credentialsMatch, isLegacyOpenPortal, validScore } = securityModule;
const recruitingModule = await import('../src/lib/public-recruiting-data.ts');
const { buildPublicRecruitingDto } = recruitingModule;
const publicActionModule = await import('../src/lib/public-league-scoring.ts');
const {
  publicLeagueGameProjection,
  recalculatePublicLeagueStandings,
} = publicActionModule;

for (const plan of ['team', 'elite', 'league', 'school']) {
  test(`${plan} subscriptions support every public portal`, () => {
    assert.equal(supportsPublicPortals(plan), true);
  });
}

test('starter/free plans cannot activate premium public portals', () => {
  assert.equal(supportsPublicPortals('free'), false);
  assert.equal(supportsPublicPortals('starter'), false);
  assert.equal(permitsLegacyOrPaidPortals('free'), false);
});

test('legacy accounts without a plan marker retain existing portal access', () => {
  assert.equal(permitsLegacyOrPaidPortals(undefined), true);
});

test('public league payload excludes private contacts, PINs, finances, and invite codes', () => {
  const result = publicLeague('league-1', {
    name: 'Summer League', scorekeeperPin: '1234', finances: { secret: true },
    teams: { t1: { teamName: 'Alpha', coachEmail: 'private@example.com', inviteCode: 'SECRET', points: 3 } },
    schedule: [{ id: 'g1', team1: 'Alpha', team2: 'Beta', internalNotes: 'private' }],
  });
  assert.equal(result.requiresPin, true);
  assert.equal('scorekeeperPin' in result, false);
  assert.equal('finances' in result, false);
  assert.equal('coachEmail' in result.teams.t1, false);
  assert.equal('inviteCode' in result.teams.t1, false);
  assert.equal('internalNotes' in result.schedule[0], false);
});

test('public tournament payload excludes scoring codes and referee contact details', () => {
  const result = publicTournament('event-1', {
    isTournament: true, scoringCode: 'SECRET', adminEmails: ['private@example.com'],
    teamAgreements: { Alpha: { agreed: true, captainName: 'Private Captain', signedAt: 'private' } },
    refereePool: [{ id: 'r1', name: 'Official', email: 'ref@example.com', phone: '555' }],
    tournamentGames: [],
  });
  assert.equal(result.requiresCode, true);
  assert.equal('scoringCode' in result, false);
  assert.equal('adminEmails' in result, false);
  assert.equal('email' in result.referees[0], false);
  assert.equal('phone' in result.referees[0], false);
  assert.equal(result.teamAgreements.Alpha.agreed, true);
  assert.equal('captainName' in result.teamAgreements.Alpha, false);
  assert.equal('signedAt' in result.teamAgreements.Alpha, false);
});

test('referee assignment lookup requires a verified token matching the requested email', async () => {
  const source = await readFile(new URL('../src/app/api/public/portals/route.ts', import.meta.url), 'utf8');
  const refereeLookup = source.slice(
    source.indexOf('      const refereeEmail ='),
    source.indexOf('      if (!data.isActive)', source.indexOf('      const refereeEmail =')),
  );
  assert.match(refereeLookup, /verifyFirebaseToken\(req\)/);
  assert.match(refereeLookup, /assertNonAnonymous\(auth\)/);
  assert.match(refereeLookup, /authenticatedEmail !== refereeEmail/);
  assert.match(refereeLookup, /Referee access could not be verified/);
});

test('public tournament games expose only safe bracket topology needed for score locking', () => {
  const result = publicTournament('event-1', {
    isTournament: true,
    tournamentGames: [{
      id: 'semi', team1: 'Alpha', team2: 'Bravo', team1Id: 'a', team2Id: 'b',
      winnerTo: 'final', winnerToSlot: 'team1', loserTo: 'consolation', loserToSlot: 'team2',
      pool: 0, isResetMatch: false, isConditional: false,
    }],
  });
  assert.deepEqual(
    {
      winnerTo: result.tournamentGames[0].winnerTo,
      winnerToSlot: result.tournamentGames[0].winnerToSlot,
      loserTo: result.tournamentGames[0].loserTo,
      loserToSlot: result.tournamentGames[0].loserToSlot,
      pool: result.tournamentGames[0].pool,
      isConditional: result.tournamentGames[0].isConditional,
    },
    { winnerTo: 'final', winnerToSlot: 'team1', loserTo: 'consolation', loserToSlot: 'team2', pool: 0, isConditional: false }
  );
});

test('tournament team registration is transactional and fails closed after bracket publication', async () => {
  const source = await readFile(new URL('../src/app/api/public/portals/action/route.ts', import.meta.url), 'utf8');
  assert.match(source, /adminDb\.runTransaction/);
  assert.match(source, /TOURNAMENT_ROSTER_LOCKED/);
  assert.match(source, /tournamentGames\.length > 0/);
  assert.match(source, /transaction\.create\(entry, entryData\)/);
  assert.match(source, /transaction\.update\(tournamentEventRef/);
  assert.match(source, /freshEvent\.data\(\)\?\.tournamentGames/);
});

test('linked squad registrations verify staff authority and canonicalize client identity', async () => {
  const action = await readFile(new URL('../src/app/api/public/portals/action/route.ts', import.meta.url), 'utf8');
  const leaguePage = await readFile(new URL('../src/app/register/league/[leagueId]/page.tsx', import.meta.url), 'utf8');
  const tournamentPage = await readFile(new URL('../src/app/register/tournament/[teamId]/[eventId]/page.tsx', import.meta.url), 'utf8');

  assert.match(action, /verifyFirebaseToken\(req\)/);
  assert.match(action, /getTeamAuthority\(sourceTeamId, auth\.uid, auth\.role\)/);
  assert.match(action, /if \(!authority\?\.isStaff\)/);
  assert.match(action, /answers\.teamName = canonicalName/);
  assert.match(action, /answers\.teamLogoUrl = canonicalLogo/);
  assert.match(action, /id: `p_\$\{entry\.id\}`/);
  assert.match(action, /sourceTeamId:/);
  assert.match(leaguePage, /headers: \{ 'content-type': 'application\/json', \.\.\.authHeader\(token\) \}/);
  assert.match(tournamentPage, /headers: \{ 'Content-Type': 'application\/json', \.\.\.authHeader\(token\) \}/);
});

test('public tournament actions honor every supported team plan marker', async () => {
  const source = await readFile(new URL('../src/app/api/public/portals/action/route.ts', import.meta.url), 'utf8');
  const tournamentRegistration = source.slice(
    source.indexOf("      } else {\n        const teamId"),
    source.indexOf("      const configSnap =", source.indexOf("      } else {\n        const teamId")),
  );
  const tournamentActions = source.slice(
    source.indexOf("    if (kind === 'tournament')", source.indexOf("    if (kind === 'tournament')") + 1),
    source.indexOf("    if (kind === 'league')", source.indexOf("    if (kind === 'tournament')", source.indexOf("    if (kind === 'tournament')") + 1)),
  );

  for (const section of [tournamentRegistration, tournamentActions]) {
    assert.match(section, /teamSnap\.data\(\)\?\.planId/);
    assert.match(section, /teamSnap\.data\(\)\?\.plan_type/);
    assert.match(section, /teamSnap\.data\(\)\?\.subscriptionPlanId/);
  }
});

test('public tournament scoring shares the deployment lock without changing league scoring', async () => {
  const source = await readFile(new URL('../src/app/api/public/portals/action/route.ts', import.meta.url), 'utf8');
  const tournamentScoreStart = source.indexOf("      if (action === 'score')", source.indexOf("    if (kind === 'tournament')"));
  const tournamentDisputeStart = source.indexOf("      if (action === 'dispute')", tournamentScoreStart);
  const tournamentScore = source.slice(tournamentScoreStart, tournamentDisputeStart);
  const leagueStart = source.indexOf("    if (kind === 'league')", tournamentDisputeStart);
  const leagueScoreStart = source.indexOf("      if (action === 'score')", leagueStart);
  const leagueDisputeStart = source.indexOf("      if (action === 'dispute')", leagueScoreStart);
  const leagueScore = source.slice(leagueScoreStart, leagueDisputeStart);

  assert.ok(tournamentScoreStart >= 0 && tournamentDisputeStart > tournamentScoreStart);
  assert.match(tournamentScore, /withTournamentScheduleMutationLock\(\(\) => adminDb\.runTransaction/);
  assert.ok(leagueStart >= 0 && leagueDisputeStart > leagueScoreStart);
  assert.doesNotMatch(leagueScore, /withTournamentScheduleMutationLock/);
});

test('public registration config excludes scoring credentials and internal fields', () => {
  const result = publicRegistrationConfig('team_config', {
    title: 'Team Registration',
    is_active: true,
    scoringCode: 'SECRET',
    internalNotes: 'private',
    form_schema: [{
      id: 'email', label: 'Email', type: 'short_text', required: true,
      adminOnly: true,
    }],
  });
  assert.equal(result.is_active, true);
  assert.equal('scoringCode' in result, false);
  assert.equal('internalNotes' in result, false);
  assert.equal('adminOnly' in result.form_schema[0], false);
});

test('scorekeeper credentials preserve demo compatibility but protect new portals', () => {
  assert.equal(isLegacyOpenPortal('demo_team_1', 'event-1'), true);
  assert.equal(credentialsMatch(undefined, '', true), true);
  assert.equal(credentialsMatch(undefined, '', false), false);
  assert.equal(credentialsMatch('ABC123', 'abc123', false), true);
  assert.equal(credentialsMatch('ABC123', 'wrong', false), false);
  assert.equal(validScore(0), true);
  assert.equal(validScore(999), true);
  assert.equal(validScore(1000), false);
  assert.equal(validScore(1.5), false);
});

test('public league scoring rebuilds standings from completed games without double counting corrections', () => {
  const teams = {
    alpha: { teamName: 'Alpha', status: 'accepted', wins: 9, losses: 9, ties: 9, points: 99 },
    beta: { teamName: 'Beta', status: 'accepted', wins: 9, losses: 9, ties: 9, points: 99 },
    gamma: { teamName: 'Gamma', status: 'accepted', wins: 9, losses: 9, ties: 9, points: 99 },
  };
  const schedule = [
    { id: 'g1', team1Id: 'alpha', team2Id: 'beta', score1: 4, score2: 2, isCompleted: true },
    { id: 'g2', team1Id: 'beta', team2Id: 'gamma', score1: 1, score2: 1, isCompleted: true },
    { id: 'g3', team1Id: 'gamma', team2Id: 'alpha', score1: 8, score2: 0, isCompleted: false },
    { id: 'exhibition', team1Id: 'gamma', team2Id: 'alpha', score1: 8, score2: 0, isCompleted: true, isExhibition: true },
  ];

  const standings = recalculatePublicLeagueStandings(teams, schedule);
  assert.deepEqual(
    Object.fromEntries(Object.entries(standings).map(([id, team]) => [id, {
      wins: team.wins, losses: team.losses, ties: team.ties, points: team.points,
    }])),
    {
      alpha: { wins: 1, losses: 0, ties: 0, points: 3 },
      beta: { wins: 0, losses: 1, ties: 1, points: 1 },
      gamma: { wins: 0, losses: 0, ties: 1, points: 1 },
    },
  );
  assert.equal(standings.alpha.teamName, 'Alpha');
  assert.equal(standings.alpha.status, 'accepted');

  const corrected = recalculatePublicLeagueStandings(teams, [
    { ...schedule[0], score1: 0, score2: 2 },
    ...schedule.slice(1),
  ]);
  assert.deepEqual(
    { wins: corrected.alpha.wins, losses: corrected.alpha.losses, points: corrected.alpha.points },
    { wins: 0, losses: 1, points: 0 },
  );
  assert.deepEqual(
    { wins: corrected.beta.wins, losses: corrected.beta.losses, ties: corrected.beta.ties, points: corrected.beta.points },
    { wins: 1, losses: 0, ties: 1, points: 4 },
  );
});

test('public league scoring creates mirrored official game projections for both teams', async () => {
  const game = { id: 'match_1', date: '2026-08-09', location: 'North Field' };
  const updatedAt = '2026-08-09T20:00:00.000Z';
  const alpha = publicLeagueGameProjection({
    leagueId: 'league_1', leagueName: 'Summer League', game,
    teamId: 'alpha', opponentTeamId: 'beta', opponent: 'Beta',
    myScore: 5, opponentScore: 3, updatedAt,
  });
  const beta = publicLeagueGameProjection({
    leagueId: 'league_1', leagueName: 'Summer League', game,
    teamId: 'beta', opponentTeamId: 'alpha', opponent: 'Alpha',
    myScore: 3, opponentScore: 5, updatedAt,
  });

  assert.equal(alpha.id, 'lg_match_1');
  assert.equal(beta.id, 'lg_match_1');
  assert.deepEqual(
    { result: alpha.result, myScore: alpha.myScore, opponentScore: alpha.opponentScore, matchTeamIds: alpha.matchTeamIds },
    { result: 'Win', myScore: 5, opponentScore: 3, matchTeamIds: ['alpha', 'beta'] },
  );
  assert.deepEqual(
    { result: beta.result, myScore: beta.myScore, opponentScore: beta.opponentScore, matchTeamIds: beta.matchTeamIds },
    { result: 'Loss', myScore: 3, opponentScore: 5, matchTeamIds: ['beta', 'alpha'] },
  );
  assert.equal(alpha.notes, 'Official result from Summer League');
  assert.equal(beta.notes, 'Official result from Summer League');

  const source = await readFile(new URL('../src/app/api/public/portals/action/route.ts', import.meta.url), 'utf8');
  assert.match(source, /transaction\.update\(ref, \{ schedule, teams,/);
  assert.match(source, /transaction\.set\(team1Ref, team1Projection\)/);
  assert.match(source, /transaction\.set\(team2Ref, team2Projection\)/);
});

test('public recruiting DTO excludes household linkage and unsafe media', () => {
  const result = buildPublicRecruitingDto({
    playerId: 'player-1',
    player: {
      name: 'Athlete', userId: 'private-user', parentId: 'private-parent',
      photoURL: 'javascript:alert(1)', recruitingProfileEnabled: true,
    },
    profile: {
      fullName: 'Athlete', parentEmail: 'parent@example.com',
      photos: ['https://cdn.example/photo.jpg', 'javascript:alert(1)'],
    },
    metrics: { verticalJump: 30, updatedByTeamId: 'private-team', phone: '555' },
    contact: { coachEmail: 'coach@example.com', parentEmail: 'parent@example.com' },
    stats: [{ id: 's1', data: { season: '2025', gamesPlayed: 10, userId: 'private' } }],
    evaluations: [{ id: 'e1', data: { overall: 8, evaluatorId: 'private', athleticism: 9 } }],
    videos: [{ id: 'v1', data: { title: 'Clip', url: 'https://cdn.example/clip.mp4' } },
      { id: 'v2', data: { title: 'Bad', url: 'javascript:alert(1)' } }],
  });
  assert.equal('userId' in result.player, false);
  assert.equal('parentId' in result.player, false);
  assert.equal('parentEmail' in result.profile, false);
  assert.equal('updatedByTeamId' in result.metrics, false);
  assert.equal('userId' in result.stats[0], false);
  assert.equal('evaluatorId' in result.evaluations[0], false);
  assert.equal(result.videos.length, 1);
  assert.equal(result.profile.photos.length, 1);
});
