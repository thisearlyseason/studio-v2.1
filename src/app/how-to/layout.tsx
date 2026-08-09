import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Help and Operational Guide | The Squad',
  description: 'Role-specific instructions for operating The Squad.',
  alternates: { canonical: '/how-to' },
};

export default function HowToLayout({ children }: { children: React.ReactNode }) {
  return children;
}
