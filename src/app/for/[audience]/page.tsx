import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AudienceLandingPage } from '@/components/marketing/audience-landing-page';
import {
  AUDIENCE_LANDINGS,
  AUDIENCE_SLUGS,
  isAudienceSlug,
} from '@/lib/audience-landing';

type PageProps = {
  params: Promise<{ audience: string }>;
};

export function generateStaticParams() {
  return AUDIENCE_SLUGS.map(audience => ({ audience }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { audience } = await params;
  if (!isAudienceSlug(audience)) return {};
  const landing = AUDIENCE_LANDINGS[audience];
  const url = `https://www.thesquad.pro/for/${audience}`;

  return {
    title: landing.seoTitle,
    description: landing.seoDescription,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      title: landing.seoTitle,
      description: landing.seoDescription,
      siteName: 'The Squad',
      images: [{ url: '/og-image.png', width: 1200, height: 630, alt: landing.seoTitle }],
    },
    twitter: {
      card: 'summary_large_image',
      title: landing.seoTitle,
      description: landing.seoDescription,
      images: ['/og-image.png'],
    },
  };
}

export default async function AudiencePage({ params }: PageProps) {
  const { audience } = await params;
  if (!isAudienceSlug(audience)) notFound();
  const landing = AUDIENCE_LANDINGS[audience];
  const pageUrl = `https://www.thesquad.pro/for/${audience}`;
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: landing.seoTitle,
      url: pageUrl,
      description: landing.seoDescription,
      audience: { '@type': 'Audience', audienceType: landing.audience },
      isPartOf: { '@type': 'WebSite', name: 'The Squad', url: 'https://www.thesquad.pro' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'The Squad', item: 'https://www.thesquad.pro' },
        { '@type': 'ListItem', position: 2, name: landing.audience, item: pageUrl },
      ],
    },
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <AudienceLandingPage landing={landing} />
    </>
  );
}
