
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

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isUserLoading } = useUser();
  const { teams, isTeamsLoading, isSeedingDemo, user: userProfile } = useTeam();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!isUserLoading && !user) {
      router.push('/login');
    }
  }, [user, isUserLoading, router, mounted]);

  useEffect(() => {
    if (!mounted) return;
    
    // Standard checks only proceed if seeder is inactive
    if (isSeedingDemo) return;

    // Force demo users to land on the feed first
    if (userProfile?.isDemo && pathname === '/') {
      router.push('/feed');
      return;
    }

    // Exclude settings and pricing to allow management
    const isSetupPage = pathname === '/teams/new' || 
                        pathname === '/teams/join' || 
                        pathname === '/family' || 
                        pathname === '/settings' || 
                        pathname === '/pricing';
    
    // REDIRECT LOGIC: Only trigger setup redirect if definitely NO teams and NOT seeding
    if (user && userProfile && !isTeamsLoading && teams.length === 0 && !isSetupPage) {
      // Final guard for demo users who just finished seeding
      if (userProfile.isDemo) return;

      if (userProfile.role === 'coach') {
        router.push('/teams/new');
      } else {
        router.push('/teams/join');
      }
    }
  }, [user, userProfile, teams, isTeamsLoading, isSeedingDemo, pathname, router, mounted]);

  // Unified Hydration Guard: Ensure server and client render identical root
  if (!mounted || isUserLoading || !user || isSeedingDemo) {
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
              {isSeedingDemo ? "Seeding Demo Environment..." : "Authenticating..."}
            </p>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest opacity-60">
              {isSeedingDemo ? "Building Guest Squad Data" : "Verifying Elite Credentials"}
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
