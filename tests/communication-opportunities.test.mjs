import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('public volunteer links use the validated server route and collect contact relationship', () => {
  const page = read('../src/app/public/volunteer/[teamId]/[oppId]/page.tsx');
  const route = read('../src/app/api/public/volunteer/route.ts');

  assert.match(page, /\/api\/public\/volunteer/);
  assert.doesNotMatch(page, /opportunityId=/);
  assert.equal((page.match(/fetch\(`\/api\/public\/volunteer\?/g) || []).length, 1);
  assert.doesNotMatch(page, /useDoc|publicSignUpForVolunteer/);
  for (const field of ['name', 'email', 'phone', 'relationship']) {
    assert.match(route, new RegExp(`\\b${field}\\b`));
  }
  assert.match(route, /runTransaction/);
  assert.match(route, /Idempotency|idempotency-key/i);
});

test('score broadcasts and tactical chat creation use authenticated server routes', () => {
  const gamesPage = read('../src/app/(dashboard)/games/page.tsx');
  const gamesRoute = read('../src/app/api/teams/games/route.ts');
  const chatProvider = read('../src/components/providers/team-provider.tsx');
  const chatRoute = read('../src/app/api/teams/chat/route.ts');

  assert.match(gamesPage, /fetch\('\/api\/teams\/games'/);
  assert.match(gamesRoute, /verifyFirebaseToken/);
  assert.match(gamesRoute, /getTeamAuthority/);
  assert.match(chatProvider, /fetch\('\/api\/teams\/chat'/);
  assert.match(chatRoute, /parentChatEnabled/);
  assert.match(chatRoute, /One or more recipients are outside your approved chat scope/);
});

test('coach parent-access toggles are prominent in the tactical chat hub', () => {
  const chatPage = read('../src/app/(dashboard)/chats/page.tsx');

  assert.match(chatPage, /Coach & Organizer Controls/);
  assert.match(chatPage, /Parent Communication Access/);
  assert.match(chatPage, /Parent-to-Parent Chat/);
  assert.match(chatPage, /Parent Live Feed/);
  assert.match(chatPage, /Parent Feed Comments/);
  assert.match(chatPage, /Currently On/);
  assert.match(chatPage, /Currently Off/);
});

test('institution switcher headers show a squad only outside the club or school hub', () => {
  const shell = read('../src/components/layout/Shell.tsx');

  assert.match(shell, /const isInstitutionHubRoute = pathname === '\/club'/);
  assert.match(shell, /isInstitutionHubRoute \|\| !activeTeam \|\| activeTeam\?\.type === 'school'/);
  assert.match(shell, /isEliteClubMode && \(isInstitutionHubRoute \|\| !activeTeam\)/);
  assert.match(shell, /!isSchoolInstitutionMode && activeTeam/);
  assert.match(shell, /!isEliteHubMode && activeTeam/);
  assert.match(shell, /↳ \{activeTeam\.name\}/);
});

test('institution hub stats resolve authoritative squads and stay team-scoped', () => {
  const hub = read('../src/app/(dashboard)/club/page.tsx');

  assert.match(hub, /getDoc\(doc\(db, 'teams', membership\.id\)\)/);
  assert.match(hub, /const clubTeams = useMemo\(\(\) => organizationSquadCandidates\.filter/);
  assert.match(hub, /isBillableSquadSeat\(t\)/);
  assert.doesNotMatch(hub, /t\.ownerUserId === organizationOwnerId/);
  assert.match(hub, /const allocatedSquadCount = clubTeams\.length/);
  assert.match(hub, /Math\.max\(0, organizationSeatLimit - allocatedSquadCount\)/);
  assert.match(hub, /new Set\(teams\.filter\(team => team\.isPro === true\)\.map\(team => team\.id\)\)/);
  assert.match(hub, /if \(!allocatedMembershipIds\.has\(team\.id\)\) return false/);
  assert.match(hub, /for \(const team of organizationSquadCandidates\)/);
  assert.match(hub, /Promise\.allSettled/);
  assert.match(hub, /organizationTeamIds\.map\(teamId => getDocs\(collection\(db, 'teams', teamId, 'incidents'\)\)\)/);
  assert.match(hub, /Safety Oversights[\s\S]*clubIncidents\.length/);
  assert.doesNotMatch(hub, /collectionGroup\(db, 'incidents'\)/);
  assert.match(hub, /isHubDataLoading \? <Loader2/);
});

test('retired Reward Points cannot be awarded while historical fields remain compatible', () => {
  const page = read('../src/app/(dashboard)/volunteers/page.tsx');
  const route = read('../src/app/api/teams/volunteers/verify/route.ts');

  assert.match(route, /Reward Points have been retired/);
  assert.match(route, /status: 410/);
  assert.doesNotMatch(route, /FieldValue\.increment|runTransaction/);
  assert.doesNotMatch(page, /contributionTotals|Earned Contribution Points|Verify & Award|Mission Reward \(Pts\)/);
});

test('coaches corner navigation and roster profile shortcut remain stable', () => {
  const coachesCorner = read('../src/app/(dashboard)/coaches-corner/page.tsx');
  const roster = read('../src/app/(dashboard)/roster/page.tsx');

  assert.match(coachesCorner, /xl:grid-cols-5/);
  assert.match(coachesCorner, /searchParams\.get\('athlete'\)/);
  assert.match(roster, /Edit in Coaches Corner/);
  assert.match(roster, /\/coaches-corner\?athlete=/);
});

test('scouting pack content is constrained to printable page width', () => {
  const roster = read('../src/app/(dashboard)/roster/page.tsx');
  const pdf = read('../src/lib/pdf-utils.ts');

  assert.match(pdf, /fitText\(fullTitle, pageWidth - 102/);
  assert.match(roster, /truncateToWidth/);
  assert.match(roster, /splitTextToSize\(evaluationHeading/);
  assert.doesNotMatch(roster, /drawField\('Recruit Status'.*, 185, y\)/);
});
