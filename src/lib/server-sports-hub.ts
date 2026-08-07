import 'server-only';

import { adminDb } from '@/lib/firebase-admin';
import type { Article } from '@/lib/sports-hub-articles';

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean).slice(0, 30)
    : [];
}

function publishedDate(value: unknown): string {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return new Date(0).toISOString();
}

function normalizePublicArticle(id: string, data: FirebaseFirestore.DocumentData): Article | null {
  if (data.isDraft === true) return null;
  const slug = text(data.slug);
  const title = text(data.title);
  const excerpt = text(data.excerpt);
  const content = text(data.content);
  if (!slug || !title || !excerpt || !content) return null;

  return {
    id,
    slug,
    title,
    excerpt,
    content,
    section: text(data.section, 'news'),
    categories: stringList(data.categories),
    tags: stringList(data.tags),
    author: {
      name: text(data.author?.name, 'The Squad Team'),
      title: text(data.author?.title, 'Sports Management Experts'),
    },
    readingTime: Number.isFinite(data.readingTime) ? Math.max(1, Math.min(120, Number(data.readingTime))) : 1,
    publishedAt: publishedDate(data.publishedAt),
    isFeatured: data.isFeatured === true,
    seoTitle: text(data.seoTitle) || undefined,
    seoDescription: text(data.seoDescription) || undefined,
  };
}

export async function listPublicSportsHubArticles(): Promise<Article[]> {
  const snapshot = await adminDb.collection('sports_hub_articles').where('isDraft', '==', false).limit(100).get();
  return snapshot.docs
    .map(document => normalizePublicArticle(document.id, document.data()))
    .filter((article): article is Article => article !== null)
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
}

export async function getPublicSportsHubArticle(slug: string): Promise<Article | null> {
  const snapshot = await adminDb.collection('sports_hub_articles').where('slug', '==', slug).limit(1).get();
  if (snapshot.empty) return null;
  const document = snapshot.docs[0];
  return normalizePublicArticle(document.id, document.data());
}
