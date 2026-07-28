import React from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Eye, BookOpen, Play, Tag, ExternalLink, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getResourceById, RESOURCES } from '@/lib/sports-hub-resources';
import { VideoEmbed } from '@/components/sports-hub/VideoEmbed';
import { ShareButton } from '@/components/sports-hub/ShareButton';
import { BookmarkButton } from '@/components/sports-hub/BookmarkButton';
import { NewsletterSignup } from '@/components/sports-hub/NewsletterSignup';
import { ResourcePDFSection } from '@/components/sports-hub/ResourcePDFSection';
import { cn } from '@/lib/utils';

interface Params {
  params: Promise<{ id: string }>;
}

const difficultyColors: Record<string, string> = {
  beginner: 'bg-green-100 text-green-700 border-green-200',
  intermediate: 'bg-amber-100 text-amber-700 border-amber-200',
  advanced: 'bg-red-100 text-red-700 border-red-200',
};

const TYPE_LABELS: Record<string, string> = {
  'practice-plan': 'Practice Plan',
  'drill': 'Drill',
  'season-planner': 'Season Planner',
  'game-day-checklist': 'Game Day Checklist',
  'tournament-checklist': 'Tournament Checklist',
  'emergency-action-plan': 'Emergency Action Plan',
  'parent-communication': 'Parent Communication',
  'volunteer-guide': 'Volunteer Guide',
  'coach-meeting-agenda': 'Coach Meeting Agenda',
  'lineup-template': 'Lineup Template',
  'fundraising-ideas': 'Fundraising Guide',
  'equipment-list': 'Equipment List',
  'travel-checklist': 'Travel Checklist',
  'video': 'Video',
};

export async function generateStaticParams() {
  return RESOURCES.map((r) => ({ id: r.id }));
}

const SITE_URL = 'https://www.thesquad.pro';

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const resource = getResourceById(id);
  if (!resource) return { title: 'Resource Not Found | Sports Hub', robots: { index: false, follow: false } };
  const title = `${resource.title} | Sports Hub Playbook`;
  const url = `${SITE_URL}/sports-hub/resources/${id}`;
  return {
    title,
    description: resource.description,
    alternates: { canonical: `/sports-hub/resources/${id}` },
    openGraph: { type: 'article', url, title, description: resource.description, siteName: 'The Squad' },
    twitter: { card: 'summary_large_image', title, description: resource.description },
  };
}

