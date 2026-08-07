import { requireDashboardSession } from '@/lib/server-dashboard-auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireDashboardSession('/admin');
  return children;
}
