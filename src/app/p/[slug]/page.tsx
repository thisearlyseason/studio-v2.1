import { starterImageUrl } from '@/lib/squad-pages/starter-content';
import { sampleImageUrl } from '@/lib/squad-pages/sample-content';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { pagesEnabled, pageStore, localPreview } from '@/lib/squad-pages/store';
import { publicPage } from '@/lib/squad-pages/service';
import { PageError } from '@/lib/squad-pages/model';
import { PublicPageView } from '@/components/squad-pages/public-view';
export const dynamic = 'force-dynamic';
async function load(slug: string) { if (!pagesEnabled()) return notFound(); try { const page = await publicPage(await pageStore(), slug); if (!page) return notFound(); return page; } catch (e) { if (e instanceof PageError && [400, 404].includes(e.status)) return notFound(); throw e; } }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const { slug } = await params; const p = await load(slug); const image = p.content.hero ? starterImageUrl(p.content.hero.id, p.identity) || sampleImageUrl(p.content.hero.id) || `/api/squad-pages/media?slug=${encodeURIComponent(slug)}&id=${p.content.hero.id}` : undefined; return { title: { absolute: p.content.title || p.content.name }, description: p.content.description || undefined, alternates: { canonical: `https://thesquad.pro/p/${slug}` }, openGraph: { title: p.content.title || p.content.name, description: p.content.description || undefined, images: image ? [image] : [] }, robots: { index: true, follow: true } }; }
export default async function PublicPage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const p = await load(slug); return <PublicPageView localReview={localPreview()} content={p.content} context={{ identity: p.identity, forms: p.forms, directory: p.directory }} slug={slug} />; }
