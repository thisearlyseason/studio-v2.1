import { notFound } from 'next/navigation';
import { pagesEnabled } from '@/lib/squad-pages/store';
import { PageEditor } from '@/components/squad-pages/editor';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Public Page', robots: { index: false, follow: false } };
export default function ManagePublicPage() { if (!pagesEnabled()) return notFound(); return <PageEditor />; }
