'use client';

import { useEffect, useMemo, useState } from 'react';
import { ARTICLES_LIST, type Article } from '@/lib/sports-hub-articles';

export function useSportsHubArticles(): Article[] {
  const [customArticles, setCustomArticles] = useState<Article[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/sports-hub/articles', { signal: controller.signal })
      .then(async response => response.ok ? response.json() : Promise.reject(new Error('Article request failed')))
      .then(payload => setCustomArticles(Array.isArray(payload.articles) ? payload.articles : []))
      .catch(error => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        console.warn('[Sports Hub] Custom articles are temporarily unavailable.');
      });
    return () => controller.abort();
  }, []);

  return useMemo(() => {
    const bySlug = new Map(ARTICLES_LIST.map(article => [article.slug, article]));
    customArticles.forEach(article => bySlug.set(article.slug, article));
    return [...bySlug.values()];
  }, [customArticles]);
}
