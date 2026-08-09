import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy | The Squad',
  description: 'How The Squad collects, uses, protects, and manages personal information.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
