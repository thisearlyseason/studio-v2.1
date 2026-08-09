import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { adminDb } from '@/lib/firebase-admin';
import { isValidFirestoreDocumentId } from '@/lib/firestore-document-id';

type Props = { children: React.ReactNode; params: Promise<{ leagueId: string }> };

async function leagueRecord(identifier: string) {
  if (!isValidFirestoreDocumentId(identifier)) return null;

  const direct = await adminDb.collection('leagues').doc(identifier).get();
  if (direct.exists) return direct.data();

  const bySlug = await adminDb.collection('leagues').where('slug', '==', identifier).limit(1).get();
  return bySlug.empty ? null : bySlug.docs[0].data();
}

export async function generateMetadata({ params }: Omit<Props, 'children'>): Promise<Metadata> {
  const { leagueId } = await params;
  const league = await leagueRecord(leagueId).catch(() => null);
  if (!league) notFound();
  return {
    title: `${String(league.name || 'League')} Registration | The Squad`,
    robots: { index: false, follow: false },
  };
}

export default async function LeagueRegistrationLayout({ children, params }: Props) {
  const { leagueId } = await params;
  if (!await leagueRecord(leagueId).catch(() => null)) notFound();
  return children;
}
