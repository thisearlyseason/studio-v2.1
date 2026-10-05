'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, BookOpen, FileText, Dumbbell, Video, CheckSquare, Users, Calendar, AlertCircle, DollarSign, Package, Plane, Eye, Star, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RESOURCES, RESOURCES_BY_TYPE, FEATURED_RESOURCES, Resource } from '@/lib/sports-hub-resources';
import { cn } from '@/lib/utils';

const TYPE_LABELS: Record<string, string> = {
  'score-sheet': 'Score Sheets',
  'practice-plan': 'Practice Plans',
  'drill': 'Drills',
  'season-planner': 'Season Planners',
  'game-day-checklist': 'Game Day Checklists',
  'tournament-checklist': 'Tournament Checklists',
  'emergency-action-plan': 'Emergency Action Plans',
  'parent-communication': 'Parent Communication',
  'volunteer-guide': 'Volunteer Guides',
  'coach-meeting-agenda': 'Coach Meeting Agendas',
  'lineup-template': 'Lineup Templates',
  'fundraising-ideas': 'Fundraising Guides',
  'equipment-list': 'Equipment Lists',
  'travel-checklist': 'Travel Checklists',
  'video': 'Videos',
};

const BROWSE_CATEGORIES = [
  { type: 'score-sheet', label: 'Branded Score Sheets', icon: FileText, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-100 dark:border-red-900/30' },
  {
    type: 'practice-plan',
    label: 'Practice Plans',
    icon: FileText,
    color: 'text-blue-600',
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-100 dark:border-blue-900/30',
  },
  {
    type: 'drill',
    label: 'Drills Library',
    icon: Dumbbell,
    color: 'text-green-600',
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-green-100 dark:border-green-900/30',
  },
  {
    type: 'video',
    label: 'Video Library',
    icon: Video,
    color: 'text-purple-600',
    bg: 'bg-purple-50 dark:bg-purple-950/30',
    border: 'border-purple-100 dark:border-purple-900/30',
  },
  {
    type: 'season-planner',
    label: 'Season Planners',
    icon: Calendar,
    color: 'text-amber-600',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-100 dark:border-amber-900/30',
  },
  {
    type: 'game-day-checklist',
    label: 'Game Day Checklists',
    icon: CheckSquare,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-100 dark:border-emerald-900/30',
  },
  {
    type: 'tournament-checklist',
    label: 'Tournament Checklists',
    icon: List,
    color: 'text-orange-600',
    bg: 'bg-orange-50 dark:bg-orange-950/30',
    border: 'border-orange-100 dark:border-orange-900/30',
  },
  {
    type: 'emergency-action-plan',
    label: 'Emergency Action Plans',
    icon: AlertCircle,
    color: 'text-red-600',
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-100 dark:border-red-900/30',
  },
  {
    type: 'parent-communication',
    label: 'Parent Communication',
    icon: Users,
    color: 'text-sky-600',
    bg: 'bg-sky-50 dark:bg-sky-950/30',
    border: 'border-sky-100 dark:border-sky-900/30',
  },
];

const difficultyColors: Record<string, string> = {
  beginner: 'bg-green-100 text-green-700',
  intermediate: 'bg-amber-100 text-amber-700',
  advanced: 'bg-red-100 text-red-700',
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

function ResourceRow({ resource }: { resource: Resource }) {
  return (
    <Link href={`/sports-hub/resources/${resource.id}`} className="group block">
      <div className="flex items-center justify-between gap-4 p-4 rounded-xl border hover:border-primary/30 hover:bg-primary/5 transition-all">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            {resource.isVideo ? <Video className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-primary" />}
          </div>
          <div className="min-w-0">
            <p className="font-black text-sm truncate group-hover:text-primary transition-colors">{resource.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={cn('text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded', difficultyColors[resource.difficulty])}>
                {resource.difficulty}
              </span>
              {resource.sport !== 'General' && (
                <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">{resource.sport}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted-foreground font-bold hidden sm:flex items-center gap-1">
            <Eye className="h-3 w-3" /> {resource.downloadCount.toLocaleString()}
          </span>
          <Button variant="outline" size="sm" className="font-black text-xs uppercase tracking-widest gap-1.5 h-8 rounded-lg hover:text-primary hover:border-primary">
            {resource.isVideo ? <><Video className="h-3 w-3" /> Watch</> : <><Eye className="h-3 w-3" /> View Resource</>}
          </Button>
        </div>
      </div>
    </Link>
  );
}

export default function ResourcesPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-12 space-y-14">

      {/* Header */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-2xl hero-gradient flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-primary">Sports Hub</p>
            <h1 className="text-3xl md:text-4xl font-black tracking-tighter uppercase">Resources</h1>
          </div>
        </div>
        <p className="text-muted-foreground font-medium max-w-xl mt-2">
          The Squad&apos;s original resource library. Practice plans, drills, templates, and guides — built by coaches, for coaches.
        </p>
      </motion.div>

      {/* Browse by Type */}
      <motion.section initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
        <h2 className="text-xl font-black uppercase tracking-tighter mb-6">Browse by Type</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {BROWSE_CATEGORIES.map(({ type, label, icon: Icon, color, bg, border }) => {
            const count = (RESOURCES_BY_TYPE as any)[type]?.length ?? 0;
            return (
              <Link key={type} href={`/sports-hub/playbook?type=${type}`} className="group">
                <div className={cn('rounded-2xl border p-5 transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer', bg, border)}>
                  <Icon className={cn('h-7 w-7 mb-3', color)} />
                  <p className={cn('font-black text-sm', color)}>{label}</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">
                    {count} Resource{count !== 1 ? 's' : ''}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </motion.section>

      {/* Most Viewed */}
      <motion.section initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black uppercase tracking-tighter">Most Viewed</h2>
          <Link href="/sports-hub/playbook">
            <Button variant="ghost" size="sm" className="font-black text-xs uppercase tracking-widest gap-1.5 text-muted-foreground hover:text-primary">
              Full Playbook <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {RESOURCES
            .sort((a, b) => b.downloadCount - a.downloadCount)
            .slice(0, 6)
            .map(resource => (
              <Link key={resource.id} href={`/sports-hub/resources/${resource.id}`} className="group">
                <div className="depth-card bg-card border rounded-xl p-4 h-full flex flex-col hover:border-primary/30 transition-all hover:shadow-md hover:-translate-y-0.5">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-[8px] font-black uppercase tracking-[0.15em] px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {TYPE_LABELS[resource.type] || resource.type}
                    </span>
                    <span className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                      <Eye className="h-3 w-3" /> {resource.downloadCount.toLocaleString()}
                    </span>
                  </div>
                  <p className="font-black text-sm leading-snug group-hover:text-primary transition-colors flex-1">{resource.title}</p>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40">
                    <span className={cn('text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded', difficultyColors[resource.difficulty])}>
                      {resource.difficulty}
                    </span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1">
                      {resource.isVideo ? <><Video className="h-3 w-3" /> Watch</> : <><Eye className="h-3 w-3" /> View Resource</>}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
        </div>
      </motion.section>

      {/* Featured Resources */}
      <motion.section initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
        <div className="flex items-center gap-2 mb-6">
          <Star className="h-5 w-5 text-amber-400" />
          <h2 className="text-xl font-black uppercase tracking-tighter">Featured Resources</h2>
        </div>
        <div className="space-y-3">
          {FEATURED_RESOURCES.map(resource => (
            <ResourceRow key={resource.id} resource={resource} />
          ))}
        </div>
      </motion.section>

      {/* CTA to Full Playbook */}
      <motion.section initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
        <div className="relative overflow-hidden rounded-3xl hero-gradient p-8 md:p-12 text-center">
          <div className="absolute inset-0 grid-beam opacity-20 pointer-events-none" aria-hidden />
          <div className="relative z-10">
            <BookOpen className="h-10 w-10 text-white mx-auto mb-4" />
            <h2 className="text-2xl md:text-3xl font-black tracking-tighter text-white mb-3">Browse the Full Playbook</h2>
            <p className="text-white/70 font-medium text-sm mb-6 max-w-md mx-auto">
              {RESOURCES.length}+ resources including practice plans, drills, templates, videos, and guides — all free for Squad coaches.
            </p>
            <Link href="/sports-hub/playbook">
              <Button className="bg-white text-black hover:bg-white/90 font-black uppercase tracking-widest text-xs gap-2 shadow-2xl">
                Browse All {RESOURCES.length} Resources <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </motion.section>

    </div>
  );
}
