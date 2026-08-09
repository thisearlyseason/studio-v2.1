import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Safety Center | The Squad',
  description: 'Membership, communication, parental oversight, and reporting safeguards in The Squad.',
  alternates: { canonical: '/safety' },
};

export default function SafetyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
