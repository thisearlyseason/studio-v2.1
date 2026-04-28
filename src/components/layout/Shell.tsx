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
  GraduationCap,
  LogOut,
  Trash2,
  UserX,
  ShieldAlert,
  User,
  Medal,
  Copy
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
import BrandLogo from '@/components/BrandLogo';
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
  { name: 'Scorekeeping', href: '/games', icon: Trophy, pro: true },
  { name: 'Playbook', href: '/drills', icon: GraduationCap, pro: true },
  { name: 'Volunteer', href: '/volunteers', icon: HandHelping, pro: true },
  { name: 'Fundraising', href: '/fundraising', icon: PiggyBank, pro: true },
  { name: 'Tactical Chat', href: '/chats', icon: MessageCircle, pro: false },
  { name: 'Library', href: '/files', icon: FolderClosed, pro: false },
];

const adminTabs = [
  { name: 'Coaches Corner', href: '/coaches-corner', icon: PenTool, pro: true, desc: 'Waivers & Docs' },
  { name: 'Facilities', href: '/facilities', icon: MapPin, pro: true, desc: 'Venue Control' },
  { name: 'Equipment', href: '/equipment', icon: Package, pro: true, desc: 'Inventory Vault' },
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

function SquadSwitcherMenu({ activeTeam, teams, setActiveTeam, router, user, isSchoolMode, isPrimaryClubAuthority }: { activeTeam: any, teams: any[], setActiveTeam: any, router: any, user: any, isSchoolMode?: boolean, isPrimaryClubAuthority?: boolean }) {
  const primarySchoolTeam = isSchoolMode ? teams.find(t => t.type === 'school') : null;
  // All non-primary teams are squads — catches school_squad and any other types
  const squadList = isSchoolMode ? teams.filter(t => t.type !== 'school') : teams;

  return (
    <DropdownMenuContent align="start" className="w-80 p-2 rounded-2xl shadow-2xl bg-white">

      {/* ── SCHOOL MODE ────────────────────────────────────────────── */}
      {isSchoolMode ? (
        <>
          {/* 1. Institution Card — fixed above the scroll, always visible */}
          {primarySchoolTeam && (
            <>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground px-2 pt-2 pb-1.5">School Institution</p>
              <button
                onClick={() => setActiveTeam(primarySchoolTeam)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl cursor-pointer border-2 transition-all text-left",
                  activeTeam?.type === 'school'
                    ? "bg-primary/10 border-primary/40 text-primary"
                    : "bg-muted/30 border-muted hover:bg-primary/5 hover:border-primary/20"
                )}
              >
                <div className={cn(
                  "h-11 w-11 rounded-xl flex items-center justify-center shrink-0 font-black text-lg",
                  activeTeam?.type === 'school' ? "bg-primary text-white" : "bg-primary/15 text-primary"
                )}>
                  {(user?.schoolName || user?.clubName || primarySchoolTeam.name || 'S')[0]}
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-black text-sm truncate uppercase tracking-tight">
                    {user?.schoolName || user?.clubName || primarySchoolTeam.name}
                  </span>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    {user?.institutionTitle || 'Athletic Director'}
                  </span>
                </div>
                {activeTeam?.type === 'school' && <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />}
              </button>
            </>
          )}

          <DropdownMenuSeparator className="my-2" />

          {/* 2. Squads — scrollable list of individual cards */}
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground px-2 pb-1.5">
            Squads ({squadList.length})
          </p>
          <ScrollArea className="max-h-[300px] pr-1">
            <div className="space-y-1.5 pb-1">
              {squadList.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No squads assigned yet.</p>
              ) : squadList.map(team => {
                const isActive = activeTeam?.id === team.id && activeTeam?.type !== 'school';
                return (
                  <button
                    key={team.id}
                    onClick={() => setActiveTeam(team)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl cursor-pointer border-2 transition-all text-left",
                      isActive
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "border-muted/60 hover:bg-muted/40 hover:border-muted-foreground/20"
                    )}
                  >
                    <Avatar className="h-9 w-9 rounded-lg shrink-0 shadow-sm border border-muted">
                      <AvatarImage src={team.teamLogoUrl} className="object-cover" />
                      <AvatarFallback className={cn("font-black text-xs", isActive ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground")}>
                        {team.name?.[0] || 'T'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="font-black text-sm truncate uppercase tracking-tight">{team.name}</span>
                      <span className="text-[10px] font-medium text-muted-foreground truncate">
                        {team.code || team.teamCode || team.inviteCode || ''}
                      </span>
                    </div>
                    {isActive && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          </ScrollArea>

          <DropdownMenuSeparator className="my-2" />
          <DropdownMenuItem onClick={() => router.push('/club')} className="p-3 cursor-pointer rounded-xl font-black text-xs gap-3 uppercase tracking-widest bg-primary/5 text-primary hover:bg-primary hover:text-white transition-all">
            <Building className="h-4 w-4" /> School Hub
          </DropdownMenuItem>
          <DropdownMenuSeparator className="my-2" />
          <DropdownMenuItem onClick={() => router.push('/team')} className="p-3 cursor-pointer rounded-xl font-black text-xs gap-3 uppercase tracking-widest">
            <Settings className="h-4 w-4 text-primary" /> View Squad Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push('/teams/join')} className="p-3 cursor-pointer rounded-xl font-black text-xs gap-3 uppercase tracking-widest">
            <UserPlus className="h-4 w-4 text-primary" /> Portals
          </DropdownMenuItem>
        </>
      ) : (
        /* ── NON-SCHOOL MODE (unchanged) ──────────────────────────── */
        <>
          <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground p-3">My Squads</DropdownMenuLabel>
          <ScrollArea className="max-h-[300px]">
            {teams.map(team => (
              <DropdownMenuItem key={team.id} onClick={() => setActiveTeam(team)} className={cn("flex items-center gap-3 p-3 rounded-xl cursor-pointer", activeTeam?.id === team.id ? "bg-primary/5 text-primary" : "")}>
                <Avatar className="h-8 w-8 rounded-lg shrink-0 shadow-sm">
                  <AvatarImage src={team.teamLogoUrl} className="object-cover" />
                  <AvatarFallback className="font-black text-[10px]">{team.name?.[0] || 'T'}</AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-black text-sm truncate uppercase tracking-tight">{team.name}</span>
                  <div className="flex items-center gap-1.5">
                    {['elite', 'league', 'school'].includes(team.planId) || team.isPro ? (
                      <Badge className="bg-primary/20 text-primary border-primary/20 text-[10px] font-black h-5 px-2 tracking-widest">ELITE PRO</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] font-bold h-5 px-2 border-black/10">STARTER</Badge>
                    )}
                    {team.ownerUserId === user?.id && ['elite', 'league', 'school'].includes(team.planId || '') && (
                      <Badge className="bg-black text-white text-[8px] font-black h-4 px-1.5 tracking-tighter rounded-sm flex items-center gap-1">
                        <Star className="h-2 w-2 fill-current" /> PRIMARY
                      </Badge>
                    )}
                  </div>
                </div>
                {activeTeam?.id === team.id && <CheckCircle2 className="h-4 w-4 ml-auto text-primary" />}
              </DropdownMenuItem>
            ))}
          </ScrollArea>
          <DropdownMenuSeparator className="my-2" />
          <DropdownMenuItem onClick={() => router.push('/team')} className="p-3 cursor-pointer rounded-xl font-black text-xs gap-3 uppercase tracking-widest">
            <Settings className="h-4 w-4 text-primary" /> View Squad Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push('/teams/join')} className="p-3 cursor-pointer rounded-xl font-black text-xs gap-3 uppercase tracking-widest">
            <UserPlus className="h-4 w-4 text-primary" /> Portals
          </DropdownMenuItem>
          <DropdownMenuSeparator className="my-2" />
          <DropdownMenuItem onClick={() => router.push('/teams/new?tier=starter')} className="p-3 cursor-pointer rounded-xl font-black text-xs gap-3 uppercase tracking-widest">
            <PlusCircle className="h-4 w-4 text-primary" /> Deploy Free Team
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push('/teams/new?tier=pro')} className="p-3 cursor-pointer rounded-xl font-black text-xs gap-3 uppercase tracking-widest">
            <Zap className="h-4 w-4 text-amber-500" /> Deploy Elite Pro Team
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
    unreadAlertsCount, purchasePro, isSchoolMode, isSchoolAdmin, isEliteAccount,
    deleteTeam, deleteAccount
  } = useTeam();
  const auth = useAuth();

  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  const filteredCoordTabs = coordinationTabs
    .filter(tab => {
      // Feed is filtered by plan/feature
      if (tab.name === 'Feed') return hasFeature?.('live_feed_read');
      // Roster: hide for school admins in institution mode (they use the School Hub instead)
      if (tab.name === 'Roster' && isSchoolMode && isPrimaryClubAuthority && activeTeam?.type === 'school') return false;
      return true;
    })
    .map(tab => {
      if (tab.name === 'Competition Hub' && isSchoolMode) {
        return { ...tab, name: 'Program League Hub' };
      }
      return tab;
    });

  // School admin in institution mode: only the squad-selector button is shown in the sidebar.
  // All nav items are hidden — they're managing the school hub, not a specific squad.
  const isSchoolInstitutionMode = isSchoolMode && isPrimaryClubAuthority && activeTeam?.type === 'school';

  const bottomNavItems = [
    { name: 'Home', href: '/dashboard', icon: Home },
    { name: 'Schedule', href: '/events', icon: CalendarDays },
    { name: 'Feed', href: '/feed', icon: LayoutDashboard, gate: () => hasFeature?.('live_feed_read') },
    { name: 'Tactical Chat', href: '/chats', icon: MessageCircle },
  ];

  if (!activeTeam && !user) return null;

  const handleLogout = async () => {
    try {
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
      toast({ title: "Team Deleted", description: "The squad has been decommissioned." });
      window.location.reload();
    } catch (error) {
      toast({ title: "Deletion Failed", variant: "destructive" });
    }
  };

  return (
    <SidebarProvider>
      <div className="flex flex-col min-h-screen w-full bg-background selection:bg-primary/20">
        <div className="flex flex-1 overflow-hidden">
          <Sidebar className="border-r bg-white w-72 shrink-0 shadow-sm" collapsible="offcanvas">
            <SidebarHeader className="p-6 bg-white">
              <BrandLogo variant="light-background" className="h-10 w-44 justify-start mb-10" priority />
              
              <SidebarMenu className="space-y-2 mb-6">
                <SidebarMenuItem>
                  <SidebarMenuButton 
                    asChild 
                    isActive={pathname === '/dashboard'} 
                    className={cn(
                      "h-12 px-4 rounded-2xl transition-all font-black text-xs uppercase tracking-widest",
                      pathname === '/dashboard' ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/80 hover:text-primary"
                    )}
                  >
                    <Link href="/dashboard">
                      <Layout className={cn("h-5 w-5 mr-3", pathname === '/dashboard' ? "text-primary stroke-[3px]" : "text-foreground")} />Dashboard
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

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

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between h-14 px-3 border-2 border-muted-foreground/10 bg-background rounded-2xl shadow-sm hover:bg-muted/50 transition-all">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-9 w-9 rounded-xl border-2 border-background shadow-md">
                        {isSchoolMode && isPrimaryClubAuthority && activeTeam?.type === 'school' ? (
                          /* Institution mode — gradient shield */
                          <AvatarFallback className="hero-gradient text-white font-black text-xs">
                            {(user?.schoolName || user?.clubName || 'S')[0]}
                          </AvatarFallback>
                        ) : isSchoolMode && isPrimaryClubAuthority ? (
                          /* Squad mode — show the squad's logo */
                          <>
                            <AvatarImage src={activeTeam?.teamLogoUrl} className="object-cover" />
                            <AvatarFallback className="bg-primary/15 text-primary font-black text-xs">{activeTeam?.name?.[0] || 'T'}</AvatarFallback>
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
                            {/* Always show school name as the top line */}
                            <span className="font-black text-sm truncate uppercase tracking-tight text-foreground">
                              {user?.schoolName || user?.clubName || 'School Hub'}
                            </span>
                            {activeTeam?.type === 'school' ? (
                              /* Institution is active — prompt to pick a squad */
                              <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest truncate flex items-center gap-1">
                                Select a Squad
                              </span>
                            ) : (
                              /* A specific squad is active */
                              <span className="text-[9px] font-bold text-primary uppercase tracking-widest truncate">
                                ↳ {activeTeam?.name || 'Squad'}
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
                                <SquadSwitcherMenu activeTeam={activeTeam} teams={teams} setActiveTeam={setActiveTeam} router={router} user={user} isSchoolMode={isSchoolMode} isPrimaryClubAuthority={isPrimaryClubAuthority} />
              </DropdownMenu>
            </SidebarHeader>

            <SidebarContent className="px-4 py-2 bg-white">
              {/* School institution mode: hide all nav items; only the squad-selector above is shown */}
              {!isSchoolInstitutionMode && (
                <SidebarMenu className="space-y-6">
                  {isStaff && (
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-black uppercase tracking-[0.3em] text-primary px-2 mb-2">Command</p>
                      {adminTabs.map(tab => <SidebarItem key={tab.name} tab={tab} isActive={pathname === tab.href} isLocked={tab.pro && !isPro} />)}
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground px-2 mb-2">Operations</p>
                    {filteredCoordTabs.map(tab => <SidebarItem key={tab.name} tab={tab} isActive={pathname === tab.href} isLocked={tab.pro && !isPro} />)}
                  </div>
                </SidebarMenu>
              )}
              {isSchoolInstitutionMode && (
                <div className="px-4 py-6 text-center space-y-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground/50">
                    Select a squad above to access team operations
                  </p>
                </div>
              )}
            </SidebarContent>

            <SidebarFooter className="p-4 border-t bg-white space-y-4">
              {/* Hide invite code for Athletic Director / primary school — they don't share a join code */}
              {activeTeam?.type !== 'school' && (
                <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10">
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 mb-1">Squad Identity Code</p>
                  <div className="flex items-center gap-2">
                    <p className="font-black text-primary tracking-wider text-sm truncate flex-1 min-w-0">
                      {activeTeam?.code || activeTeam?.teamCode || activeTeam?.inviteCode || '---'}
                    </p>
                    <button
                      className="shrink-0 text-primary/40 hover:text-primary transition-colors"
                      onClick={async () => { await navigator.clipboard.writeText(activeTeam?.code || ''); }}
                      title="Copy code"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              )}



            </SidebarFooter>
          </Sidebar>

          <div className="flex flex-col flex-1 h-screen overflow-hidden">
            <header className="sticky top-0 z-40 w-full bg-background/80 backdrop-blur-md border-b h-16 md:h-20 flex items-center px-4 md:px-10 justify-between text-foreground">
              <div className="flex items-center gap-4">
                <div className="md:hidden">
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl hover:bg-primary/5 text-primary relative transition-all active:scale-95 border-2 border-primary/10">
                            <Zap className="h-5 w-5 fill-current" />
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Switch Squad</TooltipContent>
                    </Tooltip>
                    <SquadSwitcherMenu activeTeam={activeTeam} teams={teams} setActiveTeam={setActiveTeam} router={router} user={user} isSchoolMode={isSchoolMode} isPrimaryClubAuthority={isPrimaryClubAuthority} />
                  </DropdownMenu>
                </div>
                <div className="hidden md:block">
                  <h2 className="text-xl lg:text-2xl font-black uppercase tracking-tighter text-foreground">
                    {pathname === '/dashboard' ? 'Strategic Command' : 
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
                  <Button variant="ghost" size="icon" className="h-10 w-10 md:h-11 md:w-11 rounded-2xl hover:bg-primary/5 text-foreground relative transition-all active:scale-95">
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
                    <button className="hidden sm:block focus:outline-none flex items-center gap-2 group">
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
                    
                    <DropdownMenuItem onClick={() => router.push('/how-to')} className="p-3 cursor-pointer rounded-xl font-black text-xs gap-3 uppercase tracking-widest">
                      <BookOpen className="h-4 w-4 text-primary" /> Tactical Manual
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
                              <AlertDialogTitle className="text-2xl font-black uppercase tracking-tight">Decommission Squad</AlertDialogTitle>
                              <AlertDialogDescription className="text-sm font-medium text-foreground/70">
                                This will permanently delete <strong>{activeTeam?.name}</strong> and all associated data, including rosters, schedules, and analytics. This operation is IRREVERSIBLE.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="pt-4">
                              <AlertDialogCancel className="rounded-xl h-14 font-black uppercase text-[10px] tracking-widest">Abort</AlertDialogCancel>
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
                            <AlertDialogTitle className="text-2xl font-black uppercase tracking-tight">Identity Termination</AlertDialogTitle>
                            <AlertDialogDescription className="text-sm font-medium text-foreground/70">
                              You are about to permanently delete your global account identity. All your data, settings, and role memberships will be purged. 
                              <br /><br />
                              <span className="font-bold text-destructive">WARNING: This cannot be undone.</span>
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="pt-4">
                            <AlertDialogCancel className="rounded-xl h-14 font-black uppercase text-[10px] tracking-widest">Stay Active</AlertDialogCancel>
                            <AlertDialogAction onClick={deleteAccount} className="rounded-xl h-14 bg-destructive hover:bg-destructive/90 text-white font-black uppercase text-[10px] tracking-widest shadow-xl shadow-destructive/20">
                              Terminate Account
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
            
            <main className="flex-1 overflow-y-auto p-4 md:p-10 max-w-7xl mx-auto w-full custom-scrollbar pb-32 md:pb-10 text-foreground">
              {children}
            </main>

            <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-max max-w-[95vw]">
              <nav className="flex items-center gap-1 bg-white/95 backdrop-blur-md border rounded-full px-2 py-2 shadow-2xl ring-1 ring-black/5">
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
                    <SheetHeader className="p-8 pb-4">
                      <SheetTitle className="text-2xl font-black uppercase tracking-tight text-foreground">Tactical Menu</SheetTitle>
                      <SheetDescription className="font-bold text-primary uppercase text-[10px] tracking-widest">
                        Extended Squad Operations
                      </SheetDescription>
                    </SheetHeader>
                    <ScrollArea className="flex-1 px-6 pb-10">
                      <div className="space-y-8 pt-4">
                        <div className="space-y-3">
                          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground px-2">Operational Hub</p>
                          <div className="grid grid-cols-2 gap-3">
                            {filteredCoordTabs.map((tab) => {
                              if (bottomNavItems.find(item => item.href === tab.href)) return null;
                              const isLocked = tab.pro && !isPro;
                              
                              const handleClick = (e: React.MouseEvent) => {
                                if (isLocked) {
                                  e.preventDefault();
                                  purchasePro();
                                } else {
                                  setIsMoreMenuOpen(false);
                                }
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
                                  <div className={cn(
                                    "p-2 rounded-xl transition-colors",
                                    pathname === tab.href ? "bg-primary text-white" : "bg-white text-muted-foreground group-hover:text-primary"
                                  )}>
                                    <tab.icon className="h-4 w-4" />
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className={cn(
                                      "text-[10px] font-black uppercase tracking-tight truncate",
                                      pathname === tab.href ? "text-primary" : "text-foreground"
                                    )}>
                                      {tab.name}
                                    </span>
                                    {isLocked && <span className="text-[7px] font-bold text-muted-foreground flex items-center gap-1 uppercase tracking-tighter"><Lock className="h-2 w-2" /> PRO</span>}
                                  </div>
                                </Link>
                              );
                            })}
                          </div>
                        </div>

                        {(isEliteAccount || isSchoolAdmin || isParent) && (
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
                                      <div className="bg-white/20 p-2 rounded-xl text-white">
                                        <Building className="h-5 w-5" />
                                      </div>
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
                                    <div className="bg-primary/20 p-2 rounded-xl text-primary">
                                      <Baby className="h-5 w-5" />
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-xs font-black uppercase tracking-widest">Family Hub</span>
                                      <span className="text-[8px] font-bold text-white/40 uppercase">Household Command</span>
                                    </div>
                                  </div>
                                  <ChevronRight className="h-4 w-4 text-white/20" />
                                </Link>
                              )}
                            </div>
                          </div>
                        )}

                        {isStaff && (
                          <div className="space-y-3">
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary px-2">Command Hub</p>
                            <div className="grid grid-cols-1 gap-2">
                              {adminTabs.map((tab) => {
                                const isLocked = tab.pro && !isPro;
                                
                                const handleClick = (e: React.MouseEvent) => {
                                  if (isLocked) {
                                    e.preventDefault();
                                    purchasePro();
                                  } else {
                                    setIsMoreMenuOpen(false);
                                  }
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

                        <div className="space-y-3">
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground px-2">Account Management</p>
                          <div className="grid grid-cols-1 gap-2">
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
                                  <span className="text-xs font-black uppercase tracking-widest text-foreground">Squad Profile</span>
                                  <span className="text-[8px] font-bold text-muted-foreground uppercase">Identity & Branding</span>
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
                                  <span className="text-xs font-black uppercase tracking-widest text-foreground">Squad Roster</span>
                                  <span className="text-[8px] font-bold text-muted-foreground uppercase">Members & Profiles</span>
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
                                  <span className="text-[8px] font-bold text-muted-foreground uppercase">Managed Global ID</span>
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
    </SidebarProvider>
  );
}
