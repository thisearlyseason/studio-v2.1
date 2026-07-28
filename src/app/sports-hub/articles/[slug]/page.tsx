import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Clock, ChevronLeft, Calendar, Tag, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ReadingProgress } from '@/components/sports-hub/ReadingProgress';
import { BookmarkButton } from '@/components/sports-hub/BookmarkButton';
import { ShareButton } from '@/components/sports-hub/ShareButton';
import { NewsletterSignup } from '@/components/sports-hub/NewsletterSignup';
import { ARTICLES_DB, ARTICLES_LIST } from '@/lib/sports-hub-articles';
import { renderSafeRichTextInline } from '@/lib/rich-text';
import { getPublicSportsHubArticle } from '@/lib/server-sports-hub';

interface Params {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return Object.keys(ARTICLES_DB).map((slug) => ({ slug }));
}

const SITE_URL = 'https://www.thesquad.pro';

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const article = ARTICLES_DB[slug] || await getPublicSportsHubArticle(slug).catch(() => null);
  if (!article) return { title: 'Article Not Found | Sports Hub', robots: { index: false, follow: false } };
  const title = article.seoTitle || `${article.title} | Sports Hub`;
  const description = article.seoDescription || article.excerpt;
  const url = `${SITE_URL}/sports-hub/articles/${slug}`;
  return {
    title,
    description,
    alternates: { canonical: `/sports-hub/articles/${slug}` },
    openGraph: {
      type: 'article',
      url,
      title,
      description,
      siteName: 'The Squad',
      publishedTime: article.publishedAt,
      authors: [article.author.name],
      tags: article.tags,
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

/** Convert markdown content to React elements */
function renderContent(content: string): React.ReactNode[] {
  const lines = content.trim().split('\n');
  const elements: React.ReactNode[] = [];
  let listBuffer: string[] = [];
  let isNumberedList = false;

  const formatInline = (text: string): string => renderSafeRichTextInline(text);

  const flushList = (key: string) => {
    if (listBuffer.length === 0) return;
    if (isNumberedList) {
      elements.push(
        <ol key={key} className="list-decimal ml-5 space-y-2 my-4">
          {listBuffer.map((item, i) => (
            <li key={i} className="text-base text-foreground/80 leading-relaxed" dangerouslySetInnerHTML={{ __html: item }} />
          ))}
        </ol>
      );
    } else {
      elements.push(
        <ul key={key} className="list-disc ml-5 space-y-2 my-4">
          {listBuffer.map((item, i) => (
            <li key={i} className="text-base text-foreground/80 leading-relaxed" dangerouslySetInnerHTML={{ __html: item }} />
          ))}
        </ul>
      );
    }
    listBuffer = [];
    isNumberedList = false;
  };

  // Table state machine — buffer header/body rows, flush as a complete table with thead/tbody
  let tableHeaderCells: string[] = [];
  let tableBodyRows: string[][] = [];
  let inTable = false;

  const flushTable = (key: string) => {
    if (tableHeaderCells.length === 0 && tableBodyRows.length === 0) return;
    elements.push(
      <div key={key} className="overflow-x-auto my-6 rounded-xl border border-border">
        <table className="w-full text-left">
          {tableHeaderCells.length > 0 && (
            <thead>
              <tr className="border-b-2 border-border bg-muted/30">
                {tableHeaderCells.map((cell, ci) => (
                  <th key={ci} className="px-4 py-2.5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {tableBodyRows.map((row, ri) => (
              <tr key={ri} className="border-b border-border hover:bg-muted/20 transition-colors">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-4 py-3 text-sm text-foreground/80"
                    dangerouslySetInnerHTML={{ __html: formatInline(cell) }} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableHeaderCells = [];
    tableBodyRows = [];
    inTable = false;
  };

  lines.forEach((line, idx) => {
    const key = `l-${idx}`;

    // Table detection
    if (line.startsWith('|')) {
      flushList(`list-${idx}`);
      const stripped = line.replace(/[|\s:-]/g, '');
      const isSep = stripped.length === 0;
      if (isSep) {
        inTable = true;
        return;
      }
      const cells = line.split('|').filter(Boolean).map(c => c.trim());
      const nextLine = lines[idx + 1] || '';
      const nextStripped = nextLine.replace(/[|\s:-]/g, '');
      const nextIsSep = nextLine.startsWith('|') && nextStripped.length === 0;
      if (nextIsSep) {
        tableHeaderCells = cells;
      } else {
        tableBodyRows.push(cells);
        inTable = true;
      }
      return;
    }

    // Flush table if we left table territory
    if (inTable || tableHeaderCells.length > 0 || tableBodyRows.length > 0) {
      flushTable(`table-${idx}`);
    }

    if (line.startsWith('## ')) {
      flushList(`list-${idx}`);
      elements.push(
        <h2 key={key} className="text-2xl md:text-3xl font-black tracking-tight mt-12 mb-4 pb-3 border-b">
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      flushList(`list-${idx}`);
      elements.push(
        <h3 key={key} className="text-xl font-black tracking-tight mt-8 mb-3">
          {line.slice(4)}
        </h3>
      );
    } else if (line.startsWith('#### ')) {
      flushList(`list-${idx}`);
      elements.push(
        <h4 key={key} className="text-base font-black tracking-tight mt-6 mb-2">
          {line.slice(5)}
        </h4>
      );
    } else if (line.startsWith('> ')) {
      flushList(`list-${idx}`);
      elements.push(
        <blockquote key={key}
          className="border-l-4 border-primary pl-5 py-2 my-6 bg-primary/5 rounded-r-2xl italic text-foreground/70 text-base leading-relaxed"
          dangerouslySetInnerHTML={{ __html: formatInline(line.slice(2)) }}
        />
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      listBuffer.push(formatInline(line.slice(2)));
      isNumberedList = false;
    } else if (/^\d+\.\s/.test(line)) {
      listBuffer.push(formatInline(line.replace(/^\d+\.\s/, '')));
      isNumberedList = true;
    } else if (line.startsWith('---')) {
      flushList(`list-${idx}`);
      elements.push(<hr key={key} className="my-10 border-border" />);
    } else if (line.startsWith('```')) {
      flushList(`list-${idx}`);
      // skip code fence markers
    } else if (line.trim() === '') {
      flushList(`list-${idx}`);
      elements.push(<div key={key} className="h-2" />);
    } else {
      flushList(`list-${idx}`);
      elements.push(
        <p key={key} className="text-base md:text-lg leading-relaxed text-foreground/80 my-3"
          dangerouslySetInnerHTML={{ __html: formatInline(line) }}
        />
      );
    }
  });

  flushList('final');
  flushTable('final-table');

  return elements;
}

export default async function ArticlePage({ params }: Params) {
  const { slug } = await params;
  const article = ARTICLES_DB[slug] || await getPublicSportsHubArticle(slug).catch(error => {
    console.error('[Sports Hub] Article lookup failed:', error);
    return null;
  });

  if (!article) notFound();

  // Related articles: same section or category
  const related = ARTICLES_LIST
    .filter(a => a.slug !== slug && (a.section === article.section || a.categories.some(c => article.categories.includes(c))))
    .slice(0, 3);

  const sectionHref = {
    coaching: '/sports-hub/coaching',
    'team-management': '/sports-hub/team-management',
    tournaments: '/sports-hub/tournaments',
    parents: '/sports-hub/parents',
    news: '/sports-hub/news',
  }[article.section] || '/sports-hub';

  const sectionLabel = {
    coaching: 'Coaching',
    'team-management': 'Team Management',
    tournaments: 'Tournaments',
    parents: 'Parents',
    news: 'Latest News',
  }[article.section] || 'Sports Hub';

  const articleUrl = `${SITE_URL}/sports-hub/articles/${slug}`;
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: article.title,
      description: article.seoDescription || article.excerpt,
      datePublished: article.publishedAt,
      mainEntityOfPage: articleUrl,
      author: { '@type': 'Person', name: article.author.name },
      publisher: {
        '@type': 'Organization',
        name: 'The Squad',
        url: SITE_URL,
        logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon-512.png` },
      },
      keywords: article.tags.join(', '),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Sports Hub', item: `${SITE_URL}/sports-hub` },
        { '@type': 'ListItem', position: 2, name: sectionLabel, item: `${SITE_URL}${sectionHref}` },
        { '@type': 'ListItem', position: 3, name: article.title, item: articleUrl },
      ],
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <ReadingProgress />
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-12">

        {/* Back nav */}
        <div className="mb-8">
          <Link href={sectionHref}>
            <Button variant="ghost" size="sm" className="font-black text-xs uppercase tracking-widest gap-1.5 text-muted-foreground hover:text-primary -ml-2">
              <ChevronLeft className="h-3.5 w-3.5" />Back to {sectionLabel}
            </Button>
          </Link>
        </div>

        {/* Article Header */}
        <header className="mb-10">
          <div className="flex flex-wrap gap-2 mb-5">
            {article.categories.map((cat) => (
              <Badge key={cat} variant="outline" className="text-[9px] font-black uppercase tracking-widest text-primary border-primary/20 bg-primary/5">
                {cat}
              </Badge>
            ))}
          </div>
          <h1 className="text-3xl md:text-5xl font-black tracking-tighter leading-tight mb-5">
            {article.title}
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground font-medium leading-relaxed mb-7">
            {article.excerpt}
          </p>

          <div className="flex items-center justify-between flex-wrap gap-4 pb-6 border-b">
            <div className="flex items-center gap-4">
              <div className="h-11 w-11 rounded-full hero-gradient flex items-center justify-center text-white font-black text-base shrink-0">
                {article.author.name[0]}
              </div>
              <div>
                <p className="font-black text-sm">{article.author.name}</p>
                <p className="text-xs text-muted-foreground font-medium">{article.author.title}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {new Date(article.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {article.readingTime} min read
              </span>
              <div className="flex items-center gap-1">
                <BookmarkButton articleId={article.id} />
                <ShareButton url={`/sports-hub/articles/${article.slug}`} title={article.title} />
              </div>
            </div>
          </div>
        </header>

        {/* Article Content */}
        <article className="mb-12">
          {renderContent(article.content)}
        </article>

        {/* Tags */}
        {article.tags.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap mb-10 pb-10 border-b">
            <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            {article.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {/* Author */}
        <div className="bg-card border rounded-2xl p-5 mb-12 flex items-center gap-4">
          <div className="h-11 w-11 rounded-full hero-gradient flex items-center justify-center text-white font-black text-base shrink-0">
            {article.author.name[0]}
          </div>
          <div>
            <p className="font-black tracking-tight text-sm">{article.author.name}</p>
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">{article.author.title}</p>
          </div>
        </div>

        {/* Related Articles */}
        {related.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black uppercase tracking-tighter">Related Articles</h2>
              <Link href={sectionHref}>
                <Button variant="ghost" size="sm" className="font-black text-xs uppercase tracking-widest gap-1.5 text-muted-foreground hover:text-primary">
                  More <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {related.map((rel) => (
                <Link key={rel.slug} href={`/sports-hub/articles/${rel.slug}`} className="group">
                  <div className="bg-card border rounded-xl p-4 h-full hover:border-primary/30 hover:bg-primary/5 transition-all">
                    <div className="flex flex-wrap gap-1 mb-2">
                      {rel.categories.slice(0, 1).map(cat => (
                        <Badge key={cat} variant="outline" className="text-[8px] font-black uppercase tracking-widest text-primary border-primary/20 bg-primary/5">
                          {cat}
                        </Badge>
                      ))}
                    </div>
                    <p className="font-black text-sm leading-snug group-hover:text-primary transition-colors mb-2">{rel.title}</p>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" /> {rel.readingTime} min read
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Newsletter CTA */}
        <NewsletterSignup />
      </div>
    </>
  );
}
