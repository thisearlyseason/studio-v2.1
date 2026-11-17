import { MetadataRoute } from 'next'
import { ARTICLES_LIST, ARTICLES_DB, type Article } from '@/lib/sports-hub-articles'
import { RESOURCES } from '@/lib/sports-hub-resources'
import { SPORTS_HUB_TEMPLATES } from '@/lib/sports-hub-template-catalog'
import { AUDIENCE_SLUGS } from '@/lib/audience-landing'
import { SPORT_SLUGS } from '@/lib/sport-landing'
import { ARTICLE_REDIRECTS } from '@/lib/sports-hub-article-redirects'
import { HUB_AUTHORS } from '@/lib/sports-hub-authors'
import { listPublicSportsHubArticles } from '@/lib/server-sports-hub'

export const revalidate = 3600
// This release changes article bylines, search metadata and shared brand assets.
// This is an editorial revision date, never a build/request clock.
const editorialRevision = new Date('2026-11-16T00:00:00Z')

function articleLastModified(article: Article): Date | undefined {
  if (ARTICLES_DB[article.slug]) return new Date(article.updatedAt || editorialRevision);
  const timestamp = Date.parse(article.updatedAt || article.publishedAt);
  return Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp) : undefined;
}

const baseUrl = 'https://www.thesquad.pro'

const staticPages: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
}> = [
  { path: '', changeFrequency: 'weekly', priority: 1 },
  ...['/security', '/download', '/plans', '/about', '/vs/teamsnap', '/vs/teamlinkt', '/vs/spond'].map(path => ({ path, changeFrequency: 'monthly' as const, priority: 0.7 })),
  { path: '/how-to', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/sports-hub', changeFrequency: 'daily', priority: 0.9 },
  { path: '/sports-hub/news', changeFrequency: 'daily', priority: 0.8 },
  { path: '/sports-hub/youth', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/sports-hub/coaching', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/sports-hub/team-management', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/sports-hub/parents', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/sports-hub/tournaments', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/sports-hub/resources', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/sports-hub/playbook', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/sports-hub/templates', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/sports-hub/featured', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/cookies', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/refunds', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/safety', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/refer-a-coach', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/sports', changeFrequency: 'monthly', priority: 0.8 },
]
 
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const cms = await listPublicSportsHubArticles().catch(() => []);
  const articles = new Map([...cms.filter(article => !ARTICLE_REDIRECTS[article.slug]), ...ARTICLES_LIST].map(article => [article.slug, article]));
  return [
    ...staticPages.map(page => ({
      url: `${baseUrl}${page.path}`,
      lastModified: editorialRevision,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    })),
    ...AUDIENCE_SLUGS.map(audience => ({
      url: `${baseUrl}/for/${audience}`,
      lastModified: editorialRevision,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    ...SPORT_SLUGS.map(sport => ({
      url: `${baseUrl}/sports/${sport}`,
      lastModified: editorialRevision,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    ...Array.from(articles.values()).map(article => ({
      url: `${baseUrl}/sports-hub/articles/${article.slug}`,
      lastModified: articleLastModified(article),
      changeFrequency: 'monthly' as const,
      priority: article.isFeatured ? 0.8 : 0.6,
    })),
    ...HUB_AUTHORS.map(author => ({ url: `${baseUrl}/author/${author.slug}`, lastModified: editorialRevision, changeFrequency: 'monthly' as const, priority: 0.5 })),
    ...RESOURCES.map(resource => ({
      url: `${baseUrl}/sports-hub/resources/${resource.id}`,
      changeFrequency: 'monthly' as const,
      priority: resource.isFeatured ? 0.7 : 0.5,
    })),
    ...SPORTS_HUB_TEMPLATES.map(template => ({
      url: `${baseUrl}/sports-hub/templates/${template.slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ]
}
