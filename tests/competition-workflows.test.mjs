import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calculateTournamentStandings } from '../src/lib/tournament-standings.ts';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('division setting copies stay draft and refuse to overwrite deployed schedules', () => {
  const route = read('src/app/api/leagues/clone/route.ts');
  assert.match(route, /deploymentStatus === 'deployed'/);
  assert.match(route, /already has a deployed schedule/);
  assert.match(route, /is_active: false/);
  assert.doesNotMatch(route, /batch\.update\(target\.ref,[\s\S]{0,300}schedule: \[\]/);
});

test('tournament setup, bracket, schedule, and deployment use explicit persisted states', () => {
  const page = read('src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx');
  const deployment = read('src/lib/server-tournament-schedule-deployment.ts');
  assert.match(page, /setupStatus: 'complete'/);
  assert.match(page, /deploymentStatus: 'undeployed'/);
  assert.match(page, /deploymentStatus: 'failed'/);
  assert.match(deployment, /bracketStatus: 'ready'/);
  assert.match(deployment, /scheduleStatus: 'ready'/);
  assert.match(deployment, /deploymentStatus: 'deployed'/);
});

test('tournament waivers use Library documents and one agreement contract for every roster team', () => {
  const page = read('src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx');
  const action = read('src/app/api/public/portals/action/route.ts');
  assert.match(page, /waiverDocuments:/);
  assert.match(page, /agreement\?\.agreed === true \|\| agreement\?\.status === 'signed'/);
  assert.match(action, /new FieldPath\('teamAgreements', teamName\)/);
  assert.match(action, /collection\('archived_waivers'\)/);
});

test('event safety is staff-only and provides audit, division, and date controls', () => {
  const panel = read('src/components/safety/event-safety-panel.tsx');
  const provider = read('src/components/providers/team-provider.tsx');
  const rules = read('firestore.rules');
  assert.match(panel, /divisionFilter/);
  assert.match(panel, /dateFilter/);
  assert.match(panel, /supportingDocumentUrl/);
  assert.match(provider, /auditHistory: arrayUnion/);
  assert.match(rules, /match \/incidents\/\{incidentId\}[\s\S]{0,300}isTeamStaff\(teamId\)/);
});

test('shared modal scrolling exposes a disappearing more-settings affordance', () => {
  const scrollArea = read('src/components/ui/scroll-area.tsx');
  assert.match(scrollArea, /hasMoreBelow/);
  assert.match(scrollArea, /scrollHeight - viewport\.scrollTop - viewport\.clientHeight/);
  assert.match(scrollArea, /ChevronDown/);
  assert.match(scrollArea, /touch-pan-y/);
});

test('public tournament pages use the canonical 3-1-0 standings contract', () => {
  const publicPage = read('src/app/tournaments/public/[teamId]/[eventId]/page.tsx');
  const spectatorPage = read('src/app/tournaments/spectator/[teamId]/[eventId]/page.tsx');

  for (const page of [publicPage, spectatorPage]) {
    assert.match(page, /import \{ calculateTournamentStandings \} from '@\/lib\/tournament-standings';/);
    assert.doesNotMatch(page, /function calculate(?:Tournament)?Standings\(/);
  }

  const standings = calculateTournamentStandings(
    [
      { id: 'alpha', name: 'Alpha' },
      { id: 'beta', name: 'Beta' },
      { id: 'gamma', name: 'Gamma' },
    ],
    [
      { id: 'game-1', team1Id: 'alpha', team1: 'Alpha', team2Id: 'beta', team2: 'Beta', score1: 2, score2: 0, isCompleted: true },
      { id: 'game-2', team1Id: 'alpha', team1: 'Alpha', team2Id: 'gamma', team2: 'Gamma', score1: 1, score2: 1, isCompleted: true },
    ]
  );

  assert.deepEqual(
    standings.map(team => ({ name: team.name, points: team.points })),
    [
      { name: 'Alpha', points: 4 },
      { name: 'Gamma', points: 1 },
      { name: 'Beta', points: 0 },
    ]
  );
});

test('tournament replication preserves blueprint fields while resetting operational state', () => {
  const page = read('src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx');

  assert.match(page, /\.\.\.blueprint,[\s\S]{0,700}tournamentTeams: \[\],[\s\S]{0,200}tournamentGames: \[\],[\s\S]{0,100}schedule: \[\]/);
  assert.match(page, /selectedFields: editEvent\.selectedFields/);
  assert.match(page, /dailyWindows: editEvent\.dailyWindows/);
});

test('tournament archival is reachable from the edit workflow', () => {
  const page = read('src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx');

  assert.match(page, /onArchive=\{handleArchive\}/);
  assert.match(page, /onClick=\{onArchive\}[\s\S]{0,300}Archive Series/);
});

test('public tournament waivers submit and persist the signer-entered date', () => {
  const page = read('src/app/tournaments/[teamId]/waiver/[eventId]/page.tsx');
  const action = read('src/app/api/public/portals/action/route.ts');

  assert.match(page, /signedDate: signDate/);
  assert.match(page, /setSubmitError/);
  assert.match(action, /const signedDate = String\(body\.signedDate/);
  assert.match(action, /signedAt, signedDate/);
  assert.match(page, /registrationCode/);
  assert.match(action, /tournamentRegistrationCodes/);
  assert.match(action, /codeMapping\.data\(\)\?\.teamId !== teamId/);
  assert.match(action, /getTeamAuthority\(sourceTeamId, auth\.uid, auth\.role\)/);
  assert.match(action, /!teamAuthority\?\.isStaff/);
  assert.match(page, /Authorization: `Bearer \$\{token\}`/);
});

test('league registration deletion removes derived projections through an authenticated server action', () => {
  const action = read('src/app/api/public/portals/action/route.ts');
  const page = read('src/app/(dashboard)/leagues/registration/[leagueId]/page.tsx');
  assert.match(action, /action === 'delete-registration'/);
  assert.match(action, /FieldValue\.arrayRemove\(recruitId\)/);
  assert.match(action, /FieldValue\.delete\(\)/);
  assert.match(page, /action: 'delete-registration'/);
  assert.doesNotMatch(page, /deleteDocumentNonBlocking/);
});

test('tournament registration returns to the hub that launched it', () => {
  const manager = read('src/app/(dashboard)/manage-tournaments/manage-tournaments-page-content.tsx');
  const registration = read('src/app/(dashboard)/manage-tournaments/registration/[teamId]/[eventId]/page.tsx');

  assert.match(manager, /embedded \? '\?from=competition' : ''/);
  assert.match(registration, /searchParams\.get\('from'\) === 'competition'/);
  assert.match(registration, /router\.push\(returnPath\)/);
});
