import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ParentCompanyBrand } from '@/components/ParentCompanyBrand';
import { AdoptionProof, CustomerStories, ThirdPartyProof } from '@/components/marketing/trust-proof';
import { FOUNDER } from '@/lib/marketing-proof';
export const metadata: Metadata = { title: { absolute: 'Who Builds The Squad | Gameday Sports' }, description: 'Meet Tyler Ans, owner of Gameday Sports and The Squad Pro. Read why he built sports team management tools for coaches, athletes and families.', alternates: { canonical: 'https://www.thesquad.pro/about' } };
export default function AboutPage() {
  return <main className="container mx-auto max-w-3xl px-6 py-16 space-y-8"><Link href="/" className="underline">The Squad</Link><h1 className="text-4xl font-black">Less administration. More action. One Squad.</h1><ParentCompanyBrand /><p className="text-lg leading-relaxed">The Squad brings schedules, rosters, team chat, registration and competitions into one sports management workspace for coaches, families, club directors and school athletic directors.</p>{FOUNDER && <section className="space-y-6" aria-labelledby="creator-story-heading">
      <h2 id="creator-story-heading" className="text-3xl font-bold tracking-tight">Why I built The Squad</h2>
      <div className="grid items-start gap-7 sm:grid-cols-[220px_1fr]">
        <figure className="space-y-3">
          <Image src={FOUNDER.photo} alt={`${FOUNDER.name}, creator of The Squad`} width={320} height={480} sizes="(max-width: 640px) 320px, 220px" className="w-full max-w-xs rounded-2xl" />
          <figcaption className="text-sm"><span className="block font-bold">{FOUNDER.name}</span>{FOUNDER.role && <span className="font-normal text-muted-foreground">{FOUNDER.role}</span>}</figcaption>
        </figure>
        <div className="space-y-5">
          <blockquote className="space-y-4 text-base font-normal leading-relaxed">{FOUNDER.story.map(sentence => <p key={sentence}>{sentence}</p>)}</blockquote>
          {FOUNDER.links.length > 0 && <div className="flex flex-wrap gap-4">{FOUNDER.links.map(link => <a key={link.url} href={link.url} className="underline">{link.label}</a>)}</div>}
        </div>
      </div>
    </section>}<AdoptionProof /><CustomerStories /><ThirdPartyProof /><p><Link href="/#contact" className="underline">Contact the team</Link> · <Link href="/how-to" className="underline">See how the workspace works</Link></p></main>;
}
