import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { COMPETITOR_COMPARISONS, isComparisonSlug } from '@/lib/competitor-comparisons';
import { TierComparison } from '@/components/marketing/tier-comparison';
type Props = { params: Promise<{ competitor: string }> };
export function generateStaticParams() { return Object.keys(COMPETITOR_COMPARISONS).map(competitor => ({ competitor })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { competitor } = await params;
  if (!isComparisonSlug(competitor)) return {};
  const name = COMPETITOR_COMPARISONS[competitor].name;
  return { title: `The Squad vs ${name}: free and paid plans`, description: `Considering a ${name} alternative? Compare free and paid options, included teams and a practical checklist for moving your club to The Squad.`, alternates: { canonical: `https://www.thesquad.pro/vs/${competitor}` } };
}
export default async function ComparisonPage({ params }: Props) {
  const { competitor } = await params;
  if (!isComparisonSlug(competitor)) notFound();
  const comparison = COMPETITOR_COMPARISONS[competitor];
  return <main>
    <article className="container max-w-4xl mx-auto px-6 py-16 space-y-10">
      <Link href="/#comparison" className="underline">Back to platform comparisons</Link>
      <header className="space-y-5"><p className="text-sm text-muted-foreground">For club directors and team managers · Reviewed November 16, 2026</p><h1 className="text-4xl md:text-5xl font-black">The Squad vs {comparison.name}</h1><p className="text-lg leading-relaxed">{comparison.summary}</p></header>
      <section className="space-y-4"><h2 className="text-2xl font-bold">What is free, and what costs extra?</h2><div role="region" aria-label={`${comparison.name} free and paid comparison`} tabIndex={0} className="overflow-x-auto border rounded-xl"><table className="min-w-[600px] w-full text-left"><caption className="sr-only">Free and paid plans for The Squad and {comparison.name}</caption><thead><tr className="bg-muted"><th scope="col" className="p-4">Platform</th><th scope="col" className="p-4">Free option</th><th scope="col" className="p-4">Paid option and costs</th></tr></thead><tbody><tr className="border-t"><th scope="row" className="p-4">The Squad</th><td className="p-4">Starter: one team, schedules, team chat and score tracking.</td><td className="p-4">Squad Pro adds digital waivers, Stripe Connect payments and auto-brackets. Organization plans include multiple Pro teams. Current prices are below; processing fees are separate.</td></tr><tr className="border-t"><th scope="row" className="p-4">{comparison.name}</th><td className="p-4">{comparison.free}</td><td className="p-4">{comparison.paid}</td></tr></tbody></table></div><p className="text-sm text-muted-foreground">Features are summarized, not identical. Prices, currencies and processing terms can change. Check the linked official pages and your final checkout.</p></section>
      <section className="space-y-4"><h2 className="text-2xl font-bold">When is the free plan enough?</h2><p className="leading-relaxed">{comparison.fit}</p><p className="leading-relaxed">The Squad Starter is enough when you need a season calendar, team chat and score tracking for one team. Move to a paid plan when you have a specific need for its extra tools. If you only need messages and RSVPs, paying for a larger plan may add no value.</p></section>
      <section className="space-y-4"><h2 className="text-2xl font-bold">How clubs move over</h2><ol className="list-decimal pl-6 space-y-3"><li>Export the roster, schedule, payment records and signed documents you need from your current tool. Keep an independent copy.</li><li>Try a demo, then create one squad in The Squad. Check your staff roles before adding personal information.</li><li>Add roster details and upcoming events using the available controls. Compare names, dates, venues and RSVP settings with your original records.</li><li>Set up registration, waivers and Stripe Connect if needed. Check the actual workflow before sharing the link with families.</li><li>Invite one staff member and a small group of families. Verify team chat, calendar access and guardian links before moving the rest of the club.</li><li>Tell families which tool to use and when. Retain old records until you have checked every required export.</li></ol><p className="text-sm text-muted-foreground">This is a manual migration checklist. No automatic import or transfer of existing signed waivers is promised.</p><Link href="/how-to" className="underline">Follow the setup walkthroughs</Link></section>
      <section className="space-y-3"><h2 className="text-xl font-bold">Official sources</h2><ul className="space-y-2">{comparison.sources.map(source => <li key={source.url}><a href={source.url} className="underline">{source.label}</a></li>)}</ul></section>
      <Link href="/signup" className="inline-block bg-primary text-white px-6 py-3 rounded-xl font-bold">Start with a free squad</Link>
    </article>
    <div className="bg-black"><TierComparison /></div>
  </main>;
}
