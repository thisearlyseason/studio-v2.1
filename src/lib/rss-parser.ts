import { RSSArticle, RSSFeed, RSS_FILTER_BLOCKLIST } from './sports-hub-types';
import { assertSafeExternalUrl } from './safe-external-url';

export interface ParsedRSSItem {
  title: string;
  url: string;
  excerpt: string;
  imageUrl?: string;
  publishedAt: string;
  source: string;
}

const MAX_FEED_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;

async function readBodyWithLimit(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength > MAX_FEED_BYTES) {
    throw new Error('Feed response is too large.');
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_FEED_BYTES) {
      await reader.cancel();
      throw new Error('Feed response is too large.');
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

async function fetchSafeFeed(feedUrl: string): Promise<{
  body: string;
  contentType: string;
  finalUrl: string;
}> {
  let current = await assertSafeExternalUrl(feedUrl);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(current, {
      headers: {
        'User-Agent': 'TheSquad-SportsHub/1.0',
        Accept: 'application/rss+xml, application/xml, application/json, text/xml',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location || redirectCount === MAX_REDIRECTS) {
        throw new Error('Feed redirected too many times.');
      }
      current = await assertSafeExternalUrl(new URL(location, current).toString());
      continue;
    }

    if (!response.ok) throw new Error(`Feed fetch failed: ${response.status}`);
    return {
      body: await readBodyWithLimit(response),
      contentType: response.headers.get('content-type') || '',
      finalUrl: current.toString(),
    };
  }

  throw new Error('Feed redirected too many times.');
}

// Normalize any feed format (RSS 2.0, Atom, JSON Feed) into ParsedRSSItem[]
export async function fetchAndParseRSSFeed(feedUrl: string): Promise<ParsedRSSItem[]> {
  const response = await fetchSafeFeed(feedUrl);
  
  if (response.contentType.includes('json')) {
    // JSON Feed
    const json = JSON.parse(response.body);
    return parseJSONFeed(json, response.finalUrl);
  } else {
    // XML (RSS or Atom)
    return parseXMLFeed(response.body, response.finalUrl);
  }
}

function parseXMLFeed(xml: string, feedUrl: string): ParsedRSSItem[] {
  const items: ParsedRSSItem[] = [];
  
  // Determine source name from URL
  const source = extractSourceName(feedUrl);
  
  // Check if Atom or RSS
  const isAtom = xml.includes('<feed') && xml.includes('xmlns="http://www.w3.org/2005/Atom"');
  
  if (isAtom) {
    return parseAtomFeed(xml, source);
  } else {
    return parseRSS2Feed(xml, source);
  }
}

function parseRSS2Feed(xml: string, source: string): ParsedRSSItem[] {
  const items: ParsedRSSItem[] = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
  
  for (const match of itemMatches) {
    const itemXml = match[1];
    
    const title = extractXMLTag(itemXml, 'title');
    const link = extractXMLTag(itemXml, 'link') || extractXMLAttr(itemXml, 'guid');
    const description = extractXMLTag(itemXml, 'description') || extractXMLTag(itemXml, 'content:encoded') || '';
    const pubDate = extractXMLTag(itemXml, 'pubDate') || '';
    const imageUrl = extractImageFromItem(itemXml, description);
    
    if (!title || !link) continue;
    
    const item: ParsedRSSItem = {
      title: stripHTML(title).trim(),
      url: link.trim(),
      excerpt: truncateText(stripHTML(description), 250),
      imageUrl,
      publishedAt: parsePubDate(pubDate),
      source,
    };
    
    items.push(item);
  }
  
  return items;
}

function parseAtomFeed(xml: string, source: string): ParsedRSSItem[] {
  const items: ParsedRSSItem[] = [];
  const entryMatches = xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g);
  
  for (const match of entryMatches) {
    const entryXml = match[1];
    
    const title = extractXMLTag(entryXml, 'title');
    const link = extractAtomLink(entryXml);
    const content = extractXMLTag(entryXml, 'content') || extractXMLTag(entryXml, 'summary') || '';
    const updated = extractXMLTag(entryXml, 'updated') || extractXMLTag(entryXml, 'published') || '';
    const imageUrl = extractImageFromItem(entryXml, content);
    
    if (!title || !link) continue;
    
    items.push({
      title: stripHTML(title).trim(),
      url: link.trim(),
      excerpt: truncateText(stripHTML(content), 250),
      imageUrl,
      publishedAt: updated ? new Date(updated).toISOString() : new Date().toISOString(),
      source,
    });
  }
  
  return items;
}

