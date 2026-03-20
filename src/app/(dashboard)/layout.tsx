"use client";

import Shell from '@/components/layout/Shell';
import { AlertOverlay } from '@/components/layout/AlertOverlay';
import { useUser, useAuth } from '@/firebase';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef, Suspense } from 'react';
import { RevenueCatPaywall } from '@/components/RevenueCatPaywall';
import { QuotaResolutionOverlay } from '@/components/layout/QuotaResolutionOverlay';
import { useTeam } from '@/components/providers/team-provider';
import { Loader2, Timer } from 'lucide-react';
import { seedGuestDemoTeam } from '@/lib/db-seeder';
import { useFirestore } from '@/firebase';
import { signOut } from 'firebase/auth';
import { toast } from '@/hooks/use-toast';

const DEMO_TIMEOUT_MS = 15 * 60 * 1000;
const DEMO_START_KEY = 'squad_demo_start_time';

function DemoSeedWrapper({ 
  user, 
  isTeamsLoading, 
  teamsCount, 
  isDemoInitializing, 
  setIsDemoInitializing,
  setIsSeedingDemo 
}: { 
  user: any, 
  isTeamsLoading: boolean, 
  teamsCount: number,
  isDemoInitializing: boolean,
  setIsDemoInitializing: (v: boolean) => void,
  setIsSeedingDemo: (v: boolean) => void
}) {
  const searchParams = useSearchParams();
  const db = useFirestore();
  const auth = useAuth();
  const seedingAttempted = useRef(false);

  useEffect(() => {
    const demoPlanId = searchParams.get('seed_demo');
    if (!user || isDemoInitializing || !demoPlanId || isTeamsLoading || teamsCount > 0 || seedingAttempted.current) return;
    
    seedingAttempted.current = true;
    setIsDemoInitializing(true);
    setIsSeedingDemo(true);
    
    const seed = async () => {
      try {
        if (auth.currentUser) {
          await seedGuestDemoTeam(db, user.uid, demoPlanId);
          // Small delay to allow Firestore cache to settle
          setTimeout(() => {
            window.location.replace('/dashboard');
          }, 1500);
        }
      } catch (e) {
        console.error("Demo seeding failed:", e);
        setIsDemoInitializing(false);
        setIsSeedingDemo(false);
        toast({ title: "Sync Failed", description: "Could not establish environment.", variant: "destructive" });
      }
    };
    seed();
  }, [user, isTeamsLoading, teamsCount, isDemoInitializing, searchParams, auth, db, setIsDemoInitializing, setIsSeedingDemo]);

  return null;
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading, isAuthResolved } = useUser();
  const auth = useAuth();
  const { teams, isTeamsLoading, isSeedingDemo, setIsSeedingDemo, user: userProfile } = useTeam();
  const router = useRouter();
  const pathname = usePathname();
  
  const [mounted, setMounted] = useState(false);
  const [isDemoInitializing, setIsDemoInitializing] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const heartbeatInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { 
    setMounted(true); 
  }, []);

  useEffect(() => {
    if (!mounted || !isAuthResolved || isDemoInitializing) return;
    if (!user && !pathname.includes('seed_demo')) {
      router.push('/login');
    }
  }, [user, isAuthResolved, router, mounted, isDemoInitializing, pathname]);

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
      if (userProfile?.role === 'coach') router.push('/teams/new');
      else router.push('/teams/join');
    }
  }, [user, userProfile, teams, isTeamsLoading, isSeedingDemo, pathname, router, mounted, isDemoInitializing]);

  useEffect(() => {
    if (!mounted || !userProfile?.isDemo || !user) return;
    let startTime = sessionStorage.getItem(DEMO_START_KEY);
    if (!startTime) {
      startTime = Date.now().toString();
      sessionStorage.setItem(DEMO_START_KEY, startTime);
    }
    const checkSession = () => {
      const elapsed = Date.now() - parseInt(startTime!);
      const remaining = Math.max(0, DEMO_TIMEOUT_MS - elapsed);
      setTimeLeft(remaining);
      if (remaining <= 0) {
        sessionStorage.removeItem(DEMO_START_KEY);
        signOut(auth).then(() => window.location.href = `/login?reason=expired`);
      }
    };
    checkSession();
    heartbeatInterval.current = setInterval(checkSession, 1000);
    return () => { if (heartbeatInterval.current) clearInterval(heartbeatInterval.current); };
  }, [mounted, userProfile?.isDemo, user, auth]);

  const formatTimeLeft = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    return `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, '0')}`;
  };

  /**
   * TACTICAL HYDRATION GUARD: 
   * To prevent hydration errors, we ensure the loading UI text remains static 
   * during the initial boot sequence.
   */
  const showLoading = !mounted || isUserLoading || !isAuthResolved || isSeedingDemo || isDemoInitializing || isTeamsLoading || !userProfile;

  if (showLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        {mounted && (
          <DemoSeedWrapper 
            user={user} 
            isTeamsLoading={isTeamsLoading} 
            teamsCount={teams.length} 
            isDemoInitializing={isDemoInitializing}
            setIsDemoInitializing={setIsDemoInitializing}
            setIsSeedingDemo={setIsSeedingDemo}
          />
        )}
        <div className="flex flex-col items-center gap-6 animate-in fade-in duration-500">
          <div className="bg-primary/10 p-6 rounded-[2.5rem] shadow-xl">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
          </div>
          <div className="text-center space-y-2">
            <p className="text-lg font-black uppercase tracking-widest text-primary">
              Synchronizing Secure Hub...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <LayoutContent>{children}</LayoutContent>
    </Suspense>
  );
}