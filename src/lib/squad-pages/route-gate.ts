/** Reject only new page routes before Next can stream a soft404 shell. API handlers retain independent guards. */
export function squadPageRouteUnavailable(pathname: string, hostname: string, env: Record<string, string | undefined> = process.env) {
  const path = pathname.replace(/\/+$/, '');
  const local = path === '/squad-pages';
  if (!local && path !== '/p' && !path.startsWith('/p/') && path !== '/dashboard/public-page') return false;
  if (env.SQUAD_PAGES_ENABLED !== 'true' || env.NEXT_PUBLIC_SQUAD_PAGES_ENABLED !== 'true') return true;
  return local && (env.NODE_ENV === 'production' || !!env.VERCEL || env.SQUAD_PAGES_PREVIEW_FIXTURES !== 'true' || !['localhost', '127.0.0.1'].includes(hostname));
}
