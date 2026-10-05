import { NextResponse } from 'next/server';
import { listPublicSportsHubArticles } from '@/lib/server-sports-hub';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const articles = await listPublicSportsHubArticles();
    return NextResponse.json(
      { articles },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    );
  } catch (error) {
    console.error('[Sports Hub] Public article list failed:', error);
    return NextResponse.json({ error: 'Unable to load current articles.' }, { status: 503 });
  }
}
