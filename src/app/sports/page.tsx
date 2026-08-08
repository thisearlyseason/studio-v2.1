import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, CalendarDays, ClipboardCheck, MessageCircle, Trophy } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { SPORT_LANDINGS, SPORT_SLUGS } from '@/lib/sport-landing';

export const metadata: Metadata = {
  title: 'Sports Team and League Management Software by Sport',
  description: 'Explore sport-specific registration, scheduling, team communication, roster, league, and tournament management workflows in The Squad.',
  alternates: { canonical: '/sports' },
  openGraph: {
    type: 'website',
    url: 'https://www.thesquad.pro/sports',
    title: 'Sports Management Software by Sport | The Squad',
    description: 'Sport-specific registration, scheduling, communication, league, and tournament operations in one platform.',
    images: [{ url: '/images/campaigns/leagues-hero.webp', width: 1600, height: 900, alt: 'A multi-sport community facility' }],
  },
};

const capabilities = [
  { icon: ClipboardCheck, label: 'Registration and rosters' },
  { icon: CalendarDays, label: 'Schedules and facilities' },
  { icon: MessageCircle, label: 'Team and family communication' },
  { icon: Trophy, label: 'Leagues and tournaments' },
];

export default function SportsIndexPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Sports Management Software by Sport',
    url: 'https://www.thesquad.pro/sports',
    description: 'Sport-specific team, league, registration, scheduling, and tournament management pages from The Squad.',
    hasPart: SPORT_SLUGS.map(slug => ({
      '@type': 'WebPage',
      name: `${SPORT_LANDINGS[slug].name} Management Software`,
      url: `https://www.thesquad.pro/sports/${slug}`,
    })),
  };

  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <header className="absolute inset-x-0 top-0 z-20 border-b border-white/20 bg-black/25">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="The Squad home"><BrandLogo variant="dark-background" className="h-9 w-36" priority /></Link>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hidden text-xs font-black uppercase text-white sm:block">Log in</Link>
            <Link href="/signup" className="rounded-lg bg-primary px-5 py-3 text-xs font-black uppercase text-white">Create a squad</Link>
          </div>
        </div>
      </header>

      <section className="relative flex min-h-[78vh] items-end overflow-hidden bg-black text-white">
        <Image src="/images/campaigns/leagues-hero.webp" alt="A multi-sport community facility with fields and courts" fill priority className="object-cover" sizes="100vw" />
        <div className="absolute inset-0 bg-black/65" />
        <div className="relative mx-auto w-full max-w-7xl px-5 pb-16 pt-36 sm:px-8 sm:pb-20">
          <p className="text-xs font-black uppercase text-primary">Built around the sport you run</p>
          <h1 className="mt-4 max-w-5xl text-4xl font-black uppercase leading-tight tracking-normal sm:text-6xl lg:text-7xl">Sports management software by sport</h1>
          <p className="mt-6 max-w-3xl text-base font-medium leading-8 text-white/80 sm:text-xl">Registration, scheduling, rosters, communication, league operations, and tournaments work differently across sports. Explore practical workflows for the sports your organization manages.</p>
        </div>
      </section>

      <section className="border-b bg-zinc-950 py-8 text-white">
        <div className="mx-auto grid max-w-7xl gap-4 px-5 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
          {capabilities.map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3 border-l-2 border-primary pl-4">
              <Icon className="h-5 w-5 text-primary" />
              <span className="text-sm font-black uppercase">{label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <p className="text-xs font-black uppercase text-primary">Sport-specific solutions</p>
          <h2 className="mt-3 max-w-3xl text-3xl font-black uppercase tracking-normal sm:text-5xl">Choose your sport</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {SPORT_SLUGS.map(slug => {
              const sport = SPORT_LANDINGS[slug];
              return (
                <Link key={slug} href={`/sports/${slug}`} className="group overflow-hidden rounded-lg border bg-white shadow-sm transition hover:-translate-y-1 hover:border-primary hover:shadow-xl">
                  <div className="relative aspect-[16/8] overflow-hidden bg-zinc-900">
                    <Image src={sport.heroImage} alt={sport.heroAlt} fill className="object-cover transition duration-500 group-hover:scale-105" sizes="(max-width: 768px) 100vw, 50vw" />
                    <div className="absolute inset-0 bg-black/35" />
                    <h2 className="absolute bottom-5 left-5 text-3xl font-black uppercase tracking-normal text-white sm:text-4xl">{sport.name}</h2>
                  </div>
                  <div className="flex items-center justify-between gap-4 p-6">
                    <p className="max-w-xl text-sm font-medium leading-6 text-zinc-600">Registration, scheduling, team app, league, and tournament workflows for {sport.name.toLowerCase()} programs.</p>
                    <ArrowRight className="h-5 w-5 shrink-0 text-primary transition group-hover:translate-x-1" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-t bg-zinc-100 py-16">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 sm:px-8 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-3xl font-black uppercase tracking-normal">Run the season from one place</h2>
            <p className="mt-3 max-w-2xl text-base font-medium leading-7 text-zinc-600">Start with a squad, then add the competition and organization tools your program needs.</p>
          </div>
          <Link href="/signup" className="inline-flex min-h-12 items-center rounded-lg bg-primary px-7 text-xs font-black uppercase text-white">Create a squad<ArrowRight className="ml-3 h-4 w-4" /></Link>
        </div>
      </section>
    </main>
  );
}
