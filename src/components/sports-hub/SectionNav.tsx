'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Home, Newspaper, GraduationCap, Users, Trophy, BookOpen, Library, Star, HeartHandshake, Sparkles } from 'lucide-react';

const sections = [
  { name: 'The Hub', href: '/sports-hub', icon: Home },
  { name: 'Latest News', href: '/sports-hub/news', icon: Newspaper },
  { name: 'Youth Sports', href: '/sports-hub/youth', icon: Sparkles },
  { name: 'Coaching', href: '/sports-hub/coaching', icon: GraduationCap },
  { name: 'Team Management', href: '/sports-hub/team-management', icon: Users },
  { name: 'Parents', href: '/sports-hub/parents', icon: HeartHandshake },
  { name: 'Tournaments', href: '/sports-hub/tournaments', icon: Trophy },
  { name: 'Resources', href: '/sports-hub/resources', icon: Library },
  { name: 'Playbook', href: '/sports-hub/playbook', icon: BookOpen },
  { name: 'Featured', href: '/sports-hub/featured', icon: Star },
];

export function SectionNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-16 md:top-20 z-30 bg-background/95 backdrop-blur-md border-b" aria-label="Sports Hub sections">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="flex flex-wrap items-center justify-center gap-1 py-2">
          {sections.map((section) => {
            const Icon = section.icon;
            const isActive = section.href === '/sports-hub'
              ? pathname === '/sports-hub'
              : pathname.startsWith(section.href);
            return (
              <Link
                key={section.href}
                href={section.href}
                className={cn(
                  'flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all text-[11px] font-black uppercase tracking-wider whitespace-nowrap lg:px-4 lg:text-xs lg:tracking-widest',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/70'
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {section.name}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
