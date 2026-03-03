
"use client";

import React, { useState, useEffect, memo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  CalendarDays, 
  MessageCircle, 
  Users2, 
  FolderClosed, 
  Settings,
  ChevronDown,
  PlusCircle,
  Trophy,
  Bell,
  Info,
  Lock,
  Dumbbell,
  Search,
  CreditCard,
  ShieldAlert,
  RotateCcw,
  Eye,
  Building,
  History,
  Timer,
  ChevronRight,
  Shield,
  BookOpen
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTeam } from '@/components/providers/team-provider';
import { CreateAlertButton, AlertsHistoryDialog } from '@/components/layout/AlertOverlay';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem
} from "@/components/ui/dropdown-menu";
import { Badge } from '@/components/ui/badge';
import { 
  Sidebar, 
  SidebarContent, 
  SidebarFooter, 
  SidebarHeader, 
  SidebarMenu, 
  SidebarMenuButton, 
  SidebarMenuItem, 
  SidebarProvider,
  SidebarSeparator
} from "@/components/ui/sidebar";
import BrandLogo from '@/components/BrandLogo';
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

const tabs = [
  { name: 'Feed', href: '/feed', icon: LayoutDashboard, pro: true },
  { name: 'Schedule', href: '/events', icon: CalendarDays, pro: false },
  { name: 'Leagues', href: '/leagues', icon: Shield, pro: true },
  { name: 'Games', href: '/games', icon: Trophy, pro: false },
  { name: 'Drills', href: '/drills', icon: Dumbbell, pro: true },
  { name: 'Chats', href: '/chats', icon: MessageCircle, pro: false },
  { name: 'Roster', href: '/roster', icon: Users2, pro: false },
  { name: 'Library', href: '/files', icon: FolderClosed, pro: true },
];

const SidebarItem = memo(({ tab, isActive, isLocked }: { tab: any, isActive: boolean, isLocked: boolean }) => {
  const Icon = tab.icon;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton 
        asChild 
        isActive={isActive}
        className={cn(
          "h-12 px-4 rounded-2xl transition-all font-black text-xs uppercase tracking-widest",
          isActive 
            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90" 
            : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
        )}
      >
        <Link href={tab.href} className="flex items-center justify-between w-full">
          <div className="flex items-center gap-4">
            <Icon className={cn("h-5 w-5", isActive ? "stroke-[3px]" : "stroke-[2]")} />
            <span>{tab.name}</span>
          </div>
          {isLocked && <Lock className="h-3.5 w-3.5 opacity-40" />}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
});
SidebarItem.displayName = "SidebarItem";

