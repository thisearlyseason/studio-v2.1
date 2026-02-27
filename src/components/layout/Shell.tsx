
"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Rss, 
  CalendarDays, 
  MessageSquare, 
  Users, 
  FileText, 
  Settings,
  ChevronDown,
  LogOut,
  Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const tabs = [
  { name: 'Feed', href: '/feed', icon: Rss },
  { name: 'Events', href: '/events', icon: CalendarDays },
  { name: 'Chats', href: '/chats', icon: MessageSquare },
  { name: 'Roster', href: '/roster', icon: Users },
  { name: 'Files', href: '/files', icon: FileText },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [currentTeam, setCurrentTeam] = useState('Eagles Soccer Club');
  
  // Mock teams
  const teams = [
    { id: '1', name: 'Eagles Soccer Club', code: 'EAGL01' },
    { id: '2', name: 'Wildcats Basketball', code: 'CAT99X' }
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Top Header */}
      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between px-4 max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 font-bold text-lg p-0 hover:bg-transparent">
                  {currentTeam}
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Your Teams</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {teams.map((team) => (
                  <DropdownMenuItem key={team.id} onClick={() => setCurrentTeam(team.name)}>
                    {team.name}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/teams/new" className="flex items-center">
                    <Plus className="mr-2 h-4 w-4" />
                    Create New Team
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/teams/join" className="flex items-center">
                    <Plus className="mr-2 h-4 w-4" />
                    Join with Code
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          
          <Avatar className="h-8 w-8">
            <AvatarImage src="https://picsum.photos/seed/me/150/150" alt="Profile" />
            <AvatarFallback>SF</AvatarFallback>
          </Avatar>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pb-20 pt-4 px-4 max-w-2xl mx-auto w-full">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 md:px-4">
        <div className="container flex h-16 items-center justify-around max-w-2xl mx-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = pathname === tab.href;
            return (
              <Link
                key={tab.name}
                href={tab.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5", isActive && "fill-current")} />
                <span className="text-[10px] font-medium">{tab.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
