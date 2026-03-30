"use client";

import React, { useState, useEffect, memo, useMemo } from 'react';
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
  GraduationCap
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

const coordinationTabs = [
  { name: 'Feed', href: '/feed', icon: Radio, pro: true },
  { name: 'Schedule', href: '/events', icon: CalendarDays, pro: false },
  { name: 'Leagues', href: '/leagues', icon: Shield, pro: false },
  { name: 'Tournaments', href: '/manage-tournaments', icon: TableIcon, pro: true },
  { name: 'Scorekeeping', href: '/games', icon: Trophy, pro: true },
  { name: 'Calendar', href: '/calendar', icon: CalendarIcon, pro: false },
  { name: 'Playbook', href: '/drills', icon: GraduationCap, pro: true },
  { name: 'Volunteer', href: '/volunteers', icon: HandHelping, pro: true },
  { name: 'Fundraising', href: '/fundraising', icon: PiggyBank, pro: true },
  { name: 'Chats', href: '/chats', icon: MessageCircle, pro: false },
  { name: 'Roster', href: '/roster', icon: Users2, pro: false },
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

function SquadSwitcherMenu({ activeTeam, teams, setActiveTeam, router, user }: { activeTeam: any, teams: any[], setActiveTeam: any, router: any, user: any }) {
  return (
    <DropdownMenuContent align="start" className="w-72 p-2 rounded-2xl shadow-2xl bg-white">
      <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground p-3">My Squads</DropdownMenuLabel>
      <ScrollArea className="h-[300px]">
        {teams.map(team => (
          <DropdownMenuItem key={team.id} onClick={() => setActiveTeam(team)} className={cn("flex items-center gap-3 p-3 rounded-xl cursor-pointer", activeTeam?.id === team.id ? "bg-primary/5 text-primary" : "")}>
            <Avatar className="h-8 w-8 rounded-lg shrink-0 shadow-sm">
              <AvatarImage src={team.teamLogoUrl} className="object-cover" />
              <AvatarFallback className="font-black text-[10px]">{team.name?.[0] || 'T'}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-black text-sm truncate uppercase tracking-tight">{team.name}</span>
              <div className="flex items-center gap-1.5 mt-0">
                {team.isPro ? (
                  <span className="text-[7px] font-black uppercase text-primary tracking-tighter">ELITE PRO</span>
                ) : (
                  <span className="text-[7px] font-black uppercase text-muted-foreground/60 tracking-tighter">STARTER</span>
                )}
                {team.ownerUserId === user?.id && ['elite_teams', 'elite_league'].includes(team.planId) && (
                  <Badge variant="outline" className="h-4 px-1.5 border-primary/20 text-primary bg-primary/5 text-[6px] font-black uppercase tracking-tighter flex items-center gap-1">
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
        <UserPlus className="h-4 w-4 text-primary" /> Recruitment Hub
      </DropdownMenuItem>

      <DropdownMenuSeparator className="my-2" />
      
      <DropdownMenuItem onClick={() => router.push('/teams/new?tier=starter')} className="p-3 cursor-pointer rounded-xl font-black text-xs gap-3 uppercase tracking-widest">
        <PlusCircle className="h-4 w-4 text-primary" /> Deploy Free Team
      </DropdownMenuItem>
      
      <DropdownMenuItem onClick={() => router.push('/teams/new?tier=pro')} className="p-3 cursor-pointer rounded-xl font-black text-xs gap-3 uppercase tracking-widest">
        <Zap className="h-4 w-4 text-amber-500" /> Deploy Elite Pro Team
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { 
    activeTeam, setActiveTeam, teams, user, isPro, 
    isPrimaryClubAuthority, isStaff, isParent, isPlayer, hasFeature, alerts,
    unreadAlertsCount, purchasePro
  } = useTeam();

  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  const filteredCoordTabs = coordinationTabs.filter(tab => {
    // Feed is filtered by plan/feature
    if (tab.name === 'Feed') return hasFeature('live_feed_read');
    
    // Most coordination items are visible to all members for transparency,
    // internal page logic handles edit/administrative permissions.
    return true;
  });

  const bottomNavItems = [
    { name: 'Home', href: '/dashboard', icon: Home },
    { name: 'Schedule', href: '/events', icon: CalendarDays },
    { name: 'Feed', href: '/feed', icon: LayoutDashboard, gate: () => hasFeature('live_feed_read') },
    { name: 'Chats', href: '/chats', icon: MessageCircle },
  ];

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

                {isPrimaryClubAuthority && (
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
                        <Building className={cn("h-5 w-5 mr-3", pathname === '/club' ? "text-primary stroke-[3px]" : "text-foreground")} />Club Hub
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
                        <AvatarImage src={activeTeam?.teamLogoUrl} className="object-cover" />
                        <AvatarFallback className="hero-gradient text-white font-black text-xs">{activeTeam?.name?.[0] || 'T'}</AvatarFallback>
                      </Avatar>
                      <span className="font-black text-sm truncate uppercase tracking-tight text-foreground">{activeTeam?.name || 'Select Squad'}</span>
                    </div>
                    <ChevronDown className="h-4 w-4 opacity-40 text-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <SquadSwitcherMenu activeTeam={activeTeam} teams={teams} setActiveTeam={setActiveTeam} router={router} user={user} />
              </DropdownMenu>
            </SidebarHeader>

            <SidebarContent className="px-4 py-2 bg-white">
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
            </SidebarContent>

            <SidebarFooter className="p-4 border-t bg-white space-y-4">
              <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/60 mb-1">Squad Identity Code</p>
                <p className="text-xl font-black text-primary tracking-widest">{activeTeam?.teamCode || activeTeam?.code}</p>
              </div>

              <Link href="/settings">
                <div className="flex items-center gap-3 p-2 hover:bg-primary/5 rounded-2xl transition-all cursor-pointer group">
                  <Avatar className="h-10 w-10 border-2 border-background shadow-md transition-transform group-hover:scale-105">
                    <AvatarImage src={user?.avatar} />
                    <AvatarFallback className="font-black text-xs">{user?.name?.[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                    <span className="font-black text-sm truncate uppercase tracking-tight text-foreground">{user?.name}</span>
                    <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Global Settings</span>
                  </div>
                </div>
              </Link>
            </SidebarFooter>
          </Sidebar>

          <div className="flex flex-col flex-1 h-screen overflow-hidden">
            <header className="sticky top-0 z-40 w-full bg-background/80 backdrop-blur-md border-b h-16 md:h-20 flex items-center px-4 md:px-10 justify-between text-foreground">
              <div className="flex items-center gap-4">
                <div className="md:hidden">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl hover:bg-primary/5 text-primary relative transition-all active:scale-95 border-2 border-primary/10">
                        <Zap className="h-5 w-5 fill-current" />
                      </Button>
                    </DropdownMenuTrigger>
                    <SquadSwitcherMenu activeTeam={activeTeam} teams={teams} setActiveTeam={setActiveTeam} router={router} user={user} />
                  </DropdownMenu>
                </div>
                <div className="hidden md:block">
                  <h2 className="text-xl lg:text-2xl font-black uppercase tracking-tighter text-foreground">
                    {pathname === '/dashboard' ? 'Strategic Command' : coordinationTabs.find(t => t.href === pathname)?.name || adminTabs.find(t => t.href === pathname)?.name || 'Dashboard'}
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
                <Link href="/settings" className="hidden sm:block">
                  <Avatar className="h-8 w-8 md:h-10 md:w-10 border-2 border-background shadow-md">
                    <AvatarImage src={user?.avatar} />
                    <AvatarFallback className="font-black text-xs">{user?.name?.[0]}</AvatarFallback>
                  </Avatar>
                </Link>
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

                        {(isPrimaryClubAuthority || isParent) && (
                          <div className="space-y-3">
                            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary px-2">Management Hubs</p>
                            <div className="grid grid-cols-1 gap-2">
{isPrimaryClubAuthority && (
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
                                      <span className="text-xs font-black uppercase tracking-widest">Club Hub</span>
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
