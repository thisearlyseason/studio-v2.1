import { CompetitionError, type Source, type Topology } from "./types";
export type Path = Record<string, string>;
export type Reachability = Map<string, Path[]>;
export function compatible(a: Path, b: Path): boolean {
  return Object.keys(a).every(
    (key) => b[key] === undefined || b[key] === a[key],
  );
}
export function reachability(topology: Topology): Map<string, Reachability> {
  const matches = new Map(topology.matches.map((m) => [m.id, m]));
  const memo = new Map<string, Reachability>();
  const visiting = new Set<string>();
  function sourcePaths(source: Source): Reachability {
    if (source.kind === "team") return new Map([[source.teamId, [{}]]]);
    if (source.kind === "rank")
      return new Map(
        topology.groups[source.group].map((id) => [
          id,
          [{ [`rank:${source.group}`]: String(source.rank) }],
        ]),
      );
    const paths = visit(source.matchId);
    return new Map(
      [...paths].map(([id, entries]) => [
        id,
        entries.map((path) => ({ ...path, [source.matchId]: source.kind })),
      ]),
    );
  }
  function visit(id: string): Reachability {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id))
      throw new CompetitionError("ADVANCEMENT_CYCLE", "Cyclic advancement.");
    visiting.add(id);
    const match = matches.get(id)!;
    const result: Reachability = new Map();
    match.sources.forEach((source) =>
      sourcePaths(source).forEach((paths, team) =>
        result.set(team, [...(result.get(team) || []), ...paths]),
      ),
    );
    memo.set(id, result);
    visiting.delete(id);
    return result;
  }
  topology.matches.forEach((m) => visit(m.id));
  return memo;
}
export function canShareTeam(
  a: Reachability,
  b: Reachability,
): string | undefined {
  for (const [id, paths] of a)
    if (
      paths.some((path) => b.get(id)?.some((other) => compatible(path, other)))
    )
      return id;
  return undefined;
}
/** Maximum games a team can actually play, excluding mutually exclusive winner/loser paths. */
export function maximumAppearances(groups: Path[][], limit: number): number {
  let visits = 0,
    best = 0;
  function search(index: number, chosen: Path, count: number) {
    if (++visits > 100_000)
      throw new CompetitionError(
        "SEARCH_LIMIT",
        "Daily-limit verification reached its search limit. Split this event across more days.",
      );
    if (count > best) best = count;
    if (
      best > limit ||
      index === groups.length ||
      count + groups.length - index <= best
    )
      return;
    for (const path of groups[index])
      if (compatible(path, chosen))
        search(index + 1, { ...chosen, ...path }, count + 1);
    search(index + 1, chosen, count);
  }
  search(0, {}, 0);
  return best;
}

export function validateParticipantPaths(topology: Topology): void {
  const paths = reachability(topology);
  const source = (s: Source): Reachability =>
    s.kind === "team"
      ? new Map([[s.teamId, [{}]]])
      : s.kind === "rank"
        ? new Map(
            topology.groups[s.group].map((id) => [
              id,
              [{ [`rank:${s.group}`]: String(s.rank) }],
            ]),
          )
        : new Map(
            [...paths.get(s.matchId)!].map(([id, entries]) => [
              id,
              entries.map((p) => ({ ...p, [s.matchId]: s.kind })),
            ]),
          );
  for (const match of topology.matches)
    if (canShareTeam(source(match.sources[0]), source(match.sources[1])))
      throw new CompetitionError(
        "POSSIBLE_SELF_MATCH",
        `${match.label} could assign the same team to both sides. Change its participant sources.`,
      );
}
