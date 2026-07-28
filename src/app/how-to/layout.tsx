import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'How The Squad works',
  alternates: { canonical: '/how-to' },
};

export default function HowToLayout({ children }: { children: React.ReactNode }) {
  return children;
}
