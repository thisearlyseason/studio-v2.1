import { publicRobots } from '@/lib/discovery-metadata';
import type { Metadata } from 'next';

const SITE_URL = 'https://www.thesquad.pro';

export function sportsHubPageMetadata(path: string, title: string, description: string): Metadata {
  const url = `${SITE_URL}${path}`;
  return {
    title,
    description,
    robots: publicRobots,
    alternates: { canonical: path },
    openGraph: { images: [{ url: '/og-image.png', width: 1376, height: 768, alt: 'The Squad sports team management' }], type: 'website', url, title, description, siteName: 'The Squad' },
    twitter: { images: ['/og-image.png'], card: 'summary_large_image', title, description },
  };
}
