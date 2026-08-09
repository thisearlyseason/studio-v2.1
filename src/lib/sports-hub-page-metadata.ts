import type { Metadata } from 'next';

const SITE_URL = 'https://www.thesquad.pro';

export function sportsHubPageMetadata(path: string, title: string, description: string): Metadata {
  const url = `${SITE_URL}${path}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website', url, title, description, siteName: 'The Squad' },
    twitter: { card: 'summary_large_image', title, description },
  };
}
