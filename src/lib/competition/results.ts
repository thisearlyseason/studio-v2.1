import {
  CompetitionError,
  type Match,
  type Result,
  type Source,
  type Topology,
} from "./types";
export type Standing = {
  teamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  for: number;
  against: number;
  points: number;
};
export type MatchState = {
  matchId: string;
  teamIds: [string | null, string | null];
  wins: [number, number];
  complete: boolean;
  winner: string | null;
  loser: string | null;
  inactive: boolean;
};
export type RankingApproval = Record<string, string[]>;
export function resolveCompetition(
  topology: Topology,
  results: Result[],
  approvals: RankingApproval = {},
) {
  const states = new Map<string, MatchState>();
  const standings: Record<string, Standing[]> = {};
  const visiting = new Set<string>();
  const points = topology.rules.points || { win: 3, draw: 1, loss: 0 };
  function groupTable(group: string): Standing[] {
    if (standings[group]) return standings[group];
    const rows = new Map(
      topology.groups[group].map((teamId) => [
        teamId,
        {
          teamId,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          for: 0,
          against: 0,
          points: 0,
        },
      ]),
    );
    for (const match of topology.matches.filter((m) => m.pool === group)) {
      const state = resolve(match);
      const score = results.find((r) => r.matchId === match.id);
      if (!state.complete || !score || !state.teamIds[0] || !state.teamIds[1])
        continue;
      const a = rows.get(state.teamIds[0])!,
        b = rows.get(state.teamIds[1])!;
      a.played++;
      b.played++;
      a.for += score.score1;
      a.against += score.score2;
      b.for += score.score2;
      b.against += score.score1;
      if (score.score1 === score.score2 && !score.winner) {
        a.drawn++;
        b.drawn++;
        a.points += points.draw;
        b.points += points.draw;
      } else {
        const win = state.winner === a.teamId ? a : b,
          loss = win === a ? b : a;
        win.won++;
        loss.lost++;
        win.points += points.win;
        loss.points += points.loss;
      }
    }
    if (group === "Swiss" && topology.rules.format === "swiss")
      for (let round = 1; round <= (topology.rules.swissRounds || 1); round++) {
        const matches = topology.matches.filter(
          (m) => m.stage === "Swiss" && m.round === round,
        );
        if (
          matches.length &&
          matches.every((m) => states.get(m.id)?.complete)
        ) {
          const played = new Set(
            matches.flatMap((m) => states.get(m.id)!.teamIds),
          );
          for (const row of rows.values())
            if (!played.has(row.teamId)) {
              row.played++;
              row.won++;
              row.points += points.win;
            }
        }
      }
    const all = [...rows.values()];
    all.sort(
      (a, b) =>
        b.points - a.points ||
        b.won - a.won || a.lost - b.lost || b.drawn - a.drawn ||
        b.for - b.against - (a.for - a.against) ||
        b.for - a.for ||
        topology.teams.findIndex((t) => t.id === a.teamId) -
          topology.teams.findIndex((t) => t.id === b.teamId),
    );
    standings[group] = all;
    return all;
  }
  function qualified(source: Extract<Source, { kind: "rank" }>): string | null {
    if (source.group.startsWith("Swiss Round "))
      return approvals[source.group]?.[source.rank - 1] || null;
    const groupMatches = topology.matches.filter(
      (m) => m.pool === source.group,
    );
    if (!groupMatches.length || groupMatches.some((m) => !resolve(m).complete))
      return null;
    const rows = groupTable(source.group);
    const approved = approvals[source.group];
    if (approved) {
      if (
        approved.length !== rows.length ||
        new Set(approved).size !== rows.length ||
        approved.some((id) => !rows.some((row) => row.teamId === id))
      )
        throw new CompetitionError(
          "INVALID_RANKING",
          "Approved standings must contain every pool team exactly once.",
        );
      return approved[source.rank - 1];
    }
    // Qualification is deliberately held for organizer review. Display ordering is not approval.
    return null;
  }
  function resolveSource(source: Source): string | null {
    if (source.kind === "team") return source.teamId;
    if (source.kind === "rank") return qualified(source);
    const feeder = topology.matches.find((m) => m.id === source.matchId)!;
    let state = resolve(feeder);
    if (state.inactive && feeder.resetOf) {
      const prior = resolve(topology.matches.find(match => match.id === feeder.resetOf)!);
      if (prior.complete) state = prior;
    }
    return source.kind === "winner" ? state.winner : state.loser;
  }
  function resolve(match: Match): MatchState {
    if (states.has(match.id)) return states.get(match.id)!;
    if (visiting.has(match.id))
      throw new CompetitionError("ADVANCEMENT_CYCLE", "Cyclic advancement.");
    visiting.add(match.id);
    const teamIds = match.sources.map(resolveSource) as MatchState["teamIds"];
    const scores = results
      .filter((r) => r.matchId === match.id)
      .sort((a, b) => a.game - b.game);
    const wins: [number, number] = [0, 0];
    for (const score of scores) {
      if (score.score1 === score.score2 && !score.winner) continue;
      wins[(score.winner || (score.score1 > score.score2 ? 1 : 2)) - 1]++;
    }
    const needed = Math.floor(match.bestOf / 2) + 1;
    let inactive = false;
    if (match.resetOf) {
      const final = states.get(match.resetOf)!;
      inactive = !final?.complete || final.winner !== final.teamIds[1];
    }
    const complete =
      !inactive &&
      (wins.some((w) => w >= needed) || (!!match.pool && scores.length === 1));
    const winningSide = wins[0] >= needed ? 0 : wins[1] >= needed ? 1 : null;
    const state = {
      matchId: match.id,
      teamIds,
      wins,
      complete,
      winner: complete && winningSide !== null ? teamIds[winningSide] : null,
      loser: complete && winningSide !== null ? teamIds[1 - winningSide] : null,
      inactive,
    };
    states.set(match.id, state);
    visiting.delete(match.id);
    return state;
  }
  topology.matches.forEach(resolve);
  Object.keys(topology.groups).forEach(groupTable);
  const placements = Object.fromEntries(
    Object.entries(topology.placements || {}).map(([rank, source]) => [
      rank,
      resolveSource(source),
    ]),
  );
  return { states, standings, placements };
}
export function recordCompetitionResult(
  topology: Topology,
  results: Result[],
  score: Result,
  approvals: RankingApproval = {},
): Result[] {
  const match = topology.matches.find((m) => m.id === score.matchId);
  if (
    !match ||
    !Number.isInteger(score.game) ||
    score.game < 1 ||
    score.game > match.bestOf
  )
    throw new CompetitionError("UNKNOWN_GAME", "Unknown series game.");
  if (
    ![score.score1, score.score2].every(
      (n) => Number.isSafeInteger(n) && n >= 0 && n <= 100000,
    ) ||
    (score.winner !== undefined && score.winner !== 1 && score.winner !== 2)
  )
    throw new CompetitionError(
      "INVALID_SCORE",
      "Scores must be nonnegative whole numbers.",
    );
  if (
    score.winner &&
    score.score1 !== score.score2 &&
    score.winner !== (score.score1 > score.score2 ? 1 : 2)
  )
    throw new CompetitionError(
      "INVALID_WINNER",
      "The selected winner contradicts the score.",
    );
  if (!match.pool && score.score1 === score.score2 && !score.winner)
    throw new CompetitionError(
      "ELIMINATION_TIE",
      "Select the tiebreak winner before finalizing an elimination game.",
    );
  const filtered = results.filter(
    (r) => !(r.matchId === score.matchId && r.game === score.game),
  );
  if (results.some((r) => r.matchId === score.matchId && r.game > score.game))
    throw new CompetitionError(
      "DOWNSTREAM_STARTED",
      "Later series games already have results. Resolve them before correcting this game.",
    );
  const state = resolveCompetition(topology, filtered, approvals).states.get(
    match.id,
  )!;
  if (state.inactive || state.complete || state.teamIds.some((id) => !id))
    throw new CompetitionError(
      "MATCH_UNAVAILABLE",
      "This match is unresolved, inactive, or already decided.",
    );
  if (
    score.game > 1 &&
    !filtered.some(
      (r) => r.matchId === score.matchId && r.game === score.game - 1,
    )
  )
    throw new CompetitionError(
      "SERIES_ORDER",
      "Record the preceding series game first.",
    );
  const dependent = new Set<string>([score.matchId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of topology.matches)
      if (
        !dependent.has(m.id) &&
        (m.dependsOn?.some((id) => dependent.has(id)) ||
          m.sources.some(
            (s) =>
              (s.kind === "winner" || s.kind === "loser") &&
              dependent.has(s.matchId),
          ))
      ) {
        dependent.add(m.id);
        changed = true;
      }
  }
  if (
    results.some(
      (r) => r.matchId !== score.matchId && dependent.has(r.matchId),
    ) ||
    (match.pool && approvals[match.pool])
  )
    throw new CompetitionError(
      "DOWNSTREAM_STARTED",
      "Results are locked by downstream play or approved pool seeding.",
    );
  return [...filtered, score];
}
