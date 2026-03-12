
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
  SidebarSeparator,
  SidebarTrigger
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
            ? "bg-primary/10 text-primary shadow-none hover:bg-primary/10 hover:text-primary" 
            : "text-foreground hover:bg-muted/80 hover:text-primary"
        )}
      >
        <Link href={tab.href} className="flex items-center justify-between w-full">
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
      <div className="flex flex-col min-h-screen w-full bg-background selection:bg-primary/20">
        <div className="flex flex-1 overflow-hidden">
          <Sidebar className="border-r bg-white w-72 shrink-0 shadow-sm" collapsible="offcanvas">
            <SidebarHeader className="p-6">
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

                {isClubManager && (
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
                      <span className="font-black text-sm truncate uppercase tracking-tight">{activeTeam?.name || 'Select Squad'}</span>
                    </div>
                    <ChevronDown className="h-4 w-4 opacity-40" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72 p-2 rounded-2xl shadow-2xl">
                  <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-muted-foreground p-3">My Squads</DropdownMenuLabel>
                  <ScrollArea className="h-[300px]">
                    {teams.map(team => (
                      <DropdownMenuItem key={team.id} onClick={() => setActiveTeam(team)} className={cn("flex items-center gap-3 p-3 rounded-xl cursor-pointer", activeTeam?.id === team.id ? "bg-primary/5 text-primary" : "")}>
                        <Avatar className="h-8 w-8 rounded-lg shrink-0 shadow-sm">
                          <AvatarImage src={team.teamLogoUrl} />
                          <AvatarFallback className="font-black text-[10px]">{team.name?.[0] || 'T'}</AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="font-black text-sm truncate uppercase tracking-tight">{team.name}</span>
                          {team.isPro ? (
                            <Badge className="w-fit h-4 text-[7px] font-black uppercase bg-primary text-white border-none mt-0.5">
                              <Zap className="h-2 w-2 mr-1 fill-current" /> ELITE PRO
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="w-fit h-4 text-[7px] font-black uppercase border-muted-foreground/30 text-muted-foreground mt-0.5">
                              STARTER
                            </Badge>
                          )}
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

            <SidebarFooter className="p-6 border-t bg-muted/5">
              <Link href="/settings">
                <div className="flex items-center gap-3 p-2 hover:bg-primary/5 rounded-2xl transition-all cursor-pointer group">
                  <Avatar className="h-10 w-10 border-2 border-background shadow-md transition-transform group-hover:scale-105"><AvatarImage src={user?.avatar} /><AvatarFallback className="font-black text-xs">{user?.name?.[0]}</AvatarFallback></Avatar>
                  <div className="flex flex-col min-w-0"><span className="font-black text-sm truncate uppercase tracking-tight">{user?.name}</span><span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Global Settings</span></div>
                </div>
              </Link>
            </SidebarFooter>
          </Sidebar>

          <div className="flex flex-col flex-1 h-screen overflow-hidden">
            <header className="sticky top-0 z-40 w-full bg-background/80 backdrop-blur-md border-b h-16 md:h-20 flex items-center px-4 md:px-10 justify-between">
              <div className="flex items-center gap-4">
                <div className="md:hidden"><SidebarTrigger className="h-10 w-10 text-foreground" /></div>
                <div className="hidden md:block">
                  <h2 className="text-xl lg:text-2xl font-black uppercase tracking-tighter text-foreground">
                    {pathname === '/dashboard' ? 'Strategic Command' : coordinationTabs.find(t => t.href === pathname)?.name || adminTabs.find(t => t.href === pathname)?.name || 'Dashboard'}
                  </h2>
                </div>
              </div>
              <div className="md:hidden"><BrandLogo variant="light-background" className="h-6 w-28" /></div>
              <div className="flex items-center gap-3">
                {isStaff && <CreateAlertButton />}
                <AlertsHistoryDialog><Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl hover:bg-primary/5 text-foreground"><Bell className="h-5 w-5" /></Button></AlertsHistoryDialog>
                <Link href="/settings"><Avatar className="h-8 w-8 md:h-10 md:w-10 border-2 border-background shadow-md"><AvatarImage src={user?.avatar} /><AvatarFallback className="font-black text-xs">{user?.name?.[0]}</AvatarFallback></Avatar></Link>
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
