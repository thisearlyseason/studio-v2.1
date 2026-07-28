'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import {
  BookOpen, Search, Bookmark, BookmarkCheck, Share2, Link2,
  Clock, ChevronRight, Check, Filter, X, Users, Trophy,
  Apple, FlaskConical, Dumbbell, Brain, Zap, HeartHandshake,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Article } from '@/lib/sports-hub-articles';
import { useSportsHubArticles } from '@/hooks/use-sports-hub-articles';

// ─── Category Config ──────────────────────────────────────────────────────────

const CATEGORY_CONFIG = [
  { label: 'All',                   icon: BookOpen,     color: 'text-primary' },
  { label: 'Coaching',              icon: Users,        color: 'text-red-500' },
  { label: 'Team Management',       icon: Users,        color: 'text-blue-500' },
  { label: 'Tournament Management', icon: Trophy,       color: 'text-amber-500' },
  { label: 'Youth Sports',          icon: Zap,          color: 'text-green-500' },
  { label: 'Nutrition',             icon: Apple,        color: 'text-orange-500' },
  { label: 'Sports Science',        icon: FlaskConical, color: 'text-purple-500' },
  { label: 'Strength & Conditioning', icon: Dumbbell,   color: 'text-rose-500' },
  { label: 'Mental Performance',    icon: Brain,        color: 'text-indigo-500' },
  { label: 'Parents',               icon: HeartHandshake, color: 'text-pink-600' },
] as const;

const SORT_OPTIONS = [
  { value: 'newest',   label: 'Newest first' },
  { value: 'oldest',   label: 'Oldest first' },
  { value: 'shortest', label: 'Quickest reads' },
  { value: 'longest',  label: 'Deep dives' },
] as const;
type SortOption = typeof SORT_OPTIONS[number]['value'];

// ─── Motion helpers ───────────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as [number,number,number,number] } },
};
const stagger = { visible: { transition: { staggerChildren: 0.05 } } };

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try { return new Set(JSON.parse(localStorage.getItem('sh-bookmarks') ?? '[]')); }
    catch { return new Set(); }
  });

  const toggle = (id: string) => {
    setBookmarks(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      try { localStorage.setItem('sh-bookmarks', JSON.stringify([...next])); } catch { /* */ }
      return next;
    });
  };

  return { bookmarks, toggle };
}

function useCopy() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copy = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch { /* */ }
  };
  return { copiedId, copy };
}

// ─── Article Card ─────────────────────────────────────────────────────────────

