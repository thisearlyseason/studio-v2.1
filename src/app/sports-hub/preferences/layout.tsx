import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sports Hub Preferences',
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export default function PreferencesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
