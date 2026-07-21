'use client';

import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { HeartHandshake, User, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CategoryPills } from '@/components/sports-hub/CategoryPills';
import type { Article } from '@/lib/sports-hub-articles';
import { useSportsHubArticles } from '@/hooks/use-sports-hub-articles';

const SUB_CATEGORY_MAP: Record<string, string[]> = {
  'Encouragement': ['encouragement', 'confidence', 'motivation', 'pressure', 'resilience', 'mistakes'],
  'Communication': ['communication', 'post-game', 'coaches', 'playing time', 'independence'],
  'Wellbeing': ['wellbeing', 'burnout', 'anxiety', 'mental health', 'belonging'],
  'Health & Recovery': ['injury', 'recovery', 'sleep', 'nutrition', 'health'],
  'Family & Logistics': ['school', 'family balance', 'sports costs', 'time management', 'family budget'],
  'Safety & Development': ['bullying', 'safety', 'digital safety', 'specialization', 'development'],
};

const PARENT_CATEGORIES = ['All', ...Object.keys(SUB_CATEGORY_MAP)];

function getSubCategory(article: Article): string {
  const tags = article.tags.map(tag => tag.toLowerCase());
  for (const [category, keywords] of Object.entries(SUB_CATEGORY_MAP)) {
    if (keywords.some(keyword => tags.some(tag => tag.includes(keyword)))) return category;
  }
  return 'Parent Support';
}

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

export default function ParentsPage() {
  const articles = useSportsHubArticles();
  const [activeCategory, setActiveCategory] = useState('All');
  const parentArticles = useMemo(
    () => articles.filter(article => article.categories.includes('Parents') || article.section.toLowerCase() === 'parents'),
    [articles],
  );
  const filtered = useMemo(() => {
    if (activeCategory === 'All') return parentArticles;
    const keywords = SUB_CATEGORY_MAP[activeCategory] ?? [];
    return parentArticles.filter(article => {
      const tags = article.tags.map(tag => tag.toLowerCase());
      return keywords.some(keyword => tags.some(tag => tag.includes(keyword)));
    });
  }, [activeCategory, parentArticles]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-12">
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-8">
        <div className="mb-3 flex items-center gap-3">
          <div className="hero-gradient flex h-11 w-11 items-center justify-center rounded-2xl">
            <HeartHandshake className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-primary">Sports Hub</p>
            <h1 className="text-2xl font-black uppercase tracking-tighter md:text-3xl">Parents</h1>
          </div>
        </div>
        <p className="max-w-2xl text-sm font-medium leading-relaxed text-muted-foreground">
          Practical support, encouragement, communication tools, health guidance, and perspective for families helping young athletes thrive.
        </p>
        <p className="mt-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          <span className="text-primary">{parentArticles.length}</span> Articles
        </p>
      </motion.div>

      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-8">
        <CategoryPills categories={PARENT_CATEGORIES} activeCategory={activeCategory} onSelect={setActiveCategory} />
      </motion.div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((article, index) => (
          <motion.div
            key={article.slug}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            transition={{ delay: index * 0.03 }}
          >
            <Link href={`/sports-hub/articles/${article.slug}`} className="group block h-full">
              <article className="depth-card h-full overflow-hidden rounded-2xl border bg-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl">
                <div className="hero-gradient h-1.5" />
                <div className="p-6">
                  <Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-[9px] font-black uppercase tracking-widest text-primary">
                    {getSubCategory(article)}
                  </Badge>
                  <h2 className="mb-2 line-clamp-2 text-base font-black leading-snug tracking-tight transition-colors group-hover:text-primary">
                    {article.title}
                  </h2>
                  <p className="mb-4 line-clamp-3 text-sm font-medium leading-relaxed text-muted-foreground">{article.excerpt}</p>
                  <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    <span className="flex items-center gap-1"><User className="h-3 w-3" />{article.author.name}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{article.readingTime}m</span>
                  </div>
                </div>
              </article>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

