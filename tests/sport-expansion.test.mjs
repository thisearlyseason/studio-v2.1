import test from 'node:test';
import assert from 'node:assert/strict';
import { SPORT_LANDINGS, SPORT_SLUGS } from '../src/lib/sport-landing.ts';
import { getSportsHubTemplate } from '../src/lib/sports-hub-template-catalog.ts';

const additions = ['volleyball', 'ice-hockey', 'softball', 'lacrosse', 'cricket', 'badminton', 'table-tennis', 'handball'];

test('eight additional sports have distinct content and a discoverable scoresheet', () => {
  assert.equal(SPORT_SLUGS.length, 26);
  const descriptions = new Set();
  for (const slug of additions) {
    const sport = SPORT_LANDINGS[slug];
    assert.ok(sport, `${slug} landing exists`);
    assert.equal(sport.scoresheetSlug, `${slug}-scoresheet`);
    assert.ok(getSportsHubTemplate(sport.scoresheetSlug), `${slug} scoresheet is routable`);
    descriptions.add(sport.scheduling);
    assert.ok(sport.operationalDetails.length >= 6);
  }
  assert.equal(descriptions.size, additions.length);
});

test('all sport cards and heroes draw from the same photography collection', () => {
  for (const slug of SPORT_SLUGS) {
    assert.equal(SPORT_LANDINGS[slug].heroImage, `/images/sports/photography/${slug}.webp`);
    assert.ok(SPORT_LANDINGS[slug].heroAlt.length > 20);
  }
});

test('every sport landing links to its own complete, discoverable scoresheet', async () => {
  const { SPORT_SCORESHEETS, getSportScoresheet } = await import('../src/lib/sport-scoresheets.ts');
  assert.equal(SPORT_SCORESHEETS.length, SPORT_SLUGS.length);
  assert.equal(new Set(SPORT_SCORESHEETS.map(sheet => sheet.slug)).size, SPORT_SLUGS.length);
  for (const slug of SPORT_SLUGS) {
    const landing = SPORT_LANDINGS[slug];
    assert.equal(landing.scoresheetSlug, `${slug}-scoresheet`, `${slug} has its scoresheet link`);
    const sheet = getSportScoresheet(landing.scoresheetSlug);
    assert.ok(sheet, `${slug} scoresheet exists`);
    assert.equal(sheet.sportSlug, slug);
    assert.ok(getSportsHubTemplate(sheet.slug), `${slug} is in the template library`);
    assert.equal(sheet.pages.length, 2);
    assert.ok(sheet.pages.every(page => page.tables.length > 0));
  }
});
