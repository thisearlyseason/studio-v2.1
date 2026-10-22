import React from 'react';
import { ExternalLink, Clock, Globe } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isExternalPurchaseUrl, isStoreDistribution } from '@/lib/app-distribution';

interface RSSCardData {
  id: string;
  title: string;
  url: string;
  excerpt: string;
  imageUrl?: string;
  source: string;
  publishedAt: string;
  category: string;
}

interface RSSCardProps {
  article: RSSCardData;
  className?: string;
}

function getTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function RSSCard({ article, className }: RSSCardProps) {
  const timeAgo = getTimeAgo(article.publishedAt);

  return (
    <div className={cn(
      'group bg-card border rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5',
      className
    )}>
      {article.imageUrl && (
        <div className="relative h-40 overflow-hidden bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.imageUrl}
            alt={article.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      )}
      {!article.imageUrl && <div className="h-1 bg-muted" />}
      <div className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest text-muted-foreground border-muted">
            {article.category}
          </Badge>
          <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest bg-orange-50 text-orange-600 border-orange-200">
            External
          </Badge>
        </div>
        <h3 className="font-black tracking-tight text-sm leading-snug line-clamp-2 mb-2 group-hover:text-primary transition-colors">
          {article.title}
        </h3>
        <p className="text-xs text-muted-foreground line-clamp-2 mb-4 font-medium leading-relaxed">
          {article.excerpt}
        </p>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            <Globe className="h-3 w-3" />
            <span>{article.source}</span>
            <span>·</span>
            <Clock className="h-3 w-3" />
            <span>{timeAgo}</span>
          </div>
          {(!isStoreDistribution || !isExternalPurchaseUrl(article.url)) && <a href={article.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[9px] font-black uppercase tracking-widest border-border/60 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all gap-1.5"
            >
              <ExternalLink className="h-3 w-3" />
              Read Original
            </Button>
          </a>}
        </div>
      </div>
    </div>
  );
}
