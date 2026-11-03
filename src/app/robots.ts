import { MetadataRoute } from 'next';
const SITE_URL = 'https://www.thesquad.pro';
export default function robots(): MetadataRoute.Robots {
  // Allow crawlers to see noindex on utility/account pages. Authorization protects data.
  // No changes to model-training permissions: retain the existing wildcard policy.
  return { rules: { userAgent: '*', allow: '/', disallow: ['/api/'] }, sitemap: 'https://www.thesquad.pro/sitemap.xml', host: SITE_URL };
}
