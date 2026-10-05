import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service | The Squad',
  description: 'Terms governing use of The Squad sports management platform.',
  alternates: { canonical: '/terms' },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
