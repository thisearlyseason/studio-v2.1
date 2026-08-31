"use client";

import React, { useState, useEffect, memo, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  CalendarDays, 
  MessageCircle, 
  FolderClosed, 
  Settings,
  ChevronDown,
  PlusCircle,
  Trophy,
  Bell,
  Lock,
  Dumbbell,
  CreditCard,
  Building,
  ChevronRight,
  Shield,
  BookOpen,
  Baby,
  UserPlus,
  Star,
  HandHelping,
  PiggyBank,
  Package,
  MapPin,
  Calendar as CalendarIcon,
  PenTool,
  ShieldCheck,
  Terminal,
  Activity,
  Table as TableIcon,
  Plus,
  Layout,
  Zap,
  CheckCircle2,
  Home,
  Users,
  Menu,
  MoreHorizontal,
  Radio,
  LogOut,
  Trash2,
  UserX,
  ShieldAlert,
  User,
  Medal,
  Copy,
  Download,
  Share,
  X,
  Clock3
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTrialCountdown } from '@/lib/trial-countdown';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useTeam, Team } from '@/components/providers/team-provider';
import { CreateAlertButton, AlertsHistoryDialog } from '@/components/layout/AlertOverlay';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Sidebar, 
  SidebarContent, 
  SidebarFooter, 
  SidebarHeader, 
  SidebarMenu, 
  SidebarMenuButton, 
  SidebarMenuItem, 
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger
} from "@/components/ui/sidebar";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import BrandLogo from '@/components/BrandLogo';
import { BetaNotificationBanner } from '@/components/layout/BetaNotificationBanner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { signOut } from 'firebase/auth';
import { useAuth } from '@/firebase';
import { toast } from '@/hooks/use-toast';
import { hasCoachesCornerEntitlement } from '@/lib/coaches-corner-entitlement';
import { clearBrowserSession } from '@/lib/client-auth';
import {
  authorizeDashboardRoute,
  dashboardHomePresentation,
  showDashboardCoordinationTab,
} from '@/lib/dashboard-route-policy';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const coordinationTabs = [
  { name: 'Feed', href: '/feed', icon: Radio, pro: true },
  { name: 'Schedule', href: '/events', icon: CalendarDays, pro: false },
  { name: 'Roster', href: '/roster', icon: Users, pro: false },
  { name: 'Practice', href: '/practice', icon: Dumbbell, pro: true },
  { name: 'Competition Hub', href: '/competition', icon: Medal, pro: false },
  { name: 'Scorekeeping', href: '/games', icon: Trophy, pro: false },
  { name: 'Volunteer', href: '/volunteers', icon: HandHelping, pro: true },
  { name: 'Fundraising', href: '/fundraising', icon: PiggyBank, pro: true },
  { name: 'Team Chat', href: '/chats', icon: MessageCircle, pro: false },
  { name: 'Library', href: '/files', icon: FolderClosed, pro: false },
];

const adminTabs = [
  { name: 'Coach Tools', href: '/coaches-corner', icon: PenTool, pro: true, desc: 'Waivers and documents' },
  { name: 'Facilities', href: '/facilities', icon: MapPin, pro: false, desc: 'Venues and fields' },
  { name: 'Equipment', href: '/equipment', icon: Package, pro: true, desc: 'Team inventory' },
];

