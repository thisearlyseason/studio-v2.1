import { createCompetition, type CompetitionDocument } from "./document";
/** Keep the format blueprint, replacing entrants with fresh unregistered slots. */
export function replicateCompetition(
  source: CompetitionDocument,
  title: string,
  identity: string,
) {
  const ids = new Map(
    source.topology.teams.map((team, index) => [
      team.id,
      `entrant_${identity}_${index}`,
    ]),
  );
  const rules = structuredClone(source.topology.rules);
  if (rules.customPools)
    rules.customPools = rules.customPools.map((pool) => ({
      ...pool,
      teamIds: pool.teamIds.map((id) => ids.get(id)!),
    }));
  if (rules.customMatches)
    rules.customMatches = rules.customMatches.map((match) => ({
      ...match,
      sources: match.sources.map((slot) =>
        slot.kind === "team"
          ? { ...slot, teamId: ids.get(slot.teamId)! }
          : slot,
      ) as typeof match.sources,
    }));
  return createCompetition({
    title,
    teams: source.topology.teams.map((team, index) => ({
      id: ids.get(team.id)!,
      name: `Team ${index + 1}`,
    })),
    rules,
    options: structuredClone(source.options),
  });
}
