import type { TournamentGame } from '@/components/providers/team-provider';
import { tieredStandingsFingerprint } from './seeding';
import type { TieredPlayoffsConfig } from './types';

export function reconcileTieredAfterPreliminaryMutation(
  config: TieredPlayoffsConfig,
  games: TournamentGame[],
): TieredPlayoffsConfig {
  if (config.seeding.status === 'pending') return config;
  const preliminary = games.filter(game => game.phase !== 'playoff');
  const fingerprint = tieredStandingsFingerprint(preliminary, config.standings as unknown as Record<string, unknown>);
  if (fingerprint === config.seeding.standingsFingerprint) return config;
  if (config.seeding.status === 'review') {
    return {
      ...config,
      seeding: {
        status: 'pending', calculated: [], approved: [], standingsFingerprint: null,
        lockedAt: null, lockedBy: null,
      },
    };
  }
  return { ...config, seeding: { ...config.seeding, status: 'stale' } };
}

export function reconcileTieredAfterPlayoffMutation(
  config: TieredPlayoffsConfig,
  games: TournamentGame[],
): TieredPlayoffsConfig {
  if (!['published', 'in_progress'].includes(config.playoffs.status)) return config;
  const playoffs = games.filter(game => game.phase === 'playoff');
  if (!playoffs.length || !playoffs.some(game => game.isCompleted === true)) return config;
  const status = playoffs.every(game => game.isCompleted === true) ? 'complete' : 'in_progress';
  return { ...config, playoffs: { ...config.playoffs, status } };
}
