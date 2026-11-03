import type { Metadata } from 'next';

export const SITE_URL = 'https://www.thesquad.pro';
// Vercel previews and explicitly marked staging builds must never be indexed.
export const isDiscoveryPreview = process.env.VERCEL_ENV === 'preview' || process.env.SITE_INDEXING === 'disabled' || process.env.NEXT_PUBLIC_APP_DISTRIBUTION === 'store';
export const publicRobots = { index: !isDiscoveryPreview, follow: true };
export function discoveryMetadata(path: string, title: string, description: string): Metadata {
  const images = [{ url: '/og-image.png', width: 1376, height: 768, alt: 'The Squad sports team management' }];
  return {
    title, description, robots: publicRobots,
    alternates: { canonical: `${SITE_URL}${path}` },
    openGraph: { type: 'website', url: `${SITE_URL}${path}`, title, description, siteName: 'The Squad', locale: 'en_US', images },
    twitter: { card: 'summary_large_image', title, description, images },
  };
}
