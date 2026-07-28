import { NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { FEED_REGISTRY } from '@/lib/rss-feeds';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RSSItem {
  id: string;
  title: string;
  excerpt: string;
  url: string;
  source: string;
  sourceUrl: string;
  category: string;
  tags: string[];
  publishedAt: string;
  publishedTimestamp: number;
  imageUrl?: string;
}

// ─── XML helpers ─────────────────────────────────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const cd = xml.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'));
  if (cd) return cd[1].trim();
  const pl = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i'));
  if (pl) return pl[1].trim();
  return '';
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function extractImage(itemXml: string): string | undefined {
  const mc = itemXml.match(/<media:content[^>]+url="([^"]+)"/i);
  if (mc) return mc[1];
  const mt = itemXml.match(/<media:thumbnail[^>]+url="([^"]+)"/i);
  if (mt) return mt[1];
  const enc = itemXml.match(/<enclosure[^>]+url="([^"]+)"/i);
  if (enc && /\.(jpg|jpeg|png|webp)/i.test(enc[1])) return enc[1];
  const img = itemXml.match(/<img[^>]+src="([^"]+)"/i);
  if (img) return img[1];
  return undefined;
}

function parseRSS(xml: string, source: string, category: string, tags: readonly string[]): RSSItem[] {
  const items: RSSItem[] = [];
  const itemMatches = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? [];

  for (const itemXml of itemMatches.slice(0, 10)) {
    const title = stripHtml(extractTag(itemXml, 'title'));

    let link = extractTag(itemXml, 'link');
    if (!link) {
      const hrefMatch = itemXml.match(/<link[^>]+href="([^"]+)"/i);
      if (hrefMatch) link = hrefMatch[1];
    }

    const description = stripHtml(
      extractTag(itemXml, 'description') ||
      extractTag(itemXml, 'content:encoded') ||
      extractTag(itemXml, 'summary')
    );

    const pubDate =
      extractTag(itemXml, 'pubDate') ||
      extractTag(itemXml, 'dc:date') ||
      extractTag(itemXml, 'updated') || '';

    if (!title || !link) continue;

    const id = createHash('md5').update(link).digest('hex');
    const excerpt =
      description.length > 180 ? description.slice(0, 177) + '…' :
      description || `Latest ${category} news from ${source}.`;

    const ts = pubDate ? new Date(pubDate).getTime() : Date.now();
    const imageUrl = extractImage(itemXml);

    let sourceUrl = '';
    try { sourceUrl = new URL(link).origin; } catch { /* */ }

    items.push({
      id,
      title,
      excerpt,
      url: link,
      source,
      sourceUrl,
      category,
      tags: [...tags],
      publishedAt: (() => {
        try { return pubDate ? new Date(pubDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10); }
        catch { return new Date().toISOString().slice(0, 10); }
      })(),
      publishedTimestamp: isNaN(ts) ? Date.now() : ts,
      imageUrl,
    });
  }

  return items;
}

async function fetchFeed(
  url: string,
  source: string,
  category: string,
  tags: readonly string[],
  keywords: string[] = [],
  timeoutMs = 7000,
): Promise<RSSItem[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'The-Squad-SportsHub/2.0 (+https://www.thesquad.pro/sports-hub)',
        Accept: 'application/rss+xml, application/xml, application/atom+xml, text/xml, */*',
      },
      next: { revalidate: 1800 },
    });

    clearTimeout(timer);
    if (!res.ok) return [];

    const xml = await res.text();
    const items = parseRSS(xml, source, category, tags);

    // Apply keyword filter if keywords are specified
    if (keywords.length === 0) return items;
    const lowerKws = keywords.map(k => k.toLowerCase());
    return items.filter(item => {
      const haystack = (item.title + ' ' + item.excerpt).toLowerCase();
      return lowerKws.some(kw => haystack.includes(kw));
    });
  } catch {
    return [];
  }
}

// ─── Route ───────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category') ?? 'all';
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '60', 10), 80);

  const feeds = category === 'all'
    ? FEED_REGISTRY
    : [...FEED_REGISTRY].filter(
        f => f.category.toLowerCase() === category.toLowerCase() ||
             f.tags.some(t => t.toLowerCase().includes(category.toLowerCase()))
      );

  const results = await Promise.allSettled(
    feeds.map(f => fetchFeed(f.url, f.source, f.category, f.tags, f.keywords ?? []))
  );

  const allItems: RSSItem[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') allItems.push(...r.value);
  }

  const seen = new Set<string>();
  const deduped: RSSItem[] = [];
  for (const item of allItems.sort((a, b) => b.publishedTimestamp - a.publishedTimestamp)) {
    const key = item.title.slice(0, 50).toLowerCase().replace(/\s+/g, '');
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(item);
    }
  }

  return NextResponse.json(
    {
      items: deduped.slice(0, limit),
      fetchedAt: new Date().toISOString(),
      feedCount: feeds.length,
      category,
    },
    {
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800' },
    }
  );
}
