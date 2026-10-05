'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface SearchBarProps {
  placeholder?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function SearchBar({ placeholder = 'Search articles, drills, resources...', className, size = 'md' }: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) router.push(`/sports-hub/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <form onSubmit={handleSubmit} role="search" className={cn('relative', className)}>
      <Search className={cn(
        'absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none',
        size === 'lg' ? 'h-5 w-5 left-4' : 'h-4 w-4'
      )} />
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        aria-label="Search Sports Hub"
        className={cn(
          'font-medium',
          size === 'lg' ? 'h-14 text-base pl-12 pr-12 rounded-2xl' : 'h-10 pl-9 pr-8 rounded-xl',
          size === 'sm' ? 'h-9 text-sm' : ''
        )}
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </form>
  );
}
