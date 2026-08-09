import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = path => readFile(new URL(path, import.meta.url), 'utf8');

test('legacy public tournament reads enforce plan entitlement and active state', async () => {
  const [legacy, canonical] = await Promise.all([
    source('../src/app/api/public/tournaments/[teamId]/[eventId]/route.ts'),
    source('../src/app/api/public/portals/route.ts'),
  ]);

  assert.match(legacy, /permitsLegacyOrPaidPortals\(teamData\.planId, teamData\.plan_type, teamData\.subscriptionPlanId\)/);
  assert.match(legacy, /if \(!tournament\.isActive\)/);
  assert.match(canonical, /if \(!publicEvent\.isActive\)/);
  assert.match(canonical, /if \(!team\.exists\)/);
});

test('retired donation write route cannot create incomplete ledger records', async () => {
  const donations = await source('../src/app/api/public/donations/route.ts');
  assert.match(donations, /This endpoint has been retired/);
  assert.match(donations, /status: 410/);
  assert.doesNotMatch(donations, /collection\('donations'\).*\.set\(/s);
});

test('public route middleware validates operational state and emits noindex headers', async () => {
  const middleware = await source('../src/middleware.ts');
  assert.match(middleware, /publicProjectionExists\(request: NextRequest\)/);
  assert.match(middleware, /eventData\.registrationOpen === false/);
  assert.match(middleware, /data\.isShareable !== true \|\| data\.status === 'closed'/);
  assert.match(middleware, /config\.exists && config\.data\(\)\?\.is_active === true/);
  assert.match(middleware, /X-Robots-Tag', 'noindex, nofollow'/);
});

test('Sports Hub index pages own their canonical metadata', async () => {
  const paths = ['coaching', 'featured', 'parents', 'playbook', 'resources', 'team-management', 'templates', 'tournaments'];
  for (const path of paths) {
    const layout = await source(`../src/app/sports-hub/${path}/layout.tsx`);
    assert.match(layout, new RegExp(`/sports-hub/${path}`));
    assert.match(layout, /sportsHubPageMetadata/);
  }

  const [search, preferences] = await Promise.all([
    source('../src/app/sports-hub/search/layout.tsx'),
    source('../src/app/sports-hub/preferences/layout.tsx'),
  ]);
  assert.match(search, /index: false, follow: true/);
  assert.match(preferences, /index: false, follow: false/);
});

test('every advertised Sports Hub template has usable content', async () => {
  const templates = await source('../src/app/sports-hub/templates/[slug]/page.tsx');
  for (const tabSet of ['INCIDENT_REPORT_TABS', 'TOURNAMENT_RUNSHEET_TABS', 'ATHLETE_TRACKER_TABS']) {
    assert.match(templates, new RegExp(`tabs: ${tabSet}`));
  }
  assert.doesNotMatch(templates, /Coming Soon/);
});

test('public registration controls and authentication pages expose accessible names', async () => {
  const [tournament, squad, event, youth, login, signup, pricing, pdf] = await Promise.all([
    source('../src/app/register/tournament/[teamId]/[eventId]/page.tsx'),
    source('../src/app/register/squad/[teamId]/page.tsx'),
    source('../src/app/events/register/[teamId]/page.tsx'),
    source('../src/app/signup/youth/page.tsx'),
    source('../src/app/login/page.tsx'),
    source('../src/app/signup/page.tsx'),
    source('../src/app/(dashboard)/pricing/page.tsx'),
    source('../src/components/sports-hub/ResourcePDFSection.tsx'),
  ]);

  assert.match(tournament, /htmlFor=\"tournament-date-of-birth\"/);
  assert.match(tournament, /aria-labelledby=\{labelId\}/);
  assert.match(squad, /htmlFor=\"squad-join-date-of-birth\"/);
  assert.match(squad, /role=\"radiogroup\" aria-labelledby=\"squad-player-label\"/);
  assert.match(event, /htmlFor=\{`event-field-\$\{field\.id\}`\}/);
  assert.match(youth, /aria-label=\{showPassword \? 'Hide password' : 'Show password'\}/);
  assert.match(login, /<h1 className=/);
  assert.match(signup, /<h1 className=\"sr-only\">/);
  assert.match(pricing, /role=\"switch\"/);
  assert.match(pricing, /aria-checked=\{billingCycle === 'annual'\}/);
  assert.match(pdf, /aria-hidden=\"true\"/);
});
