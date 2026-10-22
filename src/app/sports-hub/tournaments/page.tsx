'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Trophy, User, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CategoryPills } from '@/components/sports-hub/CategoryPills';
import type { Article } from '@/lib/sports-hub-articles';
import { useSportsHubArticles } from '@/hooks/use-sports-hub-articles';

// Tag-based subcategory mapping
const SUB_CATEGORY_MAP: Record<string, string[]> = {
  'Bracket Management': ['bracket', 'seeding', 'double elimination', 'pool play', 'round robin', 'bracket format', 'single elimination'],
  'Scheduling': ['scheduling', 'schedule', 'round robin scheduling', 'game scheduling'],
  'Officials': ['official', 'referee', 'ref', 'conflict resolution', 'umpire', 'volunteer coordination'],
  'Registration': ['registration', 'sign-up', 'check-in', 'team check-in', 'digital registration'],
  'Scoring': ['scoring', 'scorekeeping', 'scorekeeper', 'live scoring', 'live bracket'],
  'Awards': ['awards', 'trophy', 'medal', 'ceremony', 'trophies'],
  'Venue Planning': ['venue', 'facility', 'concessions', 'food', 'parking'],
  'Tournament Tips': ['tournament tips', 'director', 'communications', 'planning', 'pre-event', 'post-event', 'sponsorship'],
};

const TOURNAMENT_CATEGORIES = ['All', ...Object.keys(SUB_CATEGORY_MAP)];

function getSubCategory(article: Article): string {
  const tagList = (article.tags || []).map((t: string) => t.toLowerCase());
  for (const [cat, keywords] of Object.entries(SUB_CATEGORY_MAP)) {
    if (keywords.some((kw) => tagList.some((t) => t.includes(kw)))) return cat;
  }
  return 'Tournament Tips';
}

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

export default function TournamentsPage() {
  const [activeCategory, setActiveCategory] = useState('All');
  const articles = useSportsHubArticles();
  const allTournament = useMemo(() => articles.filter(
    article => article.categories?.includes('Tournament Management') || article.section === 'Tournament Management' || article.section === 'tournaments'
  ), [articles]);

  const filtered = useMemo(() => {
    if (activeCategory === 'All') return allTournament;
    const keywords = SUB_CATEGORY_MAP[activeCategory] || [];
    return allTournament.filter((a) => {
      const tagList = (a.tags || []).map((t: string) => t.toLowerCase());
      return keywords.some((kw) => tagList.some((t) => t.includes(kw)));
    });
  }, [activeCategory, allTournament]);

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-12">
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-2xl hero-gradient flex items-center justify-center">
            <Trophy className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-[9px] font-black text-primary uppercase tracking-[0.3em]">Sports Hub</p>
            <h1 className="text-2xl md:text-3xl font-black tracking-tighter uppercase">Tournaments</h1>
          </div>
        </div>
        <p className="text-muted-foreground font-medium text-sm max-w-2xl">
          Bracket management, scheduling, officials, scoring — everything you need to run professional-grade tournaments.
        </p>
        <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mt-2">
          <span className="text-primary">{allTournament.length}</span> Articles
        </p>
      </motion.div>

      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-8">
        <CategoryPills categories={TOURNAMENT_CATEGORIES} activeCategory={activeCategory} onSelect={setActiveCategory} />
      </motion.div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground font-medium">
          No articles found in this category yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((article, i) => (
            <motion.div key={article.slug} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} transition={{ delay: i * 0.04 }}>
              <Link href={`/sports-hub/articles/${article.slug}`} className="group block h-full">
                <div className="h-full bg-card border rounded-2xl overflow-hidden depth-card transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5">
                  <div className="h-1.5 hero-gradient" />
                  <div className="p-6">
                    <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest text-primary border-primary/20 bg-primary/5 mb-3">
                      {getSubCategory(article)}
                    </Badge>
                    <h3 className="font-black tracking-tight text-base leading-snug mb-2 group-hover:text-primary transition-colors line-clamp-2">
                      {article.title}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4 font-medium">{article.excerpt}</p>
                    <div className="flex items-center gap-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      <span className="flex items-center gap-1"><User className="h-3 w-3" />{article.author?.name || 'The Squad Team'}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{article.readingTime}m</span>
                    </div>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
