'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Clock, Sparkles, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CategoryPills } from '@/components/sports-hub/CategoryPills';
import { useSportsHubArticles } from '@/hooks/use-sports-hub-articles';
import type { Article } from '@/lib/sports-hub-articles';

const SUB_CATEGORY_MAP: Record<string, string[]> = {
  'Camps & Programs': ['camp', 'program operations', 'registration'],
  'Organizations': ['nonprofit', 'governance', 'fundraising', 'sports organization'],
  'Team Identity': ['team names', 'branding', 'club identity'],
  'Athlete Development': ['development', 'training', 'coaching', 'motivation'],
  'Safety & Wellbeing': ['safety', 'safeguarding', 'wellbeing', 'burnout', 'mental health'],
  'Families': ['parents', 'family', 'communication'],
};

const categories = ['All', ...Object.keys(SUB_CATEGORY_MAP)];

function getSubCategory(article: Article): string {
  const tags = article.tags.map(tag => tag.toLowerCase());
  for (const [category, keywords] of Object.entries(SUB_CATEGORY_MAP)) {
    if (keywords.some(keyword => tags.some(tag => tag.includes(keyword)))) return category;
  }
  return 'Youth Sports';
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

export default function YouthSportsPage() {
  const articles = useSportsHubArticles();
  const [activeCategory, setActiveCategory] = useState('All');
  const youthArticles = useMemo(
    () => articles
      .filter(article => article.categories.includes('Youth Sports') || article.section.toLowerCase() === 'youth')
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    [articles],
  );
  const filtered = useMemo(() => {
    if (activeCategory === 'All') return youthArticles;
    const keywords = SUB_CATEGORY_MAP[activeCategory] ?? [];
    return youthArticles.filter(article => {
      const tags = article.tags.map(tag => tag.toLowerCase());
      return keywords.some(keyword => tags.some(tag => tag.includes(keyword)));
    });
  }, [activeCategory, youthArticles]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-12">
      <motion.header initial="hidden" animate="visible" variants={fadeUp} className="mb-8">
        <div className="mb-3 flex items-center gap-3">
          <div className="hero-gradient flex h-11 w-11 items-center justify-center rounded-lg">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-[9px] font-black uppercase text-primary">Sports Hub</p>
            <h1 className="text-2xl font-black uppercase tracking-normal md:text-3xl">Youth Sports</h1>
          </div>
        </div>
        <p className="max-w-3xl text-sm font-medium leading-relaxed text-muted-foreground">
          Practical guidance for youth coaches, parents, program directors, and community organizers - from athlete development and wellbeing to camps, governance, and team operations.
        </p>
        <p className="mt-2 text-[11px] font-bold uppercase text-muted-foreground"><span className="text-primary">{youthArticles.length}</span> Articles</p>
      </motion.header>

      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-8">
        <CategoryPills categories={categories} activeCategory={activeCategory} onSelect={setActiveCategory} />
      </motion.div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center font-medium text-muted-foreground">No articles found in this category yet.</div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((article, index) => (
            <motion.div key={article.slug} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} transition={{ delay: index * 0.03 }}>
              <Link href={`/sports-hub/articles/${article.slug}`} className="group block h-full">
                <article className="depth-card h-full overflow-hidden rounded-lg border bg-card transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-xl">
                  <div className="hero-gradient h-1.5" />
                  <div className="p-6">
                    <Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-[9px] font-black uppercase text-primary">{getSubCategory(article)}</Badge>
                    <h2 className="mb-2 line-clamp-2 text-base font-black leading-snug tracking-normal transition-colors group-hover:text-primary">{article.title}</h2>
                    <p className="mb-4 line-clamp-3 text-sm font-medium leading-relaxed text-muted-foreground">{article.excerpt}</p>
                    <div className="flex items-center gap-3 text-xs font-bold uppercase text-muted-foreground">
                      <span className="flex items-center gap-1"><User className="h-3 w-3" />{article.author.name}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{article.readingTime}m</span>
                    </div>
                  </div>
                </article>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
