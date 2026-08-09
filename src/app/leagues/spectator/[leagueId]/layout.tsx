import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { adminDb } from '@/lib/firebase-admin';
import { isValidFirestoreDocumentId } from '@/lib/firestore-document-id';

type Props = { children: React.ReactNode; params: Promise<{ leagueId: string }> };

async function publicLeague(leagueId: string) {
  if (!isValidFirestoreDocumentId(leagueId)) return null;
  const snapshot = await adminDb.collection('publicLeagueViews').doc(leagueId).get();
  return snapshot.exists ? snapshot.data() : null;
}

export async function generateMetadata({ params }: Omit<Props, 'children'>): Promise<Metadata> {
  const { leagueId } = await params;
  const league = await publicLeague(leagueId).catch(() => null);
  if (!league) notFound();
  return {
    title: `${String(league.name || 'League')} | The Squad Spectator Hub`,
    robots: { index: true, follow: true },
  };
}

export default async function LeagueSpectatorLayout({ children, params }: Props) {
  const { leagueId } = await params;
  if (!await publicLeague(leagueId).catch(() => null)) notFound();
  return children;
}
