import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { refereeTournament, scorekeeperTournament, spectatorTournament } from '../src/lib/public-portal-data.ts';
import { communicationDb, loadCommunicationRoute } from './helpers/communication-route-harness.mjs';

const sensitive = {
  teamId: 'team-a', title: 'Cup', sport: 'Soccer', isTournament: true, lifecycleVersion: 4, scheduleVersion: 6, credentialVersion: 3,
  scoringCode: 'SECRET', scoringCodeHash: 'HASH', contactEmail: 'organizer@example.test', registrationResponses: [{ medical: 'private' }],
  refereePool: [{ id: 'ref', name: 'Ref', email: 'ref@example.test', phone: '555-0100' }],
  tournamentTeamsData: [{ id: 'alpha', name: 'Alpha', coachEmail: 'coach@example.test' }, { id: 'bravo', name: 'Bravo' }],
  tournamentGames: [{ id: 'g1', gameVersion: 7, team1: 'Alpha', team1Id: 'alpha', team2: 'Bravo', team2Id: 'bravo', score1: 2, score2: 1, isCompleted: true, isDisputed: false, disputeNotes: 'private', reportedBy: 'private', audit: { private: true } }],
};

test('Tournament spectator and scorekeeper DTOs are distinct allowlists', () => {
  const spectator = spectatorTournament('cup-a', sensitive);
  const scorer = scorekeeperTournament('cup-a', sensitive);
  const spectatorText = JSON.stringify(spectator);
  assert.equal(spectatorText.includes('SECRET'), false);
  assert.equal(spectatorText.includes('organizer@example.test'), false);
  assert.equal(spectatorText.includes('ref@example.test'), false);
  assert.equal(spectatorText.includes('coach@example.test'), false);
  assert.equal(spectatorText.includes('private'), false);
  assert.equal(spectator.tournamentGames[0].gameVersion, undefined);
  assert.equal(spectator.isTournament, true);
  assert.equal(scorer.isTournament, true);
  assert.equal(scorer.tournamentGames[0].gameVersion, 7);
  assert.deepEqual([scorer.lifecycleVersion, scorer.scheduleVersion, scorer.credentialVersion], [4, 6, 3]);
  assert.equal(scorer.contactEmail, undefined);
});

test('disputed Tournament results remain explicitly unofficial and do not affect standings', () => {
  const data = spectatorTournament('cup-a', { ...sensitive, tournamentGames: [{ ...sensitive.tournamentGames[0], isDisputed: true }] });
  assert.equal(data.tournamentGames[0].isOfficial, false);
  assert.equal(data.standings.every(team => team.points === 0), true);
});

test('Tiered spectator projection hides playoff placement until publication and then exposes only safe bracket data', () => {
  const tieredPlayoffs = {
    standings: { pointsEnabled: true, points: { win: 2, tie: 1, loss: 0 }, rankingRules: ['wins'], finalResolution: 'manual', maximumDifferentialPerGame: null },
    divisions: { definitions: [{ id: 'a', name: 'A Division', size: 2 }] },
    seeding: { status: 'locked', approved: [{ teamId: 'alpha', teamName: 'Alpha', divisionId: 'a', divisionName: 'A Division', divisionSeed: 1, approvedOverallSeed: 1, overriddenBy: 'private-owner' }] },
    playoffs: { status: 'ready', publishedAt: null, publishedBy: null },
  };
  const playoff = { ...sensitive.tournamentGames[0], id: 'p1', phase: 'playoff', playoffDivisionId: 'a', playoffDivisionName: 'A Division', divisionSeed1: 1, divisionSeed2: 2 };
  const hidden = spectatorTournament('cup-a', { ...sensitive, tournamentType: 'tiered_playoffs', tieredPlayoffs, tournamentGames: [...sensitive.tournamentGames, playoff] });
  assert.deepEqual(hidden.tournamentGames.map(game => game.id), ['g1']);
  assert.equal(hidden.tieredPlayoffs.playoffs.status, 'pending');
  assert.equal(hidden.tieredPlayoffs.seeding, undefined);

  const published = spectatorTournament('cup-a', {
    ...sensitive, tournamentType: 'tiered_playoffs',
    tieredPlayoffs: { ...tieredPlayoffs, playoffs: { status: 'published', publishedAt: 'now', publishedBy: 'private-owner' } },
    tournamentGames: [...sensitive.tournamentGames, playoff],
  });
  assert.deepEqual(published.tournamentGames.map(game => game.id), ['g1', 'p1']);
  assert.equal(published.tournamentGames[1].playoffDivisionName, 'A Division');
  assert.equal(published.tieredPlayoffs.seeding.approved[0].overriddenBy, undefined);
  assert.equal(JSON.stringify(published).includes('private-owner'), false);
});

