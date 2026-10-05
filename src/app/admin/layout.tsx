import type { Metadata } from 'next';
import { requireDashboardSession } from '@/lib/server-dashboard-auth';

export const metadata: Metadata = {
  title: 'Administration',
  robots: { index: false, follow: false },
  alternates: { canonical: null },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardSession('/admin');
  return children;
}
