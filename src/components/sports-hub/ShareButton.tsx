'use client';

import React, { useState } from 'react';
import { Share2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ShareButtonProps {
  url: string;
  title: string;
  className?: string;
}

export function ShareButton({ url, title, className }: ShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const fullUrl = `${typeof window !== 'undefined' ? window.location.origin : 'https://www.thesquad.pro'}${url}`;
    if (navigator.share) {
      try { await navigator.share({ title, url: fullUrl }); } catch {}
    } else {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleShare}
      aria-label="Share article"
      className={cn(
        'p-2 rounded-xl transition-all hover:bg-primary/10 active:scale-95 text-muted-foreground hover:text-primary',
        className
      )}
    >
      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Share2 className="h-4 w-4" />}
    </button>
  );
}
