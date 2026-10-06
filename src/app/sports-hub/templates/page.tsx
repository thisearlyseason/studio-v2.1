'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Layout, ChevronRight, Star, Clock, Users, Trophy, ClipboardList, Calendar, FileText, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.07 } },
};

const CATEGORIES = ['All', 'Planning', 'Game Day', 'Communication', 'Admin', 'Tracking'];

const TEMPLATES = [
  {
    id: 'season-planning-spreadsheet',
    title: 'Season Planning Spreadsheet',
    description: 'Map your entire season week by week. Includes phase breakdown, training load calculator, game schedule, and monthly check-ins.',
    category: 'Planning',
    icon: Calendar,
    color: 'bg-blue-100 text-blue-700',
    isFeatured: true,
    isNew: false,
    tags: ['season', 'planning', 'all sports'],
    useCount: '2,847',
  },
  {
    id: 'practice-plan-builder',
    title: 'Practice Plan Builder',
    description: 'A structured 90-minute practice planner. Drag-and-drop drill slots, time blocks, and coaching notes. Print-ready.',
    category: 'Planning',
    icon: ClipboardList,
    color: 'bg-green-100 text-green-700',
    isFeatured: true,
    isNew: false,
    tags: ['practice', 'drills', 'all sports'],
    useCount: '1,923',
  },
  {
    id: 'game-day-checklist',
    title: 'Game Day Checklist',
    description: 'Never forget a thing. 68-point interactive checklist covering equipment, comms, officials, first aid, and post-game tasks.',
    category: 'Game Day',
    icon: Trophy,
    color: 'bg-amber-100 text-amber-700',
    isFeatured: false,
    isNew: false,
    tags: ['game day', 'checklist', 'all sports'],
    useCount: '3,102',
  },
  {
    id: 'roster-contact-sheet',
    title: 'Roster & Contact Sheet',
    description: 'Complete team roster template with player info, emergency contacts, medical notes, and jersey assignments.',
    category: 'Admin',
    icon: Users,
    color: 'bg-purple-100 text-purple-700',
    isFeatured: false,
    isNew: true,
    tags: ['roster', 'contacts', 'admin'],
    useCount: '1,441',
  },
  {
    id: 'parent-communication-pack',
    title: 'Parent Communication Pack',
    description: '12 pre-written email and message templates for coaches — season kickoff, injury updates, schedule changes, and more.',
    category: 'Communication',
    icon: FileText,
    color: 'bg-rose-100 text-rose-700',
    isFeatured: true,
    isNew: false,
    tags: ['parents', 'email', 'templates'],
    useCount: '4,218',
  },
  {
    id: 'incident-report-form',
    title: 'Incident & Injury Report Form',
    description: 'A legally sound incident report template for youth and amateur sports. Documents the who, what, when, and follow-up.',
    category: 'Admin',
    icon: AlertCircle,
    color: 'bg-red-100 text-red-700',
    isFeatured: false,
    isNew: true,
    tags: ['safety', 'injury', 'admin'],
    useCount: '892',
  },
  {
    id: 'tournament-runsheet',
    title: 'Tournament Run Sheet',
    description: 'The day-of operations timeline for tournament directors. Covers field setup, official check-in, scoring, and awards.',
    category: 'Game Day',
    icon: Layout,
    color: 'bg-indigo-100 text-indigo-700',
    isFeatured: false,
    isNew: true,
    tags: ['tournament', 'operations', 'admin'],
    useCount: '678',
  },
  {
    id: 'athlete-performance-tracker',
    title: 'Athlete Performance Tracker',
    description: 'Track individual player stats, attendance, effort scores, and development goals across an entire season.',
    category: 'Tracking',
    icon: Star,
    color: 'bg-yellow-100 text-yellow-700',
    isFeatured: true,
    isNew: false,
    tags: ['performance', 'tracking', 'players'],
    useCount: '1,654',
  },
];

