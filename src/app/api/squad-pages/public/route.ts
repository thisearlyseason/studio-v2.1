import { NextRequest, NextResponse } from 'next/server';
import { assertEnabled, pageFailure } from '@/lib/squad-pages/http';
import { pageStore } from '@/lib/squad-pages/store';
import { publicPage } from '@/lib/squad-pages/service';
import { PageError } from '@/lib/squad-pages/model';
export async function GET(req: NextRequest) { try { assertEnabled(); const data = await publicPage(await pageStore(), req.nextUrl.searchParams.get('slug') || ''); if (!data) throw new PageError('Page not found.', 404); const output = { content: data.content, revision: data.revision, updatedAt: data.updatedAt, directory: data.directory, forms: data.forms, graceUntil: data.graceUntil }; return NextResponse.json(output, { headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }); } catch (error) { return pageFailure(error); } }
