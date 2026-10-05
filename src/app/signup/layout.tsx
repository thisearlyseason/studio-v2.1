import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create Account',
  description: 'Create your The Squad account.',
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
