
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
  BookOpen,
  Video,
  Zap,
  Baby,
  UserPlus,
  Star,
  HandHelping,
  PiggyBank,
  Package
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTeam, Team } from '@/components/providers/team-provider';
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

const tabs = [
  { name: 'Feed', href: '/feed', icon: LayoutDashboard, pro: true },
  { name: 'Schedule', href: '/events', icon: CalendarDays, pro: false },
  { name: 'Leagues', href: '/leagues', icon: Shield, pro: false },
  { name: 'Scorekeeping', href: '/games', icon: Trophy, pro: false },
  { name: 'Playbook', icon: Dumbbell, href: '/drills', pro: false, mobileName: 'Playbook' },
  { name: 'Volunteer', href: '/volunteers', icon: HandHelping, pro: false, gate: 'staff_or_parent' },
  { name: 'Fundraising', href: '/fundraising', icon: PiggyBank, pro: false, gate: 'staff_or_parent' },
  { name: 'Equipment', href: '/equipment', icon: Package, pro: true, gate: 'staff' },
  { name: 'Chats', href: '/chats', icon: MessageCircle, pro: false },
  { name: 'Roster', href: '/roster', icon: Users2, pro: false },
  { name: 'Library', href: '/files', icon: FolderClosed, pro: false, mobileName: 'Docs' },
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

function TeamSwitcherContent({ 
  teams, 
  activeTeam, 
  setActiveTeam, 
  router,
  isStaff
}: { 
  teams: Team[], 
  activeTeam: Team | null, 
  setActiveTeam: (t: Team) => void,
  router: any,
  isStaff: boolean
}) {
  return (
    <div className="p-2 w-72">
      <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest opacity-50 px-3 py-2">Switch Squad</DropdownMenuLabel>
      <DropdownMenuSeparator className="my-1" />
      
      <ScrollArea className="max-h-[300px]">
        {teams.map((team) => (
          <DropdownMenuItem 
            key={team.id} 
            onClick={() => setActiveTeam(team)}
            className={cn(
              "flex items-center justify-between p-3 cursor-pointer rounded-xl transition-all mb-1",
              activeTeam?.id === team.id ? "bg-primary/5 ring-1 ring-primary/20" : "hover:bg-muted"
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="h-9 w-9 rounded-xl shrink-0 border shadow-sm">
                <AvatarImage src={team.teamLogoUrl} className="object-cover" />
                <AvatarFallback className="bg-muted font-black text-[10px]">{team.name[0]}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0">
                <span className="font-black text-sm truncate leading-tight">{team.name}</span>
                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-tighter">{team.sport}</span>
              </div>
            </div>
            {team.isPro && <Badge className="bg-amber-500 text-white border-none font-black text-[7px] h-4 px-1 shadow-sm">PRO</Badge>}
          </DropdownMenuItem>
        ))}
      </ScrollArea>

      <DropdownMenuSeparator className="my-2" />
      <DropdownMenuLabel className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40 px-3 py-1">Management Hub</DropdownMenuLabel>
      
      {activeTeam && (
        <DropdownMenuItem onClick={() => router.push('/team')} className="p-3 cursor-pointer rounded-xl font-bold text-xs gap-3 hover:bg-muted group">
          <div className="bg-primary/5 p-2 rounded-lg group-hover:bg-primary/10"><Info className="h-4 w-4 text-primary" /></div>
          <span>Active Squad Profile</span>
        </DropdownMenuItem>
      )}

      <DropdownMenuItem onClick={() => router.push('/teams/join')} className="p-3 cursor-pointer rounded-xl font-bold text-xs gap-3 hover:bg-muted group">
        <div className="bg-muted p-2 rounded-lg group-hover:bg-muted-foreground/10"><UserPlus className="h-4 w-4 text-muted-foreground" /></div>
        <span>Join Squad via Code</span>
      </DropdownMenuItem>

      {isStaff && (
        <>
          <DropdownMenuSeparator className="my-2" />
          <DropdownMenuLabel className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40 px-3 py-1">Deployment</DropdownMenuLabel>
          
          <DropdownMenuItem onClick={() => router.push('/teams/new')} className="p-3 cursor-pointer rounded-xl font-bold text-xs gap-3 hover:bg-muted group">
            <div className="bg-muted p-2 rounded-lg group-hover:bg-muted-foreground/10"><PlusCircle className="h-4 w-4 text-muted-foreground" /></div>
            <span>Launch Free Starter Squad</span>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => router.push('/teams/new')} className="p-3 cursor-pointer rounded-xl font-bold text-xs gap-3 hover:bg-muted group">
            <div className="bg-amber-100 p-2 rounded-lg group-hover:bg-amber-200"><Star className="h-4 w-4 text-amber-600" /></div>
            <div className="flex flex-col">
              <span>Deploy Elite Pro Squad</span>
              <span className="text-[8px] opacity-60">UNLIMITED COORDINATION</span>
            </div>
          </DropdownMenuItem>
        </>
      )}
    </div>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { 
    activeTeam, setActiveTeam, teams, user, isPro, alerts, isSuperAdmin, 
    isClubManager, isStaff, isParent, hasFeature, isPlayer
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

  const filteredTabs = tabs.filter(tab => {
    if (tab.gate === 'staff_or_parent') {
      if (!isStaff && !isParent) return false;
    }
    if (tab.gate === 'staff') {
      if (!isStaff) return false;
    }

    if (tab.name === 'Feed') {
      if (isParent && !activeTeam?.parentCommentsEnabled) return false;
      if ((isParent || isPlayer) && !isPro) return false;
    }
    
    if (tab.name === 'Chats' && isParent && activeTeam && !activeTeam.parentChatEnabled) return false;
    
    return true;
  });

  return (
    <SidebarProvider>
      <div className="flex flex-col min-h-screen w-full bg-background selection:bg-primary/20">
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

              {isParent && (
                <div className="mb-6 px-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground mb-2">Guardian Control</p>
                  <Button 
                    asChild 
                    className={cn(
                      "w-full h-12 rounded-2xl justify-start gap-3 font-black text-xs uppercase tracking-widest transition-all",
                      pathname === '/family' ? "bg-black text-white shadow-xl" : "bg-primary/5 text-primary hover:bg-primary/10"
                    )}
                  >
                    <Link href="/family">
                      <Baby className="h-5 w-5" />
                      Family Hub
                    </Link>
                  </Button>
                </div>
              )}

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
                  <DropdownMenuContent align="start" className="p-0 rounded-2xl shadow-2xl border-muted overflow-hidden">
                    <TeamSwitcherContent 
                      teams={teams} 
                      activeTeam={activeTeam} 
                      setActiveTeam={setActiveTeam} 
                      router={router}
                      isStaff={isStaff}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </SidebarHeader>

            <SidebarContent className="px-4 py-2">
              <SidebarMenu className="space-y-1.5">
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground mb-2 px-2">Squad Operations</p>
                {filteredTabs.map((tab) => (
                  <SidebarItem 
                    key={tab.name} 
                    tab={tab} 
                    isActive={pathname.startsWith(tab.href)} 
                    isLocked={tab.pro && !isPro && isStaff} 
                  />
                ))}
                
                {isStaff && (
                  <>
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
                  </>
                )}
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
              <div className="hidden md:flex items-center gap-4 min-w-0">
                <div className="flex flex-col min-w-0">
                  <h2 className="text-xl lg:text-2xl font-black tracking-tighter uppercase truncate">
                    {pathname === '/pricing' ? 'Pricing' : pathname === '/how-to' ? 'Tactical Manual' : (pathname === '/leagues' ? 'League Hub' : (tabs.find(t => pathname.startsWith(t.href))?.name || 'Dashboard'))}
                  </h2>
                  <p className="text-[9px] lg:text-[10px] font-black uppercase text-muted-foreground tracking-[0.2em] lg:tracking-[0.3em] ml-0.5 truncate">The Squad Hub • {activeTeam?.name}</p>
                </div>
              </div>

              <div className="flex md:hidden items-center shrink-0">
                <Link href="/feed">
                  <BrandLogo variant="light-background" className="h-6 w-28" />
                </Link>
              </div>

              <div className="flex items-center gap-3 lg:gap-6 shrink-0">
                <div className="md:hidden">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-10 px-3 gap-2 border-muted-foreground/10 bg-background/50 rounded-xl shadow-sm font-black text-[10px] uppercase tracking-tighter max-w-[140px]">
                        <span className="truncate">{activeTeam?.name || 'Squad'}</span>
                        <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="p-0 rounded-2xl shadow-2xl border-muted overflow-hidden">
                      <TeamSwitcherContent 
                        teams={teams} 
                        activeTeam={activeTeam} 
                        setActiveTeam={setActiveTeam} 
                        router={router}
                        isStaff={isStaff}
                      />
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
                  
                  <Link href="/settings">
                    <Avatar className="h-8 w-8 md:h-10 md:w-10 border-2 border-background shadow-md">
                      <AvatarImage src={user?.avatar} alt={user?.name} className="object-cover" />
                      <AvatarFallback className="font-black text-[10px] md:text-xs">{user?.name?.[0] || '?'}</AvatarFallback>
                    </Avatar>
                  </Link>
                </div>
              </div>
            </header>

            <main className="flex-1 pb-36 md:pb-12 pt-4 md:pt-6 px-4 md:px-10 max-w-7xl mx-auto w-full overflow-y-auto custom-scrollbar">
              {children}
            </main>

            <nav className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[94%] max-w-md bg-white/90 backdrop-blur-xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-white/40 p-1.5 ring-1 ring-black/5">
              <div className="flex items-center justify-around h-16">
                {filteredTabs.slice(0, 5).map((tab) => {
                  const Icon = tab.icon;
                  const isActive = pathname.startsWith(tab.href);
                  const isLocked = tab.pro && !isPro && isStaff;
                  return (
                    <Link 
                      key={tab.name} 
                      href={tab.href} 
                      className={cn(
                        "flex flex-col items-center justify-center gap-1.5 px-3 py-2 rounded-2xl transition-all relative min-w-[64px]", 
                        isActive ? "text-primary bg-primary/10 shadow-inner" : "text-muted-foreground active:scale-90"
                      )}
                    >
                      <Icon className={cn("h-5 w-5 transition-transform", isActive && "scale-110 stroke-[3px]", isLocked && "opacity-50")} strokeWidth={isActive ? 3 : 2} />
                      <span className="text-[8px] font-black tracking-[0.05em] uppercase truncate">{tab.mobileName || tab.name}</span>
                      {isLocked && <Lock className="absolute top-1.5 right-2 h-2 w-2 opacity-40" />}
                      {isActive && <div className="absolute -bottom-1 h-1 w-4 bg-primary rounded-full" />}
                    </Link>
                  );
                })}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex flex-col items-center justify-center gap-1.5 px-3 py-2 rounded-2xl text-muted-foreground active:scale-90 transition-all min-w-[64px]">
                      <Settings className="h-5 w-5" strokeWidth={2} />
                      <span className="text-[8px] font-black tracking-[0.05em] uppercase">More</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 rounded-xl shadow-2xl p-2 mb-4">
                    {isParent && (
                      <>
                        <DropdownMenuItem asChild className="rounded-xl p-3">
                          <Link href="/family" className="flex items-center gap-3 font-bold text-xs uppercase tracking-widest">
                            <Baby className="h-4 w-4" />
                            Family Hub
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    {isClubManager && (
                      <>
                        <DropdownMenuItem asChild className="rounded-xl p-3">
                          <Link href="/club" className="flex items-center gap-3 font-bold text-xs uppercase tracking-widest">
                            <Building className="h-4 w-4" />
                            Club Hub
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    {filteredTabs.slice(5).map((tab) => (
                      <DropdownMenuItem key={tab.name} asChild className="rounded-xl p-3">
                        <Link href={tab.href} className="flex items-center gap-3 font-bold text-xs uppercase tracking-widest">
                          <tab.icon className="h-4 w-4" />
                          {tab.name}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild className="rounded-xl p-3 text-primary">
                      <Link href="/settings" className="flex items-center gap-3 font-bold text-xs uppercase tracking-widest">
                        <Settings className="h-4 w-4" />
                        Settings
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </nav>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}
