import { NextRequest } from 'next/server';
import { pageActor, pageFailure, pageJSON, bodyJSON, entityParameter } from '@/lib/squad-pages/http';
import { pageStore } from '@/lib/squad-pages/store';
import { editorState, mutatePage, slugAvailable } from '@/lib/squad-pages/service';
export async function GET(req: NextRequest) { try { const actor = await pageActor(req); const entity = entityParameter(req); const store = await pageStore(); if (req.nextUrl.searchParams.has('slug')) return pageJSON(await slugAvailable(store, req.nextUrl.searchParams.get('slug')!, entity, actor)); return pageJSON(await editorState(store, entity, actor)); } catch (error) { return pageFailure(error); } }
export async function POST(req: NextRequest) { try { const actor = await pageActor(req); return pageJSON(await mutatePage(await pageStore(), actor, await bodyJSON(req))); } catch (error) { return pageFailure(error); } }
