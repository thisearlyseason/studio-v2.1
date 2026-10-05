import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Search Sports Hub',
  robots: { index: false, follow: true },
  alternates: { canonical: null },
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