const SidebarItem = memo(({ tab, isActive, isLocked }: { tab: any, isActive: boolean, isLocked: boolean }) => {
  const Icon = tab.icon;
  const { purchasePro } = useTeam();
  
  const handleClick = (e: React.MouseEvent) => {
    if (isLocked) {
      e.preventDefault();
      purchasePro();
    }
  };

  return (
    <SidebarMenuItem>
      <SidebarMenuButton 
        asChild 
        isActive={isActive}
        onClick={handleClick}
        className={cn(
          "h-12 px-4 rounded-2xl transition-all font-black text-xs uppercase tracking-widest",
          isActive 
            ? "bg-primary/10 text-primary shadow-none hover:bg-primary/10 hover:text-primary" 
            : "text-foreground hover:bg-muted/80 hover:text-primary",
          isLocked && "opacity-80"
        )}
      >
        <Link href={isLocked ? '#' : tab.href} className="flex items-center justify-between w-full">
          <div className="flex items-center gap-4">
            <Icon className={cn("h-5 w-5", isActive ? "stroke-[3px] text-primary" : "stroke-[2.5]")} />
            <span className={cn(isActive && "text-primary")}>{tab.name}</span>
          </div>
          {isLocked && <Lock className="h-3 w-3 opacity-40" />}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
});
SidebarItem.displayName = "SidebarItem";

function SquadSwitcherMenu({ activeTeam, teams, setActiveTeam, router, user, isSchoolMode, isPrimaryClubAuthority, isEliteAccount, isEliteClubMode, onClose }: {
  activeTeam: any; teams: any[]; setActiveTeam: any; router: any; user: any;
  isSchoolMode?: boolean; isPrimaryClubAuthority?: boolean; isEliteAccount?: boolean; isEliteClubMode?: boolean;
  onClose?: () => void;
}) {
  const primarySchoolTeam = isSchoolMode ? teams.find(t => t.type === 'school') : null;
  const squadList = isSchoolMode ? teams.filter(t => t.type !== 'school') : teams;

  const squadTier = (team: any, forceSubSquad = false): 'primary' | 'pro' | 'starter' => {
    // Sub-squads (created under a club/school hub) should NOT inherit the hub's 'primary' tier.
    // Only the hub-owner's TOP-LEVEL elite/league plan team gets 'primary' — and only in non-hub view.
    const isSubSquad = forceSubSquad || !!(team.clubId || team.schoolId || team.hubOwnerUserId);
    if (!isSubSquad && ['elite', 'league'].includes(team.planId || '') && team.ownerUserId === user?.id) return 'primary';
    if (team.isPro || ['team', 'squad_pro', 'squad_pro_demo', 'elite', 'league'].includes(team.planId || '')) return 'pro';
    return 'starter';
  };

  // Compact squad row — ~44px tall, fits 3–4 in a tight scroll area
  const SquadRow = ({ team, isActive, onClick, tierOverride }: { team: any; isActive: boolean; onClick: () => void; tierOverride?: 'primary' | 'pro' | 'starter' }) => {
    const tier = tierOverride ?? squadTier(team);
    return (
      <button
        onClick={onClick}
        className={cn(
          "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all text-left",
          isActive ? "bg-primary/10 text-primary" : "hover:bg-muted/50"
        )}
      >
        <Avatar className="h-7 w-7 rounded-md shrink-0 ring-1 ring-black/5">
          {team.teamLogoUrl ? (
            <AvatarImage src={team.teamLogoUrl} className="object-cover" />
          ) : null}
          <AvatarFallback className={cn("font-black text-[10px]", isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground")}>
            {team.name?.[0]?.toUpperCase() || 'T'}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="font-black text-xs truncate uppercase tracking-tight leading-tight">{team.name}</span>
          <div className="flex items-center gap-1 mt-0.5">
            {tier === 'primary' && (
              <>
                <span className="text-[8px] font-black text-primary uppercase tracking-wider">ELITE PRO</span>
                <span className="text-[7px] font-black bg-black text-white px-1 py-0.5 rounded-sm uppercase tracking-wider flex items-center gap-0.5">
                  <Star className="h-1.5 w-1.5 fill-current" /> PRIMARY
                </span>
              </>
            )}
            {tier === 'pro' && <span className="text-[8px] font-black text-primary uppercase tracking-wider">ELITE PRO</span>}
            {tier === 'starter' && <span className="text-[8px] font-medium text-muted-foreground uppercase tracking-wider">STARTER</span>}
          </div>
        </div>
        {isActive && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
      </button>
    );
  };

  // Institution card (school or elite club) — larger, prominent
  const InstitutionCard = ({ name, subtitle, initial, isActive, onClick, variant }: {
    name: string; subtitle: string; initial: string; isActive: boolean; onClick: () => void; variant: 'school' | 'elite';
  }) => (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-xl cursor-pointer border-2 transition-all text-left",
        isActive ? "bg-primary/10 border-primary/40 text-primary" : "bg-muted/30 border-muted hover:bg-primary/5 hover:border-primary/20"
      )}
    >
      <div className={cn(
        "h-10 w-10 rounded-xl flex items-center justify-center shrink-0 font-black text-base",
        isActive
          ? variant === 'elite' ? "bg-gradient-to-br from-amber-500 to-primary text-white" : "bg-primary text-white"
          : variant === 'elite' ? "bg-amber-100 text-amber-700" : "bg-primary/15 text-primary"
      )}>
        {initial}
      </div>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="font-black text-sm truncate uppercase tracking-tight">{name}</span>
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest">{subtitle}</span>
      </div>
      {isActive && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
    </button>
  );

  return (
    <DropdownMenuContent align="start" className="w-72 p-2 rounded-2xl shadow-2xl bg-white max-h-[80vh] overflow-y-auto">

      {/* SCHOOL MODE */}
      {isSchoolMode ? (
        <>
          {primarySchoolTeam && (
            <>
              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground px-2 pt-1.5 pb-1">School</p>
              <InstitutionCard
                name={user?.schoolName || user?.clubName || primarySchoolTeam.name}
                subtitle={user?.institutionTitle || 'Athletic Director'}
                initial={(user?.schoolName || user?.clubName || primarySchoolTeam.name || 'S')[0]}
                isActive={activeTeam?.type === 'school'}
                onClick={() => { setActiveTeam(primarySchoolTeam); router.push('/club'); onClose?.(); }}
                variant="school"
              />
            </>
          )}
          <DropdownMenuSeparator className="my-1.5" />
          <p className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground px-2 pb-1">Squads ({squadList.length})</p>
          <div className="overflow-y-auto max-h-[160px] overscroll-contain space-y-0.5">
            {squadList.length === 0
              ? <p className="text-xs text-muted-foreground text-center py-3">No squads assigned yet.</p>
              : squadList.map(team => (
                <SquadRow
                  key={team.id}
                  team={team}
                  isActive={activeTeam?.id === team.id && activeTeam?.type !== 'school'}
                  onClick={() => { setActiveTeam(team); router.push('/dashboard'); onClose?.(); }}
                />
              ))
            }
          </div>
          <DropdownMenuSeparator className="my-1.5" />
          {isPrimaryClubAuthority && (
            <DropdownMenuItem onClick={() => router.push('/club')} className="p-2.5 cursor-pointer rounded-xl font-black text-xs gap-3 uppercase tracking-widest bg-primary/5 text-primary hover:bg-primary hover:text-white transition-all">
              <Building className="h-3.5 w-3.5" /> School Hub
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator className="my-1.5" />
          <DropdownMenuItem onClick={() => router.push('/team')} className="p-2.5 cursor-pointer rounded-xl font-black text-xs gap-3 uppercase tracking-widest">
            <Settings className="h-3.5 w-3.5 text-primary" /> View Team Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push('/teams/join')} className="p-2.5 cursor-pointer rounded-xl font-black text-xs gap-3 uppercase tracking-widest">
            <UserPlus className="h-3.5 w-3.5 text-primary" /> Portals
          </DropdownMenuItem>
        </>
      ) : (
        /* NON-SCHOOL MODE */
        <>
          {isEliteClubMode ? (
            <>
              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground px-2 pt-1.5 pb-1">Club</p>
              <InstitutionCard
                name={user?.clubName || user?.schoolName || 'Elite Club'}
                subtitle={user?.institutionTitle || 'Club Organizer'}
                initial={(user?.clubName || user?.schoolName || 'E')[0]}
                isActive={!activeTeam}
                onClick={() => { setActiveTeam(null); router.push('/club'); onClose?.(); }}
                variant="elite"
              />
              <DropdownMenuSeparator className="my-1.5" />
              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground px-2 pb-1">Sub-Squads ({teams.length})</p>
              <div className="overflow-y-auto max-h-[220px] overscroll-contain space-y-0.5 pr-0.5">
                {teams.length === 0
                  ? <p className="text-xs text-muted-foreground text-center py-3">No squads created yet.</p>
                  : teams.map(team => (
                    <SquadRow
                      key={team.id}
                      team={team}
                      isActive={activeTeam?.id === team.id}
                      tierOverride={squadTier(team, true)}
                      onClick={() => { setActiveTeam(team); router.push('/dashboard'); onClose?.(); }}
                    />
                  ))
                }
              </div>
              <DropdownMenuSeparator className="my-1.5" />
              <DropdownMenuItem onClick={() => router.push('/club')} className="p-2.5 cursor-pointer rounded-xl font-black text-xs gap-3 uppercase tracking-widest bg-primary/5 text-primary hover:bg-primary hover:text-white transition-all">
                <Building className="h-3.5 w-3.5" /> Club Hub
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1.5" />
            </>
          ) : isEliteAccount ? (
            <>
              <DropdownMenuLabel className="text-[9px] font-black uppercase tracking-widest text-muted-foreground px-2 pt-1.5 pb-1">My Squads</DropdownMenuLabel>
              <div className="overflow-y-auto max-h-[180px] overscroll-contain space-y-0.5">
                {teams.map(team => (
                  <SquadRow
                    key={team.id}
                    team={team}
                    isActive={activeTeam?.id === team.id}
                    onClick={() => { setActiveTeam(team); onClose?.(); }}
                  />
                ))}
              </div>
              <DropdownMenuSeparator className="my-1.5" />
            </>
          ) : (
            <>
              <DropdownMenuLabel className="text-[9px] font-black uppercase tracking-widest text-muted-foreground px-2 pt-1.5 pb-1">My Squads</DropdownMenuLabel>
              <div className="overflow-y-auto max-h-[180px] overscroll-contain space-y-0.5">
                {teams.map(team => (
                  <SquadRow
                    key={team.id}
                    team={team}
                    isActive={activeTeam?.id === team.id}
                    tierOverride={squadTier(team, true)}
                    onClick={() => { setActiveTeam(team); onClose?.(); }}
                  />
                ))}
              </div>
              <DropdownMenuSeparator className="my-1.5" />
            </>
          )}

          {/* Footer — always visible */}
          <DropdownMenuItem onClick={() => router.push('/team')} className="p-2.5 cursor-pointer rounded-xl font-black text-xs gap-3 uppercase tracking-widest">
            <Settings className="h-3.5 w-3.5 text-primary" /> View Team Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push('/teams/join')} className="p-2.5 cursor-pointer rounded-xl font-black text-xs gap-3 uppercase tracking-widest">
            <UserPlus className="h-3.5 w-3.5 text-primary" /> Portals
          </DropdownMenuItem>
          <DropdownMenuSeparator className="my-1.5" />
          <DropdownMenuItem onClick={() => router.push('/teams/new?tier=starter')} className="p-2.5 cursor-pointer rounded-xl font-black text-xs gap-3 uppercase tracking-widest">
            <PlusCircle className="h-3.5 w-3.5 text-primary" /> Create Free Team
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push('/teams/new?tier=pro')} className="p-2.5 cursor-pointer rounded-xl font-black text-xs gap-3 uppercase tracking-widest">
            <Zap className="h-3.5 w-3.5 text-amber-500" /> Create Pro Team
          </DropdownMenuItem>
        </>
      )}
    </DropdownMenuContent>
  );
}


export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { 
    activeTeam, setActiveTeam, teams, user, isPro, 
    isPrimaryClubAuthority, isStaff, isParent, isPlayer, hasFeature, alerts,
    unreadAlertsCount, purchasePro, isSchoolMode, isSchoolAdmin, isEliteAccount, isEliteClubMode,
    deleteTeam, deleteAccount, isSuperAdmin
  } = useTeam();
  const auth = useAuth();
  const hasDemoBanner = !!user?.isDemo && !user?.isBetaTester;
  const canAccessCoachesCorner = hasCoachesCornerEntitlement(activeTeam, isSuperAdmin);
  const isAdminTabLocked = (tab: (typeof adminTabs)[number]) =>
    tab.href === '/coaches-corner'
      ? !canAccessCoachesCorner
      : tab.pro && !isPro;
  const canManageFacilities = isSuperAdmin || !activeTeam || activeTeam.ownerUserId === auth?.currentUser?.uid;
  const [trialNow, setTrialNow] = useState(() => Date.now());
  useEffect(() => {
    if (user?.subscription_status !== 'trialing' || !user?.trial_end) return;
    const timer = window.setInterval(() => setTrialNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [user?.subscription_status, user?.trial_end]);
  const trialCountdown = getTrialCountdown({
    subscriptionStatus: user?.subscription_status,
    trialEnd: user?.trial_end,
    now: trialNow,
  });

  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  // Controlled open state for both squad switcher instances
  const [sidebarSwitcherOpen, setSidebarSwitcherOpen] = useState(false);
  const [mobileSwitcherOpen, setMobileSwitcherOpen] = useState(false);

  // PWA Installation Hook State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);
  const [showGeneralInstructions, setShowGeneralInstructions] = useState(false);
  const [installDismissed, setInstallDismissed] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pwa_install_dismissed') === 'true';
    }
    return false;
  });

  const handleDismissInstall = (e: React.MouseEvent) => {
    e.stopPropagation();
    setInstallDismissed(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('pwa_install_dismissed', 'true');
    }
  };

  useEffect(() => {
    // 1. Detect if already in standalone (PWA) mode
    const checkStandalone = () => {
      const isStandaloneMode = 
        window.matchMedia('(display-mode: standalone)').matches || 
        (navigator as any).standalone === true;
      setIsStandalone(isStandaloneMode);
    };
    checkStandalone();

    // 2. Intercept the browser's install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // 3. Detect if user is on iOS
    if (typeof navigator !== 'undefined') {
      const ua = navigator.userAgent.toLowerCase();
      setIsIOS(/iphone|ipad|ipod/.test(ua));
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSInstructions(true);
      return;
    }
    if (!deferredPrompt) {
      setShowGeneralInstructions(true);
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] Install prompt outcome: ${outcome}`);
    setDeferredPrompt(null);
  };

  const showInstallBtn = !isStandalone && !installDismissed;

  const roleNavigationOrder = isParent
    ? ['/events', '/chats', '/files', '/volunteers', '/competition']
    : isPlayer
      ? ['/events', '/chats', '/practice', '/roster']
      : user?.role === 'league_creator'
        ? ['/competition', '/events', '/games', '/roster', '/chats']
        : ['/events', '/roster', '/chats', '/practice', '/games'];

  const navigationPriority = (href: string) => {
    const index = roleNavigationOrder.indexOf(href);
    return index === -1 ? roleNavigationOrder.length : index;
  };

  const filteredCoordTabs = coordinationTabs
    .filter(tab => {
      // Their Competition Hub is rendered directly at /dashboard. Active-team
      // organizers keep team tools, but never receive a duplicate legacy hub link.
      if (!showDashboardCoordinationTab(user?.role, Boolean(activeTeam), tab.name)) return false;

      if (!authorizeDashboardRoute(tab.href, {
        role: user?.role,
        plan_type: user?.plan_type,
        isPrimaryClubAuthority,
      }).allowed) return false;

      // Module Visibility Settings
      if (tab.name === 'Feed' && activeTeam?.features?.feed === false) return false;
      if (tab.name === 'Roster' && activeTeam?.features?.roster === false) return false;
      if (tab.name === 'Practice' && activeTeam?.features?.practice === false) return false;
      if (tab.name === 'Volunteer' && activeTeam?.features?.volunteer === false) return false;
      if (tab.name === 'Fundraising' && activeTeam?.features?.fundraising === false) return false;
      if (tab.href === '/chats' && activeTeam?.features?.tacticalChat === false) return false;
      if (tab.name === 'Library' && activeTeam?.features?.library === false) return false;

      // Feed is filtered by plan/feature
      if (tab.name === 'Feed') return hasFeature?.('live_feed_read') && !(isParent && activeTeam?.parentFeedEnabled === false);
      // Roster: hide for school admins in institution mode (they use the School Hub instead)
      if (tab.name === 'Roster' && isSchoolMode && isPrimaryClubAuthority && activeTeam?.type === 'school') return false;
      // Fundraising: staff-only administrative module — players and parents cannot access it
      if (tab.name === 'Fundraising' && !isStaff) return false;
      return true;
    })
    .map(tab => {
      if (tab.href === '/competition' && isSchoolMode) {
        return { ...tab, name: 'Program League Hub' };
      }
      return tab;
    })
    .sort((a, b) => navigationPriority(a.href) - navigationPriority(b.href));

  const primaryCoordTabs = filteredCoordTabs.slice(0, 5);
  const additionalCoordTabs = filteredCoordTabs.slice(5);

  const filteredAdminTabs = adminTabs.filter(tab => {
    // League creators without a team: show Facilities (free) + Equipment (locked if free)
    if (user?.role === 'league_creator' && !activeTeam) {
      return tab.name === 'Facilities' || tab.name === 'Equipment';
    }
    if (tab.name === 'Facilities' && !canManageFacilities) return false;
    return true;
  });

  // The institution hub is a route-level context. A previously selected squad can
  // remain active for later navigation, but it must not appear selected on the hub.
  const isInstitutionHubRoute = pathname === '/club';

  // School admin in institution mode: show only the institution identity.
  const isSchoolInstitutionMode = isSchoolMode && isPrimaryClubAuthority
    && (isInstitutionHubRoute || !activeTeam || activeTeam?.type === 'school');

  // Club organizers likewise see only the club identity while on the Club Hub.
  const isEliteHubMode = isEliteClubMode && (isInstitutionHubRoute || !activeTeam);

  // Institution authority: based purely on account type, never on which squad is currently active.
  // Used in the More menu so the hub link + squad switcher ALWAYS appear for these users.
  const isInstitutionAuthority = (isSchoolMode && isPrimaryClubAuthority) || isEliteClubMode;

  const bottomNavItems: Array<{
    name: string;
    href: string;
    icon: typeof Home;
    gate?: () => boolean;
  }> = (
    // League creator without a team: only league-related shortcuts
    user?.role === 'league_creator' && !activeTeam
      ? [
          { name: 'Leagues', href: '/dashboard', icon: Medal },
          { name: 'Facilities', href: '/facilities', icon: MapPin },
          { name: 'Hub', href: '/sports-hub', icon: BookOpen },
        ]
      : isSchoolInstitutionMode || isEliteHubMode
        ? [
            { name: 'Overview', href: '/club', icon: Home },
            { name: 'Facilities', href: '/facilities', icon: MapPin },
            { name: 'Leagues', href: '/competition', icon: Medal },
            { name: 'Resources', href: '/sports-hub', icon: BookOpen },
          ]
        : isParent
          ? [
              { name: 'Family', href: '/family', icon: Baby },
              { name: 'Schedule', href: '/calendar', icon: CalendarDays },
              ...(activeTeam?.features?.tacticalChat !== false ? [{ name: 'Chat', href: '/chats', icon: MessageCircle }] : []),
              { name: 'Waivers', href: '/files', icon: ShieldCheck },
            ]
          : isPlayer
            ? [
                { name: 'Home', href: '/dashboard', icon: Home },
                { name: 'Schedule', href: '/calendar', icon: CalendarDays },
                ...(activeTeam?.features?.tacticalChat !== false ? [{ name: 'Chat', href: '/chats', icon: MessageCircle }] : []),
                { name: 'Profile', href: '/roster', icon: User },
              ]
            : [
                { name: 'Home', href: '/dashboard', icon: Home },
                { name: 'Schedule', href: '/events', icon: CalendarDays },
                { name: 'Roster', href: '/roster', icon: Users },
                ...(activeTeam?.features?.tacticalChat !== false ? [{ name: 'Chat', href: '/chats', icon: MessageCircle }] : []),
              ]
  );

  const dashboardHome = dashboardHomePresentation(user?.role, pathname);

  if (!activeTeam && !user) return null;

  const handleLogout = async () => {
    try {
      await clearBrowserSession();
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      toast({ title: "Logout Failed", variant: "destructive" });
    }
  };

  const handleDeleteTeam = async () => {
    if (!activeTeam?.id) return;
    try {
      await deleteTeam(activeTeam.id);
      toast({ title: "Team Deleted", description: "The squad and its data were deleted." });
      window.location.reload();
    } catch (error) {
      toast({ title: "Deletion Failed", variant: "destructive" });
    }
  };

  return (
    <SidebarProvider>
      <div className="flex flex-col h-full w-full bg-background selection:bg-primary/20">
        <div className="flex flex-1 overflow-y-hidden">
          <Sidebar 
            className="border-r bg-white w-72 shrink-0 shadow-sm" 
            collapsible="offcanvas"
            style={hasDemoBanner ? {
              top: '2.25rem',
              height: 'calc(100vh - 2.25rem)'
            } : undefined}
          >
            <SidebarHeader className="p-6 bg-white">
              <BrandLogo variant="light-background" className="h-10 w-44 justify-start mb-10" priority />
              
              <SidebarMenu className="space-y-2 mb-6">
                {/* Dashboard — hidden when AD is in hub/institution mode (no squad selected) */}
              {!isSchoolInstitutionMode && !isEliteHubMode && (
                <SidebarMenuItem>
                  <SidebarMenuButton 
                    asChild 
                    isActive={dashboardHome.active}
                    className={cn(
                      "h-12 px-4 rounded-2xl transition-all font-black text-xs uppercase tracking-widest",
                      dashboardHome.active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/80 hover:text-primary"
                    )}
                  >
                    <Link href={dashboardHome.href}>
                      <Layout className={cn("h-5 w-5 mr-3", dashboardHome.active ? "text-primary stroke-[3px]" : "text-foreground")} />{dashboardHome.label}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

                {isParent && (
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild 
                      isActive={pathname === '/family'} 
                      className={cn(
                        "h-12 px-4 rounded-2xl transition-all font-black text-xs uppercase tracking-widest",
                        pathname === '/family' ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/80 hover:text-primary"
                      )}
                    >
                      <Link href="/family">
                        <Baby className={cn("h-5 w-5 mr-3", pathname === '/family' ? "text-primary stroke-[3px]" : "text-foreground")} />Family Hub
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {hasFeature?.('club_management') && (
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild 
                      isActive={pathname === '/club'} 
                      className={cn(
                        "h-12 px-4 rounded-2xl transition-all font-black text-xs uppercase tracking-widest",
                        pathname === '/club' ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/80 hover:text-primary"
                      )}
                    >
                      <Link href="/club">
                        <Building className={cn("h-5 w-5 mr-3", pathname === '/club' ? "text-primary stroke-[3px]" : "text-foreground")} />
                        {isSchoolMode ? 'School Hub' : 'Club Hub'}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>

              {user?.role === 'league_creator' && !activeTeam ? (
                /* League Creator — no team yet: offer Start / Join a Team */
                <div className="w-full space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground/60 px-1">Optional — Add a Team</p>
                  <div className="flex gap-2">
                    <Link href="/teams/new" className="flex-1">
                      <div className="flex items-center gap-2 h-10 px-3 rounded-xl border-2 border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/40 transition-all cursor-pointer group">
                        <PlusCircle className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-primary truncate">Start Team</span>
                      </div>
                    </Link>
                    <Link href="/teams/join" className="flex-1">
                      <div className="flex items-center gap-2 h-10 px-3 rounded-xl border-2 border-muted-foreground/15 bg-muted/30 hover:bg-muted/60 hover:border-muted-foreground/30 transition-all cursor-pointer group">
                        <UserPlus className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground truncate">Join Team</span>
                      </div>
                    </Link>
                  </div>
                </div>
              ) : user?.role === 'league_creator' && activeTeam ? (
                /* League Creator — has a team: show normal squad switcher */
                <DropdownMenu open={sidebarSwitcherOpen} onOpenChange={setSidebarSwitcherOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between h-14 px-3 border-2 border-muted-foreground/10 bg-background rounded-2xl shadow-sm hover:bg-muted/50 transition-all">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-9 w-9 rounded-xl border-2 border-background shadow-md">
                          <AvatarImage src={activeTeam?.teamLogoUrl} className="object-cover" />
                          <AvatarFallback className="hero-gradient text-white font-black text-xs">{activeTeam?.name?.[0] || 'T'}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col min-w-0">
                          <span className="font-black text-sm truncate uppercase tracking-tight text-foreground">{activeTeam?.name || 'Select Squad'}</span>
                          <span className="text-[9px] font-bold text-primary uppercase tracking-widest truncate">League Organizer</span>
                        </div>
                      </div>
                      <ChevronDown className="h-4 w-4 opacity-40 text-foreground shrink-0" />
                    </Button>
                  </DropdownMenuTrigger>
                  <SquadSwitcherMenu activeTeam={activeTeam} teams={teams} setActiveTeam={setActiveTeam} router={router} user={user} isSchoolMode={isSchoolMode} isPrimaryClubAuthority={isPrimaryClubAuthority} isEliteAccount={isEliteAccount} isEliteClubMode={isEliteClubMode} onClose={() => setSidebarSwitcherOpen(false)} />
                </DropdownMenu>
              ) : (
                <DropdownMenu open={sidebarSwitcherOpen} onOpenChange={setSidebarSwitcherOpen}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between h-14 px-3 border-2 border-muted-foreground/10 bg-background rounded-2xl shadow-sm hover:bg-muted/50 transition-all">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-9 w-9 rounded-xl border-2 border-background shadow-md">
                          {isSchoolMode && isPrimaryClubAuthority && activeTeam?.type === 'school' ? (
                            /* School institution mode — gradient shield */
                            <AvatarFallback className="hero-gradient text-white font-black text-xs">
                              {(user?.schoolName || user?.clubName || 'S')[0]}
                            </AvatarFallback>
                          ) : isEliteHubMode ? (
                            /* Elite Club hub mode — amber/primary gradient shield */
                            <AvatarFallback className="bg-gradient-to-br from-amber-500 to-primary text-white font-black text-xs">
                              {(user?.clubName || user?.schoolName || 'E')[0]}
                            </AvatarFallback>
                          ) : isSchoolMode && isPrimaryClubAuthority ? (
                            /* School squad mode — show the squad's logo */
                            <>
                              <AvatarImage src={activeTeam?.teamLogoUrl} className="object-cover" />
                              <AvatarFallback className="bg-primary/15 text-primary font-black text-xs">{activeTeam?.name?.[0] || 'T'}</AvatarFallback>
                            </>
                          ) : isEliteClubMode ? (
                            /* Elite Club squad mode — squad logo */
                            <>
                              <AvatarImage src={activeTeam?.teamLogoUrl} className="object-cover" />
                              <AvatarFallback className="bg-amber-100 text-amber-700 font-black text-xs">{activeTeam?.name?.[0] || 'T'}</AvatarFallback>
                            </>
                          ) : (
                            <>
                              <AvatarImage src={activeTeam?.teamLogoUrl} className="object-cover" />
                              <AvatarFallback className="hero-gradient text-white font-black text-xs">{activeTeam?.name?.[0] || 'T'}</AvatarFallback>
                            </>
                          )}
                        </Avatar>
                        <div className="flex flex-col min-w-0">
                          {isSchoolMode && isPrimaryClubAuthority ? (
                            <>
                              <span className="font-black text-sm truncate uppercase tracking-tight text-foreground">
                                {user?.schoolName || user?.clubName || 'School Hub'}
                              </span>
                              {!isSchoolInstitutionMode && activeTeam && (
                                <span className="text-[9px] font-bold text-primary uppercase tracking-widest truncate">
                                  ↳ {activeTeam.name}
                                </span>
                              )}
                            </>
                          ) : isEliteClubMode ? (
                            <>
                              <span className="font-black text-sm truncate uppercase tracking-tight text-foreground">
                                {user?.clubName || user?.schoolName || 'Elite Club'}
                              </span>
                              {!isEliteHubMode && activeTeam && (
                                <span className="text-[9px] font-bold text-primary uppercase tracking-widest truncate">
                                  ↳ {activeTeam.name}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="font-black text-sm truncate uppercase tracking-tight text-foreground">
                              {activeTeam?.name || 'Select Squad'}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronDown className="h-4 w-4 opacity-40 text-foreground shrink-0" />
                    </Button>
                  </DropdownMenuTrigger>
                  <SquadSwitcherMenu activeTeam={activeTeam} teams={teams} setActiveTeam={setActiveTeam} router={router} user={user} isSchoolMode={isSchoolMode} isPrimaryClubAuthority={isPrimaryClubAuthority} isEliteAccount={isEliteAccount} isEliteClubMode={isEliteClubMode} onClose={() => setSidebarSwitcherOpen(false)} />
                </DropdownMenu>
              )}
            </SidebarHeader>

            <SidebarContent className="flex-1 overflow-y-auto px-4 py-2 bg-white">
              {/* School institution mode OR Elite Hub mode: hide all nav items */}
              {(!isSchoolInstitutionMode && !isEliteHubMode) && (
                <SidebarMenu className="space-y-6">
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-primary px-2 mb-2">Your Main Tools</p>
                    {primaryCoordTabs.map(tab => <SidebarItem key={tab.name} tab={tab} isActive={pathname === tab.href} isLocked={tab.pro && !isPro} />)}
                  </div>
                  {isStaff && (
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground px-2 mb-2">Management</p>
                      {filteredAdminTabs.map(tab => <SidebarItem key={tab.name} tab={tab} isActive={pathname === tab.href} isLocked={isAdminTabLocked(tab)} />)}
                    </div>
                  )}
                  {additionalCoordTabs.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground/70 px-2 mb-2">More Tools</p>
                      {additionalCoordTabs.map(tab => <SidebarItem key={tab.name} tab={tab} isActive={pathname === tab.href} isLocked={tab.pro && !isPro} />)}
                    </div>
                  )}
                </SidebarMenu>
              )}
              {(isSchoolInstitutionMode || isEliteHubMode) && (
                <div className="px-4 py-6 text-center space-y-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground/50">Select a squad above to open its team tools</p>
                </div>
              )}
            </SidebarContent>

            <SidebarFooter className="p-4 border-t bg-white space-y-3">

              {/* ── Pro Upgrade Banner ── show for all non-Pro users */}
              {trialCountdown.active && (
                <Link
                  href="/dashboard/billing"
                  className="block w-full text-left rounded-xl border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all"
                >
                  <div className="p-3 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-primary text-white flex items-center justify-center shrink-0">
                      <Clock3 className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-primary leading-none mb-0.5">Pro trial active</p>
                      <p className="text-[9px] font-semibold text-muted-foreground truncate leading-none">{trialCountdown.days}d {trialCountdown.hours}h remaining</p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0" />
                  </div>
                </Link>
              )}
              {!isPro && !trialCountdown.active && (
                <button
                  onClick={purchasePro}
                  className="w-full text-left group relative overflow-hidden rounded-xl border border-black/10 bg-black hover:bg-black/90 transition-all active:scale-[0.98] shadow-md"
                >
                  <div className="p-3 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-primary text-white flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <Trophy className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white leading-none mb-0.5">Upgrade to Pro</p>
                      <p className="text-[9px] font-semibold text-white/50 truncate leading-none">Unlock all features</p>
                    </div>
                    <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>
              )}
              <div className={cn("flex items-center gap-2", showInstallBtn ? "flex-col" : "flex-row")}>
              <Link href="/teams/join" className={cn("block group", showInstallBtn ? "w-full" : "flex-1")} title="Join & Invite">
                <div className={cn("flex items-center gap-3 rounded-2xl border-2 border-primary/20 bg-primary/10 hover:bg-primary/15 transition-all", showInstallBtn ? "w-full px-4 py-3" : "justify-center p-2.5")}>
                  <div className="p-2 rounded-xl bg-primary text-white shrink-0 shadow-md">
                    <UserPlus className="h-4 w-4" />
                  </div>
                  <div className={cn("flex flex-col min-w-0", !showInstallBtn && "hidden")}>
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary leading-none">Join &amp; Invite</span>
                    <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-tight mt-1 truncate">Players, teams &amp; competition links</span>
                  </div>
                  <ChevronRight className={cn("h-4 w-4 text-primary shrink-0", showInstallBtn ? "ml-auto" : "hidden")} />
                </div>
              </Link>

              {/* Sports Hub Link */}
              <Link href="/sports-hub" className={cn("block group", showInstallBtn ? "w-full" : "flex-1")} title="Sports Hub">
                <div className={cn("flex items-center gap-3 rounded-2xl border border-primary/15 bg-primary/5 hover:bg-primary/10 active:scale-95 transition-all", showInstallBtn ? "w-full px-4 py-3" : "justify-center p-2.5")}>
                  <div className="p-2 rounded-xl hero-gradient text-white shrink-0 shadow-md shadow-primary/10 group-hover:scale-105 transition-transform">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div className={cn("flex flex-col min-w-0", !showInstallBtn && "hidden")}>
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary leading-none">Sports Hub</span>
                    <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-tight mt-1 truncate">
                      Articles, drills &amp; resources
                    </span>
                  </div>
                </div>
              </Link>
              </div>

              {/* PWA Install Button */}
              {showInstallBtn && (
                <div className="relative group/install">
                  <button
                    onClick={handleInstallClick}
                    className="w-full flex items-center justify-center p-2.5 rounded-2xl border border-dashed border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 active:scale-95 transition-all text-left group"
                  >
                    <div className="p-2 rounded-xl bg-primary text-white shrink-0 group-hover:scale-105 transition-transform shadow-md shadow-primary/10">
                      <Download className="h-4 w-4" />
                    </div>
                    <span className="sr-only">Install App</span>
                  </button>
                  <button
                    onClick={handleDismissInstall}
                    aria-label="Dismiss install prompt"
                    className="absolute top-1/2 right-1 -translate-y-1/2 p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/5 transition-all opacity-0 group-hover/install:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </SidebarFooter>
          </Sidebar>

          <div className="flex flex-col flex-1 min-h-0">
            <header className="sticky top-0 z-40 w-full bg-background/80 backdrop-blur-md border-b h-16 md:h-20 flex items-center px-4 md:px-10 justify-between text-foreground">
              <div className="flex items-center gap-4">
                <div className="md:hidden">
                  {/* Show squad switcher on mobile for all roles except league creator with no team */}
                  {!(user?.role === 'league_creator' && !activeTeam) && (
                    <DropdownMenu open={mobileSwitcherOpen} onOpenChange={setMobileSwitcherOpen}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Switch squad"
                              className="h-10 w-10 rounded-2xl hover:bg-primary/5 text-primary relative transition-all active:scale-95 border-2 border-primary/10"
                            >
                              <Zap className="h-5 w-5 fill-current" />
                            </Button>
                          </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Switch Squad</TooltipContent>
                      </Tooltip>
                      <SquadSwitcherMenu activeTeam={activeTeam} teams={teams} setActiveTeam={setActiveTeam} router={router} user={user} isSchoolMode={isSchoolMode} isPrimaryClubAuthority={isPrimaryClubAuthority} isEliteAccount={isEliteAccount} isEliteClubMode={isEliteClubMode} onClose={() => setMobileSwitcherOpen(false)} />
                    </DropdownMenu>
                  )}
                </div>
                <div className="hidden md:block">
                  <h2 className="text-xl lg:text-2xl font-black uppercase tracking-tighter text-foreground">
                    {pathname === '/dashboard' ? dashboardHome.label :
                     user?.role === 'league_creator' && pathname === '/competition' ? 'Competition Hub' :
                     (pathname === '/leagues' && isSchoolMode ? 'Programs' : 
                      pathname === '/club' ? (isSchoolMode ? 'School Hub' : 'Club Hub') :
                      filteredCoordTabs.find(t => t.href === pathname)?.name || adminTabs.find(t => t.href === pathname)?.name || 'Dashboard')}
                  </h2>
                </div>
              </div>
              <div className="md:hidden"><BrandLogo variant="light-background" className="h-6 w-28" /></div>
              <div className="flex items-center gap-2 md:gap-3">
                {isStaff && <CreateAlertButton />}
                <AlertsHistoryDialog>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Open alerts${unreadAlertsCount > 0 ? `, ${unreadAlertsCount} unread` : ''}`}
                    className="h-10 w-10 md:h-11 md:w-11 rounded-2xl hover:bg-primary/5 text-foreground relative transition-all active:scale-95"
                  >
                    <Bell className="h-5 w-5" />
                    {unreadAlertsCount > 0 && (
                      <span className="absolute top-1 right-1 h-4 w-4 bg-primary text-[8px] font-black text-white rounded-full border-2 border-background flex items-center justify-center animate-pulse shadow-[0_0_10px_rgba(255,0,0,0.5)]">
                        {unreadAlertsCount}
                      </span>
                    )}
                  </Button>
                </AlertsHistoryDialog>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      aria-label="Open account menu"
                      className="hidden sm:block focus:outline-none flex items-center gap-2 group"
                    >
                      <Avatar className="h-8 w-8 md:h-10 md:w-10 border-2 border-background shadow-md transition-transform group-hover:scale-105 active:scale-95">
                        <AvatarImage src={user?.avatar} />
                        <AvatarFallback className="font-black text-xs">{user?.name?.[0]}</AvatarFallback>
                      </Avatar>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64 p-2 rounded-2xl shadow-2xl bg-white border-2">
                    <DropdownMenuLabel className="flex flex-col p-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border shadow-sm">
                          <AvatarImage src={user?.avatar} />
                          <AvatarFallback className="font-black text-xs">{user?.name?.[0]}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col min-w-0">
                          <span className="font-black text-sm uppercase tracking-tight truncate">{user?.name}</span>
                          {isPrimaryClubAuthority && (user?.schoolName || user?.clubName) ? (
                            <span className="text-[9px] text-primary font-black uppercase tracking-widest truncate">
                              {user.institutionTitle || 'Athletic Director'} · {user.schoolName || user.clubName}
                            </span>
                          ) : (
                            <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest truncate">{user?.email}</span>
                          )}
                        </div>
                      </div>
                    </DropdownMenuLabel>
                    
                    <DropdownMenuSeparator className="my-1 mx-2" />
                    
                    <DropdownMenuItem onClick={() => router.push('/settings')} className="p-3 cursor-pointer rounded-xl font-black text-xs gap-3 uppercase tracking-widest">
                      <User className="h-4 w-4 text-primary" /> Profile Settings
                    </DropdownMenuItem>

                    {isSuperAdmin && (
                      <DropdownMenuItem onClick={() => router.push('/admin')} className="p-3 cursor-pointer rounded-xl font-black text-xs gap-3 uppercase tracking-widest text-primary focus:text-primary">
                        <ShieldCheck className="h-4 w-4" /> Go to Admin Page
                      </DropdownMenuItem>
                    )}
                    
                    <DropdownMenuItem onClick={() => router.push('/how-to')} className="p-3 cursor-pointer rounded-xl font-black text-xs gap-3 uppercase tracking-widest">
                      <BookOpen className="h-4 w-4 text-primary" /> Help Guide
                    </DropdownMenuItem>

                    <DropdownMenuSeparator className="my-1 mx-2" />

                    {isStaff && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="p-3 cursor-pointer rounded-xl font-black text-xs gap-3 uppercase tracking-widest text-destructive hover:bg-destructive/5 hover:text-destructive focus:bg-destructive/5 focus:text-destructive">
                            <ShieldAlert className="h-4 w-4" /> Delete Team
                          </DropdownMenuItem>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0">
                          <div className="h-2 bg-destructive w-full" />
                          <div className="p-8 space-y-6">
                            <AlertDialogHeader>
                              <AlertDialogTitle className="text-2xl font-black uppercase tracking-tight">Delete Team</AlertDialogTitle>
                              <AlertDialogDescription className="text-sm font-medium text-foreground/70">
                                This permanently deletes <strong>{activeTeam?.name}</strong> and its rosters, schedules, files, and reports. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="pt-4">
                            <AlertDialogCancel className="rounded-xl h-14 font-black uppercase text-[10px] tracking-widest">Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={handleDeleteTeam} className="rounded-xl h-14 bg-destructive hover:bg-destructive/90 text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-destructive/20">
                                Confirm Deletion
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </div>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="p-3 cursor-pointer rounded-xl font-black text-xs gap-3 uppercase tracking-widest text-destructive hover:bg-destructive/5 hover:text-destructive focus:bg-destructive/5 focus:text-destructive">
                          <UserX className="h-4 w-4" /> Delete Account
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0">
                        <div className="h-2 bg-destructive w-full" />
                        <div className="p-8 space-y-6">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-2xl font-black uppercase tracking-tight">Delete Account</AlertDialogTitle>
                            <AlertDialogDescription className="text-sm font-medium text-foreground/70">
                              Your account will be scheduled for deletion and retained for seven days before it is permanently removed. Transfer or delete any teams and leagues you own first.
                              <br /><br />
                              <span className="font-bold text-destructive">This signs you out and begins the seven-day deletion period.</span>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="pt-4">
                            <AlertDialogCancel className="rounded-xl h-14 font-black uppercase text-[10px] tracking-widest">Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={deleteAccount} className="rounded-xl h-14 bg-destructive hover:bg-destructive/90 text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-destructive/20">
                              Delete Account
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </div>
                      </AlertDialogContent>
                    </AlertDialog>

                    <DropdownMenuSeparator className="my-1 mx-2" />
                    
                    <DropdownMenuItem onClick={handleLogout} className="p-3 cursor-pointer rounded-xl font-black text-xs gap-3 uppercase tracking-widest text-muted-foreground group">
                      <LogOut className="h-4 w-4 transition-transform group-hover:translate-x-1" /> Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>

            {/* Banner + scrollable main in their own flex column so the banner
                expands naturally and never gets clipped by overflow:hidden */}
            <div className="flex flex-col flex-1 min-h-0 overflow-x-hidden">
              <BetaNotificationBanner />
              <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-10 max-w-7xl mx-auto w-full custom-scrollbar pb-32 md:pb-10 text-foreground">
                {children}
              </main>
            </div>

            <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-[95vw]">
              <nav className="flex items-center gap-1 bg-white/95 backdrop-blur-md border rounded-full px-2 py-2 shadow-2xl ring-1 ring-black/5 overflow-x-auto no-scrollbar">
                {bottomNavItems.map((item) => {
                  if (item.gate && !item.gate()) return null;
                  const isActive = pathname === item.href;
                  return (
                    <Link 
                      key={item.name} 
                      href={item.href} 
                      className={cn(
                        "flex flex-col items-center justify-center w-14 h-12 rounded-full transition-all duration-300",
                        isActive ? "bg-primary text-white shadow-lg shadow-primary/20 scale-105" : "text-muted-foreground hover:text-primary hover:bg-primary/5"
                      )}
                    >
                      <item.icon className={cn("h-5 w-5", isActive ? "stroke-[3px]" : "stroke-[2.5]")} />
                      <span className={cn(
                        "text-[7px] font-black uppercase tracking-tighter mt-0.5",
                        isActive ? "text-white" : "text-muted-foreground"
                      )}>
                        {item.name}
                      </span>
                    </Link>
                  );
                })}

                <button 
                  onClick={() => setIsMoreMenuOpen(true)}
                  className="flex flex-col items-center justify-center w-14 h-12 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all relative"
                >
                  <Menu className="h-5 w-5 stroke-[2.5]" />
                  {unreadAlertsCount > 0 && (
                    <span className="absolute top-1 right-2 h-3.5 w-3.5 bg-primary text-[7px] font-black text-white rounded-full border border-white flex items-center justify-center" >
                      {unreadAlertsCount}
                    </span>
                  )}
                  <span className="text-[7px] font-black uppercase tracking-tighter mt-0.5">More</span>
                </button>

                <Sheet open={isMoreMenuOpen} onOpenChange={setIsMoreMenuOpen}>
                  <SheetContent side="bottom" className="rounded-t-[3rem] p-0 border-none shadow-2xl h-[80vh] flex flex-col bg-white">
                    <div className="h-2 bg-primary w-full shrink-0" />
                    <SheetHeader className="px-8 pt-6 pb-4 text-center">
                      <SheetTitle className="text-2xl font-black uppercase tracking-tight text-foreground">All Tools</SheetTitle>
                      <SheetDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">
                        {isInstitutionAuthority ? (isSchoolMode ? 'School and squad navigation' : 'Club and squad navigation') : 'Team navigation'}
                      </SheetDescription>
                    </SheetHeader>
                    <ScrollArea className="flex-1 px-6 pb-10">
                      <div className="space-y-6 pt-2">

                        {/* ── INSTITUTION AUTHORITY BLOCK ─────────────────────────────────
                             Always shown when user is a school admin or elite club organizer,
                             regardless of which squad is currently active. */}
                        {isInstitutionAuthority && (
                          <div className="space-y-2">
                            {/* Hub link — clears activeTeam so hub shows in institution mode */}
                            <button
                              onClick={() => { setActiveTeam(null as any); router.push('/club'); setIsMoreMenuOpen(false); }}
                              className={cn(
                                "w-full flex items-center justify-between p-4 rounded-2xl border bg-primary text-white transition-all active:scale-[0.98]",
                                pathname === '/club' ? "ring-2 ring-white ring-offset-2 ring-offset-primary" : ""
                              )}
                            >
                              <div className="flex items-center gap-4">
                                <div className="bg-white/20 p-2 rounded-xl text-white">
                                  <Building className="h-5 w-5" />
                                </div>
                                <div className="flex flex-col text-left">
                                  <span className="text-xs font-black uppercase tracking-widest">{isSchoolMode ? 'School Hub' : 'Club Hub'}</span>
                                  <span className="text-[8px] font-bold text-white/60 uppercase">Organization overview</span>
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 text-white/40" />
                            </button>
                          </div>
                        )}

                        {/* Regular multi-team switcher removed — lightning bolt top-left handles squad switching */}


                        {/* ── SQUAD OPERATIONAL NAV ───────────────────────────────────────
                             Only shown when a real squad (not the school/hub record) is active.
                             Institution users see this when they've selected a squad;
                             regular users always see it when they have a team. */}
                        {activeTeam && activeTeam.type !== 'school' && (
                          <>
                            <div className="space-y-3">
                              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground px-2">Team Tools</p>
                              <div className="grid grid-cols-2 gap-3">
                                {/* Dashboard — always first */}
                                <Link
                                  href="/dashboard"
                                  onClick={() => setIsMoreMenuOpen(false)}
                                  className={cn(
                                    "flex items-center gap-3 p-4 rounded-2xl border transition-all group active:scale-95",
                                    pathname === '/dashboard' ? "bg-primary/5 border-primary shadow-sm" : "bg-muted/30 border-transparent hover:bg-white hover:border-primary/20"
                                  )}
                                >
                                  <div className={cn("p-2 rounded-xl transition-colors", pathname === '/dashboard' ? "bg-primary text-white" : "bg-white text-muted-foreground group-hover:text-primary")}>
                                    <Home className="h-4 w-4" />
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className={cn("text-[10px] font-black uppercase tracking-tight truncate", pathname === '/dashboard' ? "text-primary" : "text-foreground")}>{dashboardHome.label}</span>
                                  </div>
                                </Link>
                                {filteredCoordTabs.map((tab) => {
                                  const isLocked = tab.pro && !isPro;
                                  const handleClick = (e: React.MouseEvent) => {
                                    if (isLocked) { e.preventDefault(); purchasePro(); }
                                    else { setIsMoreMenuOpen(false); }
                                  };
                                  return (
                                    <Link
                                      key={tab.name}
                                      href={isLocked ? '#' : tab.href}
                                      onClick={handleClick}
                                      className={cn(
                                        "flex items-center gap-3 p-4 rounded-2xl border transition-all group active:scale-95",
                                        pathname === tab.href ? "bg-primary/5 border-primary shadow-sm" : "bg-muted/30 border-transparent hover:bg-white hover:border-primary/20",
                                        isLocked && "opacity-80"
                                      )}
                                    >
                                      <div className={cn("p-2 rounded-xl transition-colors", pathname === tab.href ? "bg-primary text-white" : "bg-white text-muted-foreground group-hover:text-primary")}>
                                        <tab.icon className="h-4 w-4" />
                                      </div>
                                      <div className="flex flex-col min-w-0">
                                        <span className={cn("text-[10px] font-black uppercase tracking-tight truncate", pathname === tab.href ? "text-primary" : "text-foreground")}>{tab.name}</span>
                                        {isLocked && <span className="text-[7px] font-bold text-muted-foreground flex items-center gap-1 uppercase tracking-tighter"><Lock className="h-2 w-2" />PRO</span>}
                                      </div>
                                    </Link>
                                  );
                                })}
                              </div>
                            </div>

                            {isStaff && (
                              <div className="space-y-3">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary px-2">Management</p>
                                <div className="grid grid-cols-1 gap-2">
                                  {filteredAdminTabs.map((tab) => {
                                    const isLocked = isAdminTabLocked(tab);
                                    const handleClick = (e: React.MouseEvent) => {
                                      if (isLocked) { e.preventDefault(); purchasePro(); }
                                      else { setIsMoreMenuOpen(false); }
                                    };
                                    return (
                                      <Link
                                        key={tab.name}
                                        href={isLocked ? '#' : tab.href}
                                        onClick={handleClick}
                                        className={cn(
                                          "flex items-center justify-between p-4 rounded-2xl border bg-muted/30 text-foreground transition-all active:scale-[0.98]",
                                          pathname === tab.href ? "bg-white ring-2 ring-primary ring-offset-2" : "",
                                          isLocked && "opacity-80"
                                        )}
                                      >
                                        <div className="flex items-center gap-4">
                                          <div className="bg-primary/10 p-2 rounded-xl text-primary">
                                            <tab.icon className="h-5 w-5" />
                                          </div>
                                          <div className="flex flex-col">
                                            <span className="text-xs font-black uppercase tracking-widest">{tab.name}</span>
                                            <span className="text-[8px] font-bold text-muted-foreground uppercase">{tab.desc}</span>
                                          </div>
                                        </div>
                                        {isLocked ? <Lock className="h-4 w-4 text-muted-foreground/20" /> : <ChevronRight className="h-4 w-4 text-muted-foreground/20" />}
                                      </Link>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </>
                        )}

                        {/* Management Hubs (parent / non-institution elite account) */}
                        {!isInstitutionAuthority && (isEliteAccount || isSchoolAdmin || isParent) && (
                          <div className="space-y-3">
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary px-2">Management Hubs</p>
                            <div className="grid grid-cols-1 gap-2">
                              {hasFeature?.('club_management') && (
                                <Link
                                  href="/club"
                                  onClick={() => setIsMoreMenuOpen(false)}
                                  className={cn(
                                    "flex items-center justify-between p-4 rounded-2xl border bg-primary text-white transition-all active:scale-[0.98]",
                                    pathname === '/club' ? "ring-2 ring-white ring-offset-2 ring-offset-primary" : ""
                                  )}
                                >
                                  <div className="flex items-center gap-4">
                                    <div className="bg-white/20 p-2 rounded-xl text-white"><Building className="h-5 w-5" /></div>
                                    <div className="flex flex-col">
                                      <span className="text-xs font-black uppercase tracking-widest">{isSchoolMode ? 'School Hub' : 'Club Hub'}</span>
                                      <span className="text-[8px] font-bold text-white/60 uppercase">Institutional Analytics</span>
                                    </div>
                                  </div>
                                  <ChevronRight className="h-4 w-4 text-white/20" />
                                </Link>
                              )}
                              {isParent && (
                                <Link
                                  href="/family"
                                  onClick={() => setIsMoreMenuOpen(false)}
                                  className={cn(
                                    "flex items-center justify-between p-4 rounded-2xl border bg-black text-white transition-all active:scale-[0.98]",
                                    pathname === '/family' ? "ring-2 ring-primary ring-offset-2" : ""
                                  )}
                                >
                                  <div className="flex items-center gap-4">
                                    <div className="bg-primary/20 p-2 rounded-xl text-primary"><Baby className="h-5 w-5" /></div>
                                    <div className="flex flex-col">
                                      <span className="text-xs font-black uppercase tracking-widest">Family Hub</span>
                                      <span className="text-[8px] font-bold text-white/40 uppercase">Family Hub</span>
                                    </div>
                                  </div>
                                  <ChevronRight className="h-4 w-4 text-white/20" />
                                </Link>
                              )}
                            </div>
                          </div>
                        )}


                        {/* ── SPORTS HUB ──────────────────────────────────────────────────── */}
                        <div className="space-y-2">
                          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground px-2">Resources</p>
                          <Link
                            href="/sports-hub"
                            aria-label="Sports Hub"
                            onClick={() => setIsMoreMenuOpen(false)}
                            className={cn(
                              "flex items-center justify-between p-4 rounded-2xl border transition-all active:scale-[0.98]",
                              pathname.startsWith('/sports-hub')
                                ? "bg-primary/5 border-primary shadow-sm"
                                : "bg-muted/30 border-transparent hover:bg-white hover:border-primary/20"
                            )}
                          >
                            <div className="flex items-center gap-4">
                              <div className={cn("p-2 rounded-xl transition-colors", pathname.startsWith('/sports-hub') ? "bg-primary text-white" : "bg-primary/10 text-primary")}>
                                <BookOpen className="h-5 w-5" />
                              </div>
                              <div className="hidden flex-col">
                                <span className={cn("text-xs font-black uppercase tracking-widest", pathname.startsWith('/sports-hub') ? "text-primary" : "text-foreground")}>Sports Hub</span>
                                <span className="text-[8px] font-bold text-muted-foreground uppercase">Articles &amp; Resources</span>
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                          </Link>
                        </div>

                        <div className="space-y-3">
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground px-2">Account Management</p>
                          <div className="grid grid-cols-1 gap-2">
                            {isSuperAdmin && (
                              <Link
                                href="/admin"
                                onClick={() => setIsMoreMenuOpen(false)}
                                className="flex items-center justify-between rounded-2xl border border-primary/20 bg-primary/5 p-4 transition-all active:scale-[0.98]"
                              >
                                <div className="flex items-center gap-4">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
                                    <ShieldCheck className="h-4 w-4" />
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-xs font-black uppercase tracking-widest text-primary">Go to Admin Page</span>
                                    <span className="text-[8px] font-bold uppercase text-muted-foreground">Superadmin controls</span>
                                  </div>
                                </div>
                                <ChevronRight className="h-4 w-4 text-primary/40" />
                              </Link>
                            )}
                            {showInstallBtn && (
                              <div className="relative group/installmobile">
                                <button
                                  onClick={() => {
                                    setIsMoreMenuOpen(false);
                                    handleInstallClick();
                                  }}
                                  aria-label="Install App"
                                  className="w-full flex items-center justify-center p-3 rounded-2xl border border-dashed border-primary/20 bg-primary/5 transition-all text-left active:scale-[0.98] group"
                                >
                                  <div className="flex items-center gap-4">
                                    <div className="p-2 rounded-xl bg-primary text-white shrink-0 group-hover:scale-105 transition-transform shadow-md shadow-primary/10">
                                      <Download className="h-4 w-4" />
                                    </div>
                                    <div className="hidden flex-col">
                                      <span className="text-xs font-black uppercase tracking-widest text-primary">Install Application</span>
                                      <span className="text-[8px] font-bold text-muted-foreground uppercase">Launch from your home screen</span>
                                    </div>
                                  </div>
                                  <ChevronRight className="h-4 w-4 text-primary/30" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    handleDismissInstall(e);
                                    setIsMoreMenuOpen(false);
                                  }}
                                  aria-label="Dismiss install prompt"
                                  className="absolute top-1/2 right-3 -translate-y-1/2 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-black/5 transition-all"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                            <Link
                              href="/team"
                              onClick={() => setIsMoreMenuOpen(false)}
                              className="flex items-center justify-between p-4 rounded-2xl border bg-muted/30 border-transparent transition-all"
                            >
                              <div className="flex items-center gap-4">
                                <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                  <Shield className="h-4 w-4 text-primary" />
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-xs font-black uppercase tracking-widest text-foreground">Team Profile</span>
                                  <span className="text-[8px] font-bold text-muted-foreground uppercase">Name and Branding</span>
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                            </Link>
                            <Link
                              href="/roster"
                              onClick={() => setIsMoreMenuOpen(false)}
                              className="flex items-center justify-between p-4 rounded-2xl border bg-muted/30 border-transparent transition-all"
                            >
                              <div className="flex items-center gap-4">
                                <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                  <Users className="h-4 w-4 text-primary" />
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-xs font-black uppercase tracking-widest text-foreground">Team Roster</span>
                                  <span className="text-[8px] font-bold text-muted-foreground uppercase">Players and Staff</span>
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                            </Link>
                            <Link 
                              href="/settings"
                              onClick={() => setIsMoreMenuOpen(false)}
                              className="flex items-center justify-between p-4 rounded-2xl border bg-muted/30 border-transparent transition-all"
                            >
                              <div className="flex items-center gap-4">
                                <Avatar className="h-8 w-8 rounded-xl border shadow-sm">
                                  <AvatarImage src={user?.avatar} />
                                  <AvatarFallback className="font-black text-[10px]">{user?.name?.[0]}</AvatarFallback>
                                </Avatar>
                                <div className="flex flex-col">
                                  <span className="text-xs font-black uppercase tracking-widest text-foreground">Profile & Settings</span>
                                  <span className="text-[8px] font-bold text-muted-foreground uppercase">Account and Preferences</span>
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground/30" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    </ScrollArea>
                  </SheetContent>
                </Sheet>
              </nav>
            </div>
          </div>
        </div>
      </div>

      {/* iOS PWA Install Instructions Dialog */}
      <Dialog open={showIOSInstructions} onOpenChange={setShowIOSInstructions}>
        <DialogContent className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0 max-w-sm">
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 space-y-6">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
                <Download className="h-6 w-6 text-primary" /> Install App
              </DialogTitle>
              <DialogDescription className="text-sm font-medium text-foreground/75 mt-2">
                Add <strong>The Squad</strong> to your iOS Home Screen for a native app experience and to receive push notifications.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex gap-4 items-start p-3 bg-muted/40 rounded-2xl">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-[10px] font-black text-primary shrink-0">1</div>
                <div className="text-xs font-medium text-foreground/80 leading-relaxed">
                  Tap Safari's <span className="font-bold text-primary inline-flex items-center gap-1"><Share className="h-3.5 w-3.5 inline" /> Share</span> button at the bottom of your browser.
                </div>
              </div>

              <div className="flex gap-4 items-start p-3 bg-muted/40 rounded-2xl">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-[10px] font-black text-primary shrink-0">2</div>
                <div className="text-xs font-medium text-foreground/80 leading-relaxed">
                  Scroll down the share sheet and select <span className="font-bold text-primary">Add to Home Screen</span>.
                </div>
              </div>

              <div className="flex gap-4 items-start p-3 bg-muted/40 rounded-2xl">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-[10px] font-black text-primary shrink-0">3</div>
                <div className="text-xs font-medium text-foreground/80 leading-relaxed">
                  Launch the app from your home screen, sign in, and accept notifications!
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Button 
                onClick={() => setShowIOSInstructions(false)}
                className="w-full rounded-xl h-12 bg-primary hover:bg-primary/95 text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/10"
              >
                Got It
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* General PWA Install Instructions Dialog */}
      <Dialog open={showGeneralInstructions} onOpenChange={setShowGeneralInstructions}>
        <DialogContent className="rounded-[2.5rem] border-none shadow-2xl overflow-hidden p-0 max-w-sm">
          <div className="h-2 bg-primary w-full" />
          <div className="p-8 space-y-6">
            <DialogHeader>
              <DialogTitle className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
                <Download className="h-6 w-6 text-primary" /> Install App
              </DialogTitle>
              <DialogDescription className="text-sm font-medium text-foreground/75 mt-2">
                Install <strong>The Squad</strong> on your device for a fast, native-app experience.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex gap-4 items-start p-3 bg-muted/40 rounded-2xl">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-[10px] font-black text-primary shrink-0">1</div>
                <div className="text-xs font-medium text-foreground/80 leading-relaxed">
                  On <span className="font-bold text-primary">Desktop Chrome / Edge</span>: Look for the download icon in your address bar (top right) or click the menu and select <span className="font-bold text-primary">Install App</span>.
                </div>
              </div>

              <div className="flex gap-4 items-start p-3 bg-muted/40 rounded-2xl">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-[10px] font-black text-primary shrink-0">2</div>
                <div className="text-xs font-medium text-foreground/80 leading-relaxed">
                  On <span className="font-bold text-primary">Android</span>: Tap the three-dot menu icon in the top right and select <span className="font-bold text-primary">Add to Home Screen</span> or <span className="font-bold text-primary">Install app</span>.
                </div>
              </div>

              <div className="flex gap-4 items-start p-3 bg-muted/40 rounded-2xl">
                <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center text-[10px] font-black text-primary shrink-0">3</div>
                <div className="text-xs font-medium text-foreground/80 leading-relaxed">
                  On <span className="font-bold text-primary">Mac Safari</span>: Select <span className="font-bold text-primary">File</span> &gt; <span className="font-bold text-primary">Add to Dock...</span>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Button 
                onClick={() => setShowGeneralInstructions(false)}
                className="w-full rounded-xl h-12 bg-primary hover:bg-primary/95 text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-primary/10"
              >
                Got It
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
