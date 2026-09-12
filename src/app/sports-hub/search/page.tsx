'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Search, FileText, Globe, BookOpen, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/sports-hub/SearchBar';
import { cn } from '@/lib/utils';
import { isExternalPurchaseUrl, isStoreDistribution } from '@/lib/app-distribution';

const ALL_CONTENT = [
  { id: '1', type: 'article', title: 'Building Championship Culture: Leadership Strategies That Actually Work', excerpt: 'Discover the proven leadership frameworks that elite coaches use.', category: 'Coaching', href: '/sports-hub/articles/building-championship-culture' },
  { id: '2', type: 'article', title: 'The 5-Day Practice Plan Formula for Game Day Readiness', excerpt: 'Build a structured weekly practice plan covering physical prep, tactical work, and mental readiness.', category: 'Coaching', href: '/sports-hub/articles/five-day-practice-plan' },
  { id: '3', type: 'article', title: 'Tournament Scheduling: Running a 32-Team Bracket Without Chaos', excerpt: 'From venue logistics to referee scheduling, this is the definitive guide.', category: 'Tournament Management', href: '/sports-hub/articles/tournament-scheduling-guide' },
  { id: '4', type: 'article', title: 'Parent Communication Templates That Save Coaches Hours', excerpt: 'Pre-written emails and messages for every situation.', category: 'Team Management', href: '/sports-hub/articles/parent-communication-templates' },
  { id: '5', type: 'resource', title: '4-Week Pre-Season Training Plan', excerpt: 'Comprehensive pre-season training plan for any sport.', category: 'Practice Plan', href: '/sports-hub/playbook' },
  { id: '6', type: 'resource', title: 'Game Day Communication Checklist', excerpt: 'Everything you need to communicate effectively on game day.', category: 'Checklist', href: '/sports-hub/playbook' },
  { id: '7', type: 'article', title: 'Mental Performance Coaching for Youth Athletes: A Practical Guide', excerpt: 'Mental skills are learnable — and they may matter more than physical talent at the youth level. Here is how to actually teach them.', category: 'Youth Sports', href: '/sports-hub/articles/mental-performance-youth-athletes' },
  { id: '8', type: 'article', title: 'Sports Nutrition Basics Every Coach Needs to Know', excerpt: "You don't need a nutrition degree to give your athletes a significant competitive advantage. Here are the evidence-based fundamentals that make a real difference.", category: 'Nutrition', href: '/sports-hub/articles/sports-nutrition-for-coaches' },
  { id: '9', type: 'rss', title: 'New Research Shows Recovery Sleep Impact Is Greater Than Thought', excerpt: 'A landmark study tracking 400 college athletes.', category: 'Sports Science', href: 'https://example.com/1', isExternal: true, source: 'sportsscience.org' },
];

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  article: FileText,
  rss: Globe,
  resource: BookOpen,
};

const TYPE_LABELS: Record<string, string> = {
  article: 'Article',
  resource: 'Resource',
};

const CONTENT_TYPES = ['All', 'Articles', 'Resources'];

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

function SearchContent() {
  const searchParams = useSearchParams();
  const [typeFilter, setTypeFilter] = useState('All');
  const [results, setResults] = useState<typeof ALL_CONTENT>([]);
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const q = searchParams.get('q') || '';
    setQuery(q);
    if (!q) { setResults([]); return; }
    setLoading(true);
    const timer = setTimeout(() => {
      const ql = q.toLowerCase();
      const filtered = ALL_CONTENT.filter((item) => {
        const matchesQuery = item.title.toLowerCase().includes(ql) || item.excerpt.toLowerCase().includes(ql) || item.category.toLowerCase().includes(ql);
        const matchesType = typeFilter === 'All'
          || (typeFilter === 'Resources' && item.type === 'resource');
        return matchesQuery && matchesType;
      });
      setResults(filtered);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchParams, typeFilter]);

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-12">
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-10 w-10 rounded-2xl hero-gradient flex items-center justify-center">
            <Search className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-[9px] font-black text-primary uppercase tracking-[0.3em]">Sports Hub</p>
            <h1 className="text-2xl md:text-3xl font-black tracking-tighter uppercase">Search</h1>
          </div>
        </div>
        <SearchBar size="lg" className="w-full mb-4" />
        <div className="flex gap-2 flex-wrap">
          {CONTENT_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={cn(
                'px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all',
                typeFilter === t ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-muted-foreground hover:bg-muted'
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </motion.div>

      {!query && (
        <div className="text-center py-16">
          <Search className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="font-black uppercase tracking-widest text-muted-foreground text-sm">Type to search articles, resources, and more</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {!loading && query && results.length === 0 && (
        <div className="text-center py-16">
          <Search className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <p className="font-black uppercase tracking-widest text-muted-foreground text-sm">No results for &ldquo;{query}&rdquo;</p>
          <p className="text-xs text-muted-foreground mt-2">Try different keywords or browse a section</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp}>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">
            {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{query}&rdquo;
          </p>
          <div className="space-y-3">
            {results.map((item, i) => {
              const Icon = TYPE_ICONS[item.type] || FileText;
              const isExternal = (item as any).isExternal;
              if (isExternal && isStoreDistribution && isExternalPurchaseUrl(item.href)) return null;
              return (
                <motion.div key={item.id} initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} transition={{ delay: i * 0.04 }}>
                  {isExternal ? (
                    <a href={item.href} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-4 p-5 rounded-2xl border bg-card hover:shadow-md hover:border-primary/20 transition-all">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest">{TYPE_LABELS[item.type]}</Badge>
                          <Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest text-primary border-primary/20 bg-primary/5">{item.category}</Badge>
                          <Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest bg-orange-50 text-orange-600 border-orange-200">External</Badge>
                        </div>
                        <h3 className="font-black tracking-tight text-sm leading-snug group-hover:text-primary transition-colors line-clamp-1">{item.title}</h3>
                        <p className="text-xs text-muted-foreground font-medium mt-1 line-clamp-1">{item.excerpt}</p>
                      </div>
                    </a>
                  ) : (
                    <Link href={item.href} className="group flex items-start gap-4 p-5 rounded-2xl border bg-card hover:shadow-md hover:border-primary/20 transition-all">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest">{TYPE_LABELS[item.type]}</Badge>
                          <Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest text-primary border-primary/20 bg-primary/5">{item.category}</Badge>
                        </div>
                        <h3 className="font-black tracking-tight text-sm leading-snug group-hover:text-primary transition-colors line-clamp-1">{item.title}</h3>
                        <p className="text-xs text-muted-foreground font-medium mt-1 line-clamp-1">{item.excerpt}</p>
                      </div>
                    </Link>
                  )}
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    }>
      <SearchContent />
    </Suspense>
  );
}
