import { NextRequest, NextResponse } from 'next/server';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { adminDb } from '@/lib/firebase-admin';

async function requireSuperAdmin(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;
  return auth.role === 'superadmin'
    ? auth
    : NextResponse.json({ error: 'Super Admin access is required.' }, { status: 403 });
}

function serializeValue(value: unknown): unknown {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, serializeValue(nested)]));
  }
  return value;
}

function documents(snapshot: FirebaseFirestore.QuerySnapshot): Array<Record<string, unknown> & { id: string }> {
  return snapshot.docs.map(document => ({
    id: document.id,
    ...(serializeValue(document.data()) as Record<string, unknown>),
  }));
}

export async function GET(request: NextRequest) {
  const auth = await requireSuperAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const results = await Promise.allSettled([
    adminDb.collection('sports_hub_rss_feeds').orderBy('createdAt', 'desc').limit(50).get(),
    adminDb.collection('sports_hub_articles').orderBy('publishedAt', 'desc').limit(100).get(),
    adminDb.collection('sports_hub_newsletter_subscribers').orderBy('subscribedAt', 'desc').limit(200).get(),
    adminDb.collection('newsletter_subscribers').limit(500).get(),
  ]);
  const [feedsResult, articlesResult, legacyResult, canonicalResult] = results;

  const feeds = feedsResult.status === 'fulfilled' ? documents(feedsResult.value) : [];
  const articles = articlesResult.status === 'fulfilled' ? documents(articlesResult.value) : [];
  const legacySubscribers = legacyResult.status === 'fulfilled' ? documents(legacyResult.value) : [];
  const canonicalSubscribers = canonicalResult.status === 'fulfilled'
    ? documents(canonicalResult.value).filter(subscriber =>
        subscriber.source === 'sports_hub' ||
        (Array.isArray(subscriber.sources) && subscriber.sources.includes('sports_hub'))
      )
    : [];

  const subscribersByEmail = new Map<string, Record<string, unknown>>();
  [...legacySubscribers, ...canonicalSubscribers].forEach(subscriber => {
    const email = typeof subscriber.email === 'string' ? subscriber.email.trim().toLowerCase() : '';
    if (!email) return;
    const existing = subscribersByEmail.get(email);
    subscribersByEmail.set(email, {
      ...existing,
      ...subscriber,
      email,
      isActive: existing?.isActive !== false && subscriber.isActive !== false,
    });
  });

  const labels = ['RSS feeds', 'custom articles', 'legacy subscribers', 'newsletter subscribers'];
  const failedSources = results.flatMap((result, index) => result.status === 'rejected' ? [labels[index]] : []);
  results.forEach((result, index) => {
    if (result.status === 'rejected') console.error(`[Sports Hub Admin] Unable to read ${labels[index]}:`, result.reason);
  });

  return NextResponse.json({
    feeds,
    articles,
    subscribers: [...subscribersByEmail.values()],
    failedSources,
  });
}
