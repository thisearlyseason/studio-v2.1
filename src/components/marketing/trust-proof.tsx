import Image from 'next/image';
import Link from 'next/link';
import { ADOPTION, CUSTOMER_STORIES, EXTERNAL_PROOF, FOUNDER } from '@/lib/marketing-proof';

export function AdoptionProof() {
  if (!ADOPTION) return null;
  return <aside className="bg-black text-white py-8 text-center"><p className="text-2xl font-bold">{ADOPTION.count.toLocaleString('en-US')} {ADOPTION.label}</p><p className="text-sm">Verified {ADOPTION.verifiedOn}</p><div className="flex justify-center gap-2 mt-3">{ADOPTION.avatars.map(person => <Image key={person.photo} src={person.photo} alt={person.alt} width={40} height={40} className="rounded-full" />)}</div></aside>;
}
export function CustomerStories() {
  if (!CUSTOMER_STORIES.length) return null;
  return <section className="container mx-auto px-6 py-16"><h2 className="text-3xl font-bold mb-8">From the people running the season</h2><div className="grid gap-6 md:grid-cols-3">{CUSTOMER_STORIES.map(story => <figure key={`${story.name}-${story.team}`} className="border rounded-2xl p-6"><blockquote className="leading-relaxed">“{story.quote}”</blockquote><figcaption className="flex items-center gap-3 mt-5"><Image src={story.photo} alt={story.name} width={56} height={56} className="rounded-full" /><span>{story.name}<br /><span className="text-sm text-muted-foreground">{story.role}, {story.team}</span></span></figcaption></figure>)}</div></section>;
}
export function FounderStrip() {
  if (!FOUNDER) return null;
  return <aside className="container mx-auto flex items-center gap-5 px-6 py-10"><Image src={FOUNDER.photo} alt={`${FOUNDER.name}, creator of The Squad`} width={96} height={144} className="h-28 w-20 shrink-0 rounded-2xl object-cover" /><div className="space-y-2"><p className="font-bold">Built by {FOUNDER.name}.</p><p className="max-w-xl text-sm font-normal leading-relaxed text-muted-foreground">{FOUNDER.story[0]}</p><Link href="/about" className="inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">Why I built The Squad</Link></div></aside>;
}
export function ThirdPartyProof() {
  if (!EXTERNAL_PROOF.length) return null;
  return <aside className="container mx-auto px-6 py-8"><h2 className="text-xl font-bold">Independent reviews and mentions</h2><ul className="flex flex-wrap gap-6 mt-4">{EXTERNAL_PROOF.map(proof => <li key={proof.url}><a className="underline" href={proof.url}>{proof.publisher}: {proof.title}</a><br /><time dateTime={proof.date} className="text-sm text-muted-foreground">{proof.date}</time></li>)}</ul></aside>;
}
