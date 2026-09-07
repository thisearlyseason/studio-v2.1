import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fileURLToPath } from 'node:url';
import { calculateTournamentStandings } from '../src/lib/tournament-standings.ts';
import * as leagueScoringClient from '../src/lib/public-league-scoring.ts';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('rendered League spectator distinguishes disputed context from official completed wins', async () => {
  const key = `spectator_${Date.now()}`;
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const game = { id: 'game-a', date, team1: 'Alpha', team2: 'Beta', score1: 4, score2: 2, isCompleted: true, isDisputed: true };
  globalThis[key] = { React, league: { id: 'league-a', name: 'League', teams: {}, schedule: [game] } };
  const components = ['Card', 'CardContent', 'Button', 'Badge', 'AnimatedScore', 'Input', 'Select', 'SelectContent', 'SelectItem', 'SelectTrigger', 'SelectValue', 'Popover', 'PopoverContent', 'PopoverTrigger', 'Calendar', 'SquadIdentity'];
  const icons = ['Trophy', 'CalendarDays', 'MapPin', 'Clock', 'Loader2', 'AlertCircle', 'List', 'ChevronRight'];
  const stubs = {
    react: `const React=globalThis[${JSON.stringify(key)}].React; export default React; export const {useMemo,useState,useEffect}=React;`,
    'next/navigation': `export const useParams=()=>({leagueId:'league-a'});`,
    'next/link': `import React from 'react'; export default p=>React.createElement('a',{href:p.href},p.children);`,
    '@/hooks/use-public-portal': `export const usePublicPortal=()=>({data:globalThis[${JSON.stringify(key)}].league,isLoading:false,retry:()=>{}});`,
    'lucide-react': `import React from 'react'; ${icons.map(name => `export const ${name}=p=>React.createElement('i',{'data-icon':'${name}',className:p.className});`).join('\n')}`,
  };
  try {
    const result = await build({ entryPoints: [fileURLToPath(new URL('../src/app/leagues/spectator/[leagueId]/page.tsx', import.meta.url))], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent', jsx: 'transform',
      plugins: [{ name: 'spectator-render-boundaries', setup(bundler) {
        bundler.onResolve({ filter: /.*/ }, args => Object.hasOwn(stubs, args.path) || args.path.startsWith('@/components/') ? { path: args.path, namespace: 'boundary' } : null);
        bundler.onLoad({ filter: /.*/, namespace: 'boundary' }, args => ({ loader: 'js', contents: stubs[args.path] || `import React from 'react'; const UI=p=>React.createElement('div',{className:p.className},p.children ?? p.value); export default UI; ${components.map(name => `export const ${name}=UI;`).join('\n')}` }));
      } }],
    });
    const page = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
    const disputed = renderToStaticMarkup(React.createElement(page.default));
    assert.match(disputed, /Disputed/);
    assert.doesNotMatch(disputed, /Archive Log|text-primary scale-110/);
    assert.equal((disputed.match(/data-icon="Trophy"/g) || []).length, 2); // Header and leaderboard only.
    assert.match(disputed, />4<.*>2</);
    game.isDisputed = false;
    const official = renderToStaticMarkup(React.createElement(page.default));
    assert.match(official, /Archive Log/);
    assert.match(official, /text-primary scale-110/);
    assert.equal((official.match(/data-icon="Trophy"/g) || []).length, 3);
    assert.doesNotMatch(official, /Disputed/);
    Object.assign(game, { isDisputed: true, score1: 2, score2: 4 });
    const disputedAwayLead = renderToStaticMarkup(React.createElement(page.default));
    assert.match(disputedAwayLead, /Disputed/);
    assert.doesNotMatch(disputedAwayLead, /Archive Log|text-primary scale-110/);
    assert.equal((disputedAwayLead.match(/data-icon="Trophy"/g) || []).length, 2);
  } finally { delete globalThis[key]; }
});

test('League resolution controls require a disputed match and current organizer identity', () => {
  const base = { actorUid: 'owner', creatorId: 'owner', isDisputed: true };
  assert.equal(leagueScoringClient.canResolveLeagueGame(base), true);
  assert.equal(leagueScoringClient.canResolveLeagueGame({ ...base, actorUid: 'staff' }), false);
  assert.equal(leagueScoringClient.canResolveLeagueGame({ ...base, isDisputed: false }), false);
  assert.equal(leagueScoringClient.canResolveLeagueGame({ ...base, actorUid: 'tenant-owner', tenantId: 'host', ownedTeamId: 'host' }), true);
});

test('League resolution commands require a reason and preserve the displayed version and outcome', () => {
  const base = { leagueId: 'league-a', gameId: 'game-a', expectedGameVersion: 7, reason: 'Official record checked', outcome: 'uphold', score1: 50, score2: 20 };
  assert.throws(() => leagueScoringClient.leagueResolutionCommand({ ...base, reason: ' ' }), /reason/i);
  assert.deepEqual(leagueScoringClient.leagueResolutionCommand(base), { action: 'resolve-dispute', leagueId: 'league-a', gameId: 'game-a', reason: 'Official record checked', expectedGameVersion: 7, outcome: 'uphold' });
  assert.deepEqual(leagueScoringClient.leagueResolutionCommand({ ...base, outcome: 'correct', score1: 0, score2: 2 }), { action: 'resolve-dispute', leagueId: 'league-a', gameId: 'game-a', reason: 'Official record checked', expectedGameVersion: 7, outcome: 'correct', score1: 0, score2: 2 });
});

test('League client retries preserve body and identity after an uncertain response without replacing game version', async () => {
  const pending = new Map(), bodies = [];
  const command = { action: 'resolve-dispute', leagueId: 'league-a', gameId: 'game-a', outcome: 'uphold', reason: 'Confirmed', expectedGameVersion: 7 };
  const send = async body => { bodies.push(structuredClone(body)); if (bodies.length === 1) throw Error('Connection lost after commit'); return Response.json({ success: true }); };
  await assert.rejects(leagueScoringClient.sendLeagueScoringCommand(pending, command, send), /Connection lost/);
  await leagueScoringClient.sendLeagueScoringCommand(pending, command, send);
  assert.deepEqual(bodies[0], bodies[1]);
  assert.equal(bodies[1].expectedGameVersion, 7);
  assert.match(bodies[0].requestId, /^league-score-/);
  assert.equal(pending.size, 0);
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
  assert.match(provider, /fetch\('\/api\/teams\/incidents\?teamId='/);
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
