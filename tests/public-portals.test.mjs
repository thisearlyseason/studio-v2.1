import assert from 'node:assert/strict';
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
