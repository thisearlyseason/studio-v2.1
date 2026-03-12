"use client";

import Shell from '@/components/layout/Shell';
import { AlertOverlay } from '@/components/layout/AlertOverlay';
import { useUser, useAuth } from '@/firebase';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { RevenueCatPaywall } from '@/components/RevenueCatPaywall';
import { QuotaResolutionOverlay } from '@/components/layout/QuotaResolutionOverlay';
import { useTeam } from '@/components/providers/team-provider';
import { Loader2, Timer, ShieldAlert } from 'lucide-react';
import { seedGuestDemoTeam, seedSubscriptionData } from '@/lib/db-seeder';
import { useFirestore } from '@/firebase';
import { signOut } from 'firebase/auth';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

const DEMO_TIMEOUT_MS = 15 * 60 * 1000; // 15 Minutes
const DEMO_START_KEY = 'squad_demo_start_time';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isUserLoading } = useUser();
  const auth = useAuth();
  const { teams, isTeamsLoading, isSeedingDemo, user: userProfile, setActiveTeam } = useTeam();
  const db = useFirestore();
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [isDemoInitializing, setIsDemoInitializing] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const heartbeatInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // --- DEMO HEARTBEAT LOGIC ---
  useEffect(() => {
    if (!mounted || !userProfile?.isDemo || !user) return;

    // 1. Establish session start in sessionStorage (clears when tab closes)
    let startTime = sessionStorage.getItem(DEMO_START_KEY);
    if (!startTime) {
      startTime = Date.now().toString();
      sessionStorage.setItem(DEMO_START_KEY, startTime);
    }

    const checkSession = () => {
      const start = parseInt(startTime!);
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, DEMO_TIMEOUT_MS - elapsed);
      
      setTimeLeft(remaining);

      // 60-second warning
      if (remaining <= 60000 && remaining > 59000) {
        toast({
          title: "Session Expiring",
          description: "Guest tactical access ends in 60 seconds.",
          variant: "destructive"
        });
      }

      if (remaining <= 0) {
        handleEndDemo("Session Expired");
      }
    };

    const handleEndDemo = async (reason: string) => {
      if (heartbeatInterval.current) clearInterval(heartbeatInterval.current);
      sessionStorage.removeItem(DEMO_START_KEY);
      await signOut(auth);
      window.location.href = `/login?reason=${encodeURIComponent(reason)}`;
    };

    // 2. Start heartbeat (update every second for countdown)
    checkSession();
    heartbeatInterval.current = setInterval(checkSession, 1000);

    // 3. Reset if they leave
    const handleExit = () => {
      sessionStorage.removeItem(DEMO_START_KEY);
    };
    window.addEventListener('beforeunload', handleExit);

    return () => {
      if (heartbeatInterval.current) clearInterval(heartbeatInterval.current);
      window.removeEventListener('beforeunload', handleExit);
    };
  }, [mounted, userProfile?.isDemo, user, auth]);

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

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('seed_demo')) return;

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

  const formatTimeLeft = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
      {userProfile?.isDemo && (
        <div className="fixed bottom-6 right-6 z-[100] pointer-events-none">
          <Badge className="bg-black/80 backdrop-blur-md text-white border-primary/20 h-10 px-4 rounded-full flex items-center gap-3 shadow-2xl animate-in slide-in-from-bottom-4">
            <Timer className="h-4 w-4 text-primary animate-pulse" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest">Guest Mode</span>
              <span className="h-4 w-px bg-white/20" />
              <span className="text-[10px] font-mono font-bold text-primary">{timeLeft !== null ? formatTimeLeft(timeLeft) : '...'}</span>
            </div>
          </Badge>
        </div>
      )}
    </>
  );
}