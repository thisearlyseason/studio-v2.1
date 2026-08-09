'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { BookOpen, Video, Filter, Search, Star, Eye, Play, FileText, Calendar, Dumbbell, CheckSquare, Users, AlertCircle, Plane, List, DollarSign, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RESOURCES, FEATURED_RESOURCES, RESOURCES_BY_TYPE, Resource } from '@/lib/sports-hub-resources';
import { SPORTS_HUB_SPORTS } from '@/lib/sports-hub-types';
import { cn } from '@/lib/utils';

type Difficulty = 'beginner' | 'intermediate' | 'advanced';

const TYPE_OPTIONS = [
  { value: 'all', label: 'All Types', icon: List },
  { value: 'practice-plan', label: 'Practice Plans', icon: FileText },
  { value: 'drill', label: 'Drills', icon: Dumbbell },
  { value: 'season-planner', label: 'Season Planners', icon: Calendar },
  { value: 'game-day-checklist', label: 'Game Day Checklists', icon: CheckSquare },
  { value: 'tournament-checklist', label: 'Tournament Checklists', icon: CheckSquare },
  { value: 'emergency-action-plan', label: 'Emergency Action Plans', icon: AlertCircle },
  { value: 'parent-communication', label: 'Parent Communication', icon: Users },
  { value: 'volunteer-guide', label: 'Volunteer Guides', icon: Users },
  { value: 'coach-meeting-agenda', label: 'Coach Meeting Agendas', icon: FileText },
  { value: 'lineup-template', label: 'Lineup Templates', icon: List },
  { value: 'fundraising-ideas', label: 'Fundraising Guides', icon: DollarSign },
  { value: 'equipment-list', label: 'Equipment Lists', icon: Package },
  { value: 'travel-checklist', label: 'Travel Checklists', icon: Plane },
  { value: 'video', label: 'Videos', icon: Video },
];

const DIFFICULTY_FILTERS: Array<{ value: Difficulty | 'all'; label: string; color: string }> = [
  { value: 'all', label: 'All Levels', color: 'text-foreground' },
  { value: 'beginner', label: 'Beginner', color: 'text-green-600' },
  { value: 'intermediate', label: 'Intermediate', color: 'text-amber-600' },
  { value: 'advanced', label: 'Advanced', color: 'text-red-600' },
];

const difficultyColors: Record<Difficulty, string> = {
  beginner: 'bg-green-100 text-green-700 border-green-200',
  intermediate: 'bg-amber-100 text-amber-700 border-amber-200',
  advanced: 'bg-red-100 text-red-700 border-red-200',
};

