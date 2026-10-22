import { notFound } from 'next/navigation';
import { localPreview, pagesEnabled } from '@/lib/squad-pages/store';
import { PageEditor } from '@/components/squad-pages/editor';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Squad Pages · Local review', robots: { index: false, follow: false } };
export default function LocalPages() { if (!pagesEnabled() || !localPreview()) return notFound(); return <PageEditor fictional />; }
