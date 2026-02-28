
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
  CreditCard
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
import BrandLogo from '@/components/BrandLogo';

const tabs = [
  { name: 'Feed', href: '/feed', icon: LayoutDashboard, pro: false },
  { name: 'Schedule', href: '/events', icon: CalendarDays, pro: false },
  { name: 'Games', href: '/games', icon: Trophy, pro: true },
  { name: 'Drills', href: '/drills', icon: Dumbbell, pro: true },
  { name: 'Chats', href: '/chats', icon: MessageCircle, pro: false },
  { name: 'Roster', href: '/roster', icon: Users2, pro: true },
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

export default function Shell({ children }: { children: React.Node }) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeTeam, setActiveTeam, teams, user, isPro, alerts } = useTeam();
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

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background selection:bg-primary/20">
        <Sidebar collapsible="none" className="hidden md:flex border-r bg-muted/20 w-72 shrink-0 sticky top-0 h-screen">
          <SidebarHeader className="p-6">
            <div className="flex flex-col mb-10 px-2">
              <BrandLogo variant="light-background" className="h-10 w-44 justify-start -ml-2" priority />
              <div className="flex items-center gap-3 mt-1 ml-1">
                <div className="h-[2px] w-6 bg-primary rounded-full" />
                <p className="text-[10px] font-extrabold text-primary uppercase tracking-[0.25em] whitespace-nowrap">Coordination Hub</p>
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
              {tabs.map((tab) => (
                <SidebarItem 
                  key={tab.name} 
                  tab={tab} 
                  isActive={pathname.startsWith(tab.href)} 
                  isLocked={tab.pro && !isPro} 
                />
              ))}
              <SidebarSeparator className="my-4 opacity-10" />
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

        <div className="flex flex-col flex-1 min-w-0 h-screen overflow-y-auto">
          <header className="hidden md:flex sticky top-0 z-40 w-full bg-background/80 backdrop-blur-md border-b h-20 items-center px-10 justify-between shrink-0">
            <div className="flex flex-col">
              <h2 className="text-2xl font-black tracking-tighter uppercase">
                {pathname === '/pricing' ? 'Pricing' : (tabs.find(t => pathname.startsWith(t.href))?.name || 'Dashboard')}
              </h2>
              <p className="text-[10px] font-black uppercase text-muted-foreground tracking-[0.3em] ml-0.5">The Squad Hub • {activeTeam?.name}</p>
            </div>
            
            <div className="flex items-center gap-6">
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

          <main className="flex-1 pb-32 md:pb-12 pt-6 px-4 md:px-10 max-w-7xl mx-auto w-full">
            {children}
          </main>

          <nav className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-2xl glass rounded-2xl shadow-2xl border-white/40 p-1.5">
            <div className="flex items-center justify-around h-14">
              {tabs.slice(0, 5).map((tab) => {
                const Icon = tab.icon;
                const isActive = pathname.startsWith(tab.href);
                return (
                  <Link key={tab.name} href={tab.href} className={cn("flex flex-col items-center justify-center gap-1 px-1 py-1 rounded-xl transition-all relative min-w-[50px]", isActive ? "text-primary bg-primary/5" : "text-muted-foreground")}>
                    <Icon className={cn("h-5 w-5", isActive && "scale-110")} strokeWidth={isActive ? 2.5 : 2} />
                    <span className="text-[8px] font-black tracking-tight uppercase truncate">{tab.name}</span>
                  </Link>
                );
              })}
              <Link href="/pricing" className={cn("flex flex-col items-center justify-center gap-1 px-1 py-1 rounded-xl transition-all relative min-w-[50px]", pathname === '/pricing' ? "text-amber-500 bg-amber-500/5" : "text-muted-foreground")}>
                <CreditCard className={cn("h-5 w-5", pathname === '/pricing' && "scale-110")} />
                <span className="text-[8px] font-black tracking-tight uppercase truncate">Plans</span>
              </Link>
            </div>
          </nav>
        </div>
      </div>
    </SidebarProvider>
  );
}
