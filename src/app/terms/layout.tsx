import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'The Squad Terms of Service and Use' },
  description: 'Read the terms for using The Squad, including account responsibilities, acceptable use, subscriptions and how the sports management service operates.',
  alternates: { canonical: '/terms' },
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
