'use client';

import React, { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  ChevronLeft, Printer, Copy, Check, Star, Users, Clock,
  Calendar, ClipboardList, Trophy, FileText, AlertCircle,
  Layout, ChevronRight, ExternalLink
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Template Data
// ---------------------------------------------------------------------------

interface TemplateSection {
  id: string;
  label: string;
  component: React.ReactNode;
}

interface TemplateConfig {
  id: string;
  title: string;
  description: string;
  category: string;
  useCount: string;
  icon: React.ElementType;
  color: string;
  tabs: TemplateSection[];
}

// Shared component helpers
function FieldRow({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-3 py-2.5 border-b border-dashed border-border group">
      <span className="text-xs font-black uppercase tracking-widest text-muted-foreground w-48 shrink-0">{label}</span>
      <div className="flex-1 border-b-2 border-foreground/20 group-hover:border-primary/40 transition-colors h-6 relative">
        {hint && <span className="absolute right-0 top-0 text-[9px] text-muted-foreground/50 italic">{hint}</span>}
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5 pb-3 border-b-2 border-primary/20">
      <h3 className="font-black tracking-tighter text-lg">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground font-medium mt-0.5">{subtitle}</p>}
    </div>
  );
}

function BlankTable({ columns, rows = 10 }: { columns: string[]; rows?: number }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b-2 border-border bg-muted/30">
            {columns.map(column => (
              <th key={column} className="px-3 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, row) => (
            <tr key={row} className="border-b border-dashed border-border">
              {columns.map(column => <td key={column} className="px-3 py-3"><div className="h-5 min-w-20 border-b border-dashed border-border/50" /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WeekRow({ week, theme, load, notes }: { week: number; theme: string; load: string; notes?: string }) {
  const loadColor = load === 'High' ? 'bg-red-100 text-red-700' : load === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700';
  return (
    <tr className="border-b border-border hover:bg-muted/20 transition-colors">
      <td className="px-3 py-2.5 text-xs font-black text-center w-12">{week}</td>
      <td className="px-3 py-2.5 text-xs font-medium text-muted-foreground">{theme}</td>
      <td className="px-3 py-2.5 text-center">
        <span className={cn('text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full', loadColor)}>{load}</span>
      </td>
      <td className="px-3 py-2.5 text-xs text-muted-foreground">{notes || '—'}</td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Individual Template Sections
// ---------------------------------------------------------------------------

const SEASON_PLANNING_TABS: TemplateSection[] = [
  {
    id: 'parameters',
    label: 'Season Parameters',
    component: (
      <div className="space-y-6">
        <SectionHeader title="Season Parameters" subtitle="Fill this out before planning anything else." />
        <FieldRow label="Team / Program Name" hint="e.g. Westview Thunder U14" />
        <FieldRow label="Sport" />
        <FieldRow label="Season Start Date" hint="MM/DD/YYYY" />
        <FieldRow label="Season End Date" hint="MM/DD/YYYY" />
        <FieldRow label="Total Weeks" />
        <FieldRow label="Championship / Tournament Date" hint="MM/DD/YYYY" />
        <FieldRow label="Typical Practice Days" hint="Circle: M T W Th F Sa Su" />
        <FieldRow label="Average Games Per Week" />
        <FieldRow label="Max Roster Size" />

        <div className="mt-8">
          <SectionHeader title="Season Goals" subtitle="Set 1 outcome goal, 1 performance goal, and 1 development goal." />
          {['Outcome Goal (Result)', 'Performance Goal (How we play)', 'Development Goal (Players / Team culture)'].map(g => (
            <div key={g} className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{g}</p>
              <div className="border rounded-xl p-3 bg-muted/20 min-h-[52px]" />
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'phases',
    label: 'Phase Breakdown',
    component: (
      <div className="space-y-6">
        <SectionHeader title="Season Phases" subtitle="Divide your season into phases with distinct focuses." />
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b-2 border-border bg-muted/30">
                {['Phase', 'Weeks', '% of Season', 'Primary Focus', 'Training Load'].map(h => (
                  <th key={h} className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['Pre-Season', '1–3', '~15%', 'Fitness, team cohesion, baseline testing', 'High'],
                ['Early Season', '4–8', '~25%', 'Learning systems, low-stakes games', 'Medium'],
                ['Mid Season', '9–16', '~45%', 'Peak competition, tactical refinement', 'Medium–High'],
                ['Championship Phase', '17–20', '~15%', 'Taper, sharpening, game prep', 'Low–Medium'],
              ].map(([phase, weeks, pct, focus, load]) => (
                <tr key={phase} className="border-b border-border hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-sm font-black">{phase}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{weeks}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{pct}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{focus}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full',
                      load.includes('High') ? 'bg-red-100 text-red-700' : load.includes('Low') ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    )}>{load}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6">
          <SectionHeader title="Tactical Progression" subtitle="What new concepts will you introduce each phase?" />
          {['Pre-Season', 'Early Season', 'Mid Season', 'Championship Phase'].map(phase => (
            <div key={phase} className="mb-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">{phase}</p>
              <div className="border rounded-xl p-3 bg-muted/20 min-h-[44px]" />
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: 'weekly',
    label: 'Weekly Calendar',
    component: (
      <div>
        <SectionHeader title="Weekly Season Calendar" subtitle="Pre-filled example — customize each week for your program." />
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b-2 border-border bg-muted/30">
                {['Wk', 'Theme / Focus', 'Load', 'Notes / Events'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <WeekRow week={1} theme="Pre-season fitness baseline & team meeting" load="High" notes="Fitness tests Day 1" />
              <WeekRow week={2} theme="Conditioning + formation intro" load="High" />
              <WeekRow week={3} theme="Skill stations + first scrimmage" load="High" notes="Internal scrimmage Sat" />
              <WeekRow week={4} theme="System install — offensive structure" load="Medium" notes="1st official game" />
              <WeekRow week={5} theme="System install — defensive structure" load="Medium" />
              <WeekRow week={6} theme="Transition play + set pieces" load="Medium" notes="Away game Thu" />
              <WeekRow week={7} theme="Full game scenarios / situation training" load="Medium" />
              <WeekRow week={8} theme="Mid-season review + refinement" load="Low" notes="Parent meeting, photos" />
              <WeekRow week={9} theme="Peak competition — tactical sharpening" load="High" />
              <WeekRow week={10} theme="Peak competition + recovery emphasis" load="Medium" />
              <WeekRow week={11} theme="Scouting opponents + tactical adjustments" load="Medium" />
              <WeekRow week={12} theme="Championship prep — game-speed training" load="Medium" notes="Playoffs begin" />
              <WeekRow week={13} theme="Taper — quality over volume" load="Low" notes="Semi-finals" />
              <WeekRow week={14} theme="Championship week — sharpen & peak" load="Low" notes="Championship" />
              {[15, 16, 17, 18].map(w => (
                <WeekRow key={w} week={w} theme="" load="Low" />
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 font-medium">* Blank rows are provided for your specific season length. Adjust phases as needed.</p>
      </div>
    ),
  },
  {
    id: 'load',
    label: 'Training Load',
    component: (
      <div className="space-y-6">
        <SectionHeader title="Training Load Calculator" subtitle="Use these guidelines to set weekly load targets." />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { level: 'Low', color: 'bg-green-50 border-green-200', badge: 'bg-green-100 text-green-700', desc: 'Recovery week or taper. 50–70% of normal volume. High skill, low physical demand.', examples: 'Walkthroughs, technical skill work, team meetings', sessions: '2–3 sessions/week' },
            { level: 'Medium', color: 'bg-amber-50 border-amber-200', badge: 'bg-amber-100 text-amber-700', desc: 'Standard competition week. Full practice + games. Balanced physical and tactical load.', examples: 'Full practices, scrimmages, film sessions', sessions: '3–4 sessions/week' },
            { level: 'High', color: 'bg-red-50 border-red-200', badge: 'bg-red-100 text-red-700', desc: 'Pre-season or peak training block. Maximum training volume. Recovery is critical.', examples: 'Double sessions, fitness tests, conditioning runs', sessions: '4–5 sessions/week' },
          ].map(({ level, color, badge, desc, examples, sessions }) => (
            <div key={level} className={cn('rounded-2xl border p-5', color)}>
              <span className={cn('text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full', badge)}>{level}</span>
              <p className="text-sm font-medium text-foreground/80 mt-3 mb-2 leading-relaxed">{desc}</p>
              <p className="text-xs font-black text-muted-foreground uppercase tracking-wider mt-2">{sessions}</p>
              <p className="text-xs text-muted-foreground mt-1 italic">{examples}</p>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <SectionHeader title="Rules of Thumb" />
          <div className="space-y-3">
            {[
              'Never schedule 3 consecutive High load weeks — recovery adaptation requires it.',
              'Every 4th week should be a Low load recovery week.',
              'The 2 weeks before your most important competition should be Low load (taper).',
              'Athletes who miss a High load week due to illness should return at Medium, not High.',
              'Game days always count as a session — don\'t add a full practice the same day.',
            ].map((rule, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="h-5 w-5 rounded-full hero-gradient flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-[9px] font-black text-white">{i + 1}</span>
                </div>
                <p className="text-sm text-muted-foreground font-medium leading-relaxed">{rule}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'evaluation',
    label: 'Post-Season',
    component: (
      <div className="space-y-6">
        <SectionHeader title="Post-Season Evaluation" subtitle="Complete this within 2 weeks of your final game while it's fresh." />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { title: 'Team Performance', questions: ['Did we achieve our stated season goals?', 'What was our win-loss record vs. expectations?', 'What did we do exceptionally well as a team?', 'What tactical element most held us back?'] },
            { title: 'Player Development', questions: ['Which players showed the most growth?', 'Which players need the most attention next season?', 'Did every player get meaningful minutes?', 'What skill gap was most evident across the roster?'] },
            { title: 'Coaching Performance', questions: ['Was my practice planning efficient and effective?', 'How was my communication with players? Parents?', 'What decisions do I regret? Why?', 'What would I do differently in Phase 1?'] },
            { title: 'Operations & Admin', questions: ['Were games/practices well-organized?', 'Were parents informed and engaged?', 'What administrative process cost us the most time?', 'What tool or system would save us time next year?'] },
          ].map(({ title, questions }) => (
            <div key={title} className="bg-card border rounded-2xl p-5">
              <h4 className="font-black tracking-tight mb-4 pb-2 border-b">{title}</h4>
              {questions.map((q, i) => (
                <div key={i} className="mb-4">
                  <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground mb-1">{q}</p>
                  <div className="border rounded-lg p-2 bg-muted/20 min-h-[40px]" />
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5 mt-4">
          <h4 className="font-black tracking-tight text-primary mb-3">Top 3 Priorities for Next Season</h4>
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3 mb-3">
              <div className="h-7 w-7 rounded-full hero-gradient flex items-center justify-center shrink-0">
                <span className="text-[10px] font-black text-white">{i}</span>
              </div>
              <div className="flex-1 border-b-2 border-foreground/20 h-7" />
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

// ----------- Practice Plan Template -----------
const PRACTICE_PLAN_TABS: TemplateSection[] = [
  {
    id: 'info',
    label: 'Practice Info',
    component: (
      <div className="space-y-6">
        <SectionHeader title="Practice Details" subtitle="Fill in before each session." />
        <FieldRow label="Date" hint="MM/DD/YYYY" />
        <FieldRow label="Start Time" />
        <FieldRow label="Location / Field" />
        <FieldRow label="Practice Theme" hint="e.g. Defensive Shape" />
        <FieldRow label="Season Phase" hint="Pre-Season / Early / Mid / Late" />
        <FieldRow label="Players Expected" />
        <FieldRow label="Assistants Available" />
        <FieldRow label="Equipment Needed" />
        <div className="mt-6">
          <SectionHeader title="Session Objectives" subtitle="Max 3 objectives. Be specific and measurable." />
          {[1, 2, 3].map(i => <FieldRow key={i} label={`Objective ${i}`} hint="e.g. 80% passing success in 4v2" />)}
        </div>
      </div>
    ),
  },
  {
    id: 'runsheet',
    label: '90-Min Run Sheet',
    component: (
      <div>
        <SectionHeader title="90-Minute Practice Run Sheet" subtitle="Customize times, drills, and coaching points." />
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b-2 border-border bg-muted/30">
                {['Time', 'Block', 'Activity / Drill', 'Duration', 'Coaching Points'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ['0:00', 'Arrival', 'Players arrive, dynamic warm-up laps, ball mastery', '10 min', 'Energy and attitude check'],
                ['0:10', 'Warm-Up', 'Rondo / possession game (4v2 or 5v2)', '10 min', 'Quick touch, communication, intensity'],
                ['0:20', 'Technical', 'Skill station 1 — primary objective drill', '15 min', 'Individual correction, repetition'],
                ['0:35', 'Technical', 'Skill station 2 — secondary drill or progression', '15 min', 'Increase speed of play'],
                ['0:50', 'Tactical', 'Structured game — apply theme in small-sided game', '20 min', 'Stop & correct moments, ask questions'],
                ['1:10', 'Full Game', 'Full-sided or expanded scrimmage', '15 min', 'Let them play — minimal interruption'],
                ['1:25', 'Cool Down', 'Light jog, static stretch, team huddle', '5 min', 'Positive reflection, key takeaway'],
                ['1:30', 'End', 'Players dismissed', '—', 'Coach notes for next session'],
              ].map(([time, block, activity, dur, points]) => (
                <tr key={time} className="border-b border-border hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2.5 text-xs font-black tabular-nums whitespace-nowrap">{time}</td>
                  <td className="px-3 py-2.5"><Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest">{block}</Badge></td>
                  <td className="px-3 py-2.5 text-xs font-medium">{activity}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{dur}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground italic">{points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-muted-foreground mt-3 font-medium">Adjust block durations based on your sport, age group, and session theme.</p>
      </div>
    ),
  },
  {
    id: 'notes',
    label: 'Post-Practice Notes',
    component: (
      <div className="space-y-6">
        <SectionHeader title="Post-Practice Notes" subtitle="Complete within 30 minutes while details are fresh." />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {['What went well?', 'What needs more work?', 'Individual player notes', 'Focus for next session'].map(label => (
            <div key={label} className="bg-card border rounded-2xl p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">{label}</p>
              <div className="space-y-2">
                {[1, 2, 3].map(i => <div key={i} className="border-b border-dashed border-border h-7" />)}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 mt-4">
          <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Overall Session Rating:</span>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map(n => (
              <div key={n} className="h-8 w-8 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                <span className="text-xs font-black text-muted-foreground/50">{n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
];

// ----------- Game Day Checklist Template -----------
const GAMEDAY_TABS: TemplateSection[] = [
  {
    id: 'pregame',
    label: 'Pre-Game (24h)',
    component: (
      <div className="space-y-6">
        <SectionHeader title="24 Hours Before Game Day" />
        {[
          { group: 'Communications', items: ['Confirm game time, venue, and field/court number', 'Send game day reminder to all parents/players', 'Confirm officials are booked and paid', 'Notify roster of any lineup changes', 'Confirm travel/carpool arrangements'] },
          { group: 'Equipment Prep', items: ['Count and pack uniforms/jerseys', 'Pack medical kit (first aid, ice, AED location confirmed)', 'Pack training equipment (cones, balls, pinnies)', 'Check and charge any video/timing devices', 'Prepare scorebook or lineup cards'] },
          { group: 'Opponent Prep', items: ['Review scouting notes / recent match data', 'Set your starting lineup and rotation', 'Prepare 2–3 tactical talking points for pre-game', 'Identify key opponent threats to address'] },
        ].map(({ group, items }) => (
          <div key={group} className="bg-card border rounded-2xl p-5">
            <h4 className="font-black tracking-tight mb-4 pb-2 border-b text-sm">{group}</h4>
            {items.map(item => (
              <label key={item} className="flex items-start gap-3 mb-3 cursor-pointer group">
                <div className="h-4.5 w-4.5 rounded border-2 border-border group-hover:border-primary mt-0.5 shrink-0 transition-colors" />
                <span className="text-sm text-muted-foreground font-medium group-hover:text-foreground transition-colors">{item}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'day-of',
    label: 'Day Of',
    component: (
      <div className="space-y-6">
        <SectionHeader title="Game Day — Arrival to Kickoff" />
        {[
          { group: 'Venue Arrival (60–90 min before)', items: ['Arrive and check field/court conditions', 'Set up team bench/sideline area', 'Confirm scoreboard or scorekeeping setup', 'Check referee arrival and introductions', 'Set up medical kit in accessible location'] },
          { group: 'Warm-Up (30–45 min before)', items: ['Dynamic warm-up led by captain or coach', 'Sport-specific activation drills', 'Goalkeeper / specialist warm-up', 'Team walkthrough of set pieces', 'Final hydration reminder to all players'] },
          { group: 'Pre-Game Meeting (10–15 min before)', items: ['Team talk — energy, purpose, focus word', 'Review lineup and player roles', 'Cover 2–3 tactical priorities only', 'Address opponent threats briefly', 'Positive close — team ritual/chant'] },
        ].map(({ group, items }) => (
          <div key={group} className="bg-card border rounded-2xl p-5">
            <h4 className="font-black tracking-tight mb-4 pb-2 border-b text-sm">{group}</h4>
            {items.map(item => (
              <label key={item} className="flex items-start gap-3 mb-3 cursor-pointer group">
                <div className="h-4.5 w-4.5 rounded border-2 border-border group-hover:border-primary mt-0.5 shrink-0 transition-colors" />
                <span className="text-sm text-muted-foreground font-medium group-hover:text-foreground transition-colors">{item}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'postgame',
    label: 'Post-Game',
    component: (
      <div className="space-y-6">
        <SectionHeader title="Post-Game Checklist" />
        {[
          { group: 'Immediate (Within 30 min)', items: ['Bring team together for post-game debrief', 'Acknowledge opponent — sportsmanship', 'Provide 2 positives + 1 focus for next game', 'Check all players for injuries or concerns', 'Collect all equipment and uniforms'] },
          { group: 'Admin (Within 24 hours)', items: ['Submit game result / score to league', 'Update standings if required', 'Document any disciplinary incidents', 'Note referee concerns for league', 'Send post-game parent communication'] },
          { group: 'Coaching Notes', items: ['Record match stats / key performance data', 'Note individual player standouts', 'Update scouting file for next opponent', 'Review tactical effectiveness', 'Plan next practice focus based on gaps'] },
        ].map(({ group, items }) => (
          <div key={group} className="bg-card border rounded-2xl p-5">
            <h4 className="font-black tracking-tight mb-4 pb-2 border-b text-sm">{group}</h4>
            {items.map(item => (
              <label key={item} className="flex items-start gap-3 mb-3 cursor-pointer group">
                <div className="h-4.5 w-4.5 rounded border-2 border-border group-hover:border-primary mt-0.5 shrink-0 transition-colors" />
                <span className="text-sm text-muted-foreground font-medium group-hover:text-foreground transition-colors">{item}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
    ),
  },
];

// ----------- Roster Template -----------
const ROSTER_TABS: TemplateSection[] = [
  {
    id: 'roster',
    label: 'Roster',
    component: (
      <div>
        <SectionHeader title="Team Roster" subtitle="Complete before the first practice." />
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b-2 border-border bg-muted/30">
                {['#', 'Player Name', 'Position', 'Age/Grade', 'Jersey #', 'Parent/Guardian', 'Phone', 'Email', 'Medical Notes'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 20 }, (_, i) => (
                <tr key={i} className="border-b border-dashed border-border hover:bg-muted/10 transition-colors">
                  <td className="px-3 py-2.5 text-xs font-black text-muted-foreground w-8">{i + 1}</td>
                  {Array.from({ length: 8 }, (_, j) => (
                    <td key={j} className="px-3 py-2.5"><div className="h-5 w-full border-b border-dashed border-border/50" /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ),
  },
  {
    id: 'emergency',
    label: 'Emergency Contacts',
    component: (
      <div>
        <SectionHeader title="Emergency Contact Card" subtitle="One card per player. Keep a physical copy at every event." />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="bg-card border-2 border-dashed border-border rounded-2xl p-5">
              <div className="h-4 w-32 bg-primary/10 rounded mb-3" />
              <FieldRow label="Player Name" />
              <FieldRow label="DOB" hint="MM/DD/YYYY" />
              <FieldRow label="Allergies" />
              <FieldRow label="Medical Conditions" />
              <FieldRow label="Medications" />
              <FieldRow label="Emergency Contact 1" />
              <FieldRow label="Phone" />
              <FieldRow label="Emergency Contact 2" />
              <FieldRow label="Phone" />
              <FieldRow label="Insurance / Policy #" />
            </div>
          ))}
        </div>
      </div>
    ),
  },
];

// ----------- Parent Communication Template -----------
const PARENT_COMM_TABS: TemplateSection[] = [
  {
    id: 'season-kickoff',
    label: 'Season Kickoff',
    component: (
      <div className="space-y-4">
        <SectionHeader title="Season Kickoff Email" subtitle="Send 1–2 weeks before the first practice." />
        <div className="bg-card border rounded-2xl p-6 font-mono text-sm leading-relaxed">
          <p className="text-muted-foreground text-xs mb-4 font-sans font-black uppercase tracking-widest not-italic">Subject: Welcome to [Team Name] — Season [Year] Information</p>
          <div className="space-y-4 text-foreground/80">
            <p>Hi [Parent/Guardian Name],</p>
            <p>I&apos;m excited to welcome [Player Name] to the [Team Name] roster for our [Year] season! My name is [Coach Name], and I&apos;ll be the head coach this year.</p>
            <p>Here&apos;s everything you need to know to get started:</p>
            <div className="bg-muted/30 rounded-xl p-4 space-y-1">
              <p><strong>📅 First Practice:</strong> [Day, Date] at [Time]</p>
              <p><strong>📍 Location:</strong> [Venue / Field Name, Address]</p>
              <p><strong>👕 What to Bring:</strong> [Equipment list: cleats, shin guards, water bottle, etc.]</p>
              <p><strong>💰 Fees Due:</strong> [Amount] by [Date] via [Payment method]</p>
            </div>
            <p>Our season runs from [Start Date] to [End Date]. Games are typically on [Day(s)] and practices are [Day(s)] from [Time] to [Time].</p>
            <p>I believe in open communication. The best way to reach me is [preferred contact method]. I aim to respond within 24 hours.</p>
            <p>I&apos;m looking forward to a great season!</p>
            <p>Warm regards,<br />[Coach Name]<br />[Team Name] | [Sport] | [League]</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'injury-update',
    label: 'Injury Update',
    component: (
      <div className="space-y-4">
        <SectionHeader title="Injury Update Email" subtitle="Send within 24 hours of a player injury." />
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2 mb-2">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 font-medium">Always consult with your league administrator before sending. Do not include diagnosis or prognosis — that&apos;s for medical professionals.</p>
        </div>
        <div className="bg-card border rounded-2xl p-6 font-mono text-sm leading-relaxed">
          <p className="text-muted-foreground text-xs mb-4 font-sans font-black uppercase tracking-widest not-italic">Subject: Update Regarding [Player First Name] — [Date]</p>
          <div className="space-y-4 text-foreground/80">
            <p>Dear [Parent/Guardian Name],</p>
            <p>I&apos;m writing to let you know that [Player Name] experienced a [brief, factual description — e.g., &quot;a collision during practice&quot;] on [Date] at [Time].</p>
            <p>We responded by [describe immediate action taken: removed from play, applied ice, contacted you, called EMS, etc.]. [Player Name] [was/was not] able to continue the [practice/game].</p>
            <p>We recommend that [Player Name] be evaluated by a medical professional before returning to play. Our return-to-play policy requires written clearance from a physician.</p>
            <p>Please don&apos;t hesitate to contact me with any questions. The wellbeing of every player is my top priority.</p>
            <p>Sincerely,<br />[Coach Name]<br />[Phone Number]</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'schedule-change',
    label: 'Schedule Change',
    component: (
      <div className="space-y-4">
        <SectionHeader title="Schedule Change Notification" subtitle="Send as soon as the change is confirmed." />
        <div className="bg-card border rounded-2xl p-6 font-mono text-sm leading-relaxed">
          <p className="text-muted-foreground text-xs mb-4 font-sans font-black uppercase tracking-widest not-italic">Subject: ⚠️ Schedule Change — [Team Name] [Date]</p>
          <div className="space-y-4 text-foreground/80">
            <p>Hi [Team Name] families,</p>
            <p>Please note the following schedule change:</p>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1">
              <p><strong>Original:</strong> [Day, Date] at [Time] — [Location]</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 space-y-1">
              <p><strong>Updated:</strong> [New Day, Date] at [New Time] — [New Location or same]</p>
            </div>
            <p><strong>Reason for change:</strong> [Brief explanation — field unavailability, weather, opponent request, etc.]</p>
            <p>Please confirm receipt by replying to this message. If you have any conflicts with the new time, please let me know as soon as possible.</p>
            <p>Thank you for your flexibility,<br />[Coach Name]</p>
          </div>
        </div>
      </div>
    ),
  },
];

const INCIDENT_REPORT_TABS: TemplateSection[] = [
  {
    id: 'incident',
    label: 'Incident Details',
    component: (
      <div className="space-y-6">
        <SectionHeader title="Incident and Injury Report" subtitle="Complete promptly using factual observations. Do not diagnose an injury." />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
          <FieldRow label="Organization / Team" />
          <FieldRow label="Report Number" />
          <FieldRow label="Date and Time" />
          <FieldRow label="Location" />
          <FieldRow label="Person Involved" />
          <FieldRow label="Age / Date of Birth" />
          <FieldRow label="Reporter Name" />
          <FieldRow label="Reporter Role" />
        </div>
        <SectionHeader title="What Happened" subtitle="Record the sequence of events, conditions, and observable facts." />
        <div className="border rounded-xl bg-muted/10 min-h-40" />
        <FieldRow label="Witnesses" hint="Names and contact information" />
        <FieldRow label="Equipment Involved" />
      </div>
    ),
  },
  {
    id: 'response',
    label: 'Response and Follow-up',
    component: (
      <div className="space-y-6">
        <SectionHeader title="Immediate Response" subtitle="Document actions taken and who made each decision." />
        <BlankTable columns={['Time', 'Action Taken', 'Person Responsible', 'Outcome']} rows={6} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
          <FieldRow label="First Aid Provided By" />
          <FieldRow label="EMS Called" hint="Yes / No and time" />
          <FieldRow label="Guardian Notified" hint="Name, time, method" />
          <FieldRow label="Disposition" hint="Returned / Removed / Transported" />
        </div>
        <SectionHeader title="Follow-up" />
        <FieldRow label="Return-to-Play Status" />
        <FieldRow label="Corrective Action" />
        <FieldRow label="Report Submitted To" />
        <FieldRow label="Reporter Signature / Date" />
        <FieldRow label="Supervisor Signature / Date" />
      </div>
    ),
  },
];

const TOURNAMENT_RUNSHEET_TABS: TemplateSection[] = [
  {
    id: 'command-sheet',
    label: 'Command Sheet',
    component: (
      <div className="space-y-6">
        <SectionHeader title="Tournament Command Sheet" subtitle="Keep this page with the tournament director throughout the event." />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
          <FieldRow label="Tournament" />
          <FieldRow label="Date" />
          <FieldRow label="Venue" />
          <FieldRow label="Director / Mobile" />
          <FieldRow label="Medical Lead / Mobile" />
          <FieldRow label="Officials Lead / Mobile" />
          <FieldRow label="Venue Contact" />
          <FieldRow label="Emergency Address" />
        </div>
        <SectionHeader title="Day-of Timeline" subtitle="Add setup, check-in, games, ceremonies, teardown, and handoff times." />
        <BlankTable columns={['Time', 'Milestone', 'Owner', 'Location', 'Status / Notes']} rows={14} />
      </div>
    ),
  },
  {
    id: 'operations',
    label: 'Operations',
    component: (
      <div className="space-y-6">
        <SectionHeader title="Venue Operations" />
        <BlankTable columns={['Area', 'Opening Check', 'Assigned To', 'Close Check']} rows={8} />
        <SectionHeader title="Game and Officials Control" />
        <BlankTable columns={['Game / Court', 'Start', 'Teams', 'Officials', 'Result / Issue']} rows={10} />
        <SectionHeader title="Escalations and Decisions" subtitle="Log schedule changes, safety issues, disputes, and communications." />
        <BlankTable columns={['Time', 'Issue', 'Decision', 'Approved By', 'Communicated To']} rows={6} />
      </div>
    ),
  },
];

const ATHLETE_TRACKER_TABS: TemplateSection[] = [
  {
    id: 'profile',
    label: 'Athlete Profile',
    component: (
      <div className="space-y-6">
        <SectionHeader title="Athlete Development Profile" subtitle="Define measurable goals with the athlete at the start of each review cycle." />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
          <FieldRow label="Athlete Name" />
          <FieldRow label="Team / Season" />
          <FieldRow label="Position / Role" />
          <FieldRow label="Review Period" />
          <FieldRow label="Coach" />
          <FieldRow label="Baseline Date" />
        </div>
        <SectionHeader title="Development Goals" />
        <BlankTable columns={['Goal', 'Baseline', 'Target', 'Measure', 'Review Date']} rows={5} />
        <SectionHeader title="Athlete Commitments" />
        <div className="border rounded-xl bg-muted/10 min-h-28" />
      </div>
    ),
  },
  {
    id: 'session-log',
    label: 'Session Log',
    component: (
      <div className="space-y-6">
        <SectionHeader title="Performance and Attendance Log" subtitle="Use consistent measures across the review period." />
        <BlankTable columns={['Date', 'Session / Game', 'Attendance', 'Load 1-5', 'Metric / Result', 'Coach Note']} rows={14} />
        <SectionHeader title="Review Summary" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
          <FieldRow label="Attendance Rate" />
          <FieldRow label="Games / Sessions" />
          <FieldRow label="Goals Achieved" />
          <FieldRow label="Next Review Date" />
        </div>
        <FieldRow label="Athlete Reflection" />
        <FieldRow label="Coach Recommendation" />
        <FieldRow label="Athlete / Coach Sign-off" />
      </div>
    ),
  },
];

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

const TEMPLATE_CONFIGS: Record<string, TemplateConfig> = {
  'season-planning-spreadsheet': {
    id: 'season-planning-spreadsheet',
    title: 'Season Planning Spreadsheet',
    description: 'Map your entire season week by week. Includes phase breakdown, training load calculator, game schedule, and monthly check-ins.',
    category: 'Planning',
    useCount: '2,847',
    icon: Calendar,
    color: 'bg-blue-100 text-blue-700',
    tabs: SEASON_PLANNING_TABS,
  },
  'practice-plan-builder': {
    id: 'practice-plan-builder',
    title: 'Practice Plan Builder',
    description: 'A structured 90-minute practice planner with drill slots, time blocks, coaching notes, and post-session reflection.',
    category: 'Planning',
    useCount: '1,923',
    icon: ClipboardList,
    color: 'bg-green-100 text-green-700',
    tabs: PRACTICE_PLAN_TABS,
  },
  'game-day-checklist': {
    id: 'game-day-checklist',
    title: 'Game Day Checklist',
    description: 'Never forget a thing. 68-point interactive checklist covering equipment, comms, officials, first aid, and post-game tasks.',
    category: 'Game Day',
    useCount: '3,102',
    icon: Trophy,
    color: 'bg-amber-100 text-amber-700',
    tabs: GAMEDAY_TABS,
  },
  'roster-contact-sheet': {
    id: 'roster-contact-sheet',
    title: 'Roster & Contact Sheet',
    description: 'Complete team roster template with player info, emergency contacts, medical notes, and jersey assignments.',
    category: 'Admin',
    useCount: '1,441',
    icon: Users,
    color: 'bg-purple-100 text-purple-700',
    tabs: ROSTER_TABS,
  },
  'parent-communication-pack': {
    id: 'parent-communication-pack',
    title: 'Parent Communication Pack',
    description: '12 pre-written email and message templates for coaches — season kickoff, injury updates, schedule changes, and more.',
    category: 'Communication',
    useCount: '4,218',
    icon: FileText,
    color: 'bg-rose-100 text-rose-700',
    tabs: PARENT_COMM_TABS,
  },
  'incident-report-form': { id: 'incident-report-form', title: 'Incident & Injury Report Form', description: 'Document incident facts, immediate response, notifications, and follow-up in one consistent report.', category: 'Admin', useCount: '892', icon: AlertCircle, color: 'bg-red-100 text-red-700', tabs: INCIDENT_REPORT_TABS },
  'tournament-runsheet': { id: 'tournament-runsheet', title: 'Tournament Run Sheet', description: 'Coordinate the day-of timeline, venue operations, game control, and escalations for tournament staff.', category: 'Game Day', useCount: '678', icon: Layout, color: 'bg-indigo-100 text-indigo-700', tabs: TOURNAMENT_RUNSHEET_TABS },
  'athlete-performance-tracker': { id: 'athlete-performance-tracker', title: 'Athlete Performance Tracker', description: 'Set development goals and track attendance, workload, results, reflections, and coach reviews.', category: 'Tracking', useCount: '1,654', icon: Star, color: 'bg-yellow-100 text-yellow-700', tabs: ATHLETE_TRACKER_TABS },
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

import { use } from 'react';

export default function TemplatePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const config = TEMPLATE_CONFIGS[slug];

  const [activeTab, setActiveTab] = useState(config?.tabs?.[0]?.id ?? '');
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  if (!config) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-black mb-4">Template Not Found</h1>
        <Link href="/sports-hub/templates">
          <Button variant="outline">← Back to Templates</Button>
        </Link>
      </div>
    );
  }

  const Icon = config.icon;
  const activeSection = config.tabs.find(t => t.id === activeTab);

  const handleCopy = async () => {
    if (!contentRef.current) return;
    const text = contentRef.current.innerText;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => window.print();

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-8 md:py-12">
      {/* Back nav */}
      <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
        <Link href="/sports-hub/templates">
          <Button variant="ghost" size="sm" className="font-black text-xs uppercase tracking-widest gap-1.5 text-muted-foreground hover:text-primary -ml-2">
            <ChevronLeft className="h-3.5 w-3.5" /> All Templates
          </Button>
        </Link>
        <div className="flex items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={handleCopy} className="font-black text-xs uppercase tracking-widest gap-1.5 rounded-xl h-8">
            {copied ? <><Check className="h-3.5 w-3.5 text-green-600" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy Text</>}
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrint} className="font-black text-xs uppercase tracking-widest gap-1.5 rounded-xl h-8">
            <Printer className="h-3.5 w-3.5" /> Print
          </Button>
        </div>
      </div>

      {/* Header */}
      <motion.header initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }} className="mb-8 pb-8 border-b">
        <div className="flex items-start gap-5">
          <div className={cn('h-14 w-14 rounded-2xl flex items-center justify-center shrink-0', config.color)}>
            <Icon className="h-7 w-7" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-2 mb-2">
              <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest text-primary border-primary/20 bg-primary/5">Free Template</Badge>
              <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{config.category}</Badge>
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tighter leading-tight mb-2">{config.title}</h1>
            <p className="text-muted-foreground font-medium text-sm leading-relaxed">{config.description}</p>
            <div className="flex items-center gap-4 mt-3 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              <span className="flex items-center gap-1"><Users className="h-3 w-3" />{config.useCount} coaches using this</span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />View in browser, print anytime</span>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Tab nav */}
      <div className="grid grid-cols-2 sm:flex sm:overflow-x-auto gap-1 mb-6 pb-1 print:hidden">
        {config.tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'min-h-10 px-3 sm:px-4 py-2 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest text-center whitespace-normal sm:whitespace-nowrap transition-all sm:shrink-0',
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground shadow'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Template Content */}
      <motion.div
        key={activeTab}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        ref={contentRef}
        className="bg-card border rounded-2xl p-6 md:p-8 mb-8"
      >
        {/* Squad watermark on template */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-lg hero-gradient flex items-center justify-center">
              <span className="text-[9px] font-black text-white">S</span>
            </div>
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground">The Squad · Sports Hub · Free Template</span>
          </div>
          <span className="text-[9px] font-bold text-muted-foreground/60">{config.title}</span>
        </div>

        {activeSection?.component}
      </motion.div>

      {/* Use in The Squad CTA */}
      <div className="rounded-2xl hero-gradient p-6 text-white flex items-center justify-between flex-wrap gap-4 print:hidden">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.25em] text-white/60 mb-1">Power Up This Template</p>
          <h3 className="font-black tracking-tight text-lg">Auto-fill with your real team data</h3>
          <p className="text-white/70 text-sm font-medium mt-1">Connect to The Squad and your roster, schedule, and contacts populate these templates automatically.</p>
        </div>
        <Link href="/dashboard">
          <Button className="bg-white text-primary hover:bg-white/90 font-black text-xs uppercase tracking-widest gap-1.5 rounded-xl shrink-0">
            Open The Squad <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>

      {/* Browse more */}
      <div className="mt-8 text-center print:hidden">
        <p className="text-xs text-muted-foreground font-medium mb-3">Looking for something else?</p>
        <Link href="/sports-hub/templates">
          <Button variant="outline" className="font-black text-xs uppercase tracking-widest gap-1.5 rounded-xl">
            Browse All Free Templates <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