export default function TemplatesPage() {
  const [activeCategory, setActiveCategory] = useState('All');

  const filtered = activeCategory === 'All'
    ? TEMPLATES
    : TEMPLATES.filter(t => t.category === activeCategory);

  const featured = TEMPLATES.filter(t => t.isFeatured);

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-12">

      {/* Header */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-11 w-11 rounded-2xl hero-gradient flex items-center justify-center shrink-0">
            <Layout className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-[9px] font-black text-primary uppercase tracking-[0.3em]">Sports Hub</p>
            <h1 className="text-2xl md:text-3xl font-black tracking-tighter uppercase">Free Templates</h1>
          </div>
        </div>
        <p className="text-muted-foreground font-medium text-sm max-w-2xl leading-relaxed">
          Ready-to-use templates built by coaches, for coaches. View and use every template directly in your browser — no signup, no download required.
        </p>
      </motion.div>

      {/* Featured row */}
      <motion.section initial="hidden" animate="visible" variants={stagger} className="mb-12">
        <div className="flex items-center gap-2 mb-5">
          <Star className="h-4 w-4 text-primary fill-primary" />
          <h2 className="text-sm font-black uppercase tracking-widest">Most Used Templates</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {featured.slice(0, 2).map((t) => {
            const Icon = t.icon;
            return (
              <motion.div key={t.id} variants={fadeUp}>
                <Link href={`/sports-hub/templates/${t.id}`} className="group block">
                  <div className="relative bg-card border-2 border-border hover:border-primary/40 rounded-2xl p-6 transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-primary/5 -mr-8 -mt-8" />
                    <div className={cn('h-11 w-11 rounded-2xl flex items-center justify-center mb-4', t.color)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="font-black tracking-tight text-lg group-hover:text-primary transition-colors leading-snug">{t.title}</h3>
                      <Badge className="bg-primary/10 text-primary border-0 text-[8px] font-black uppercase tracking-widest shrink-0">Free</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground font-medium leading-relaxed mb-4">{t.description}</p>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-1.5 flex-wrap">
                        {t.tags.map(tag => (
                          <span key={tag} className="text-[9px] font-black uppercase tracking-wider text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-full">{tag}</span>
                        ))}
                      </div>
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">{t.useCount} uses</span>
                    </div>
                    <div className="mt-4 flex items-center gap-1.5 text-xs font-black text-primary uppercase tracking-widest group-hover:gap-2.5 transition-all">
                      Open Template <ChevronRight className="h-3.5 w-3.5" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </motion.section>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-6">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              'px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest transition-all',
              activeCategory === cat
                ? 'bg-primary text-primary-foreground shadow'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted'
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* All templates grid */}
      <motion.div initial="hidden" animate="visible" variants={stagger} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((t) => {
          const Icon = t.icon;
          return (
            <motion.div key={t.id} variants={fadeUp}>
              <Link href={`/sports-hub/templates/${t.id}`} className="group block h-full">
                <div className="relative h-full bg-card border rounded-2xl p-5 transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:-translate-y-0.5 flex flex-col">
                  {t.isNew && (
                    <div className="absolute top-4 right-4">
                      <Badge className="bg-green-100 text-green-700 border-0 text-[8px] font-black uppercase tracking-widest">New</Badge>
                    </div>
                  )}
                  <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center mb-3 shrink-0', t.color)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex items-start gap-2 mb-1.5">
                    <h3 className="font-black tracking-tight text-sm leading-snug group-hover:text-primary transition-colors flex-1">{t.title}</h3>
                    <Badge className="bg-primary/10 text-primary border-0 text-[8px] font-black uppercase tracking-widest shrink-0">Free</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground font-medium leading-relaxed flex-1 mb-3">{t.description}</p>
                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-border">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">{t.category}</span>
                    <span className="flex items-center gap-1 text-[9px] font-black text-primary uppercase tracking-widest">
                      <Clock className="h-3 w-3" /> Open
                    </span>
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Bottom CTA */}
      <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
        className="mt-16 rounded-3xl hero-gradient p-8 md:p-12 text-white text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,rgba(255,255,255,0.08),transparent_60%)]" />
        <div className="relative z-10">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/60 mb-2">The Squad Platform</p>
          <h2 className="text-2xl md:text-3xl font-black tracking-tighter mb-3">Want templates that auto-fill?</h2>
          <p className="text-white/80 font-medium text-sm max-w-lg mx-auto mb-6">
            The Squad connects your roster, schedule, and communication tools so your templates populate automatically. Game day checklists build themselves.
          </p>
          <Link href="/dashboard">
            <button className="bg-white text-primary font-black text-xs uppercase tracking-widest px-6 py-3 rounded-xl hover:bg-white/90 transition-colors">
              Try The Squad Free
            </button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