const TYPE_LABELS: Record<string, string> = {
  'practice-plan': 'Practice Plan',
  'drill': 'Drill',
  'season-planner': 'Season Planner',
  'game-day-checklist': 'Game Day Checklist',
  'tournament-checklist': 'Tournament Checklist',
  'emergency-action-plan': 'Emergency Action Plan',
  'parent-communication': 'Parent Communication',
  'volunteer-guide': 'Volunteer Guide',
  'coach-meeting-agenda': 'Coach Meeting Agenda',
  'lineup-template': 'Lineup Template',
  'fundraising-ideas': 'Fundraising Guide',
  'equipment-list': 'Equipment List',
  'travel-checklist': 'Travel Checklist',
  'video': 'Video',
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

function ResourceCard({ resource }: { resource: Resource }) {
  return (
    <Link href={`/sports-hub/resources/${resource.id}`} className="group block">
      <div className="depth-card bg-card rounded-2xl border p-5 h-full flex flex-col transition-all duration-200 hover:border-primary/30 hover:shadow-lg hover:-translate-y-0.5">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[8px] font-black uppercase tracking-[0.15em] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {TYPE_LABELS[resource.type] || resource.type}
            </span>
            {resource.isFeatured && (
              <span className="text-[8px] font-black uppercase tracking-[0.15em] px-2 py-0.5 rounded-full bg-amber-100 text-amber-600 border border-amber-200 flex items-center gap-1">
                <Star className="h-2.5 w-2.5" /> Featured
              </span>
            )}
          </div>
          <Badge variant="outline" className={cn('text-[8px] font-black uppercase tracking-widest border shrink-0', difficultyColors[resource.difficulty])}>
            {resource.difficulty}
          </Badge>
        </div>

        {/* Title */}
        <h3 className="font-black tracking-tight text-base leading-snug mb-2 group-hover:text-primary transition-colors flex-1">
          {resource.title}
        </h3>
        <p className="text-xs text-muted-foreground font-medium leading-relaxed mb-4 line-clamp-2">
          {resource.description}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-border/50">
          <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            {resource.sport !== 'General' && <span>{resource.sport}</span>}
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" /> {resource.downloadCount.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary group-hover:gap-2.5 transition-all">
            {resource.isVideo ? <Play className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {resource.isVideo ? 'Watch' : 'View Resource'}
          </div>
        </div>
      </div>
    </Link>
  );
}

function PlaybookContent() {
  const searchParams = useSearchParams();
  const initialType = searchParams.get('type') || 'all';
  const [typeFilter, setTypeFilter] = useState(initialType);
  const [sportFilter, setSportFilter] = useState('all');
  const [difficultyFilter, setDifficultyFilter] = useState<Difficulty | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const filtered = RESOURCES.filter((item) => {
    if (typeFilter !== 'all' && item.type !== typeFilter) return false;
    if (sportFilter !== 'all' && item.sport !== sportFilter) return false;
    if (difficultyFilter !== 'all' && item.difficulty !== difficultyFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!item.title.toLowerCase().includes(q) && !item.description.toLowerCase().includes(q) && !item.tags.some(t => t.includes(q))) return false;
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-12 space-y-12">

      {/* Header */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp}>
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-2xl hero-gradient flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-primary">Sports Hub</p>
            <h1 className="text-3xl md:text-4xl font-black tracking-tighter uppercase">Playbook</h1>
          </div>
        </div>
        <p className="text-muted-foreground font-medium max-w-xl mt-2">
          The Squad's resource library — practice plans, drills, templates, checklists, and guides. View, use, and coach.
        </p>
      </motion.div>

      {/* Search + Filter Bar */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Search Playbook"
            placeholder="Search playbook..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10 h-11 rounded-xl bg-card border-border/60 font-medium"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => setShowFilters(!showFilters)}
          className={cn('font-black text-xs uppercase tracking-widest gap-2 h-11 rounded-xl', showFilters && 'border-primary text-primary bg-primary/5')}
        >
          <Filter className="h-4 w-4" /> Filters {showFilters ? '▲' : '▼'}
        </Button>
      </motion.div>

      {/* Filter Panel */}
      {showFilters && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-card border rounded-2xl p-5 space-y-5">
          {/* Type Filter */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground mb-3">Resource Type</p>
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setTypeFilter(value)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border transition-all',
                    typeFilter === value
                      ? 'bg-primary text-white border-primary shadow-md'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-primary'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Difficulty */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground mb-3">Difficulty</p>
            <div className="flex flex-wrap gap-2">
              {DIFFICULTY_FILTERS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setDifficultyFilter(value as Difficulty | 'all')}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border transition-all',
                    difficultyFilter === value
                      ? 'bg-primary text-white border-primary shadow-md'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-primary'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Sport Filter */}
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground mb-3">Sport</p>
            <div className="flex flex-wrap gap-2">
              {['all', 'General', 'Soccer', 'Basketball', 'Baseball', 'Volleyball', 'Football', 'Track & Field'].map(sport => (
                <button
                  key={sport}
                  onClick={() => setSportFilter(sport)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-widest border transition-all',
                    sportFilter === sport
                      ? 'bg-primary text-white border-primary shadow-md'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-primary'
                  )}
                >
                  {sport === 'all' ? 'All Sports' : sport}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Featured Resources */}
      {typeFilter === 'all' && sportFilter === 'all' && difficultyFilter === 'all' && !searchQuery && (
        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
          <div className="flex items-center gap-2 mb-6">
            <Star className="h-5 w-5 text-amber-400" />
            <h2 className="text-xl font-black uppercase tracking-tighter">Featured Resources</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURED_RESOURCES.map(resource => (
              <ResourceCard key={resource.id} resource={resource} />
            ))}
          </div>
        </motion.section>
      )}

      {/* All / Filtered Results */}
      <motion.section initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black uppercase tracking-tighter">
            {searchQuery || typeFilter !== 'all' || sportFilter !== 'all' || difficultyFilter !== 'all'
              ? `Results (${filtered.length})`
              : `All Resources (${RESOURCES.length})`
            }
          </h2>
          {(typeFilter !== 'all' || sportFilter !== 'all' || difficultyFilter !== 'all' || searchQuery) && (
            <button
              onClick={() => { setTypeFilter('all'); setSportFilter('all'); setDifficultyFilter('all'); setSearchQuery(''); }}
              className="text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
            >
              Clear Filters ✕
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="font-black uppercase tracking-widest text-sm">No resources match your filters</p>
            <p className="text-xs mt-2 font-medium">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map(resource => (
              <ResourceCard key={resource.id} resource={resource} />
            ))}
          </div>
        )}
      </motion.section>

    </div>
  );
}

export default function PlaybookPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground font-medium">Loading playbook...</div>}>
      <PlaybookContent />
    </Suspense>
  );
}
