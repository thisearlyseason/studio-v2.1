import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Account Setup',
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
