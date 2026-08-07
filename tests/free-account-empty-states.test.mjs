import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('team-scoped free-account hubs stop loading and offer squad onboarding', async () => {
  const [emptyState, drills, files, games, roster] = await Promise.all([
    source('../src/components/layout/NoActiveTeamState.tsx'),
    source('../src/app/(dashboard)/drills/page.tsx'),
    source('../src/app/(dashboard)/files/page.tsx'),
    source('../src/app/(dashboard)/games/page.tsx'),
    source('../src/app/(dashboard)/roster/page.tsx'),
  ]);

  assert.match(emptyState, /Create Free Squad/);
  assert.match(emptyState, /Join With Code/);
  for (const page of [drills, files, games, roster]) {
    assert.match(page, /isTeamsLoading/);
    assert.match(page, /if \(!activeTeam\) return <NoActiveTeamState/);
  }
  assert.match(games, /Basic scorekeeping is included with your free account/);
});

test('free league creators receive a first-league CTA instead of a permanent spinner', async () => {
  const leagues = await source('../src/app/(dashboard)/leagues/leagues-page-content.tsx');

  assert.match(leagues, /userProfile\?\.role === 'league_creator'/);
  assert.match(leagues, /loadingGraceExpired/);
  assert.match(leagues, /window\.setTimeout\(\(\) => setLoadingGraceExpired\(true\), 8000\)/);
  assert.match(leagues, /isLeaguesLoading && !loadingGraceExpired/);
  assert.match(leagues, /No Competitive Enrollment/);
  assert.match(leagues, /Initialize Free \{leagueLabel\}/);
});

test('empty dashboard schedule directs the user to the next useful action', async () => {
  const dashboard = await source('../src/app/(dashboard)/dashboard/page.tsx');

  assert.match(dashboard, /Schedule First Event/);
  assert.match(dashboard, /Open Master Schedule/);
  assert.match(dashboard, /Create Your Squad/);
  assert.match(dashboard, /Join a Squad/);
});
