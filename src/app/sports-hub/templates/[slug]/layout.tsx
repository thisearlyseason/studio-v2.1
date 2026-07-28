import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getSportsHubTemplate } from '@/lib/sports-hub-template-catalog';

const SITE_URL = 'https://www.thesquad.pro';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const template = getSportsHubTemplate(slug);
  if (!template) return { title: 'Template Not Found', robots: { index: false, follow: false } };

  const title = `${template.title} | Sports Hub Templates`;
  const url = `${SITE_URL}/sports-hub/templates/${template.slug}`;
  return {
    title,
    description: template.description,
    alternates: { canonical: `/sports-hub/templates/${template.slug}` },
    openGraph: { type: 'article', url, title, description: template.description, siteName: 'The Squad' },
    twitter: { card: 'summary_large_image', title, description: template.description },
  };
}

export default async function TemplateLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const template = getSportsHubTemplate(slug);
  if (!template) notFound();

  const url = `${SITE_URL}/sports-hub/templates/${template.slug}`;
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name: template.title,
      description: template.description,
      url,
      isAccessibleForFree: true,
      provider: { '@type': 'Organization', name: 'The Squad', url: SITE_URL },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Sports Hub', item: `${SITE_URL}/sports-hub` },
        { '@type': 'ListItem', position: 2, name: 'Templates', item: `${SITE_URL}/sports-hub/templates` },
        { '@type': 'ListItem', position: 3, name: template.title, item: url },
      ],
    },
  ];

  return <>{<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />}{children}</>;
}
