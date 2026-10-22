'use client';

import React from 'react';
import Link from 'next/link';
import { Clock, User, Bookmark, Share2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { BookmarkButton } from './BookmarkButton';
import { ShareButton } from './ShareButton';

interface ArticleData {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  featuredImage?: string;
  categories: string[];
  author: { name: string };
  readingTime: number;
  publishedAt: string;
  isProductUpdate?: boolean;
}

interface ArticleCardProps {
  article: ArticleData;
  variant?: 'default' | 'featured' | 'compact';
  className?: string;
}

export function ArticleCard({ article, variant = 'default', className }: ArticleCardProps) {
  const href = `/sports-hub/articles/${article.slug}`;

  if (variant === 'featured') {
    return (
      <Link href={href} className={cn('group block', className)}>
        <div className="relative overflow-hidden rounded-3xl bg-card border depth-card transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
          <div className="hero-gradient p-8 md:p-12">
            <div className="flex flex-wrap gap-2 mb-3">
              {article.categories.slice(0, 2).map((cat) => (
                <Badge key={cat} className="bg-white/20 text-white font-black text-[9px] uppercase tracking-widest border-0">
                  {cat}
                </Badge>
              ))}
            </div>
            <h2 className="text-xl md:text-3xl font-black tracking-tighter text-white leading-tight mb-4 group-hover:opacity-90 transition-opacity">
              {article.title}
            </h2>
            <p className="text-white/70 font-medium text-sm mb-6 leading-relaxed line-clamp-2 max-w-2xl">
              {article.excerpt}
            </p>
            <div className="flex items-center gap-4 text-white/60 text-xs font-bold uppercase tracking-wider">
              <span className="flex items-center gap-1.5"><User className="h-3 w-3" />{article.author.name}</span>
              <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" />{article.readingTime} min read</span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  if (variant === 'compact') {
    return (
      <Link href={href} className={cn('group flex items-start gap-3 p-3 rounded-xl hover:bg-muted/50 transition-all', className)}>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-primary mb-1">{article.categories[0]}</p>
          <h4 className="text-sm font-black tracking-tight leading-snug line-clamp-2 group-hover:text-primary transition-colors">
            {article.title}
          </h4>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mt-1 flex items-center gap-2">
            <span>{article.readingTime} min</span>
            <span>·</span>
            <span>{new Date(article.publishedAt).toLocaleDateString()}</span>
          </p>
        </div>
      </Link>
    );
  }

  // default variant
  return (
    <div className={cn(
      'group relative bg-card border rounded-2xl overflow-hidden depth-card transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5',
      className
    )}>
      <div className="h-1.5 hero-gradient" />
      <div className="p-5">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {article.categories.slice(0, 2).map((cat) => (
            <Badge key={cat} variant="outline" className="text-[9px] font-black uppercase tracking-widest text-primary border-primary/20 bg-primary/5">
              {cat}
            </Badge>
          ))}
          {article.isProductUpdate && (
            <Badge className="text-[9px] font-black uppercase tracking-widest bg-foreground text-background border-0">
              Update
            </Badge>
          )}
        </div>
        <Link href={href}>
          <h3 className="font-black tracking-tight text-base leading-snug line-clamp-2 mb-2 group-hover:text-primary transition-colors">
            {article.title}
          </h3>
        </Link>
        <p className="text-sm text-muted-foreground line-clamp-2 mb-4 font-medium leading-relaxed">
          {article.excerpt}
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-xs font-bold text-muted-foreground uppercase tracking-wider">
            <span className="flex items-center gap-1"><User className="h-3 w-3" />{article.author.name}</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{article.readingTime}m</span>
          </div>
          <div className="flex items-center gap-1">
            <BookmarkButton articleId={article.id} />
            <ShareButton url={`/sports-hub/articles/${article.slug}`} title={article.title} />
          </div>
        </div>
      </div>
    </div>
  );
}
