import { NextRequest, NextResponse } from 'next/server';
import { localPreview, pagesEnabled } from './store';
import { MediaInputError } from '@/lib/media-policy';
import { RequestBodyError } from '@/lib/bounded-json';
import { PageError } from './model';
import type { Actor } from './authority';
export function assertEnabled() { if (!pagesEnabled()) throw new PageError('Not found.', 404); }
export function fixtureRequest(req: NextRequest) { return localPreview() && ['localhost', '127.0.0.1'].includes(new URL(req.url).hostname); }
export async function pageActor(req: NextRequest): Promise<Actor> {
  assertEnabled();
  if (localPreview()) { if (!fixtureRequest(req)) throw new PageError('Local preview is loopback only.', 403); const { previewActors } = await import('./fixtures'); const uid = req.headers.get('x-squad-preview-actor'); if (!previewActors.some(a => a.uid === uid)) throw new PageError('Select a fictional preview role.', 401); return { uid: uid! }; }
  const { verifyFirebaseToken, assertNonAnonymous } = await import('@/lib/api-auth'); const actor = await verifyFirebaseToken(req); if (actor instanceof NextResponse) throw new PageError('Sign in to manage pages.', actor.status); const denied = assertNonAnonymous(actor); if (denied) throw new PageError('A registered account is required.', 403);
  const { enforceUserRateLimit } = await import('@/lib/server-request-guards'); const limited = await enforceUserRateLimit(actor.uid, 'squad-pages', 600, 600000); if (limited) throw new PageError('Too many page requests. Try again later.', 429); return actor;
}
export const pageJSON = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' } });
export function pageFailure(error: unknown, operation = 'request') { if (error instanceof PageError || error instanceof MediaInputError || error instanceof RequestBodyError) return pageJSON({ error: error.message }, error.status); const rawCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''; const code = /^[a-zA-Z0-9_-]{1,64}$/.test(rawCode) ? rawCode : 'unknown'; console.error('[Squad Pages] Request failed.', { operation, code }); return pageJSON({ error: 'Squad Pages is temporarily unavailable.' }, 500); }
export async function bodyJSON(req: NextRequest) { const { readJsonBodyWithLimit } = await import('@/lib/server-request-guards'); return readJsonBodyWithLimit<Record<string, unknown>>(req, 150 * 1024); }

export function entityParameter(req: NextRequest): unknown { try { return JSON.parse(req.nextUrl.searchParams.get('entity') || 'null'); } catch { throw new PageError('Select a valid entity.'); } }
