import { publicRobots } from '@/lib/discovery-metadata';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Youth Sports Guides for Coaches, Parents, and Organizers',
  description: 'Practical youth sports guides covering camps, nonprofit organizations, team identity, athlete development, wellbeing, safety, and family support.',
  robots: publicRobots,
    alternates: { canonical: '/sports-hub/youth' },
  openGraph: { images: [{ url: '/og-image.png', width: 1376, height: 768, alt: 'The Squad sports team management' }],
    type: 'website',
    url: 'https://www.thesquad.pro/sports-hub/youth',
    title: 'Youth Sports Guides | The Squad Sports Hub',
    description: 'Practical youth sports guidance for coaches, parents, program directors, and community organizers.',
  },
};

export default function YouthSportsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
