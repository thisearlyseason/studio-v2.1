'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Star, Clock, User, ArrowRight, Flame } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const FEATURED_STORIES = [
  {
    id: '1',
    title: 'Building Championship Culture: Leadership Strategies That Actually Work',
    excerpt: 'The difference between good teams and great teams rarely comes down to talent. Discover the proven leadership frameworks that elite coaches use to build cultures of excellence, accountability, and sustained performance over an entire career.',
    category: 'Coaching',
    author: 'The Squad Team',
    readingTime: 8,
    slug: 'building-championship-culture',
    isCoverStory: true,
  },
  {
    id: '2',
    title: 'Tournament Scheduling: How to Run a 32-Team Bracket Without Chaos',
    excerpt: 'From venue logistics to referee scheduling, this is the definitive guide to running a smooth, professional tournament at any level.',
    category: 'Tournament Management',
    author: 'The Squad Team',
    readingTime: 15,
    slug: 'tournament-scheduling-guide',
    isCoverStory: false,
  },
  {
    id: '3',
    title: 'Mental Performance Coaching for Youth Athletes: A Practical Guide',
    excerpt: 'Mental skills are learnable — and they may matter more than physical talent at the youth level. Here is how to actually teach them.',
    category: 'Mental Performance',
    author: 'Amanda Lee',
    readingTime: 11,
    slug: 'mental-performance-youth-athletes',
    isCoverStory: false,
  },
];

const EDITORS_PICKS = [
  { id: '4', title: 'Youth Athlete Development: The Long-Term Framework Every Coach Needs', category: 'Youth Sports', readingTime: 10, slug: 'youth-athlete-development' },
  { id: '5', title: 'Sports Nutrition Basics Every Coach Needs to Know', category: 'Nutrition', readingTime: 10, slug: 'sports-nutrition-for-coaches' },
  { id: '6', title: 'Volunteer Recruitment and Retention for Youth Sports Programs', category: 'Team Management', readingTime: 8, slug: 'volunteer-recruitment-retention' },
  { id: '7', title: 'Recovery Science: What the Research Actually Says About Athlete Recovery', category: 'Sports Science', readingTime: 6, slug: 'recovery-science-athletes' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

export default function FeaturedPage() {
  const coverStory = FEATURED_STORIES[0];
  const secondaryStories = FEATURED_STORIES.slice(1);

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-12">
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-2xl hero-gradient flex items-center justify-center">
            <Star className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-[9px] font-black text-primary uppercase tracking-[0.3em]">Sports Hub</p>
            <h1 className="text-2xl md:text-3xl font-black tracking-tighter uppercase">Featured</h1>
          </div>
        </div>
        <p className="text-muted-foreground font-medium text-sm max-w-2xl">
          Hand-curated stories, deep dives, and must-reads from The Squad team.
        </p>
      </motion.div>

      {/* Cover Story */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-8">
        <Link href={`/sports-hub/articles/${coverStory.slug}`} className="group block">
          <div className="relative overflow-hidden rounded-3xl hero-gradient p-8 md:p-14 depth-card transition-all hover:shadow-2xl hover:-translate-y-1">
            <div className="absolute inset-0 grid-beam opacity-20 pointer-events-none" aria-hidden />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-4">
                <Badge className="bg-white/20 text-white border-white/30 font-black text-[9px] uppercase tracking-widest">
                  <Flame className="h-3 w-3 mr-1" />Cover Story
                </Badge>
                <Badge className="bg-white/20 text-white border-white/30 font-black text-[9px] uppercase tracking-widest">
                  {coverStory.category}
                </Badge>
              </div>
              <h2 className="text-3xl md:text-5xl font-black tracking-tighter text-white leading-tight mb-4 group-hover:opacity-90 max-w-3xl">
                {coverStory.title}
              </h2>
              <p className="text-white/70 font-medium text-base mb-6 max-w-2xl leading-relaxed">{coverStory.excerpt}</p>
              <div className="flex items-center gap-6">
                <span className="flex items-center gap-2 text-white/60 text-xs font-bold uppercase tracking-widest">
                  <User className="h-3.5 w-3.5" />{coverStory.author}
                </span>
                <span className="flex items-center gap-2 text-white/60 text-xs font-bold uppercase tracking-widest">
                  <Clock className="h-3.5 w-3.5" />{coverStory.readingTime} min read
                </span>
                <Button className="bg-white text-black hover:bg-white/90 font-black uppercase tracking-widest text-xs gap-2 ml-auto hidden sm:flex">
                  Read Story <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </Link>
      </motion.div>

      {/* Secondary Featured */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        {secondaryStories.map((story, i) => (
          <motion.div key={story.id} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} transition={{ delay: i * 0.1 }}>
            <Link href={`/sports-hub/articles/${story.slug}`} className="group block h-full">
              <div className="h-full bg-card border rounded-2xl overflow-hidden depth-card transition-all hover:shadow-xl hover:-translate-y-0.5">
                <div className="h-1.5 hero-gradient" />
                <div className="p-7">
                  <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest text-primary border-primary/20 bg-primary/5 mb-4">
                    {story.category}
                  </Badge>
                  <h3 className="text-xl font-black tracking-tight leading-snug mb-3 group-hover:text-primary transition-colors">
                    {story.title}
                  </h3>
                  <p className="text-sm text-muted-foreground font-medium leading-relaxed mb-5 line-clamp-3">{story.excerpt}</p>
                  <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    <span className="flex items-center gap-1"><User className="h-3 w-3" />{story.author}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{story.readingTime} min</span>
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Editor's Picks */}
      <motion.section initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}>
        <h2 className="text-lg font-black uppercase tracking-tighter mb-5">Editor&apos;s Picks</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {EDITORS_PICKS.map((pick, i) => (
            <motion.div key={pick.id} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} transition={{ delay: i * 0.05 }}>
              <Link
                href={`/sports-hub/articles/${pick.slug}`}
                className="group flex items-center gap-4 p-4 rounded-2xl border bg-card hover:shadow-md hover:bg-primary/5 hover:border-primary/20 transition-all"
              >
                <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 font-black text-sm">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-black text-primary uppercase tracking-widest mb-0.5">{pick.category}</p>
                  <h4 className="font-black tracking-tight text-sm leading-snug group-hover:text-primary transition-colors line-clamp-1">
                    {pick.title}
                  </h4>
                </div>
                <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wider shrink-0">
                  <Clock className="h-3 w-3" />{pick.readingTime}m
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </motion.section>
    </div>
  );
}
