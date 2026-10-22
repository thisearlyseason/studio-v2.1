'use client';
import { usePathname } from 'next/navigation';
import { TeamProvider } from '@/components/providers/team-provider';
import { AppServiceWorkerRegistration } from '@/components/pwa/AppServiceWorkerRegistration';
import BugReporter from '@/components/BugReporter';
import { PageEntityProvider } from './entity-context';
import { Toaster } from '@/components/ui/toaster';
export function SquadPageBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (process.env.NEXT_PUBLIC_SQUAD_PAGES_ENABLED === 'true' && (pathname.startsWith('/p/') || pathname === '/squad-pages')) return <>{children}<Toaster /></>;
  return <><AppServiceWorkerRegistration /><TeamProvider><PageEntityProvider>{children}<BugReporter /><Toaster /></PageEntityProvider></TeamProvider></>;
}
