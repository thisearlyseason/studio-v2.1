
"use client";

import React from 'react';
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
  PlusCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTeam } from '@/components/providers/team-provider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const tabs = [
  { name: 'Feed', href: '/feed', icon: LayoutDashboard },
  { name: 'Schedule', href: '/events', icon: CalendarDays },
  { name: 'Chats', href: '/chats', icon: MessageCircle },
  { name: 'Roster', href: '/roster', icon: Users2 },
  { name: 'Library', href: '/files', icon: FolderClosed },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { activeTeam, setActiveTeam, teams, user } = useTeam();

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Dynamic Header */}
      <header className="sticky top-0 z-50 w-full glass shadow-sm">
        <div className="container flex h-16 items-center justify-between px-4 max-w-4xl mx-auto">
          <div className="flex items-center gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-3 h-10 hover:bg-muted/50 transition-all active:scale-95">
                  <div className="w-8 h-8 rounded-lg hero-gradient flex items-center justify-center text-white font-black text-sm">
                    {activeTeam?.name?.[0] || 'T'}
                  </div>
                  <span className="font-extrabold text-base tracking-tight">
                    {activeTeam?.name || 'Select Squad'}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-40" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 rounded-xl shadow-xl border-muted">
                <DropdownMenuLabel className="text-xs font-bold uppercase tracking-widest opacity-50 px-3 py-2">My Squads</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {teams.length > 0 ? teams.map((team) => (
                  <DropdownMenuItem 
                    key={team.id} 
                    onClick={() => setActiveTeam(team)}
                    className="flex items-center gap-3 p-3 cursor-pointer rounded-lg mx-1 my-1"
                  >
                    <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center font-bold text-xs">
                      {team.name[0]}
                    </div>
                    <span className="font-semibold">{team.name}</span>
                  </DropdownMenuItem>
                )) : (
                  <div className="px-4 py-3 text-sm text-muted-foreground italic">No squads yet</div>
                )}
                <DropdownMenuSeparator />
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
          
          <div className="flex items-center gap-2">
            <Link href="/settings">
              <Avatar className="h-9 w-9 border-2 border-background shadow-sm hover:ring-4 hover:ring-primary/10 transition-all">
                <AvatarImage src={user?.avatar} alt={user?.name} />
                <AvatarFallback className="font-bold">{user?.name?.[0] || '?'}</AvatarFallback>
              </Avatar>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content with subtle animations */}
      <main className="flex-1 pb-24 pt-6 px-4 max-w-4xl mx-auto w-full animate-in fade-in duration-700 slide-in-from-bottom-2">
        {children}
      </main>

      {/* Modern Floating Bottom Navigation */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-lg glass rounded-2xl shadow-2xl border-white/40 p-1.5 transition-all hover:scale-[1.02]">
        <div className="flex items-center justify-around h-14">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.name}
                href={tab.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl transition-all relative",
                  isActive 
                    ? "text-primary bg-primary/5" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <Icon className={cn("h-5 w-5 transition-transform", isActive && "scale-110")} strokeWidth={isActive ? 2.5 : 2} />
                <span className={cn("text-[10px] font-bold tracking-tight uppercase", !isActive && "opacity-70")}>
                  {tab.name}
                </span>
                {isActive && (
                  <span className="absolute -top-1 w-1 h-1 bg-primary rounded-full animate-pulse" />
                )}
              </Link>
            );
          })}
          <Link
            href="/settings"
            className={cn(
              "flex flex-col items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl transition-all",
              pathname === '/settings' ? "text-primary bg-primary/5" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Settings className="h-5 w-5" strokeWidth={pathname === '/settings' ? 2.5 : 2} />
            <span className="text-[10px] font-bold uppercase">Me</span>
          </Link>
        </div>
      </nav>
    </div>
  );
}
