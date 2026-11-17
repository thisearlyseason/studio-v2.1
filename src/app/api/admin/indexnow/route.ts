import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { verifyFirebaseToken } from '@/lib/api-auth';
import { getPublicSportsHubArticle } from '@/lib/server-sports-hub';
import { indexNowPayload } from '@/lib/indexnow';

export async function POST(request: NextRequest) {
  const auth = await verifyFirebaseToken(request);
  if (auth instanceof NextResponse) return auth;
  if (auth.role !== 'superadmin') return NextResponse.json({ error: 'Super Admin access is required.' }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (typeof body?.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(body.slug)) return NextResponse.json({ error: 'A valid published article slug is required.' }, { status: 400 });
  const article = await getPublicSportsHubArticle(body.slug).catch(() => null);
  if (!article) return NextResponse.json({ error: 'Published article not found.' }, { status: 404 });
  revalidatePath('/sitemap.xml');
  revalidatePath(`/sports-hub/articles/${body.slug}`);
  const response = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(indexNowPayload([`https://www.thesquad.pro/sports-hub/articles/${body.slug}`])), signal: AbortSignal.timeout(10000) }).catch(() => null);
  return NextResponse.json({ notified: response?.status === 200 || response?.status === 202, status: response?.status ?? null });
}
