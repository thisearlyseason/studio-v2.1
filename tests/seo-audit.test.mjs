import assert from 'node:assert/strict';
import test from 'node:test';
import { ARTICLES_DB, ARTICLES_LIST } from '../src/lib/sports-hub-articles.ts';
import { ARTICLE_REDIRECTS, ARTICLE_MERGES } from '../src/lib/sports-hub-article-redirects.ts';
import { ARTICLE_SEARCH_TITLES, ARTICLE_SEARCH_DESCRIPTIONS } from '../src/lib/sports-hub-search-titles.ts';
import { findHubAuthor, hubAuthorSchema } from '../src/lib/sports-hub-authors.ts';
import { STATIC_SPORTS_HUB_ARTICLE_COUNT } from '../src/lib/sports-hub-catalog-metadata.ts';
import { pageTitle, pageDescription } from '../src/lib/seo-metadata.ts';
import { indexNowPayload } from '../src/lib/indexnow.ts';

test('retired URLs redirect directly to a published guide with no loops or chains', () => {
  for (const [slug, destination] of Object.entries(ARTICLE_REDIRECTS)) {
    assert.notEqual(slug, destination);
    assert.ok(!ARTICLES_DB[slug]);
    assert.ok(ARTICLES_DB[destination], `${slug} -> ${destination}`);
    assert.ok(!ARTICLE_REDIRECTS[destination]);
    if ((ARTICLE_MERGES[destination] || []).includes(slug)) {
      assert.ok(ARTICLES_DB[destination].content.includes(`{#${slug}}`), `Missing retained section for ${slug}`);
    }
  }
});

test('published guides have unique bounded search metadata, substantive bodies and known contributors', () => {
  const titles = new Set();
  assert.equal(STATIC_SPORTS_HUB_ARTICLE_COUNT, ARTICLES_LIST.length);
  for (const a of ARTICLES_LIST) {
    const original = a.seoTitle || `${a.title} | Sports Hub`;
    const title = pageTitle(original.length >= 30 && original.length <= 60 ? original : ARTICLE_SEARCH_TITLES[a.slug] || original).absolute;
    const description = pageDescription(ARTICLE_SEARCH_DESCRIPTIONS[a.slug] || a.seoDescription || a.excerpt);
    assert.ok(title.length >= 30 && title.length <= 60, `${a.slug}: ${title}`);
    assert.ok(description.length >= 110 && description.length <= 160, `${a.slug}: ${description}`);
    assert.ok(!titles.has(title), `Duplicate title: ${title}`);
    titles.add(title);
    assert.ok(a.content.split(/\s+/).length >= 800, `${a.slug} needs substantive editing`);
    assert.match(a.content, /^([\s\S]*?)\bis\b/);
    assert.ok(findHubAuthor(a.author.name), a.author.name);
    assert.match(hubAuthorSchema(a.author.name).url, /^https:\/\/www\.thesquad\.pro\/author\//);
    assert.ok(a.updatedAt && a.updatedAt >= a.publishedAt.slice(0, 10));
  }
});

test('metadata leaves a long CMS title intact for editorial correction instead of silently slicing it', () => {
  const long = 'A deliberately long article headline that needs an editor to supply a shorter search title';
  const oldWarn = console.warn;
  const warnings = [];
  console.warn = message => warnings.push(message);
  try { assert.equal(pageTitle(long).absolute, long); } finally { console.warn = oldWarn; }
  assert.equal(warnings.length, 1);
  assert.equal(pageTitle('Sports Team Management').absolute, 'Sports Team Management | The Squad');
});

test('IndexNow accepts only this public HTTPS host and deduplicates URLs', () => {
  const url = 'https://www.thesquad.pro/sports-hub/articles/tournament-scheduling-guide';
  assert.deepEqual(indexNowPayload([url, url]).urlList, [url]);
  for (const invalid of ['http://www.thesquad.pro/', 'https://evil.example/', 'https://user:password@www.thesquad.pro/']) {
    assert.throws(() => indexNowPayload([invalid]));
  }
  assert.throws(() => indexNowPayload([]));
});

test('every sport landing asset has measured dimensions and product examples use existing captures', async () => {
  const { PUBLIC_IMAGE_DIMENSIONS } = await import('../src/lib/public-image-dimensions.ts');
  const { SPORT_LANDINGS } = await import('../src/lib/sport-landing.ts');
  const { ARTICLE_PRODUCT_EXAMPLES } = await import('../src/lib/sports-hub-product-examples.ts');
  const fs = await import('node:fs/promises');
  for (const landing of Object.values(SPORT_LANDINGS)) {
    assert.ok(PUBLIC_IMAGE_DIMENSIONS[landing.heroImage]?.width > 0, landing.heroImage);
    assert.ok(PUBLIC_IMAGE_DIMENSIONS[landing.heroImage]?.height > 0, landing.heroImage);
  }
  for (const [slug, example] of Object.entries(ARTICLE_PRODUCT_EXAMPLES)) {
    assert.ok(ARTICLES_DB[slug]);
    await fs.access(new URL(`../public/how-to/screenshots/${example.image}.webp`, import.meta.url));
    assert.match(example.caption, /^Demo workspace:/);
  }
});
