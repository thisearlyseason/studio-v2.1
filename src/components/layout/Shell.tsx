
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
  CheckCircle2
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
  SidebarSeparator
} from "@/components/ui/sidebar";
import BrandLogo from '@/components/BrandLogo';
import { ScrollArea } from '@/components/ui/scroll-area';

const coordinationTabs = [
  { name: 'Feed', href: '/feed', icon: LayoutDashboard, pro: true },
  { name: 'Schedule', href: '/events', icon: CalendarDays, pro: false },
  { name: 'Leagues', href: '/leagues', icon: Shield, pro: false },
  { name: 'Tournaments', href: '/tournaments', icon: TableIcon, pro: true },
  { name: 'Scorekeeping', href: '/games', icon: Trophy, pro: false },
  { name: 'Calendar', href: '/calendar', icon: CalendarIcon, pro: false },
  { name: 'Playbook', icon: Dumbbell, href: '/drills', pro: false },
  { name: 'Volunteer', href: '/volunteers', icon: HandHelping, pro: false, gate: 'staff_or_parent' },
  { name: 'Fundraising', href: '/fundraising', icon: PiggyBank, pro: false, gate: 'staff_or_parent' },
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
  return (
    <SidebarMenuItem>
      <SidebarMenuButton 
        asChild 
        isActive={isActive}
        className={cn(
          "h-12 px-4 rounded-2xl transition-all font-black text-xs uppercase tracking-widest",
          isActive 
            ? "bg-primary text-white shadow-lg hover:bg-primary hover:text-white" 
            : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
        )}
      >
        <Link href={tab.href} className="flex items-center justify-between w-full">
          <div className="flex items-center gap-4">
            <Icon className={cn("h-5 w-5", isActive ? "stroke-[3px]" : "stroke-[2]")} />
            <span>{tab.name}</span>
          </div>
          {isLocked && <Lock className="h-3 w-3 opacity-40" />}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
});
SidebarItem.displayName = "SidebarItem";

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { 
    activeTeam, setActiveTeam, teams, user, isPro, 
    isClubManager, isStaff, isParent, isPlayer
  } = useTeam();

  const filteredCoordTabs = coordinationTabs.filter(tab => {
    if (tab.gate === 'staff_or_parent') return isStaff || isParent;
    if (tab.name === 'Feed' && isParent && !activeTeam?.parentCommentsEnabled) return false;
    return true;
  });

  return (
    <SidebarProvider>
      <div className="flex flex-col min-h-screen w-full bg-background">
        <div className="flex flex-1 overflow-hidden">
          <Sidebar collapsible="none" className="hidden md:flex border-r bg-muted/20 w-72 shrink-0 h-screen sticky top-0">
            <SidebarHeader className="p-6">
              <BrandLogo variant="light-background" className="h-10 w-44 justify-start mb-10" priority />
              
              <SidebarMenu className="space-y-2 mb-6">
                <SidebarMenuItem>
                  <SidebarMenuButton 
                    asChild 
                    isActive={pathname === '/'} 
                    className={cn(
                      "h-12 px-4 rounded-2xl transition-all font-black text-xs uppercase tracking-widest",
                      pathname === '/' ? "bg-primary text-white shadow-lg hover:bg-primary hover:text-white" : "bg-primary/5 text-primary hover:bg-primary/10"
                    )}
                  >
                    <Link href="/"><Layout className="h-5 w-5 mr-3" />Dashboard</Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>

                {isParent && (
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild 
                      isActive={pathname === '/family'} 
                      className={cn(
                        "h-12 px-4 rounded-2xl transition-all font-black text-xs uppercase tracking-widest",
                        pathname === '/family' ? "bg-primary text-white shadow-lg hover:bg-primary hover:text-white" : "bg-primary/5 text-primary hover:bg-primary/10"
                      )}
                    >
                      <Link href="/family"><Baby className="h-5 w-5 mr-3" />Family Hub</Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}

                {isClubManager && (
                  <SidebarMenuItem>
                    <SidebarMenuButton 
                      asChild 
                      isActive={pathname === '/club'} 
                      className={cn(
                        "h-12 px-4 rounded-2xl transition-all font-black text-xs uppercase tracking-widest",
                        pathname === '/club' ? "bg-black text-white shadow-lg hover:bg-black hover:text-white" : "bg-primary/5 text-primary hover:bg-primary/10"
                      )}
                    >
                      <Link href="/club"><Building className="h-5 w-5 mr-3" />Club Hub</Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between h-14 px-3 border-muted-foreground/10 bg-background/50 rounded-2xl shadow-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-9 w-9 rounded-xl border-2 border-background shadow-md">
                        <AvatarImage src={activeTeam?.teamLogoUrl} className="object-cover" />
                        <AvatarFallback className="hero-gradient text-white font-black text-xs">{activeTeam?.name?.[0] || 'T'}</AvatarFallback>
                      </Avatar>
                      <span className="font-extrabold text-sm truncate">{activeTeam?.name || 'Select Squad'}</span>
                    </div>
                    <ChevronDown className="h-4 w-4 opacity-40" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72 p-2 rounded-2xl shadow-2xl">
                  <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground p-3">My Squads</DropdownMenuLabel>
                  <ScrollArea className="h-[200px]">
                    {teams.map(team => (
                      <DropdownMenuItem key={team.id} onClick={() => setActiveTeam(team)} className={cn("flex items-center gap-3 p-3 rounded-xl cursor-pointer", activeTeam?.id === team.id ? "bg-primary/5 text-primary" : "")}>
                        <Avatar className="h-8 w-8 rounded-lg shrink-0">
                          <AvatarImage src={team.teamLogoUrl} />
                          <AvatarFallback className="font-black text-[10px]">{team.name?.[0] || 'T'}</AvatarFallback>
                        </Avatar>
                        <span className="font-bold text-sm truncate">{team.name}</span>
                        {activeTeam?.id === team.id && <CheckCircle2 className="h-4 w-4 ml-auto" />}
                      </DropdownMenuItem>
                    ))}
                  </ScrollArea>
                  
                  <DropdownMenuSeparator className="my-2" />
                  
                  <DropdownMenuItem onClick={() => router.push('/team')} className="p-3 cursor-pointer rounded-xl font-bold text-xs gap-3">
                    <Settings className="h-4 w-4 text-primary" /> View Squad Profile
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem onClick={() => router.push('/teams/join')} className="p-3 cursor-pointer rounded-xl font-bold text-xs gap-3">
                    <UserPlus className="h-4 w-4 text-primary" /> Recruitment Hub
                  </DropdownMenuItem>

                  <DropdownMenuSeparator className="my-2" />
                  
                  <DropdownMenuItem onClick={() => router.push('/teams/new?tier=starter')} className="p-3 cursor-pointer rounded-xl font-bold text-xs gap-3">
                    <PlusCircle className="h-4 w-4 text-primary" /> Deploy Free Starter Team
                  </DropdownMenuItem>
                  
                  <DropdownMenuItem onClick={() => router.push('/teams/new?tier=pro')} className="p-3 cursor-pointer rounded-xl font-bold text-xs gap-3">
                    <Zap className="h-4 w-4 text-amber-500" /> Deploy Elite Pro Team
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarHeader>

            <SidebarContent className="px-4 py-2">
              <SidebarMenu className="space-y-6">
                {isStaff && (
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-primary px-2 mb-2">Command</p>
                    {adminTabs.map(tab => <SidebarItem key={tab.name} tab={tab} isActive={pathname === tab.href} isLocked={tab.pro && !isPro} />)}
                  </div>
                )}
                <div className="space-y-1.5">
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground px-2 mb-2">Operations</p>
                  {filteredCoordTabs.map(tab => <SidebarItem key={tab.name} tab={tab} isActive={pathname === tab.href} isLocked={tab.pro && !isPro && isStaff} />)}
                </div>
              </SidebarMenu>
            </SidebarContent>

            <SidebarFooter className="p-6">
              <Link href="/settings">
                <div className="flex items-center gap-3 p-2 hover:bg-primary/5 rounded-2xl transition-all cursor-pointer">
                  <Avatar className="h-10 w-10 border-2 border-background shadow-md"><AvatarImage src={user?.avatar} /><AvatarFallback>{user?.name?.[0]}</AvatarFallback></Avatar>
                  <div className="flex flex-col min-w-0"><span className="font-black text-sm truncate">{user?.name}</span><span className="text-[10px] font-bold text-muted-foreground uppercase">Settings</span></div>
                </div>
              </Link>
            </SidebarFooter>
          </Sidebar>

          <div className="flex flex-col flex-1 h-screen overflow-hidden">
            <header className="sticky top-0 z-40 w-full bg-background/80 backdrop-blur-md border-b h-16 md:h-20 flex items-center px-4 md:px-10 justify-between">
              <div className="hidden md:block">
                <h2 className="text-xl lg:text-2xl font-black uppercase tracking-tighter">
                  {pathname === '/' ? 'Strategic Command' : coordinationTabs.find(t => t.href === pathname)?.name || adminTabs.find(t => t.href === pathname)?.name || 'Dashboard'}
                </h2>
              </div>
              <div className="md:hidden"><BrandLogo variant="light-background" className="h-6 w-28" /></div>
              <div className="flex items-center gap-3">
                {isStaff && <CreateAlertButton />}
                <AlertsHistoryDialog><Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl"><Bell className="h-5 w-5" /></Button></AlertsHistoryDialog>
                <Link href="/settings"><Avatar className="h-8 w-8 md:h-10 md:w-10 border-2 border-background shadow-md"><AvatarImage src={user?.avatar} /><AvatarFallback>{user?.name?.[0]}</AvatarFallback></Avatar></Link>
              </div>
            </header>
            <main className="flex-1 overflow-y-auto p-4 md:p-10 max-w-7xl mx-auto w-full custom-scrollbar">
              {children}
            </main>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
