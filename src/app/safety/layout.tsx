import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Safety',
  alternates: { canonical: '/safety' },
};

export default function SafetyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
