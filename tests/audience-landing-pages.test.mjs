import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('six audience campaign pages are statically generated with unique metadata', () => {
  const data = read('src/lib/audience-landing.ts');
  const route = read('src/app/for/[audience]/page.tsx');

  for (const audience of ['parents', 'coaches', 'leagues', 'tournaments', 'schools', 'municipalities']) {
    assert.match(data, new RegExp(`${audience}: \\{`));
    assert.match(data, new RegExp(`slug: '${audience}'`));
  }
  assert.match(route, /generateStaticParams/);
  assert.match(route, /generateMetadata/);
  assert.match(route, /alternates: \{ canonical: url \}/);
  assert.match(route, /AudienceLandingPage/);
});

test('audience pages use audience-specific features and preserve the original homepage', () => {
  const data = read('src/lib/audience-landing.ts');
  const component = read('src/components/marketing/audience-landing-page.tsx');
  const homepage = read('src/app/page.tsx');

  assert.match(data, /Family-ready schedules/);
  assert.match(data, /Roster command/);
  assert.match(data, /Invite-only discovery/);
  assert.match(data, /Brackets and formats/);
  assert.match(data, /School Hub/);
  assert.match(data, /Multi-program oversight/);
  assert.match(component, /landing\.features\.map/);
  assert.match(component, /Canadian-built sports operations platform/);
  assert.match(component, /images\/campaigns\/\$\{landing\.slug\}-hero\.webp/);
  for (const audience of ['parents', 'coaches', 'leagues', 'tournaments', 'schools', 'municipalities']) {
    assert.equal(fs.existsSync(new URL(`../public/images/campaigns/${audience}-hero.webp`, import.meta.url)), true);
  }
  assert.match(homepage, /export default function LandingPage/);
});

test('parent referral is a fixed-content, rate-limited, idempotent server email', () => {
  const route = read('src/app/api/referrals/coach/route.ts');
  const page = read('src/app/refer-a-coach/page.tsx');
  const links = read('src/components/embed/embed-panel.tsx');

  assert.match(route, /Thought this might be helpful for our team/);
  assert.match(route, /I found a team app called The Squad/);
  assert.match(route, /No pressure at all/);
  assert.match(route, /images\/email\/the-squad-grass-logo\.png/);
  assert.match(route, /alt="The Squad"/);
  assert.match(page, /Thought this might be helpful for our team/);
  assert.match(page, /No pressure at all/);
  assert.match(route, /enforcePublicRateLimit/);
  assert.match(route, /coach-referral-sender/);
  assert.match(route, /coach-referral-recipient/);
  assert.match(route, /runTransaction/);
  assert.match(route, /escapeHtml/);
  assert.match(route, /parent_coach_referrals/);
  assert.match(page, /fetch\('\/api\/referrals\/coach'/);
  assert.match(page, /Preview the exact email/);
  assert.match(links, /Refer Your Coach/);
  assert.match(links, /\/refer-a-coach/);
});

test('campaign and referral URLs are included in the production sitemap', () => {
  const sitemap = read('src/app/sitemap.ts');
  assert.match(sitemap, /AUDIENCE_SLUGS/);
  assert.match(sitemap, /\/for\/\$\{audience\}/);
  assert.match(sitemap, /\/refer-a-coach/);
});

test('super admin links hub exposes every audience campaign URL', () => {
  const linksHub = read('src/components/admin/embed-hub-manager.tsx');
  const adminPage = read('src/app/admin/page.tsx');

  for (const audience of ['parents', 'coaches', 'leagues', 'tournaments', 'schools', 'municipalities']) {
    assert.match(linksHub, new RegExp(`directPath: '/for/${audience}'`));
  }
  assert.match(linksHub, /Audience Landing Pages/);
  assert.match(linksHub, /Direct URL/);
  assert.match(adminPage, /Links &amp; Embeds/);
});
