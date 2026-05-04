"use client";

import Shell from '@/components/layout/Shell';
import { AlertOverlay } from '@/components/layout/AlertOverlay';
import { useUser, useAuth } from '@/firebase';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef, Suspense } from 'react';
import { StripePaywall } from '@/components/StripePaywall';
import { QuotaResolutionOverlay } from '@/components/layout/QuotaResolutionOverlay';
import { useTeam } from '@/components/providers/team-provider';
import { Loader2, Timer } from 'lucide-react';
import { seedGuestDemoTeam } from '@/lib/db-seeder';
import { useFirestore } from '@/firebase';
import { signOut } from 'firebase/auth';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getAuthToken, authHeader } from '@/lib/client-auth';


const DEMO_TIMEOUT_MS = 15 * 60 * 1000;
const DEMO_START_KEY = 'squad_demo_start_time';
const SEEDING_ATTEMPTED_KEY = 'squad_seeding_attempted'; // sessionStorage – survives remounts, cleared on tab close
const LOADING_HARD_TIMEOUT_MS = 30_000; // 30 s max wait before forcing the loading state to resolve

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
  useEffect(() => {
    const demoPlanId = searchParams.get('seed_demo');
    // Only allow known valid plan IDs to prevent arbitrary seeding
    const ALLOWED_DEMO_PLANS = new Set([
      // Homepage DEMO_OPTIONS
      'starter_squad', 'squad_pro', 'elite_teams', 'school_demo', 'player_demo', 'parent_demo',
      // Settings page
      'elite',
      // Legacy / generic
      'free', 'team', 'league', 'school',
    ]);
    if (!demoPlanId || !ALLOWED_DEMO_PLANS.has(demoPlanId)) return;
    if (!user || isDemoInitializing || isTeamsLoading) return;
    // Use sessionStorage so this guard survives React remounts within the same browser session.
    // Unlike a useRef, this persists across component teardown/remount cycles.
    const sessionAttemptKey = `${SEEDING_ATTEMPTED_KEY}_${demoPlanId}_${user.uid}`;
    if (sessionStorage.getItem(sessionAttemptKey)) return;

    // Also check the global Firestore write lock to avoid double-seeding
    const globalLock = localStorage.getItem('squad_seeding_lock');
    if (globalLock === demoPlanId) {
      console.warn('[Demo] Seeding lock active – skipping redundant seed.');
      return;
    }

    // Mark as attempted BEFORE going async so concurrent re-renders don't race
    sessionStorage.setItem(sessionAttemptKey, 'true');
    setIsDemoInitializing(true);
    localStorage.setItem('squad_seeding_lock', demoPlanId);
    setIsSeedingDemo(true);

    // Immediately strip the URL param to prevent a loop if the user hits refresh
    const url = new URL(window.location.href);
    url.searchParams.delete('seed_demo');
    window.history.replaceState({}, '', url.pathname + url.search);

    const seed = async (attempt = 1) => {
      try {
        if (!auth.currentUser) throw new Error('No authenticated user');
        const primaryId = await seedGuestDemoTeam(db, user.uid, demoPlanId);
        if (primaryId) {
          localStorage.setItem('sf_session_team_id', primaryId);
        }
        toast({ title: '✅ Environment Ready', description: 'Tactical data synchronized successfully.' });

        // Clear the Firestore write-lock on success
        localStorage.removeItem('squad_seeding_lock');

        // Give Firestore an extra 2 s to propagate all writes before redirecting.
        // The previous 1 s was too short on cold starts.
        setTimeout(() => {
          window.location.replace('/dashboard');
        }, 2000);

      } catch (e: any) {
        console.error(`[Demo] Seed attempt ${attempt} failed:`, e);

        if (e.code === 'resource-exhausted') {
          // Quota errors are not recoverable — surface immediately
          setIsDemoInitializing(false);
          setIsSeedingDemo(false);
          localStorage.removeItem('squad_seeding_lock');
          sessionStorage.removeItem(sessionAttemptKey);
          toast({
            title: 'Quota Exceeded',
            description: 'Database write bandwidth reached. Please try again in 24 hours or upgrade plan.',
            variant: 'destructive'
          });
        } else if (attempt < 3) {
          // Transient network/Firestore error — retry with exponential back-off
          console.warn(`[Demo] Retrying seed in ${attempt * 1500} ms…`);
          setTimeout(() => seed(attempt + 1), attempt * 1500);
        } else {
          // All retries exhausted
          setIsDemoInitializing(false);
          setIsSeedingDemo(false);
          localStorage.removeItem('squad_seeding_lock');
          sessionStorage.removeItem(sessionAttemptKey);
          toast({
            title: 'Sync Failed',
            description: 'Environment could not be established after multiple attempts. Please try again.',
            variant: 'destructive'
          });
        }
      }
    };
    seed();
  }, [user, isTeamsLoading, teamsCount, isDemoInitializing, searchParams, auth, db, setIsDemoInitializing, setIsSeedingDemo]);

  return null;
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  const { user, isUserLoading, isAuthResolved } = useUser();
  const auth = useAuth();
  const { teams, isTeamsLoading, isSeedingDemo, setIsSeedingDemo, user: userProfile, isPrimaryClubAuthority, isSchoolMode, isEliteClubMode, isParent } = useTeam();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const [mounted, setMounted] = useState(false);
  const [isDemoInitializing, setIsDemoInitializing] = useState(false);
  const [isSyncingPlan, setIsSyncingPlan] = useState(false);
  const syncAttempted = useRef(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const heartbeatInterval = useRef<NodeJS.Timeout | null>(null);
  // Hard timeout: if loading lasts more than LOADING_HARD_TIMEOUT_MS, force-unblock so the
  // UI never gets permanently stuck (e.g. Firestore listener never fires on a bad network).
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const hardTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setMounted(true);
    hardTimeoutRef.current = setTimeout(() => {
      setLoadingTimedOut(true);
    }, LOADING_HARD_TIMEOUT_MS);
    return () => {
      // NOTE: Do NOT clear 'squad_seeding_lock' here — doing so would abort an in-progress
      // seed when React re-mounts this layout (e.g. during Suspense boundary resolution).
      if (hardTimeoutRef.current) clearTimeout(hardTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!mounted || !isAuthResolved || isDemoInitializing) return;
    if (!user && !pathname.includes('seed_demo')) {
      router.push('/login');
    }

    // Automatic Redirect to Institutional Hub on first login per session
    // School Admins → School Hub (/club rendered as school view)
    // Elite Club Organizers → Elite Club Hub (/club rendered as elite view)
    // Each role uses its own session key so they don't block each other.
    if (pathname === '/dashboard') {
      if (isSchoolMode && isPrimaryClubAuthority) {
        const schoolLandingKey = `school_hub_landing_${user?.uid}`;
        const hasRedirected = typeof window !== 'undefined' ? sessionStorage.getItem(schoolLandingKey) : null;
        if (!hasRedirected) {
          sessionStorage.setItem(schoolLandingKey, 'true');
          router.push('/club');
        }
      } else if (isEliteClubMode) {
        const eliteLandingKey = `elite_club_landing_${user?.uid}`;
        const hasRedirected = typeof window !== 'undefined' ? sessionStorage.getItem(eliteLandingKey) : null;
        if (!hasRedirected) {
          sessionStorage.setItem(eliteLandingKey, 'true');
          router.push('/club');
        }
      } else if (isParent) {
        router.push('/family');
      }
    }
  }, [user, isAuthResolved, router, mounted, isDemoInitializing, pathname, isPrimaryClubAuthority, isSchoolMode, isEliteClubMode, isParent]);

  useEffect(() => {
    if (!mounted || isSeedingDemo || isTeamsLoading || !user || isDemoInitializing) return;
    const isSetupPage = pathname === '/dashboard' ||
                        pathname === '/dashboard/billing' ||
                        pathname === '/teams/new' || 
                        pathname === '/teams/join' || 
                        pathname === '/family' || 
                        pathname === '/settings' || 
                        pathname === '/pricing' ||
                        pathname === '/how-to' ||
                        pathname === '/leagues' ||
                        pathname === '/manage-tournaments' ||
                        pathname === '/facilities' ||
                        pathname === '/coaches-corner' ||
                        pathname === '/equipment' ||
                        pathname === '/playbook' ||
                        pathname === '/drills' ||
                        pathname === '/feed' ||
                        pathname === '/events' ||
                        pathname === '/games' ||
                        pathname === '/calendar' ||
                        pathname === '/volunteers' ||
                        pathname === '/fundraising' ||
                        pathname === '/chats' ||
                        pathname === '/roster' ||
                        pathname === '/files' ||
                        pathname.startsWith('/tournaments/') ||
                        pathname.startsWith('/leagues/') ||
                        pathname.startsWith('/register/league/');
    
    const isStaffLocal = userProfile?.role === 'admin' || userProfile?.role === 'superadmin';
    
    if (teams.length === 0 && !isSetupPage && !isStaffLocal) {
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

  useEffect(() => {
    if (!mounted || !user?.uid) return;
    const successParam = searchParams.get('success');
    const stripeSuccessParam = searchParams.get('stripe_success');
    
    if ((successParam === 'true' || stripeSuccessParam === 'true') && !isSyncingPlan && !syncAttempted.current) {
      syncAttempted.current = true;
      setIsSyncingPlan(true);
      
      const doSync = async () => {
        try {
          const token = await getAuthToken(auth);
          await fetch('/api/subscription/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader(token) },
            body: JSON.stringify({ userId: user.uid }),
          });
          
          if (auth.currentUser) {
            await auth.currentUser.getIdToken(true);
          }
        } catch (e) {
          console.error('[Plan Sync]', e);
        } finally {
          setIsSyncingPlan(false);
          const url = new URL(window.location.href);
          url.searchParams.delete('success');
          url.searchParams.delete('stripe_success');
          window.history.replaceState({}, '', url.pathname + url.search);
        }
      };
      
      doSync();
    }
  }, [mounted, user, searchParams, auth, isSyncingPlan]);

  // Clear the hard timeout once we're actually done loading
  useEffect(() => {
    const reallyDone = mounted && isAuthResolved && !isUserLoading && !isSeedingDemo && !isDemoInitializing && !isTeamsLoading && !!userProfile && !isSyncingPlan;
    if (reallyDone && hardTimeoutRef.current) {
      clearTimeout(hardTimeoutRef.current);
      hardTimeoutRef.current = null;
      setLoadingTimedOut(false);
    }
  }, [mounted, isAuthResolved, isUserLoading, isSeedingDemo, isDemoInitializing, isTeamsLoading, userProfile, isSyncingPlan]);

  // The loading gate logic is critical. We must ensure that we don't get trapped in a 
  // 'Suspense Loop' where a suspending child causes this layout to remount, which resets
  // the 'mounted' state, which triggers the loading gate, which unmounts the child, 
  // which aborts the suspension... and repeat.
  
  // We consider the system 'resolved' if we have a user profile and auth is confirmed,
  // even if 'mounted' is briefly false during a React remount cycle.
  const isEssentiallyLoading = isUserLoading || !isAuthResolved || isSeedingDemo || isDemoInitializing || isTeamsLoading || !userProfile || isSyncingPlan;
  
  // We only show the full-screen gate if we aren't 'essentially loaded' OR if we haven't mounted yet.
  // But if we HAVE a userProfile, we skip the !mounted requirement to break the Suspense Trap.
  const isLoadingState = !loadingTimedOut && (isEssentiallyLoading || (!mounted && !userProfile));

  if (isLoadingState) {
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
          <div className="bg-primary/10 p-6 rounded-[2.5rem] shadow-xl relative">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            {loadingTimedOut && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-[2.5rem]">
                <Timer className="h-6 w-6 text-destructive" />
              </div>
            )}
          </div>
          <div className="text-center space-y-4 max-w-md px-6">
            <div className="space-y-1">
              <p className="text-lg font-black uppercase tracking-widest text-primary">
                {isSyncingPlan
                  ? 'Synchronizing Upgraded Protocol...'
                  : isDemoInitializing || isSeedingDemo
                  ? 'Building Demo Environment...'
                  : 'Synchronizing Secure Hub...'}
              </p>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">
                System Architecture Optimization in Progress
              </p>
            </div>

            {/* Developer Debug Indicator - only rendered client-side to prevent hydration mismatch */}
            {mounted && (
              <div className="flex flex-wrap justify-center gap-2 pt-4">
                {[
                  { label: 'Auth', val: isAuthResolved, inverse: true },
                  { label: 'User', val: isUserLoading },
                  { label: 'Profile', val: !!userProfile, inverse: true },
                  { label: 'Teams', val: isTeamsLoading },
                  { label: 'Plan', val: isSyncingPlan },
                  { label: 'Demo', val: isDemoInitializing || isSeedingDemo }
                ].map(f => (
                  <div key={f.label} className={cn(
                    "px-2 py-1 rounded text-[8px] font-black uppercase border transition-colors",
                    (f.inverse ? !f.val : f.val) ? "bg-amber-500/10 border-amber-500/50 text-amber-600 animate-pulse" : "bg-primary/5 border-primary/10 text-primary/40"
                  )}>
                    {f.label}
                  </div>
                ))}
              </div>
            )}

            {(isDemoInitializing || isSeedingDemo) && (
              <p className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-xl border border-dashed">
                Seeding tactical data — this takes a few seconds to verify integrity.
              </p>
            )}

            {mounted && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="mt-6 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-all"
                onClick={() => setLoadingTimedOut(true)}
              >
                Bypass Synchronization Gate
              </Button>
            )}
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
        <StripePaywall />
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