function DemoResetBanner({ seconds }: { seconds: number | null }) {
  if (seconds === null) return null;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  return (
    <div className="bg-black text-white px-4 py-2 flex items-center justify-center gap-4 text-[10px] font-black uppercase tracking-[0.2em] relative z-[60] overflow-hidden shrink-0">
      <div className="absolute inset-0 bg-primary/20 animate-pulse pointer-events-none" />
      <div className="flex items-center gap-2 relative z-10">
        <Timer className="h-3 w-3 text-primary animate-spin duration-[5000ms]" />
        <span className="text-center">Demo Reset in {minutes}:{remainingSeconds.toString().padStart(2, '0')}</span>
      </div>
      <div className="hidden lg:block h-3 w-[1px] bg-white/20 relative z-10" />
      <span className="hidden lg:inline relative z-10 text-white/60">Modifications will be purged soon.</span>
    </div>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { 
    activeTeam, setActiveTeam, teams, user, isPro, alerts, isSuperAdmin, 
    simulationPlanId, setSimulationPlanId, resetDemo, isClubManager, secondsUntilReset 
  } = useTeam();
  const [hasUnreadAlerts, setHasUnreadAlerts] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('squad_seen_alerts_ids');
    if (!stored) {
      setHasUnreadAlerts(alerts.length > 0);
      return;
    }
    try {
      const seenIds = JSON.parse(stored);
      setHasUnreadAlerts(alerts.some(a => !seenIds.includes(a.id)));
    } catch (e) {
      setHasUnreadAlerts(alerts.length > 0);
    }
  }, [alerts]);

  const TeamSwitcherContent = () => (
    <>
      <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest opacity-50 px-3 py-2">Switch Squad</DropdownMenuLabel>
      <DropdownMenuSeparator className="my-1" />
      {teams.map((team) => (
        <DropdownMenuItem 
          key={team.id} 
          onClick={() => setActiveTeam(team)}
          className="flex items-center justify-between p-3 cursor-pointer rounded-xl hover:bg-primary/5 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8 rounded-lg shrink-0 border">
              <AvatarImage src={team.teamLogoUrl} className="object-cover" />
              <AvatarFallback className="bg-muted font-black text-xs">{team.name[0]}</AvatarFallback>
            </Avatar>
            <span className="font-bold text-sm truncate">{team.name}</span>
          </div>
          {team.isDemo && <Badge className="bg-primary text-[8px] h-3 px-1">DEMO</Badge>}
          {team.isPro && !team.isDemo && <Badge className="bg-amber-500 text-[8px] h-3 px-1">PRO</Badge>}
        </DropdownMenuItem>
      ))}
      <DropdownMenuSeparator className="my-1" />
      {activeTeam?.isDemo && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="p-3 text-red-600 cursor-pointer rounded-xl font-bold text-xs gap-2">
              <RotateCcw className="h-4 w-4" /> Reset Demo Data
            </DropdownMenuItem>
          </AlertDialogTrigger>
          <AlertDialogContent className="rounded-[2.5rem] border-none shadow-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-2xl font-black">Restore Original State?</AlertDialogTitle>
              <AlertDialogDescription className="font-medium text-base pt-2">
                This will permanently delete all modifications made to this demo environment and re-seed the baseline squad data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-6">
              <AlertDialogCancel className="rounded-xl font-bold border-2">Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={resetDemo} className="rounded-xl font-black bg-red-600 hover:bg-red-700 shadow-xl shadow-red-600/20">Purge & Re-seed</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <DropdownMenuItem onClick={() => router.push('/team')} className="p-3 cursor-pointer rounded-xl font-bold text-xs gap-2">
        <Info className="h-4 w-4 text-muted-foreground" /> Squad Profile
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => router.push('/pricing')} className="p-3 text-primary cursor-pointer rounded-xl font-bold text-xs gap-2">
        <PlusCircle className="h-4 w-4" /> Create New Squad
      </DropdownMenuItem>
    </>
  );

  return (
    <SidebarProvider>
      <div className="flex flex-col min-h-screen w-full bg-background selection:bg-primary/20">
        <DemoResetBanner seconds={secondsUntilReset} />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar collapsible="none" className="hidden md:flex border-r bg-muted/20 w-72 shrink-0 sticky top-0 h-screen">
            <SidebarHeader className="p-6">
              <div className="flex flex-col mb-10 px-2">
                <BrandLogo variant="light-background" className="h-10 w-44 justify-start -ml-2" priority />
                <div className="flex items-center gap-3 mt-1 ml-1">
                  <div className="h-[2px] w-6 bg-primary rounded-full" />
                  <p className="text-[10px] font-extrabold text-primary uppercase tracking-[0.25em] whitespace-nowrap">Coordination Hub</p>
                </div>
              </div>

              {isClubManager && (
                <div className="mb-6 px-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground mb-2">Organization View</p>
                  <Button 
                    asChild 
                    className={cn(
                      "w-full h-12 rounded-2xl justify-start gap-3 font-black text-xs uppercase tracking-widest transition-all",
                      pathname === '/club' ? "bg-black text-white shadow-xl" : "bg-primary/5 text-primary hover:bg-primary/10"
                    )}
                  >
                    <Link href="/club">
                      <Building className="h-5 w-5" />
                      Club Hub
                    </Link>
                  </Button>
                </div>
              )}

              <div className="px-2">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground mb-2 px-2">Tactical Switcher</p>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full justify-between h-14 px-3 border-muted-foreground/10 bg-background/50 hover:bg-white rounded-2xl shadow-sm group">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-9 w-9 rounded-xl border-2 border-background shadow-md shrink-0">
                          <AvatarImage src={activeTeam?.teamLogoUrl} className="object-cover" />
                          <AvatarFallback className="hero-gradient text-white font-black text-xs">
                            {activeTeam?.name?.[0] || 'T'}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col items-start min-w-0 text-left">
                          <span className="font-extrabold text-sm tracking-tight truncate leading-tight w-32">
                            {activeTeam?.name || 'Select Squad'}
                          </span>
                          <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest leading-none">
                            {activeTeam?.sport || 'General'}
                          </span>
                        </div>
                      </div>
                      <ChevronDown className="h-4 w-4 opacity-40 group-data-[state=open]:rotate-180 transition-transform" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64 rounded-xl shadow-2xl border-muted p-2">
                    <TeamSwitcherContent />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </SidebarHeader>

            <SidebarContent className="px-4 py-2">
              <SidebarMenu className="space-y-1.5">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground mb-2 px-2">Squad Operations</p>
                {tabs.map((tab) => (
                  <SidebarItem 
                    key={tab.name} 
                    tab={tab} 
                    isActive={pathname.startsWith(tab.href)} 
                    isLocked={tab.pro && !isPro} 
                  />
                ))}
                
                <SidebarSeparator className="my-4 opacity-10" />
                
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground mb-2 px-2">Resources</p>
                <SidebarMenuItem>
                  <SidebarMenuButton 
                    asChild 
                    isActive={pathname === '/how-to'}
                    className={cn(
                      "h-12 px-4 rounded-2xl transition-all font-black text-xs uppercase tracking-widest",
                      pathname === '/how-to' 
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" 
                        : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
                    )}
                  >
                    <Link href="/how-to" className="flex items-center gap-4">
                      <BookOpen className="h-5 w-5" />
                      <span>Tactical Manual</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                <SidebarMenuItem>
                  <SidebarMenuButton 
                    asChild 
                    isActive={pathname === '/pricing'}
                    className={cn(
                      "h-12 px-4 rounded-2xl transition-all font-black text-xs uppercase tracking-widest",
                      pathname === '/pricing' 
                        ? "bg-amber-500 text-white shadow-lg shadow-amber-500/20 hover:bg-amber-600" 
                        : "text-muted-foreground hover:bg-amber-500/5 hover:text-amber-600"
                    )}
                  >
                    <Link href="/pricing" className="flex items-center gap-4">
                      <CreditCard className="h-5 w-5" />
                      <span>Pricing & Plans</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarContent>

            <SidebarFooter className="p-6">
              <Link href="/settings">
                <div className="flex items-center gap-3 p-2 hover:bg-primary/5 rounded-2xl transition-all cursor-pointer group">
                  <Avatar className="h-10 w-10 border-2 border-background shadow-md shrink-0">
                    <AvatarImage src={user?.avatar} alt={user?.name} className="object-cover" />
                    <AvatarFallback className="font-black text-xs">{user?.name?.[0] || '?'}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                    <span className="font-black text-sm truncate leading-tight">{user?.name}</span>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Account Settings</span>
                  </div>
                </div>
              </Link>
            </SidebarFooter>
          </Sidebar>

          <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden bg-background">
            <header className="sticky top-0 z-40 w-full bg-background/80 backdrop-blur-md border-b h-16 md:h-20 flex items-center px-4 md:px-10 justify-between shrink-0">
              {/* Desktop Content (Title) */}
              <div className="hidden md:flex items-center gap-4 min-w-0">
                <div className="flex flex-col min-w-0">
                  <h2 className="text-xl lg:text-2xl font-black tracking-tighter uppercase truncate">
                    {pathname === '/pricing' ? 'Pricing' : pathname === '/how-to' ? 'Tactical Manual' : (pathname === '/leagues' ? 'League Control' : (tabs.find(t => pathname.startsWith(t.href))?.name || 'Dashboard'))}
                  </h2>
                  <p className="text-[9px] lg:text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] lg:tracking-[0.3em] ml-0.5 truncate">The Squad Hub • {activeTeam?.name}</p>
                </div>
              </div>

              {/* Mobile Content (Logo) */}
              <div className="flex md:hidden items-center shrink-0">
                <Link href="/feed">
                  <BrandLogo variant="light-background" className="h-6 w-28" />
                </Link>
              </div>

              {/* Right Actions / Switcher */}
              <div className="flex items-center gap-3 lg:gap-6 shrink-0">
                {/* Mobile Team Switcher */}
                <div className="md:hidden">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-10 px-3 gap-2 border-muted-foreground/10 bg-background/50 rounded-xl shadow-sm font-black text-[10px] uppercase tracking-tighter max-w-[140px]">
                        <span className="truncate">{activeTeam?.name || 'Squad'}</span>
                        <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64 rounded-xl shadow-2xl p-2">
                      <TeamSwitcherContent />
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex items-center gap-3">
                  <div className="hidden md:block">
                    <CreateAlertButton />
                  </div>
                  <AlertsHistoryDialog>
                    <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl hover:bg-primary/5 hover:text-primary transition-all relative">
                      <Bell className="h-5 w-5" />
                      {hasUnreadAlerts && <span className="absolute top-2.5 right-2.5 h-2 w-2 bg-red-500 rounded-full border-2 border-background" />}
                    </Button>
                  </AlertsHistoryDialog>
                  
                  {/* Avatar -> Settings (Shared) */}
                  <Link href="/settings">
                    <Avatar className="h-8 w-8 md:h-10 md:w-10 border-2 border-background shadow-md">
                      <AvatarImage src={user?.avatar} alt={user?.name} className="object-cover" />
                      <AvatarFallback className="font-black text-[10px] md:text-xs">{user?.name?.[0] || '?'}</AvatarFallback>
                    </Avatar>
                  </Link>
                </div>
              </div>
            </header>

            <main className="flex-1 pb-36 md:pb-12 pt-4 md:pt-6 px-4 md:px-10 max-w-7xl mx-auto w-full overflow-y-auto">
              {children}
            </main>

            <nav className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-md glass rounded-2xl shadow-2xl border-white/40 p-1">
              <div className="flex items-center justify-around h-14 overflow-x-auto no-scrollbar">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = pathname.startsWith(tab.href);
                  const isLocked = tab.pro && !isPro;
                  return (
                    <Link 
                      key={tab.name} 
                      href={tab.href} 
                      className={cn(
                        "flex flex-col items-center justify-center gap-1 px-1 py-1 rounded-xl transition-all relative min-w-[42px]", 
                        isActive ? "text-primary bg-primary/5" : "text-muted-foreground"
                      )}
                    >
                      <Icon className={cn("h-4 w-4 sm:h-5 sm:w-5", isActive && "scale-110", isLocked && "opacity-50")} strokeWidth={isActive ? 3 : 2} />
                      <span className="text-[7px] sm:text-[8px] font-black tracking-tight uppercase truncate max-w-[40px]">{tab.name}</span>
                      {isLocked && <Lock className="absolute top-0.5 right-0.5 h-1.5 w-1.5 opacity-40" />}
                    </Link>
                  );
                })}
              </div>
            </nav>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
