import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ARTICLES_LIST } from '@/lib/sports-hub-articles';
import { HUB_AUTHORS, hubAuthorSchema } from '@/lib/sports-hub-authors';
import { pageTitle, pageDescription } from '@/lib/seo-metadata';

type Props = { params: Promise<{ slug: string }> };
export function generateStaticParams() { return HUB_AUTHORS.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const author = HUB_AUTHORS.find(item => item.slug === slug);
  if (!author) notFound();
  return { title: pageTitle(`${author.name} | Sports Hub Reviewer`), description: pageDescription(author.bio), alternates: { canonical: `/author/${slug}` } };
}
export default async function AuthorPage({ params }: Props) {
  const { slug } = await params;
  const author = HUB_AUTHORS.find(item => item.slug === slug);
  if (!author) notFound();
  const articles = ARTICLES_LIST.filter(article => article.author.name === author.name);
  return <main className="mx-auto max-w-3xl px-5 py-12">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(hubAuthorSchema(author.name)) }} />
    <Link href="/sports-hub" className="text-sm underline">Back to Sports Hub</Link>
    <h1 className="mt-8 text-4xl font-bold">{author.name}</h1>
    <p className="mt-5 text-lg font-normal leading-relaxed">{author.bio}</p>
    {author.profiles.length > 0 && <nav aria-label="Contributor profiles" className="mt-4 flex gap-4">{author.profiles.map(url => <a key={url} href={url} rel="noopener noreferrer" className="underline">Professional profile</a>)}</nav>}
    <h2 className="mt-10 text-2xl font-bold">Articles credited to {author.name}</h2>
    <ul className="mt-5 space-y-5">{articles.map(article => <li key={article.slug}><Link href={`/sports-hub/articles/${article.slug}`} className="text-lg underline">{article.title}</Link><p className="mt-1 font-normal text-muted-foreground">{article.excerpt}</p></li>)}</ul>
  </main>;
}
