export type AppDistribution = 'web' | 'store';

export const APP_DISTRIBUTION: AppDistribution =
  process.env.NEXT_PUBLIC_APP_DISTRIBUTION === 'store' ? 'store' : 'web';

export const isStoreDistribution = APP_DISTRIBUTION === 'store';

export type DistributionAvailability = 'all' | 'web';

export function isDistributionContentAvailable(
  availability: DistributionAvailability = 'all',
  distribution: AppDistribution = APP_DISTRIBUTION,
): boolean {
  return availability === 'all' || distribution === 'web';
}

const STORE_BLOCKED_ROOTS = [
  '/pricing',
  '/checkout',
  '/dashboard/billing',
  '/register/league',
  '/register/tournament',
  '/events/register',
  '/public/donate',
] as const;

const NESTED_RETURN_KEYS = new Set([
  'continue',
  'destination',
  'next',
  'redirect',
  'redirectto',
  'return',
  'returnto',
]);

const FALLBACK_PATH = '/dashboard';
const MAX_RETURN_DEPTH = 4;

function normalizedPathname(candidate: string): string | null {
  const rawPathname = candidate.split(/[?#]/, 1)[0];
  try {
    const decoded = decodeURIComponent(rawPathname);
    const normalized = decoded.length > 1 ? decoded.replace(/\/+$/, '') : decoded;
    return normalized.toLowerCase();
  } catch {
    return null;
  }
}

export function isStoreBlockedPath(pathname: string): boolean {
  const normalized = normalizedPathname(pathname);
  if (!normalized) return true;
  return STORE_BLOCKED_ROOTS.some(
    blocked => normalized === blocked || normalized.startsWith(`${blocked}/`),
  );
}

export function isExternalPurchaseUrl(href: string): boolean {
  if (href.startsWith('/') && !href.startsWith('//')) {
    if (/[\u0000-\u001f\u007f\\]/.test(href)) return true;
    let parsed: URL;
    try {
      parsed = new URL(href, 'https://app.local');
    } catch {
      return true;
    }
    if (parsed.origin !== 'https://app.local') return true;
    return isStoreBlockedPath(parsed.pathname) ||
      (parsed.pathname === '/' && parsed.hash.toLowerCase() === '#pricing');
  }

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return true;
  }

  if (url.protocol === 'mailto:') return url.href.toLowerCase() !== 'mailto:team@thesquad.pro';
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return true;

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  const configuredOrigin = (() => {
    try {
      return process.env.NEXT_PUBLIC_APP_URL
        ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin.toLowerCase()
        : null;
    } catch {
      return null;
    }
  })();
  if (hostname === 'thesquad.pro') return true;
  if (url.origin.toLowerCase() === configuredOrigin) {
    return isStoreBlockedPath(url.pathname) ||
      (url.pathname === '/' && url.hash.toLowerCase() === '#pricing');
  }

  if (hostname === 'pay.stripe.com' && url.pathname.startsWith('/receipts/')) return false;
  if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com') || hostname === 'youtu.be') return false;
  if (hostname === 'youtube-nocookie.com' || hostname.endsWith('.youtube-nocookie.com')) return false;
  if (hostname === 'storage.googleapis.com' || hostname.endsWith('.firebasestorage.app')) return false;
  if (hostname === 'maps.google.com' || (hostname.endsWith('.google.com') && url.pathname.startsWith('/maps'))) return false;

  return true;
}

function safeReturnPathAtDepth(
  candidate: string | null | undefined,
  distribution: AppDistribution,
  depth: number,
): string {
  if (
    typeof candidate !== 'string' ||
    candidate.length === 0 ||
    candidate.length > 4_096 ||
    depth > MAX_RETURN_DEPTH ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    /[\u0000-\u001f\u007f]/.test(candidate) ||
    /%(?![0-9a-f]{2})/i.test(candidate)
  ) {
    return FALLBACK_PATH;
  }

  const rawPathname = candidate.split(/[?#]/, 1)[0];
  if (/%(?:2f|5c)/i.test(rawPathname)) return FALLBACK_PATH;

  let parsed: URL;
  try {
    parsed = new URL(candidate, 'https://app.local');
  } catch {
    return FALLBACK_PATH;
  }
  if (parsed.origin !== 'https://app.local') return FALLBACK_PATH;
  if (distribution === 'store' && isStoreBlockedPath(parsed.pathname)) return FALLBACK_PATH;

  for (const [key, nestedCandidate] of parsed.searchParams) {
    if (!NESTED_RETURN_KEYS.has(key.toLowerCase())) continue;
    if (safeReturnPathAtDepth(nestedCandidate, distribution, depth + 1) !== nestedCandidate) {
      return FALLBACK_PATH;
    }
  }

  return candidate;
}

export function safeReturnPath(
  candidate: string | null | undefined,
  distribution: AppDistribution = APP_DISTRIBUTION,
): string {
  return safeReturnPathAtDepth(candidate, distribution, 0);
}