// ---------------------------------------------------------------------------
// Markdown renderer — handles headings, lists, tables, blockquotes, links
// ---------------------------------------------------------------------------
function renderMarkdown(content: string): React.ReactNode[] {
  const lines = content.trim().split('\n');
  const out: React.ReactNode[] = [];
  let listItems: string[] = [];
  let isOrdered = false;
  let tableHead: string[] = [];
  let tableBody: string[][] = [];
  let expectingBody = false;

  /** Inline formatting: bold, italic, code, and [text](url) links */
  const fmt = (t: string) =>
    t
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary font-bold underline underline-offset-2 hover:opacity-80" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="bg-muted px-1 py-0.5 rounded text-xs font-mono">$1</code>');

  const pushList = (k: string) => {
    if (!listItems.length) return;
    out.push(
      isOrdered
        ? <ol key={k} className="list-decimal list-inside space-y-1.5 my-3 ml-4 text-foreground/80">
            {listItems.map((x, i) => <li key={i} className="text-sm md:text-base leading-relaxed" dangerouslySetInnerHTML={{ __html: x }} />)}
          </ol>
        : <ul key={k} className="list-disc list-inside space-y-1.5 my-3 ml-4 text-foreground/80">
            {listItems.map((x, i) => <li key={i} className="text-sm md:text-base leading-relaxed" dangerouslySetInnerHTML={{ __html: x }} />)}
          </ul>
    );
    listItems = [];
    isOrdered = false;
  };

  const pushTable = (k: string) => {
    if (!tableHead.length && !tableBody.length) return;
    out.push(
      <div key={k} className="overflow-x-auto my-6 rounded-xl border border-border">
        <table className="w-full text-left">
          {tableHead.length > 0 && (
            <thead>
              <tr className="border-b-2 border-border bg-muted/30">
                {tableHead.map((c, i) => (
                  <th key={i} className="px-4 py-2.5 text-left text-xs font-black uppercase tracking-widest text-muted-foreground">{c}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {tableBody.map((row, ri) => (
              <tr key={ri} className="border-b border-border hover:bg-muted/20 transition-colors">
                {row.map((c, ci) => (
                  <td key={ci} className="px-4 py-3 text-sm text-foreground/80" dangerouslySetInnerHTML={{ __html: fmt(c) }} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableHead = [];
    tableBody = [];
    expectingBody = false;
  };

  lines.forEach((line, idx) => {
    const k = `r${idx}`;

    if (line.startsWith('|')) {
      pushList(`l${idx}`);
      const isSep = line.replace(/[|\s:-]/g, '').length === 0;
      if (isSep) { expectingBody = true; return; }
      const cells = line.split('|').filter(Boolean).map(c => c.trim());
      const next = lines[idx + 1] ?? '';
      const nextIsSep = next.startsWith('|') && next.replace(/[|\s:-]/g, '').length === 0;
      if (nextIsSep) {
        tableHead = cells;
      } else {
        tableBody.push(cells);
        expectingBody = true;
      }
      return;
    }

    if (expectingBody || tableHead.length || tableBody.length) {
      pushTable(`t${idx}`);
    }

    if (line.startsWith('## ')) {
      pushList(`l${idx}`);
      out.push(<h2 key={k} className="text-xl md:text-2xl font-black tracking-tight mt-10 mb-4 pb-2 border-b">{line.slice(3)}</h2>);
    } else if (line.startsWith('### ')) {
      pushList(`l${idx}`);
      out.push(<h3 key={k} className="text-lg md:text-xl font-black tracking-tight mt-8 mb-3">{line.slice(4)}</h3>);
    } else if (line.startsWith('#### ')) {
      pushList(`l${idx}`);
      out.push(<h4 key={k} className="text-base font-black tracking-tight mt-6 mb-2">{line.slice(5)}</h4>);
    } else if (line.startsWith('> ')) {
      pushList(`l${idx}`);
      out.push(
        <blockquote key={k} className="border-l-4 border-primary pl-4 py-1 my-4 bg-primary/5 rounded-r-xl italic text-muted-foreground text-sm leading-relaxed"
          dangerouslySetInnerHTML={{ __html: fmt(line.slice(2)) }} />
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      listItems.push(fmt(line.slice(2)));
      isOrdered = false;
    } else if (/^\d+\.\s/.test(line)) {
      listItems.push(fmt(line.replace(/^\d+\.\s/, '')));
      isOrdered = true;
    } else if (line.startsWith('---')) {
      pushList(`l${idx}`);
      out.push(<hr key={k} className="my-8 border-border" />);
    } else if (line.startsWith('```')) {
      pushList(`l${idx}`);
      // skip fence markers
    } else if (line.trim() === '') {
      pushList(`l${idx}`);
      out.push(<div key={k} className="h-2" />);
    } else {
      pushList(`l${idx}`);
      out.push(
        <p key={k} className="text-sm md:text-base leading-relaxed text-foreground/80 my-2"
          dangerouslySetInnerHTML={{ __html: fmt(line) }} />
      );
    }
  });

  pushList('final');
  pushTable('final');

  return out;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function ResourceViewerPage({ params }: Params) {
  const { id } = await params;
  const resource = getResourceById(id);

  if (!resource) notFound();

  const related = RESOURCES
    .filter(r => r.id !== resource.id && (r.type === resource.type || r.sport === resource.sport))
    .slice(0, 3);

  const pdfFilename = `TheSquad-${resource.title.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').slice(0, 50)}.pdf`;
  const category = TYPE_LABELS[resource.type] ?? resource.type;
  const resourceUrl = `${SITE_URL}/sports-hub/resources/${id}`;
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'LearningResource',
      name: resource.title,
      description: resource.description,
      url: resourceUrl,
      learningResourceType: category,
      provider: { '@type': 'Organization', name: 'The Squad', url: SITE_URL },
      isAccessibleForFree: true,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Sports Hub', item: `${SITE_URL}/sports-hub` },
        { '@type': 'ListItem', position: 2, name: 'Resources', item: `${SITE_URL}/sports-hub/resources` },
        { '@type': 'ListItem', position: 3, name: resource.title, item: resourceUrl },
      ],
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <div className="max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-12">

      {/* Back nav */}
      <div className="mb-8">
        <Link href="/sports-hub/playbook">
          <Button variant="ghost" size="sm" className="font-black text-xs uppercase tracking-widest gap-1.5 text-muted-foreground hover:text-primary -ml-2">
            <ChevronLeft className="h-3.5 w-3.5" /> Back to Playbook
          </Button>
        </Link>
      </div>

      {/* Header */}
      <header className="mb-10 pb-8 border-b">
        <div className="flex flex-wrap gap-2 mb-4">
          <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest text-primary border-primary/20 bg-primary/5">
            {category}
          </Badge>
          {resource.sport && resource.sport !== 'General' && (
            <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
              {resource.sport}
            </Badge>
          )}
          {resource.difficulty && (
            <Badge variant="outline" className={cn('text-[9px] font-black uppercase tracking-widest border', difficultyColors[resource.difficulty] ?? '')}>
              {resource.difficulty}
            </Badge>
          )}
          {resource.isVideo && (
            <Badge className="bg-purple-100 text-purple-700 border-purple-200 text-[9px] font-black uppercase tracking-widest">
              <Play className="h-2.5 w-2.5 mr-1" />Video
            </Badge>
          )}
          <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest bg-green-50 text-green-700 border-green-200">
            Free Resource
          </Badge>
        </div>

        <h1 className="text-3xl md:text-4xl font-black tracking-tighter leading-tight mb-4">
          {resource.title}
        </h1>
        <p className="text-lg text-muted-foreground font-medium leading-relaxed mb-6">
          {resource.description}
        </p>

        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">
            <span className="flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" />
              {resource.downloadCount.toLocaleString()} views
            </span>
            <span className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              {category}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <BookmarkButton articleId={resource.id} />
            <ShareButton url={`/sports-hub/resources/${resource.id}`} title={resource.title} />
          </div>
        </div>
      </header>

      {/* ── PDF Download Banner ────────────────────────────────────────────── */}
      {!resource.isVideo && (
        <ResourcePDFSection
          resourceId={resource.id}
          title={resource.title}
          description={resource.description}
          category={category}
          content={resource.content.body}
          filename={pdfFilename}
          tags={resource.tags}
        />
      )}

      {/* Video embed */}
      {resource.isVideo && resource.videoUrl && (
        <div className="mb-10">
          <VideoEmbed url={resource.videoUrl} title={resource.title} />
          {resource.videoCredit && (
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-2 text-right">
              Video by <span className="text-foreground">{resource.videoCredit}</span> on YouTube
            </p>
          )}
        </div>
      )}

      {/* Resource Content */}
      <div className="mb-12">
        {renderMarkdown(resource.content.body)}
      </div>

      {/* Tags */}
      {resource.tags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-10 pb-10 border-b">
          <Tag className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {resource.tags.map(tag => (
            <Badge key={tag} variant="outline" className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
              {tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Related Resources */}
      {related.length > 0 && (
        <section className="mb-12">
          <h2 className="text-lg font-black uppercase tracking-tighter mb-4">Related Resources</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {related.map(r => (
              <Link key={r.id} href={`/sports-hub/resources/${r.id}`} className="group">
                <div className="bg-card border rounded-xl p-4 hover:border-primary/30 hover:bg-primary/5 transition-all">
                  <Badge variant="outline" className="text-[8px] font-black uppercase tracking-widest text-primary border-primary/20 bg-primary/5 mb-2">
                    {TYPE_LABELS[r.type] || r.type}
                  </Badge>
                  <p className="font-black text-sm leading-snug group-hover:text-primary transition-colors">{r.title}</p>
                  <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider mt-2 flex items-center gap-1">
                    <ExternalLink className="h-2.5 w-2.5" /> View Resource
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <NewsletterSignup />
      </div>
    </>
  );
}
