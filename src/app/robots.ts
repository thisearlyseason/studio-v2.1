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
        '/login',
        '/onboarding',
        '/public/',
        '/leagues/scorekeeper/',
        '/leagues/spectator/',
        '/recruit/player/',
        '/register/',
        '/schedule-app/',
        '/signup/',
        '/tournaments/',
        '/verify-email',
      ],
    },
    sitemap: 'https://www.thesquad.pro/sitemap.xml',
    host: 'www.thesquad.pro',
  }
}
