import { headers } from 'next/headers';
import { requireDashboardSession } from '@/lib/server-dashboard-auth';

export default async function DashboardAuthTemplate({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const pathname = requestHeaders.get('x-squad-pathname') || '/dashboard';
  await requireDashboardSession(pathname);
  return children;
}
