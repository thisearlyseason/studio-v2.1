'use client';

import React from 'react';
import Link from 'next/link';
import { BookOpen, ChevronLeft, Search } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { SectionNav } from '@/components/sports-hub/SectionNav';
import { SearchBar } from '@/components/sports-hub/SearchBar';
import { Button } from '@/components/ui/button';

const HUB_SECTIONS = [
  ['The Hub', '/sports-hub'],
  ['Latest News', '/sports-hub/news'],
  ['Youth Sports', '/sports-hub/youth'],
  ['Coaching', '/sports-hub/coaching'],
  ['Team Management', '/sports-hub/team-management'],
  ['Parents', '/sports-hub/parents'],
  ['Tournaments', '/sports-hub/tournaments'],
  ['Resources', '/sports-hub/resources'],
  ['Playbook', '/sports-hub/playbook'],
  ['Featured', '/sports-hub/featured'],
] as const;

export function SportsHubClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 md:h-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/" className="hidden md:block"><BrandLogo variant="light-background" className="h-8 w-36" /></Link>
            <span className="hidden md:block text-muted-foreground/40 text-lg font-light">/</span>
            <Link href="/sports-hub" className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-xl hero-gradient flex items-center justify-center shrink-0"><BookOpen className="h-4 w-4 text-white" /></div>
              <span className="font-black uppercase tracking-tighter text-sm md:text-base">Sports Hub</span>
            </Link>
          </div>
          <div className="hidden md:flex flex-1 max-w-sm"><SearchBar className="w-full" /></div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="hidden md:block"><Button variant="ghost" size="sm" className="font-black text-xs uppercase tracking-widest text-muted-foreground hover:text-primary gap-1.5"><ChevronLeft className="h-3.5 w-3.5" />Back to App</Button></Link>
            <Link href="/sports-hub/search" className="md:hidden"><Button aria-label="Search Sports Hub" variant="ghost" size="icon" className="h-10 w-10 rounded-xl"><Search className="h-4 w-4" /></Button></Link>
            <Link href="/login"><Button size="sm" className="font-black text-xs uppercase tracking-widest hidden sm:flex">Get Started</Button></Link>
          </div>
        </div>
      </header>
      <SectionNav />
      <main className="flex-1">{children}</main>
      <footer className="bg-foreground text-background mt-20">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
            <div className="lg:col-span-2"><div className="flex items-center gap-2 mb-4"><div className="h-8 w-8 rounded-xl bg-primary flex items-center justify-center"><BookOpen className="h-4 w-4 text-white" /></div><span className="font-black uppercase tracking-tighter">The Squad Sports Hub</span></div><p className="text-background/50 text-sm font-medium leading-relaxed max-w-sm">The premium content platform for coaches, organizers, athletes, and parents. Built into The Squad.</p></div>
            <div><p className="text-[9px] font-black uppercase tracking-[0.3em] text-background/40 mb-4">Sections</p><div className="space-y-2">{HUB_SECTIONS.map(([section, href]) => <Link key={section} href={href} className="block text-xs font-bold text-background/60 hover:text-background transition-colors uppercase tracking-wider">{section}</Link>)}</div></div>
            <div><p className="text-[9px] font-black uppercase tracking-[0.3em] text-background/40 mb-4">The Squad</p><div className="space-y-2">{[['Home', '/'], ['Dashboard', '/dashboard'], ['Pricing', '/pricing'], ['Tournaments', '/tournaments'], ['Leagues', '/leagues']].map(([label, href]) => <Link key={label} href={href} className="block text-xs font-bold text-background/60 hover:text-background transition-colors uppercase tracking-wider">{label}</Link>)}</div></div>
          </div>
          <div className="border-t border-background/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4"><p className="text-xs font-bold text-background/30 uppercase tracking-widest">© {new Date().getFullYear()} The Squad · All rights reserved</p><div className="flex gap-6"><Link href="/privacy" className="text-xs font-bold text-background/30 hover:text-background/60 uppercase tracking-widest transition-colors">Privacy</Link><Link href="/terms" className="text-xs font-bold text-background/30 hover:text-background/60 uppercase tracking-widest transition-colors">Terms</Link></div></div>
        </div>
      </footer>
    </div>
  );
}
