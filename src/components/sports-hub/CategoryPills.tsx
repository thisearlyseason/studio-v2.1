'use client';

import React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface CategoryPillsProps {
  categories: string[];
  basePath?: string;
  activeCategory?: string;
  onSelect?: (cat: string) => void;
  className?: string;
}

export function CategoryPills({ categories, basePath, activeCategory, onSelect, className }: CategoryPillsProps) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)} role="list">
      {categories.map((cat) => {
        const isActive = activeCategory === cat;
        if (onSelect) {
          return (
            <button
              key={cat}
              role="listitem"
              onClick={() => onSelect(cat)}
              className={cn(
                'px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                  : 'bg-muted/60 text-muted-foreground hover:bg-primary/10 hover:text-primary'
              )}
            >
              {cat}
            </button>
          );
        }
        return (
          <Link
            key={cat}
            role="listitem"
            href={`${basePath || '/sports-hub'}?cat=${encodeURIComponent(cat)}`}
            className={cn(
              'px-4 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all',
              isActive
                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                : 'bg-muted/60 text-muted-foreground hover:bg-primary/10 hover:text-primary'
            )}
          >
            {cat}
          </Link>
        );
      })}
    </div>
  );
}
