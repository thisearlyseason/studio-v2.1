import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Industry News | Sports Hub — The Squad',
  description:
    'Live sports industry news aggregated from trusted coaching, nutrition, sports science, team management, and youth sports sources. Updated every 30 minutes.',
  keywords: [
    'sports news', 'coaching news', 'youth sports', 'sports science', 'team management',
    'tournament management', 'strength conditioning', 'sports nutrition',
  ],
  openGraph: {
    title: 'Industry News | Sports Hub',
    description: 'Live sports industry news from trusted sources — updated every 30 minutes.',
    type: 'website',
    url: 'https://www.thesquad.pro/sports-hub/news',
    siteName: 'The Squad',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Industry News | Sports Hub',
    description: 'Live sports industry news from trusted sources — updated every 30 minutes.',
  },
  alternates: {
    canonical: 'https://www.thesquad.pro/sports-hub/news',
  },
};

export default function NewsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: 'Industry News | Sports Hub',
            description: 'Live sports industry news aggregated from trusted sources.',
            url: 'https://www.thesquad.pro/sports-hub/news',
            publisher: {
              '@type': 'Organization',
              name: 'The Squad',
              url: 'https://www.thesquad.pro',
            },
          }),
        }}
      />
      {children}
    </>
  );
}
