'use client';

import React, { useState, useEffect } from 'react';
import { Bookmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUser } from '@/firebase';
import { readSportsHubArray, sportsHubStorageKey } from '@/lib/sports-hub-storage';

interface BookmarkButtonProps {
  articleId: string;
  className?: string;
}

export function BookmarkButton({ articleId, className }: BookmarkButtonProps) {
  const { user } = useUser();
  const [isBookmarked, setIsBookmarked] = useState(false);

  useEffect(() => {
    const bookmarks = readSportsHubArray(localStorage, 'bookmarks', user?.uid);
    setIsBookmarked(bookmarks.includes(articleId));
  }, [articleId, user?.uid]);

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const bookmarks = readSportsHubArray(localStorage, 'bookmarks', user?.uid);
    const next = isBookmarked
      ? bookmarks.filter((id) => id !== articleId)
      : [...bookmarks, articleId];
    localStorage.setItem(sportsHubStorageKey('bookmarks', user?.uid), JSON.stringify(next));
    setIsBookmarked(!isBookmarked);
  };

  return (
    <button
      onClick={toggle}
      aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark article'}
      className={cn(
        'p-2 rounded-xl transition-all hover:bg-primary/10 active:scale-95',
        isBookmarked ? 'text-primary' : 'text-muted-foreground hover:text-primary',
        className
      )}
    >
      <Bookmark className={cn('h-4 w-4', isBookmarked && 'fill-current')} />
    </button>
  );
}
