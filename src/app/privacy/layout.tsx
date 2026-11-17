import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'The Squad Privacy and Personal Data Policy' },
  description: 'Read how The Squad collects, uses and protects personal information. Find details on account data, sharing, retention and your privacy choices.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
