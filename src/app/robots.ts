import { MetadataRoute } from 'next'
 
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/admin/',
        '/dashboard/',
        '/embed/',
        '/events/register/',
        '/leagues/scorekeeper/',
        '/leagues/spectator/',
        '/recruit/player/',
        '/register/',
        '/schedule-app/',
        '/tournaments/',
      ],
    },
    sitemap: 'https://www.thesquad.pro/sitemap.xml',
    host: 'www.thesquad.pro',
  }
}
