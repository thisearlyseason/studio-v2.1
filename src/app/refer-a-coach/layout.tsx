import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Refer Your Coach to The Squad',
  description: 'Introduce your coach to The Squad with a one-time referral email. Share a way to manage your team’s schedules, messages and parent updates together.',
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
