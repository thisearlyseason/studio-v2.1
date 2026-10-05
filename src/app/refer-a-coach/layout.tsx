import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Refer Your Coach to The Squad',
  description: 'Send your coach a friendly, one-time introduction to The Squad sports management platform.',
  alternates: { canonical: 'https://www.thesquad.pro/refer-a-coach' },
  openGraph: {
    type: 'website',
    url: 'https://www.thesquad.pro/refer-a-coach',
    title: 'Refer Your Coach to The Squad',
    description: 'Help your team discover a clearer way to manage schedules, updates, messages, resources, and more.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'The Squad' }],
  },
};

export default function ReferCoachLayout({ children }: { children: React.ReactNode }) {
  return children;
}
