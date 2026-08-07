import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { fetchAndParseRSSFeed, shouldRejectItem } from '@/lib/rss-parser';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { enforceUserRateLimit, readJsonBodyWithLimit, RequestBodyError } from '@/lib/server-request-guards';

const ID_PATTERN = /^[A-Za-z0-9_-]{1,200}$/;

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== 'superadmin') {
    return NextResponse.json({ error: 'Forbidden: Superadmin access required.' }, { status: 403 });
  }

  try {
    const limited = await enforceUserRateLimit(auth.uid, 'rss-refresh', 30, 60 * 60 * 1000);
    if (limited) return limited;
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(req, 4_000);
    const feedId = String(body.feedId || '').trim();
    if (!ID_PATTERN.test(feedId)) {
      return NextResponse.json({ error: 'A valid feedId is required.' }, { status: 400 });
    }

    const feedRef = adminDb.collection('sports_hub_rss_feeds').doc(feedId);
    const feed = await feedRef.get();
    if (!feed.exists) return NextResponse.json({ error: 'RSS feed not found.' }, { status: 404 });
    const feedData = feed.data() || {};
    const feedUrl = String(feedData.url || '').trim();
    const category = String(feedData.category || 'General').slice(0, 100);

    // Fetch and parse the RSS feed
    const rawItems = await fetchAndParseRSSFeed(feedUrl);

    // Apply content filters
    const filteredItems = rawItems.filter((item) => !shouldRejectItem(item)).slice(0, 100);
    const batch = adminDb.batch();
    const importedAt = new Date().toISOString();
    for (const item of filteredItems) {
      const articleId = createHash('sha256').update(item.url).digest('hex');
      batch.set(adminDb.collection('sports_hub_articles').doc(articleId), {
        feedId,
        title: item.title.slice(0, 300),
        url: item.url,
        excerpt: item.excerpt.slice(0, 1_000),
        imageUrl: item.imageUrl || null,
        source: item.source.slice(0, 200),
        publishedAt: item.publishedAt,
        category,
        importedAt,
      }, { merge: true });
    }
    batch.update(feedRef, {
      lastSyncAt: importedAt,
      lastSyncStatus: 'success',
      articleCount: filteredItems.length,
    });
    await batch.commit();

    return NextResponse.json({
      success: true,
      totalFetched: rawItems.length,
      totalImported: filteredItems.length,
      rejected: rawItems.length - filteredItems.length,
    });
  } catch (error: unknown) {
    console.error('[Sports Hub] RSS refresh error:', error);
    if (error instanceof RequestBodyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({
      error: 'RSS refresh failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