function parseJSONFeed(json: any, feedUrl: string): ParsedRSSItem[] {
  const source = json.title || extractSourceName(feedUrl);
  const feedItems = json.items || [];
  
  return feedItems.map((item: any) => ({
    title: item.title || '',
    url: item.url || item.external_url || '',
    excerpt: truncateText(item.summary || stripHTML(item.content_html || item.content_text || ''), 250),
    imageUrl: item.image || item.banner_image,
    publishedAt: item.date_published ? new Date(item.date_published).toISOString() : new Date().toISOString(),
    source,
  })).filter((item: ParsedRSSItem) => item.title && item.url);
}

// Auto-discover RSS feed from a website URL
export async function discoverRSSFeed(websiteUrl: string): Promise<string | null> {
  const base = websiteUrl.replace(/\/$/, '');
  const candidates = [
    `${base}/feed`,
    `${base}/rss`,
    `${base}/rss.xml`,
    `${base}/feed.xml`,
    `${base}/atom.xml`,
    `${base}/index.xml`,
    `${base}/feeds/posts/default`,
  ];
  
  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, { method: 'HEAD', headers: { 'User-Agent': 'TheSquad-SportsHub/1.0' } });
      if (res.ok) {
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('xml') || ct.includes('rss') || ct.includes('atom') || ct.includes('json')) {
          return candidate;
        }
      }
    } catch {
      // continue
    }
  }
  
  // Try parsing the HTML to find <link rel="alternate" type="application/rss+xml">
  try {
    const res = await fetch(base, { headers: { 'User-Agent': 'TheSquad-SportsHub/1.0' } });
    if (res.ok) {
      const html = await res.text();
      const match = html.match(/<link[^>]+type=["']application\/(rss|atom)\+xml["'][^>]+href=["']([^"']+)["']/i)
        || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/(rss|atom)\+xml["']/i);
      if (match) {
        const href = match[match.length - 1].startsWith('http') ? match[match.length - 1] : `${base}${match[match.length - 1]}`;
        return href;
      }
    }
  } catch {
    // ignore
  }
  
  return null;
}

// Validate that a feed URL is valid and parseable
export async function validateRSSFeed(feedUrl: string): Promise<{ valid: boolean; itemCount: number; error?: string }> {
  try {
    const items = await fetchAndParseRSSFeed(feedUrl);
    return { valid: true, itemCount: items.length };
  } catch (e: any) {
    return { valid: false, itemCount: 0, error: e.message };
  }
}

// Content filtering: returns true if the item should be REJECTED
export function shouldRejectItem(item: ParsedRSSItem): boolean {
  const text = `${item.title} ${item.excerpt}`.toLowerCase();
  
  // Block banned topics
  for (const keyword of RSS_FILTER_BLOCKLIST) {
    if (text.includes(keyword.toLowerCase())) return true;
  }
  
  // Reject articles without titles
  if (!item.title || item.title.length < 3) return true;
  
  // Reject broken/missing links
  if (!item.url || !item.url.startsWith('http')) return true;
  
  // Reject articles older than 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  if (new Date(item.publishedAt) < thirtyDaysAgo) return true;
  
  return false;
}

// Helpers
function extractXMLTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}(?:[^>]*)><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\/${tag}>`, 'i'))
    || xml.match(new RegExp(`<${tag}(?:[^>]*)>([\\s\\S]*?)<\/${tag}>`, 'i'));
  return match ? match[1].trim() : '';
}

function extractXMLAttr(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i'));
  return match ? match[1].trim() : '';
}

function extractAtomLink(xml: string): string {
  const match = xml.match(/<link[^>]+href=["']([^"']+)["'][^>]*(?:\/>|>)/i)
    || xml.match(/<link[^>]*rel=["']alternate["'][^>]+href=["']([^"']+)["']/i);
  return match ? match[1] : '';
}

function extractImageFromItem(itemXml: string, description: string): string | undefined {
  // Check enclosure
  const enclosure = itemXml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image/i);
  if (enclosure) return enclosure[1];
  
  // Check media:thumbnail
  const mediaThumbnail = itemXml.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i);
  if (mediaThumbnail) return mediaThumbnail[1];
  
  // Check media:content
  const mediaContent = itemXml.match(/<media:content[^>]+url=["']([^"']+)["'][^>]+type=["']image/i);
  if (mediaContent) return mediaContent[1];
  
  // Check og:image-style meta
  const ogImage = itemXml.match(/property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  if (ogImage) return ogImage[1];
  
  // Extract first img from description
  const imgMatch = description.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) return imgMatch[1];
  
  return undefined;
}

function extractSourceName(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function stripHTML(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).replace(/\s+\S*$/, '') + '...';
}

function parsePubDate(dateStr: string): string {
  if (!dateStr) return new Date().toISOString();
  try {
    return new Date(dateStr).toISOString();
  } catch {
    return new Date().toISOString();
  }
}
