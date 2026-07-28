import { MetadataRoute } from 'next'
import { ARTICLES_LIST } from '@/lib/sports-hub-articles'
import { RESOURCES } from '@/lib/sports-hub-resources'
import { SPORTS_HUB_TEMPLATES } from '@/lib/sports-hub-template-catalog'

const baseUrl = 'https://www.thesquad.pro'

const staticPages: Array<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
  priority: number;
}> = [
  { path: '', changeFrequency: 'weekly', priority: 1 },
  { path: '/how-to', changeFrequency: 'monthly', priority: 0.7 },
  { path: '/sports-hub', changeFrequency: 'daily', priority: 0.9 },
  { path: '/sports-hub/news', changeFrequency: 'daily', priority: 0.8 },
  { path: '/sports-hub/coaching', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/sports-hub/team-management', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/sports-hub/parents', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/sports-hub/tournaments', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/sports-hub/resources', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/sports-hub/playbook', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/sports-hub/templates', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/sports-hub/featured', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/privacy', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/terms', changeFrequency: 'yearly', priority: 0.3 },
  { path: '/safety', changeFrequency: 'yearly', priority: 0.3 },
]
 
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    ...staticPages.map(page => ({
      url: `${baseUrl}${page.path}`,
      changeFrequency: page.changeFrequency,
      priority: page.priority,
    })),
    ...ARTICLES_LIST.map(article => ({
      url: `${baseUrl}/sports-hub/articles/${article.slug}`,
      lastModified: new Date(article.publishedAt),
      changeFrequency: 'monthly' as const,
      priority: article.isFeatured ? 0.8 : 0.6,
    })),
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
