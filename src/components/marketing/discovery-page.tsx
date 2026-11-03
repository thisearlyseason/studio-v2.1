import Link from 'next/link';
import { isStoreDistribution } from '@/lib/app-distribution';
import BrandLogo from '@/components/BrandLogo';
import { SITE_URL } from '@/lib/discovery-metadata';

export function DiscoveryPage({ title, path, introduction, children }: { title: string; path: string; introduction: string; children: React.ReactNode }) {
  const breadcrumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'The Squad', item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: title, item: `${SITE_URL}${path}` },
  ] };
  return <div className="min-h-screen bg-background text-foreground">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />
    <header className="border-b"><nav aria-label="Main navigation" className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-6 py-5">
      <Link href="/" aria-label="The Squad home"><BrandLogo variant="light-background" className="h-9 w-36" /></Link>
      <div className="flex flex-wrap gap-5 text-sm font-semibold">{!isStoreDistribution && <Link href="/plans">Plans</Link>}<Link href="/download">Get the app</Link><Link href="/sports">Sports</Link><Link href="/how-to">Help</Link><Link href="/login">Log in</Link></div>
    </nav></header>
    <main className="mx-auto max-w-5xl space-y-12 px-6 py-14">
      <div className="max-w-3xl space-y-5"><p className="font-semibold uppercase tracking-widest text-primary">The Squad</p><h1 className="text-4xl font-black tracking-tight md:text-6xl">{title}</h1><p className="text-lg leading-relaxed text-muted-foreground">{introduction}</p></div>
      {children}
      <section className="rounded-2xl bg-muted p-7"><h2 className="text-2xl font-bold">Need help choosing or getting started?</h2><p className="mt-3 leading-relaxed">Read the <Link className="underline" href="/how-to">step-by-step guide</Link> or email <a className="underline" href="mailto:team@thesquad.pro">team@thesquad.pro</a>.</p></section>
    </main>
    <footer className="mx-auto flex max-w-5xl flex-wrap gap-6 border-t px-6 py-8 text-sm"><Link href="/">The Squad home</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/safety">Safety</Link></footer>
  </div>;
}
