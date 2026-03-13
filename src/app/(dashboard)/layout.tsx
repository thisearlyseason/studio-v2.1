
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
  const { user, isUserLoading, isAuthResolved } = useUser();
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
        try {
          await seedSubscriptionData(db);
          await seedGuestDemoTeam(db, user.uid, demoPlanId);
          window.location.href = '/dashboard'; 
        } catch (e) {
          console.error("Demo seeding failed:", e);
          setIsDemoInitializing(false);
        }
      };
      seed();
    }
  }, [mounted, user, teams.length, db, isDemoInitializing]);

  // Global Auth Guard
  useEffect(() => {
    if (!mounted || !isAuthResolved) return;
    
    // Check if we are currently launching a demo
    const urlParams = new URLSearchParams(window.location.search);
    const isLaunchingDemo = urlParams.has('seed_demo');

    if (!user && !isLaunchingDemo) {
      router.push('/login');
    }
  }, [user, isAuthResolved, router, mounted]);

  // Team Setup Guard
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

  const showLoading = !mounted || isUserLoading || !isAuthResolved || isSeedingDemo || isDemoInitializing;

  if (showLoading) {
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
    <div className="flex flex-col min-h-screen">
      {/* Demo Banner moved to Top with lower z-index */}
      {userProfile?.isDemo && (
        <div className="w-full bg-black text-white h-9 flex items-center justify-center gap-4 z-[40] border-b border-primary/20 shrink-0 sticky top-0">
          <Timer className="h-3.5 w-3.5 text-primary animate-pulse" />
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest">Guest Tactical Mode</span>
            <div className="h-3 w-px bg-white/20" />
            <span className="text-[10px] font-mono font-bold text-primary">
              Session Expiration: {timeLeft !== null ? formatTimeLeft(timeLeft) : '...'}
            </span>
          </div>
        </div>
      )}
      <div className="flex-1 flex flex-col relative">
        <AlertOverlay />
        <RevenueCatPaywall />
        <QuotaResolutionOverlay />
        <Shell>{children}</Shell>
      </div>
    </div>
  );
}
