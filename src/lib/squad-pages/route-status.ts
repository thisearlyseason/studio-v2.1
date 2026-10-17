import { NextResponse } from 'next/server';
import { PageError } from './model';
import { publicPage } from './service';
import { pageStore, type PageStore } from './store';

/** Use the same current publication/coverage checks as the page and public API. */
export async function squadPublicRouteExists(pathname: string, store?: PageStore) {
  const parts = pathname.replace(/\/+$/, '').split('/');
  if (parts.length !== 3 || parts[1] !== 'p' || !parts[2]) return false;
  let slug: string;
  try { slug = decodeURIComponent(parts[2]); } catch { return false; }
  try { return !!await publicPage(store || await pageStore(), slug); }
  catch (error) {
    if (error instanceof PageError && [400, 404].includes(error.status)) return false;
    throw error;
  }
}

/** A complete response prevents a streamed 404 shell from retaining HTTP200. */
export function squadPageNotFoundResponse() {
  return new NextResponse('<!doctype html><html lang="en"><head><meta name="robots" content="noindex,nofollow"><title>404 — Page not found</title></head><body><main><h1>404</h1><p>This page could not be found.</p></main></body></html>', {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}
