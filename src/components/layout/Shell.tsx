
"use client";

import React, { useState, useEffect } from 'react';
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
  Users
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
} from "@/components/ui/sidebar";

const tabs = [
  { name: 'Feed', href: '/feed', icon: LayoutDashboard, pro: false },
  { name: 'Schedule', href: '/events', icon: CalendarDays, pro: false },
  { name: 'Games', href: '/games', icon: Trophy, pro: true },
  { name: 'Drills', href: '/drills', icon: Dumbbell, pro: true },
  { name: 'Chats', href: '/chats', icon: MessageCircle, pro: false },
  { name: 'Roster', href: '/roster', icon: Users2, pro: true },
  { name: 'Library', href: '/files', icon: FolderClosed, pro: true },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeTeam, setActiveTeam, teams, user, isPro, alerts } = useTeam();
  const [hasUnreadAlerts, setHasUnreadAlerts] = useState(false);

  useEffect(() => {
    const checkUnread = () => {
      const stored = localStorage.getItem('squad_seen_alerts_ids');
      if (!stored) {
        setHasUnreadAlerts(alerts.length > 0);
        return;
      }
      try {
        const seenIds = JSON.parse(stored);
        const hasUnseen = alerts.some(a => !seenIds.includes(a.id));
        setHasUnreadAlerts(hasUnseen);
      } catch (e) {
        setHasUnreadAlerts(alerts.length > 0);
      }
    };

    checkUnread();
    // Re-check periodically or when alerts change
    const interval = setInterval(checkUnread, 5000);
    return () => clearInterval(interval);
  }, [alerts]);

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background selection:bg-primary/20">
        {/* Desktop Sidebar (Only visible on MD+) */}
        <Sidebar collapsible="none" className="hidden md:flex border-r bg-muted/20 w-72 shrink-0 sticky top-0 h-screen">
          <SidebarHeader className="p-6">
            <div className="flex items-center gap-3 mb-8 px-2">
              <div className="h-10 w-10 hero-gradient rounded-xl flex items-center justify-center text-white shadow-lg">
                <Trophy className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-black tracking-tighter leading-none">THE SQUAD</h1>
                <p className="text-[10px] font-bold text-primary uppercase tracking-[0.2em] mt-1">Coordination Hub</p>
              </div>
            </div>

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
                    <div className="flex flex-col items-start min-w-0">
                      <div className="flex items-center gap-1.5 w-full">
                        <span className="font-extrabold text-sm tracking-tight truncate leading-tight">
                          {activeTeam?.name || 'Select Squad'}
                        </span>
                        {activeTeam?.isPro && <Badge className="bg-amber-500 text-[8px] h-3 px-1 font-black">PRO</Badge>}
                      </div>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest leading-none">
                        {activeTeam?.sport || 'General'}
                      </span>
                    </div>
                  </div>
                  <ChevronDown className="h-4 w-4 opacity-40 group-data-[state=open]:rotate-180 transition-transform" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 rounded-xl shadow-2xl border-muted p-2">
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
                        <AvatarFallback className="bg-muted font-black text-xs">
                          {team.name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-bold text-sm truncate">{team.name}</span>
                    </div>
                    {team.isPro && <Badge className="bg-amber-500 text-[8px] h-3 px-1">PRO</Badge>}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator className="my-1" />
                <DropdownMenuItem onClick={() => router.push('/team')} className="p-3 cursor-pointer rounded-xl font-bold text-xs gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" /> Squad Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push('/teams/new')} className="p-3 text-primary cursor-pointer rounded-xl font-bold text-xs gap-2">
                  <PlusCircle className="h-4 w-4" /> Create New Squad
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarHeader>

          <SidebarContent className="px-4 py-2">
            <SidebarMenu className="space-y-1.5">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = pathname.startsWith(tab.href);
                const isTabLocked = tab.pro && !isPro;

                return (
                  <SidebarMenuItem key={tab.name}>
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
                        {isTabLocked && <Lock className="h-3.5 w-3.5 opacity-40" />}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-6">
            <div className="bg-primary/5 rounded-3xl p-4 border border-primary/10 mb-4">
              <p className="text-[9px] font-black uppercase text-primary tracking-widest mb-2">Need Assistance?</p>
              <Button variant="ghost" className="w-full h-8 text-[10px] font-bold justify-start p-0 hover:bg-transparent" onClick={() => router.push('/safety')}>
                <Settings className="h-3 w-3 mr-2" /> Help Center
              </Button>
            </div>
            
            <Link href="/settings">
              <div className="flex items-center gap-3 p-2 hover:bg-primary/5 rounded-2xl transition-all cursor-pointer group">
                <Avatar className="h-10 w-10 border-2 border-background shadow-md group-hover:ring-4 group-hover:ring-primary/10 transition-all shrink-0">
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

        {/* Main Viewport */}
        <div className="flex flex-col flex-1 min-w-0 h-screen overflow-y-auto">
          {/* Mobile Header (Hidden on Desktop) */}
          <header className="md:hidden sticky top-0 z-50 w-full glass shadow-sm">
            <div className="container flex h-16 items-center justify-between px-4 max-w-5xl mx-auto">
              <div className="flex items-center gap-4">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="flex items-center gap-2 px-3 h-12 hover:bg-muted/50 transition-all active:scale-95 group">
                      <div className="relative shrink-0">
                        <Avatar className="h-9 w-9 rounded-xl border-2 border-background shadow-md">
                          <AvatarImage src={activeTeam?.teamLogoUrl} className="object-cover" />
                          <AvatarFallback className="hero-gradient text-white font-black text-xs rounded-xl">
                            {activeTeam?.name?.[0] || 'T'}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                      <div className="flex flex-col items-start min-w-0 max-w-[120px]">
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-sm tracking-tight truncate leading-tight">
                            {activeTeam?.name || 'Select Squad'}
                          </span>
                          {activeTeam?.isPro && <Badge className="bg-amber-500 text-[8px] h-3 px-1 font-black uppercase">PRO</Badge>}
                        </div>
                        <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest leading-none">
                          {activeTeam?.sport || 'General'}
                        </span>
                      </div>
                      <ChevronDown className="h-4 w-4 opacity-40 group-data-[state=open]:rotate-180 transition-transform" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64 rounded-xl shadow-xl border-muted">
                    <DropdownMenuLabel className="text-xs font-bold uppercase tracking-widest opacity-50 px-3 py-2">My Squads</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {teams.length > 0 ? teams.map((team) => (
                      <DropdownMenuItem 
                        key={team.id} 
                        onClick={() => setActiveTeam(team)}
                        className="flex items-center justify-between p-3 cursor-pointer rounded-lg mx-1 my-1"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8 rounded-md shrink-0">
                            <AvatarImage src={team.teamLogoUrl} />
                            <AvatarFallback className="bg-muted font-bold text-xs rounded-md">
                              {team.name[0]}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-semibold truncate">{team.name}</span>
                        </div>
                        {team.isPro && <Badge className="bg-amber-500 text-[8px] h-3 px-1">PRO</Badge>}
                      </DropdownMenuItem>
                    )) : (
                      <div className="px-4 py-3 text-sm text-muted-foreground italic">No squads yet</div>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => router.push('/team')}
                      className="flex items-center gap-3 p-3 cursor-pointer rounded-lg mx-1 my-1 font-bold"
                    >
                      <Info className="h-5 w-5 text-muted-foreground" />
                      Squad Profile
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => router.push('/teams/new')}
                      className="flex items-center gap-3 p-3 text-primary cursor-pointer rounded-lg mx-1 my-1 font-bold"
                    >
                      <PlusCircle className="h-5 w-5" />
                      Create New Squad
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              
              <div className="flex items-center gap-3">
                <CreateAlertButton />
                <AlertsHistoryDialog>
                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-muted relative">
                    <Bell className="h-5 w-5" />
                    {hasUnreadAlerts && <span className="absolute top-2.5 right-2.5 h-2 w-2 bg-red-500 rounded-full border-2 border-background" />}
                  </Button>
                </AlertsHistoryDialog>
                <Link href="/settings">
                  <Avatar className="h-9 w-9 border-2 border-background shadow-sm hover:ring-4 hover:ring-primary/10 transition-all">
                    <AvatarImage src={user?.avatar} alt={user?.name} />
                    <AvatarFallback className="font-bold">{user?.name?.[0] || '?'}</AvatarFallback>
                  </Avatar>
                </Link>
              </div>
            </div>
          </header>

          {/* Desktop Top Bar (Only visible on MD+) */}
          <header className="hidden md:flex sticky top-0 z-40 w-full bg-background/80 backdrop-blur-md border-b h-20 items-center px-10 justify-between shrink-0">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-2xl font-black tracking-tighter uppercase">{tabs.find(t => pathname.startsWith(t.href))?.name || 'Dashboard'}</h2>
                <div className="h-1.5 w-1.5 bg-primary rounded-full animate-pulse" />
              </div>
              <p className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.3em] ml-0.5">The Squad Hub • {activeTeam?.name}</p>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="relative hidden lg:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input 
                  placeholder="Global Search..." 
                  className="bg-muted/50 border-none rounded-2xl h-10 w-64 pl-10 pr-4 text-xs font-bold focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
              <div className="flex items-center gap-2">
                <CreateAlertButton />
                <AlertsHistoryDialog>
                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl hover:bg-primary/5 hover:text-primary transition-all relative">
                    <Bell className="h-5 w-5" />
                    {hasUnreadAlerts && <span className="absolute top-2.5 right-2.5 h-2 w-2 bg-red-500 rounded-full border-2 border-background" />}
                  </Button>
                </AlertsHistoryDialog>
              </div>
            </div>
          </header>

          {/* Main Content Area */}
          <main className="flex-1 pb-32 md:pb-12 pt-6 px-4 md:px-10 max-w-7xl mx-auto w-full animate-in fade-in duration-700 slide-in-from-bottom-2">
            {children}
          </main>

          {/* Mobile Bottom Navigation (Hidden on Desktop) */}
          <nav className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-2xl glass rounded-2xl shadow-2xl border-white/40 p-1.5 transition-all hover:scale-[1.01]">
            <div className="flex items-center justify-around h-14">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = pathname.startsWith(tab.href);
                const isTabLocked = tab.pro && !isPro;

                return (
                  <Link
                    key={tab.name}
                    href={tab.href}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1 px-1 py-1 rounded-xl transition-all relative min-w-[50px]",
                      isActive 
                        ? "text-primary bg-primary/5" 
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <div className="relative">
                      <Icon className={cn("h-5 w-5 transition-transform", isActive && "scale-110")} strokeWidth={isActive ? 2.5 : 2} />
                      {isTabLocked && (
                        <div className="absolute -top-1 -right-1 bg-amber-500 rounded-full p-0.5 text-white ring-1 ring-white">
                          <Lock className="h-2 w-2" />
                        </div>
                      )}
                    </div>
                    <span className={cn("text-[8px] font-black tracking-tight uppercase truncate", !isActive && "opacity-70")}>
                      {tab.name}
                    </span>
                    {isActive && (
                      <span className="absolute -top-1 w-1 h-1 bg-primary rounded-full animate-pulse" />
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </div>
    </SidebarProvider>
  );
}
