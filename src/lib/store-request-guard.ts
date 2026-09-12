import { isStoreDistribution } from '@/lib/app-distribution';

export function storePurchaseResponse(): Response | null {
  if (!isStoreDistribution) return null;
  return new Response(null, {
    status: 403,
    headers: { 'Cache-Control': 'no-store' },
  });
}
