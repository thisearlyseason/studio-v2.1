import type { Metadata } from 'next';
import { SportsHubClientLayout } from '@/components/sports-hub/SportsHubClientLayout';

export const metadata: Metadata = {
  title: 'Sports Hub | Coaching Resources, Templates, and Sports News',
  description: 'Practical coaching resources, team management guides, sports news, and ready-to-use templates from The Squad.',
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