test('Tournament referee DTO contains only that referee assigned matches and no credential or contact data', () => {
  const event = { ...sensitive, tournamentGames: [
    { ...sensitive.tournamentGames[0], refereeId: 'ref', refereeName: 'Ref' },
    { ...sensitive.tournamentGames[0], id: 'g2', refereeId: 'other', refereeName: 'Other' },
  ] };
  const dto = refereeTournament('cup-a', event, 'ref');
  assert.deepEqual(dto.tournamentGames.map(game => game.id), ['g1']);
  assert.equal(dto.activeRefereeId, 'ref');
  assert.equal(JSON.stringify(dto).includes('ref@example.test'), false);
  assert.equal(JSON.stringify(dto).includes('SECRET'), false);
  assert.equal(dto.credentialVersion, undefined);
});

test('Tournament DTOs satisfy the actual spectator, scorekeeper, and referee page contracts', async () => {
  const spectatorPage = await readFile(new URL('../src/app/tournaments/public/[teamId]/[eventId]/page.tsx', import.meta.url), 'utf8');
  const scorekeeperPage = await readFile(new URL('../src/app/tournaments/scorekeeper/[teamId]/[eventId]/page.tsx', import.meta.url), 'utf8');
  const refereePage = await readFile(new URL('../src/app/tournaments/referee/[teamId]/[eventId]/page.tsx', import.meta.url), 'utf8');
  assert.match(spectatorPage, /!event\.isTournament/);
  assert.match(scorekeeperPage, /!event\.isTournament/);
  assert.match(scorekeeperPage, /purpose=scorekeeper/);
  assert.doesNotMatch(refereePage, /tournamentGames\.filter\(g => g\.refereeId === activeRef\.id\)/);
});

test('Tournament public portal defaults omitted and unknown purposes to spectator data', async () => {
  const state = communicationDb({
    'teams/team-a': { ownerUserId: 'owner', planId: 'elite', isPro: true },
    'teams/team-a/events/cup-a': sensitive,
    'teams/team-a/events/cup-a/private/scoring': { scorekeeperCodeHash: 'private-hash', credentialVersion: 3 },
  });
  const app = await loadCommunicationRoute('../../src/app/api/public/portals/route.ts', state.db, null);
  try {
    for (const suffix of ['', '&purpose=unknown']) {
      const request = new Request(`http://127.0.0.1/api/public/portals?kind=tournament&teamId=team-a&eventId=cup-a${suffix}`);
      request.nextUrl = new URL(request.url);
      const response = await app.route.GET(request);
      const body = await response.json();
      assert.equal(response.status, 200);
      assert.equal(body.data.isTournament, true);
      assert.equal(body.data.lifecycleVersion, undefined);
      assert.equal(body.data.scheduleVersion, undefined);
      assert.equal(body.data.credentialVersion, undefined);
      assert.equal(body.data.tournamentGames[0].gameVersion, undefined);
    }
    const scorerRequest = new Request('http://127.0.0.1/api/public/portals?kind=tournament&teamId=team-a&eventId=cup-a&purpose=scorekeeper');
    scorerRequest.nextUrl = new URL(scorerRequest.url);
    const scorer = await app.route.GET(scorerRequest);
    const scorerBody = await scorer.json();
    assert.equal(scorer.status, 200);
    assert.deepEqual([scorerBody.data.lifecycleVersion, scorerBody.data.scheduleVersion, scorerBody.data.credentialVersion], [4, 6, 3]);
  } finally { app.dispose(); }
});
