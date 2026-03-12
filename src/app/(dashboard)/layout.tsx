
"use client";

import Shell from '@/components/layout/Shell';
import { AlertOverlay } from '@/components/layout/AlertOverlay';
import { useUser } from '@/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { RevenueCatPaywall } from '@/components/RevenueCatPaywall';
import { QuotaResolutionOverlay } from '@/components/layout/QuotaResolutionOverlay';
import { useTeam } from '@/components/providers/team-provider';
import { Loader2 } from 'lucide-react';
import { seedGuestDemoTeam, seedSubscriptionData } from '@/lib/db-seeder';
import { useFirestore } from '@/firebase';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isUserLoading } = useUser();
  const { teams, isTeamsLoading, isSeedingDemo, user: userProfile, setActiveTeam } = useTeam();
  const db = useFirestore();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [isDemoInitializing, setIsDemoInitializing] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle Demo Seeding
  useEffect(() => {
    if (!mounted || !user || isDemoInitializing) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const demoPlanId = urlParams.get('seed_demo');
    
    if (demoPlanId && teams.length === 0) {
      setIsDemoInitializing(true);
      const seed = async () => {
        await seedSubscriptionData(db);
        await seedGuestDemoTeam(db, user.uid, demoPlanId);
        // Ensure landing on dashboard after seeding
        window.location.href = '/dashboard'; 
      };
      seed();
    }
  }, [mounted, user, teams.length, db, isDemoInitializing]);

  useEffect(() => {
    if (!mounted) return;
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router, mounted]);

  useEffect(() => {
    if (!mounted || isSeedingDemo || isTeamsLoading || !user || isDemoInitializing) return;

    const isSetupPage = pathname === '/dashboard' ||
                        pathname === '/teams/new' || 
                        pathname === '/teams/join' || 
                        pathname === '/family' || 
                        pathname === '/settings' || 
                        pathname === '/pricing' ||
                        pathname === '/how-to' ||
                        pathname.startsWith('/tournaments/') ||
                        pathname.startsWith('/register/league/');
    
    if (teams.length === 0 && !isSetupPage) {
      if (userProfile?.role === 'coach') {
        router.push('/teams/new');
      } else {
        router.push('/teams/join');
      }
    }
  }, [user, userProfile, teams, isTeamsLoading, isSeedingDemo, pathname, router, mounted, isDemoInitializing]);

  if (!mounted || isUserLoading || !user || isSeedingDemo || isDemoInitializing) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-6 animate-in fade-in duration-500">
          <div className="bg-primary/10 p-6 rounded-[2.5rem] shadow-xl relative">
            <div className="h-16 w-16 flex items-center justify-center">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
          </div>
          <div className="text-center space-y-2">
            <p className="text-lg font-black uppercase tracking-widest text-primary">
              {isDemoInitializing ? "Seeding Demo..." : "Authenticating..."}
            </p>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-60">
              Synchronising Elite Infrastructure
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <AlertOverlay />
      <RevenueCatPaywall />
      <QuotaResolutionOverlay />
      <Shell>{children}</Shell>
    </>
  );
}
