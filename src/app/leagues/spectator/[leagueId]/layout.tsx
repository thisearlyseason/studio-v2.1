import type { Metadata } from 'next';
import { cache } from 'react';
import { readActiveScoringLeague } from '@/lib/server-competition-scoring';
import { notFound } from 'next/navigation';
import { adminDb } from '@/lib/firebase-admin';
import { isValidFirestoreDocumentId } from '@/lib/firestore-document-id';

type Props = { children: React.ReactNode; params: Promise<{ leagueId: string }> };

const publicLeague = cache(async (leagueId: string) => {
  if (!isValidFirestoreDocumentId(leagueId)) return null;
  let snapshot = await adminDb.collection('leagues').doc(leagueId).get();
  if (!snapshot.exists) {
    const bySlug = await adminDb.collection('leagues').where('slug', '==', leagueId).limit(1).get();
    if (bySlug.empty) return null;
    snapshot = bySlug.docs[0];
  }
  const league = await adminDb.runTransaction(transaction => readActiveScoringLeague(transaction, snapshot.id));
  return { name: String(league.name || 'League') };
});

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
