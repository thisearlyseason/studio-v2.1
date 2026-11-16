import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ParentCompanyBrand } from '@/components/ParentCompanyBrand';
import { FOUNDER } from '@/lib/marketing-proof';
export const metadata: Metadata = { title: 'About our sports team management app', description: 'The Squad is a Gameday Sports app for coaches, families, clubs and school athletic directors.', alternates: { canonical: 'https://www.thesquad.pro/about' } };
export default function AboutPage() {
  return <main className="container mx-auto max-w-3xl px-6 py-16 space-y-8"><Link href="/" className="underline">The Squad</Link><h1 className="text-4xl font-black">Less administration. More action. One Squad.</h1><ParentCompanyBrand /><p className="text-lg leading-relaxed">The Squad brings schedules, rosters, team chat, registration and competitions into one sports management workspace for coaches, families, club directors and school athletic directors.</p>{FOUNDER && <section className="space-y-5"><h2 className="text-2xl font-bold">Why {FOUNDER.name} built The Squad</h2><Image src={FOUNDER.photo} alt={FOUNDER.name} width={240} height={240} className="rounded-2xl" />{FOUNDER.story.map(sentence => <p key={sentence}>{sentence}</p>)}<div className="flex gap-4">{FOUNDER.links.map(link => <a key={link.url} href={link.url} className="underline">{link.label}</a>)}</div></section>}<p><Link href="/#contact" className="underline">Contact the team</Link> · <Link href="/how-to" className="underline">See how the workspace works</Link></p></main>;
}