function ArticleCard({
  article, isBookmarked, onBookmark, onCopy, isCopied,
}: {
  article: Article;
  isBookmarked: boolean;
  onBookmark: () => void;
  onCopy: () => void;
  isCopied: boolean;
}) {
  const url = `https://www.thesquad.pro/sports-hub/articles/${article.slug}`;

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (navigator.share) {
      try { await navigator.share({ title: article.title, url }); } catch { /* cancelled */ }
    } else { await navigator.clipboard.writeText(url); }
  };

  const primaryCategory = article.categories[0];
  const catConfig = CATEGORY_CONFIG.find(c => c.label === primaryCategory);

  return (
    <motion.div variants={fadeUp} className="group h-full">
      <div className="h-full bg-card border rounded-2xl overflow-hidden flex flex-col transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5">
        {/* Top accent bar */}
        <div className="h-1 hero-gradient shrink-0" />

        <div className="p-5 flex-1 flex flex-col">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex flex-wrap gap-1.5">
              <Badge
                variant="outline"
                className={cn(
                  'text-[9px] font-black uppercase tracking-widest border-current/20 bg-current/5',
                  catConfig?.color ?? 'text-primary'
                )}
              >
                {primaryCategory}
              </Badge>
              {article.isFeatured && (
                <Badge className="text-[9px] font-black uppercase tracking-widest hero-gradient text-white border-0">
                  Featured
                </Badge>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onBookmark(); }}
                className={cn(
                  'h-7 w-7 rounded-lg flex items-center justify-center transition-colors duration-200',
                  isBookmarked ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
                title={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
              >
                {isBookmarked ? <BookmarkCheck className="h-3.5 w-3.5" /> : <Bookmark className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCopy(); }}
                className={cn(
                  'h-7 w-7 rounded-lg flex items-center justify-center transition-colors duration-200',
                  isCopied ? 'bg-green-100 text-green-600' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
                title="Copy link"
              >
                {isCopied ? <Check className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={handleShare}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-200"
                title="Share"
              >
                <Share2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Article content link */}
          <Link href={`/sports-hub/articles/${article.slug}`} className="flex-1 flex flex-col">
            <h3 className="font-black tracking-tight text-sm leading-snug mb-2 group-hover:text-primary transition-colors line-clamp-2">
              {article.title}
            </h3>
            <p className="text-xs text-muted-foreground line-clamp-3 mb-4 font-medium leading-relaxed flex-1">
              {article.excerpt}
            </p>
          </Link>

          {/* Footer */}
          <div className="flex items-center justify-between pt-3 border-t border-border">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider truncate">
                {article.author.name}
              </span>
              <span className="text-muted-foreground/40 shrink-0">·</span>
              <span className="text-[10px] font-bold text-muted-foreground flex items-center gap-0.5 shrink-0">
                <Clock className="h-2.5 w-2.5" />
                {article.readingTime}m
              </span>
            </div>
            <Link href={`/sports-hub/articles/${article.slug}`}>
              <span className="text-[9px] font-black text-primary uppercase tracking-widest flex items-center gap-0.5 group-hover:gap-1.5 transition-all">
                Read <ChevronRight className="h-3 w-3" />
              </span>
            </Link>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Category Pill ────────────────────────────────────────────────────────────

function CategoryPill({
  cat, active, count, onClick,
}: {
  cat: typeof CATEGORY_CONFIG[number];
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  const Icon = cat.icon;
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all duration-200 shrink-0 border',
        active
          ? 'bg-primary text-white border-primary shadow-sm'
          : 'bg-muted/40 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground'
      )}
    >
      <Icon className={cn('h-3 w-3', active ? 'text-white' : cat.color)} />
      {cat.label}
      <span className={cn(
        'ml-0.5 text-[9px] font-bold',
        active ? 'text-white/70' : 'text-muted-foreground/50'
      )}>
        {count}
      </span>
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function NewsPage() {
  const articles = useSportsHubArticles();
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortOption>('newest');
  const [showOnlyBookmarks, setShowOnlyBookmarks] = useState(false);

  const { bookmarks, toggle: toggleBookmark } = useBookmarks();
  const { copiedId, copy } = useCopy();

  // Counts per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: articles.length };
    for (const a of articles) {
      for (const c of a.categories) {
        counts[c] = (counts[c] ?? 0) + 1;
      }
    }
    return counts;
  }, [articles]);

  // Filtered + sorted articles
  const filtered = useMemo(() => {
    let list = [...articles];

    if (showOnlyBookmarks) list = list.filter(a => bookmarks.has(a.id));

    if (category !== 'All') list = list.filter(a => a.categories.includes(category));

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a =>
        a.title.toLowerCase().includes(q) ||
        a.excerpt.toLowerCase().includes(q) ||
        a.tags.some(t => t.toLowerCase().includes(q)) ||
        a.author.name.toLowerCase().includes(q)
      );
    }

    switch (sort) {
      case 'newest':   list.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)); break;
      case 'oldest':   list.sort((a, b) => a.publishedAt.localeCompare(b.publishedAt)); break;
      case 'shortest': list.sort((a, b) => a.readingTime - b.readingTime); break;
      case 'longest':  list.sort((a, b) => b.readingTime - a.readingTime); break;
    }

    return list;
  }, [articles, category, search, sort, showOnlyBookmarks, bookmarks]);

  const featured = filtered.filter(a => a.isFeatured).slice(0, 3);
  const rest = featured.length > 0 ? filtered.filter(a => !a.isFeatured) : filtered;

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-12">

      {/* Page Header */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-11 w-11 rounded-2xl hero-gradient flex items-center justify-center shrink-0">
            <BookOpen className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-[9px] font-black text-primary uppercase tracking-[0.3em]">Sports Hub</p>
            <h1 className="text-2xl md:text-3xl font-black tracking-tighter uppercase">Articles</h1>
          </div>
        </div>
        <p className="text-sm text-muted-foreground font-medium max-w-2xl leading-relaxed">
          Original, in-depth articles from The Squad covering coaching, team management, tournaments, nutrition, sports science, and athlete development.
        </p>
        <div className="flex items-center gap-2 mt-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          <span className="h-2 w-2 rounded-full hero-gradient" />
          {articles.length} articles · Updated regularly
        </div>
      </motion.div>

      {/* Controls */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} className="mb-8 space-y-4">
        {/* Search + Sort + Bookmarks */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search articles, topics, authors…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-xl font-medium text-sm"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            {/* Sort */}
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortOption)}
              className="h-10 px-3 rounded-xl border bg-card text-xs font-bold text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            {/* Bookmarks toggle */}
            <button
              onClick={() => setShowOnlyBookmarks(v => !v)}
              className={cn(
                'h-10 px-4 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-1.5 transition-colors duration-200 border',
                showOnlyBookmarks
                  ? 'bg-primary text-white border-primary'
                  : 'bg-muted/40 text-muted-foreground border-transparent hover:bg-muted'
              )}
            >
              <Bookmark className="h-3.5 w-3.5" />
              Saved
              {bookmarks.size > 0 && (
                <span className={cn(
                  'text-[9px] font-bold ml-0.5',
                  showOnlyBookmarks ? 'text-white/70' : 'text-muted-foreground/60'
                )}>
                  {bookmarks.size}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Category pills */}
        <div className="flex flex-wrap gap-2 pb-1">
          {CATEGORY_CONFIG.map(cat => (
            <CategoryPill
              key={cat.label}
              cat={cat}
              active={category === cat.label}
              count={categoryCounts[cat.label] ?? 0}
              onClick={() => setCategory(cat.label)}
            />
          ))}
        </div>

        {/* Result count */}
        <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
          <Filter className="h-3 w-3" />
          {filtered.length} article{filtered.length !== 1 ? 's' : ''}
          {category !== 'All' && <span>in {category}</span>}
          {search && <span>matching &ldquo;{search}&rdquo;</span>}
          {showOnlyBookmarks && <span>· Bookmarked only</span>}
        </div>
      </motion.div>

      {/* Featured articles (top 3 for the selected category if applicable) */}
      {featured.length > 0 && (
        <motion.section initial="hidden" animate="visible" variants={fadeUp} className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <div className="h-1 w-6 hero-gradient rounded-full" />
            <h2 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Featured</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {featured.map(a => (
              <ArticleCard
                key={a.id}
                article={a}
                isBookmarked={bookmarks.has(a.id)}
                onBookmark={() => toggleBookmark(a.id)}
                onCopy={() => copy(a.id, `https://www.thesquad.pro/sports-hub/articles/${a.slug}`)}
                isCopied={copiedId === a.id}
              />
            ))}
          </div>
        </motion.section>
      )}

      {/* All articles grid */}
      <section>
        {featured.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <div className="h-1 w-6 bg-muted-foreground/30 rounded-full" />
            <h2 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">All Articles</h2>
          </div>
        )}

        {rest.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-center py-24 bg-card border rounded-2xl"
          >
            <BookOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="font-black text-sm uppercase tracking-widest text-muted-foreground mb-2">
              {showOnlyBookmarks ? 'No bookmarked articles' : 'No articles found'}
            </p>
            <p className="text-xs text-muted-foreground font-medium mb-4">
              {showOnlyBookmarks ? 'Bookmark articles to save them here.' : 'Try a different category or clear your search.'}
            </p>
            <button
              onClick={() => { setCategory('All'); setSearch(''); setShowOnlyBookmarks(false); }}
              className="text-xs font-black text-primary uppercase tracking-widest hover:underline"
            >
              Clear all filters
            </button>
          </motion.div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={`${category}-${search}-${sort}`}
              initial="hidden"
              animate="visible"
              variants={stagger}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
            >
              {rest.map(a => (
                <ArticleCard
                  key={a.id}
                  article={a}
                  isBookmarked={bookmarks.has(a.id)}
                  onBookmark={() => toggleBookmark(a.id)}
                onCopy={() => copy(a.id, `https://www.thesquad.pro/sports-hub/articles/${a.slug}`)}
                  isCopied={copiedId === a.id}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </section>
    </div>
  );
}
