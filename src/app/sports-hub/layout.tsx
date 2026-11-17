import type { Metadata } from 'next';
import { SportsHubClientLayout } from '@/components/sports-hub/SportsHubClientLayout';

export const metadata: Metadata = {
  title: { absolute: 'Sports Hub: Coaching Guides and Team Resources | The Squad' },
  description: 'Find coaching guides, team management resources, sports news and editable templates for coaches, parents and sports organizers.',
  alternates: { canonical: '/sports-hub' },
  openGraph: {
    type: 'website',
    url: 'https://www.thesquad.pro/sports-hub',
    title: 'Sports Hub | The Squad',
    description: 'Coaching resources, team management guides, sports news, and free templates for sports programs.',
  },
};

export default function SportsHubLayout({ children }: { children: React.ReactNode }) {
  return <SportsHubClientLayout>{children}</SportsHubClientLayout>;
}
