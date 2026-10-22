import { APP_DISTRIBUTION, type AppDistribution } from '@/lib/app-distribution';

/** Share the public registration receiver, never the store-only hosted shell. */
export function tournamentRegistrationShareUrl(origin: string, teamId: string, eventId: string, protocolId: string, distribution: AppDistribution = APP_DISTRIBUTION) {
  const host = distribution === 'store' ? 'https://www.thesquad.pro' : origin;
  const url = new URL(`/register/tournament/${encodeURIComponent(teamId)}/${encodeURIComponent(eventId)}`, host);
  url.searchParams.set('protocol', protocolId);
  return url.href;
}
