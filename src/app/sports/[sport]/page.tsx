import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, CalendarDays, ChevronLeft, ClipboardCheck, MessageCircle, ShieldCheck, Trophy, Users } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { isSportSlug, SPORT_LANDINGS, SPORT_SLUGS } from '@/lib/sport-landing';

type PageProps = { params: Promise<{ sport: string }> };

export function generateStaticParams() {
  return SPORT_SLUGS.map(sport => ({ sport }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { sport } = await params;
  if (!isSportSlug(sport)) return {};
  const landing = SPORT_LANDINGS[sport];
  const url = `https://www.thesquad.pro/sports/${sport}`;
  return {
    title: landing.seoTitle,
    description: landing.seoDescription,
    alternates: { canonical: url },
    keywords: [
      `${landing.name.toLowerCase()} team management software`,
      `${landing.name.toLowerCase()} registration software`,
      `${landing.name.toLowerCase()} scheduling software`,
      `${landing.name.toLowerCase()} team app`,
      `${landing.name.toLowerCase()} tournament software`,
    ],
    openGraph: {
      type: 'website',
      url,
      title: landing.seoTitle,
      description: landing.seoDescription,
      siteName: 'The Squad',
      images: [{ url: landing.heroImage, alt: landing.heroAlt }],
    },
    twitter: { card: 'summary_large_image', title: landing.seoTitle, description: landing.seoDescription, images: [landing.heroImage] },
  };
}

export default async function SportLandingPage({ params }: PageProps) {
  const { sport } = await params;
  if (!isSportSlug(sport)) notFound();
  const landing = SPORT_LANDINGS[sport];
  const pageUrl = `https://www.thesquad.pro/sports/${sport}`;
  const features = [
    { icon: ClipboardCheck, title: `${landing.name} registration`, description: landing.registration },
    { icon: CalendarDays, title: `${landing.name} scheduling`, description: landing.scheduling },
    { icon: MessageCircle, title: `${landing.name} team app`, description: landing.teamApp },
    { icon: Trophy, title: `${landing.name} tournaments`, description: landing.tournaments },
  ];
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: `The Squad for ${landing.name}`,
      applicationCategory: 'SportsApplication',
      operatingSystem: 'Web',
      url: pageUrl,
      description: landing.seoDescription,
      featureList: features.map(feature => feature.title),
      provider: { '@type': 'Organization', name: 'The Squad', url: 'https://www.thesquad.pro' },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'CAD', description: 'Free squad plan available' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: landing.faq.map(item => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'The Squad', item: 'https://www.thesquad.pro' },
        { '@type': 'ListItem', position: 2, name: 'Sports', item: 'https://www.thesquad.pro/sports' },
        { '@type': 'ListItem', position: 3, name: landing.name, item: pageUrl },
      ],
    },
  ];

  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <header className="absolute inset-x-0 top-0 z-20 border-b border-white/20 bg-black/25">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="The Squad home"><BrandLogo variant="dark-background" className="h-9 w-36" priority /></Link>
          <div className="flex items-center gap-4">
            <Link href="/sports" className="hidden text-xs font-black uppercase text-white sm:inline-flex sm:items-center"><ChevronLeft className="mr-2 h-4 w-4" />All sports</Link>
            <Link href="/signup" className="rounded-lg bg-primary px-5 py-3 text-xs font-black uppercase text-white">Create a squad</Link>
          </div>
        </div>
      </header>

      <section className="relative flex min-h-[78vh] items-end overflow-hidden bg-black text-white">
        <Image src={landing.heroImage} alt={landing.heroAlt} fill priority className="object-cover" sizes="100vw" />
        <div className="absolute inset-0 bg-black/65" />
        <div className="relative mx-auto w-full max-w-7xl px-5 pb-16 pt-36 sm:px-8 sm:pb-20">
          <p className="text-xs font-black uppercase text-primary">The Squad for {landing.name}</p>
          <h1 className="mt-4 max-w-5xl text-4xl font-black uppercase leading-tight tracking-normal sm:text-6xl lg:text-7xl">{landing.headline}</h1>
          <p className="mt-6 max-w-3xl text-base font-medium leading-8 text-white/80 sm:text-xl">{landing.description}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className="inline-flex min-h-12 items-center justify-center rounded-lg bg-primary px-7 text-xs font-black uppercase text-white">Start your {landing.name.toLowerCase()} squad<ArrowRight className="ml-3 h-4 w-4" /></Link>
            <Link href="/pricing" className="inline-flex min-h-12 items-center justify-center rounded-lg border border-white/40 bg-black/25 px-7 text-xs font-black uppercase text-white">Review plans</Link>
          </div>
        </div>
      </section>

      <section className="border-b bg-zinc-950 py-8 text-white">
        <div className="mx-auto grid max-w-7xl gap-5 px-5 sm:grid-cols-3 sm:px-8">
          <div className="flex items-center gap-3"><Users className="h-5 w-5 text-primary" /><span className="text-sm font-black uppercase">Teams, leagues, and schools</span></div>
          <div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-primary" /><span className="text-sm font-black uppercase">Role-appropriate family access</span></div>
          <div className="flex items-center gap-3"><Trophy className="h-5 w-5 text-primary" /><span className="text-sm font-black uppercase">Season and tournament tools</span></div>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <p className="text-xs font-black uppercase text-primary">One connected operating system</p>
          <h2 className="mt-3 max-w-4xl text-3xl font-black uppercase leading-tight tracking-normal sm:text-5xl">Manage the work around every {landing.name.toLowerCase()} session</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {features.map(({ icon: Icon, title, description }) => (
              <article key={title} className="rounded-lg border p-6 sm:p-8">
                <Icon className="h-7 w-7 text-primary" />
                <h3 className="mt-5 text-xl font-black uppercase tracking-normal">{title}</h3>
                <p className="mt-3 text-sm font-medium leading-7 text-zinc-600">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y bg-zinc-100 py-16 sm:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="text-xs font-black uppercase text-primary">Operational coverage</p>
            <h2 className="mt-3 text-3xl font-black uppercase tracking-normal sm:text-5xl">What {landing.name.toLowerCase()} programs can coordinate</h2>
          </div>
          <ul className="grid gap-px overflow-hidden rounded-lg border bg-zinc-300 sm:grid-cols-2">
            {landing.operationalDetails.map(item => (
              <li key={item} className="flex min-h-20 items-center gap-3 bg-white p-5 text-sm font-black uppercase"><ShieldCheck className="h-5 w-5 shrink-0 text-primary" />{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-4xl px-5 sm:px-8">
          <p className="text-xs font-black uppercase text-primary">Frequently asked questions</p>
          <h2 className="mt-3 text-3xl font-black uppercase tracking-normal sm:text-5xl">{landing.name} management questions</h2>
          <div className="mt-10 divide-y border-y">
            {landing.faq.map(item => (
              <article key={item.question} className="py-7">
                <h3 className="text-lg font-black tracking-normal">{item.question}</h3>
                <p className="mt-3 text-base font-medium leading-7 text-zinc-600">{item.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-zinc-950 py-16 text-white">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 sm:px-8 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-3xl font-black uppercase tracking-normal">Bring your {landing.name.toLowerCase()} season together</h2>
            <p className="mt-3 max-w-2xl text-base font-medium leading-7 text-white/65">Create a free squad and add the organization tools your program needs.</p>
          </div>
          <Link href="/signup" className="inline-flex min-h-12 items-center rounded-lg bg-primary px-7 text-xs font-black uppercase text-white">Create a squad<ArrowRight className="ml-3 h-4 w-4" /></Link>
        </div>
      </section>
    </main>
  );
}
