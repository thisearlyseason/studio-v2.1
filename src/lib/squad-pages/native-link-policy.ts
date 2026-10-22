import { APP_DISTRIBUTION, isExternalPurchaseUrl, type AppDistribution } from '@/lib/app-distribution';

/** Reuse the app's existing store link boundary for published content and previews. */
export function pageLinkHref(url: string, distribution: AppDistribution = APP_DISTRIBUTION): string | undefined {
  if (distribution !== 'store' || url.startsWith('#')) return url;
  return isExternalPurchaseUrl(url) ? undefined : url;
}
