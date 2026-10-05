import type { TournamentGame } from '@/components/providers/team-provider';
import type { TieredPlayoffsConfig } from '@/lib/tiered-playoffs/types';

export type TournamentMatchDetails = { team1Name?: string; team2Name?: string; location: string };
export type TournamentParticipant = { id: string; name: string; [key: string]: unknown };

export function editTournamentMatchDetails(
  games: TournamentGame[], participants: TournamentParticipant[], gameId: string,
  details: TournamentMatchDetails, tieredPlayoffs?: TieredPlayoffsConfig,
) {
  const match = games.find(game => game.id === gameId);
  if (!match) throw new Error('Match not found.');
  const names = new Map<string, string>();
  for (const slot of ['team1', 'team2'] as const) {
    const name = details[`${slot}Name`];
    if (name === undefined) continue;
    const id = match[`${slot}Id`];
    if (!id || ['tbd', 'bye'].includes(id.toLowerCase()) || !participants.some(team => team.id === id)) {
      if (name !== match[slot]) throw new Error('A team must be assigned before its name can be edited.');
      continue;
    }
    names.set(id, name);
  }
  const teams = participants.map(team => ({ ...team, name: names.get(team.id) || team.name }));
  if (new Set(teams.map(team => team.name.trim().toLowerCase())).size !== teams.length) {
    throw new Error('Each tournament team must have a distinct name.');
  }
  const sameLocation = details.location === match.location;
  const knownResource = games.find(game => String(game.location || '').toLowerCase() === details.location.toLowerCase() && game.resourceId)?.resourceId;
  const resourceId = sameLocation ? match.resourceId : knownResource || `custom:${details.location}`;
  const updatedGames = games.map(game => ({
    ...game,
    ...(names.has(game.team1Id || '') ? { team1: names.get(game.team1Id!)! } : {}),
    ...(names.has(game.team2Id || '') ? { team2: names.get(game.team2Id!)! } : {}),
    ...(game.id === gameId ? { location: details.location, ...(resourceId ? { resourceId } : {}) } : {}),
  }));
  const renameSeeds = (seeds: TieredPlayoffsConfig['seeding']['approved']) => seeds.map(seed => ({
    ...seed, teamName: names.get(seed.teamId) || seed.teamName,
  }));
  return {
    games: updatedGames, teams,
    tieredPlayoffs: tieredPlayoffs ? { ...tieredPlayoffs, seeding: {
      ...tieredPlayoffs.seeding,
      calculated: renameSeeds(tieredPlayoffs.seeding.calculated), approved: renameSeeds(tieredPlayoffs.seeding.approved),
    } } : undefined,
  };
}
