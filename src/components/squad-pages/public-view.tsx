'use client';
import { PageView, type PublicContext } from './page-view';
import type { PageContent } from '@/lib/squad-pages/model';
export function PublicPageView({ content, context, slug, localReview = false }: { content: PageContent; context: PublicContext; slug: string; localReview?: boolean }) { return <PageView localReview={localReview} content={content} context={context} images={p => `/api/squad-pages/media?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(p.id)}`} />; }
