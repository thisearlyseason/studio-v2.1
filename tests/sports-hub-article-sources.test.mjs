import assert from 'node:assert/strict';
import test from 'node:test';
import { ARTICLES_DB, ARTICLES_LIST } from '../src/lib/sports-hub-articles.ts';
import { ARTICLE_SOURCE_GROUPS, ARTICLE_PRIMARY_SOURCES } from '../src/lib/sports-hub-article-sources.ts';
import { renderSafeRichTextInline } from '../src/lib/rich-text.ts';

const externalLinks = content => [...content.matchAll(/\[[^\]]+\]\((https:\/\/[^\s)]+)\)/g)].map(match => match[1]);
const domain = url => new URL(url).hostname.replace(/^www\./, '');

test('every published catalog article cites at least two external source domains in its body', () => {
  for (const article of ARTICLES_LIST) {
    const domains = new Set(externalLinks(article.content).map(domain));
    assert.ok(domains.size >= 2, `${article.slug} needs two independent primary sources`);
    assert.ok(![...domains].some(host => host.endsWith('thesquad.pro')));
  }
});

test('reviewed article source assignments are unique and refer to existing articles', () => {
  const seen = new Set();
  for (const slugs of Object.values(ARTICLE_SOURCE_GROUPS)) {
    for (const slug of slugs) {
      assert.ok(ARTICLES_DB[slug], `Unknown article: ${slug}`);
      assert.ok(!seen.has(slug), `Duplicate source assignment: ${slug}`);
      seen.add(slug);
      assert.equal(ARTICLES_DB[slug].content.match(/## Sources and further reading/g)?.length, 1);
    }
  }
});

test('source citations render as crawlable, descriptively labelled HTTPS anchors', () => {
  for (const source of Object.values(ARTICLE_PRIMARY_SOURCES)) {
    assert.equal(new URL(source.url).protocol, 'https:');
    assert.ok(source.note.length > 30);
    const rendered = renderSafeRichTextInline(`[${source.title}](${source.url})`);
    assert.ok(rendered.includes(`href="${source.url}"`));
    assert.ok(rendered.includes('rel="noopener noreferrer"'));
    assert.ok(!rendered.includes('nofollow'));
  }
});
