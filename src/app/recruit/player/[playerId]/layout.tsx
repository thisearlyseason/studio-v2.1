import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { adminDb } from '@/lib/firebase-admin';
import { isValidFirestoreDocumentId } from '@/lib/firestore-document-id';
import { isProspectActivated } from '@/lib/prospect-activation';

type Props = { children: React.ReactNode; params: Promise<{ playerId: string }> };

async function publicPlayer(playerId: string) {
  if (!isValidFirestoreDocumentId(playerId)) return null;
  const playerRef = adminDb.collection('players').doc(playerId);
  const [snapshot, profileSnapshot] = await Promise.all([
    playerRef.get(),
    playerRef.collection('recruitingProfile').doc('profile').get(),
  ]);
  const player = snapshot.data();
  return snapshot.exists && isProspectActivated(profileSnapshot.data()) ? player : null;
}

export async function generateMetadata({ params }: Omit<Props, 'children'>): Promise<Metadata> {
  const { playerId } = await params;
  const player = await publicPlayer(playerId).catch(() => null);
  if (!player) notFound();
  const name = [player.firstName, player.lastName].filter(Boolean).join(' ') || 'Athlete';
  return {
    title: `${name} | The Squad Scout Portal`,
    robots: { index: true, follow: true },
    alternates: { canonical: `/recruit/player/${playerId}` },
  };
}

export default async function RecruitingProfileLayout({ children, params }: Props) {
  const { playerId } = await params;
  if (!await publicPlayer(playerId).catch(() => null)) notFound();
  return children;
}
