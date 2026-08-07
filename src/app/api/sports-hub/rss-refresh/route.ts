import { NextRequest, NextResponse } from 'next/server';
import { fetchAndParseRSSFeed, shouldRejectItem } from '@/lib/rss-parser';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';
import { DEFAULT_RSS_FEEDS } from '@/lib/sports-hub-rss-config';

export async function POST(req: NextRequest) {
  const auth = await verifyFirebaseToken(req);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== 'superadmin') {
    return NextResponse.json({ error: 'Super Admin access is required.' }, { status: 403 });
  }

  try {
    const { feedUrl, feedId } = await req.json();
    if (typeof feedId !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(feedId)) {
      return NextResponse.json({ error: 'A valid feed ID is required.' }, { status: 400 });
    }

    const defaultFeed = DEFAULT_RSS_FEEDS.find(feed => feed.id === feedId);
    const storedFeed = defaultFeed
      ? null
      : await adminDb.collection('sports_hub_rss_feeds').doc(feedId).get();
    const config = defaultFeed || (storedFeed?.exists ? storedFeed.data() : null);
    if (!config || config.isEnabled !== true || typeof config.url !== 'string') {
      return NextResponse.json({ error: 'That RSS feed is unavailable.' }, { status: 404 });
    }
    if (typeof feedUrl === 'string' && feedUrl.trim() !== config.url) {
      return NextResponse.json(
        { error: 'The supplied URL does not match the approved feed.' },
        { status: 400 }
      );
    }

    // Fetch and parse the RSS feed
    const rawItems = await fetchAndParseRSSFeed(config.url);

    // Apply content filters
    const filteredItems = rawItems.filter((item) => !shouldRejectItem(item));

    // In production: save articles to Firestore sports_hub_rss_articles collection
    // const db = getFirestore();
    // const batch = db.batch();
    // for (const item of filteredItems) {
    //   const docRef = db.collection('sports_hub_rss_articles').doc();
    //   batch.set(docRef, {
    //     feedId,
    //     title: item.title,
    //     url: item.url,
    //     excerpt: item.excerpt,
    //     imageUrl: item.imageUrl || null,
    //     source: item.source,
    //     publishedAt: item.publishedAt,
    //     category: config.category || 'General',
    //     importedAt: new Date().toISOString(),
    //     isDuplicate: false,
    //   });
    // }
    // await batch.commit();
    //
    // Update feed lastSyncAt
    // await db.collection('sports_hub_rss_feeds').doc(feedId).update({
    //   lastSyncAt: new Date().toISOString(),
    //   lastSyncStatus: 'success',
    //   articleCount: filteredItems.length,
    // });

    return NextResponse.json({
      success: true,
      totalFetched: rawItems.length,
      totalImported: filteredItems.length,
      rejected: rawItems.length - filteredItems.length,
    });
  } catch (error: unknown) {
    console.error('[Sports Hub] RSS refresh error:', error);
    return NextResponse.json({
      error: 'RSS refresh failed',
    }, { status: 500 });
  }
}
