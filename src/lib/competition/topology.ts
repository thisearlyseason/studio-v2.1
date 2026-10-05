import { validateParticipantPaths } from "./reachability";
import {
  CompetitionError,
  sourceKey,
  type CompetitionRules,
  type Entrant,
  type Match,
  type Source,
  type Topology,
} from "./types";

const team = (teamId: string): Source => ({ kind: "team", teamId });
const winner = (matchId: string): Source => ({ kind: "winner", matchId });
const loser = (matchId: string): Source => ({ kind: "loser", matchId });
function seeded(size: number): number[] {
  let order = [1, 2];
  for (let n = 4; n <= size; n *= 2)
    order = order.flatMap((seed) => [seed, n + 1 - seed]);
  return order;
}
export function buildTopology(
  teams: Entrant[],
  rules: CompetitionRules,
): Topology {
  if (
    teams.length < 2 ||
    teams.length > 64 ||
    new Set(teams.map((t) => t.id)).size !== teams.length ||
    teams.some((t) => !t.id || ["tbd", "bye"].includes(t.id))
  )
    throw new CompetitionError(
      "INVALID_TEAMS",
      "Choose 2–64 teams with distinct identities.",
    );
  try {
    new Intl.DateTimeFormat("en", { timeZone: rules.timezone }).format();
  } catch {
    throw new CompetitionError(
      "INVALID_TIMEZONE",
      "Choose a valid tournament timezone.",
    );
  }
  const matches: Match[] = [];
  const groups: Record<string, string[]> = {};
  const placements: Record<number, Source> = {};
  function add(
    a: Source | null,
    b: Source | null,
    stage: string,
    round: number,
    placement?: [number, number],
  ): { win: Source | null; loss: Source | null } {
    if (!a || !b) return { win: a || b, loss: null };
    const id = `c2_${matches.length + 1}`;
    const bestOf =
      rules.seriesByRound?.[`${stage}:${round}`] ?? rules.seriesLength ?? 1;
    matches.push({
      id,
      stage,
      round,
      label: `${stage} · Round ${round}`,
      sources: [a, b],
      bestOf,
      ...(placement ? { placement } : {}),
    });
    return { win: winner(id), loss: loser(id) };
  }
  function elimination(
    sources: Source[],
    mode: "single" | "double" | "consolation",
    prefix = "",
  ) {
    const capacity = 2 ** Math.ceil(Math.log2(sources.length));
    let layer: (Source | null)[] = seeded(capacity).map(
      (seed) => sources[seed - 1] || null,
    );
    const drops: (Source | null)[][] = [];
    let round = 1;
    const wb = `${prefix}${mode === "single" ? "Championship" : "Winners"}`;
    while (layer.length > 1) {
      const next: (Source | null)[] = [],
        lost: (Source | null)[] = [];
      for (let i = 0; i < layer.length; i += 2) {
        const result = add(layer[i], layer[i + 1], wb, round);
        next.push(result.win);
        lost.push(result.loss);
      }
      drops.push(lost);
      layer = next;
      round++;
    }
    if (mode === "single") return;
    const stage = `${prefix}${mode === "consolation" ? "Consolation" : "Losers"}`;
    let survivors = drops[0],
      lbRound = 1;
    // Collapse empty BYE paths, without introducing fictitious losses or games.
    for (let r = 1; r < drops.length; r++) {
      const reduced: (Source | null)[] = [];
      for (let i = 0; i < survivors.length; i += 2)
        reduced.push(
          add(survivors[i], survivors[i + 1] || null, stage, lbRound).win,
        );
      lbRound++;
      survivors = reduced.map(
        (entry, i) =>
          add(entry, drops[r][drops[r].length - 1 - i], stage, lbRound).win,
      );
      lbRound++;
    }
    const lbChampion = survivors[0];
    if (mode === "double" && layer[0] && lbChampion) {
      const final = add(layer[0], lbChampion, `${prefix}Final`, 1);
      if (final.win?.kind === "winner" && final.loss) {
        add(final.win, final.loss, `${prefix}Final`, 2);
        matches[matches.length - 1].resetOf = final.win.matchId;
        matches[matches.length - 1].label = "Championship reset (if needed)";
      }
    }
  }
  function roundRobin(ids: string[], group: string, cycles = 1) {
    groups[group] = ids;
    const ring: (string | null)[] = [...ids, ...(ids.length % 2 ? [null] : [])];
    for (let cycle = 0; cycle < cycles; cycle++) {
      for (let r = 0; r < ring.length - 1; r++) {
        for (let i = 0; i < ring.length / 2; i++) {
          const a = ring[i],
            b = ring[ring.length - 1 - i];
          if (!a || !b) continue;
          const reverse = (r + i + cycle) % 2 === 1;
          const result = add(
            team(reverse ? b : a),
            team(reverse ? a : b),
            group,
            cycle * (ring.length - 1) + r + 1,
          );
          const match = matches.find(
            (m) => result.win?.kind === "winner" && m.id === result.win.matchId,
          )!;
          match.bestOf = 1;
          match.pool = group;
        }
        ring.splice(1, 0, ring.pop()!);
      }
    }
  }
  function classify(entries: Source[], start: number, depth = 1) {
    if (entries.length === 1) {
      placements[start] = entries[0];
      return;
    }
    if (!entries.length) return;
    const wins: Source[] = [],
      losses: Source[] = [];
    for (let i = 0; i < entries.length; i += 2) {
      const result = add(
        entries[i],
        entries[i + 1] || null,
        `Places ${start}–${start + entries.length - 1}`,
        depth,
        entries.length === 2 ? [start, start + 1] : undefined,
      );
      if (result.win) wins.push(result.win);
      if (result.loss) losses.push(result.loss);
    }
    classify(wins, start, depth + 1);
    classify(losses, start + wins.length, depth + 1);
  }
  const sources = teams.map((t) => team(t.id));
  switch (rules.format) {
    case "round_robin":
      roundRobin(
        teams.map((t) => t.id),
        "Standings",
      );
      break;
    case "double_round_robin":
      roundRobin(
        teams.map((t) => t.id),
        "Standings",
        2,
      );
      break;
    case "single_elimination":
      elimination(sources, "single");
      break;
    case "double_elimination":
      elimination(sources, "double");
      break;
    case "consolation":
      elimination(sources, "consolation");
      break;
    case "placement":
      classify(sources, 1);
      break;
    case "best_of_series":
      if (teams.length !== 2)
        throw new CompetitionError(
          "SERIES_TEAMS",
          "A standalone series requires exactly two teams. Choose an elimination format for more teams.",
        );
      add(sources[0], sources[1], "Series", 1);
      break;
    case "pool_play":
    case "pool_play_knockout":
    case "pool_double_elimination": {
      const count = rules.poolCount ?? 2,
        advance = rules.advancePerPool ?? 2;
      if (
        !Number.isInteger(count) ||
        count < 2 ||
        count > Math.floor(teams.length / 2)
      )
        throw new CompetitionError(
          "POOL_COUNT",
          "Every pool needs at least two teams.",
        );
      if (
        !Number.isInteger(advance) ||
        advance < 1 ||
        advance > Math.floor(teams.length / count)
      )
        throw new CompetitionError(
          "POOL_ADVANCEMENT",
          "Advancement cannot exceed the smallest pool.",
        );
      const pools: string[][] = Array.from({ length: count }, () => []);
      teams.forEach((t, i) =>
        pools[
          Math.floor(i / count) % 2 ? count - 1 - (i % count) : i % count
        ].push(t.id),
      );
      pools.forEach((ids, i) =>
        roundRobin(ids, `Pool ${String.fromCharCode(65 + i)}`),
      );
      if (rules.format !== "pool_play") {
        const qualifiers: Source[] = [];
        for (let rank = 1; rank <= advance; rank++)
          for (let i = 0; i < count; i++)
            qualifiers.push({
              kind: "rank",
              group: `Pool ${String.fromCharCode(65 + i)}`,
              rank,
            });
        elimination(
          qualifiers,
          rules.format === "pool_double_elimination" ? "double" : "single",
          "Playoff ",
        );
      }
      break;
    }
    case "custom":
      for (const pool of rules.customPools || []) {
        if (
          groups[pool.name] ||
          pool.teamIds.length < 2 ||
          new Set(pool.teamIds).size !== pool.teamIds.length ||
          pool.teamIds.some((id) => !teams.some((t) => t.id === id))
        )
          throw new CompetitionError(
            "CUSTOM_POOL",
            "Custom pools require distinct names and at least two valid unique teams.",
          );
        roundRobin(pool.teamIds, pool.name, pool.cycles);
      }
      matches.push(
        ...(rules.customMatches || []).map((m) => ({
          ...m,
          label: m.label || `${m.stage} · Round ${m.round}`,
          bestOf:
            m.bestOf ||
            rules.seriesByRound?.[`${m.stage}:${m.round}`] ||
            rules.seriesLength ||
            1,
        })),
      );
      if (!matches.length)
        throw new CompetitionError(
          "CUSTOM_EMPTY",
          "Add matches and participant sources to the custom bracket.",
        );
      break;
    case "swiss":
      if (
        !Number.isInteger(rules.swissRounds) ||
        rules.swissRounds! < 1 ||
        rules.swissRounds! > teams.length - (teams.length % 2 ? 0 : 1)
      )
        throw new CompetitionError(
          "SWISS_ROUNDS",
          "Swiss rounds must fit the available unique opponents.",
        );
      // Future rounds are paired only after the previous round is final.
      groups.Swiss = teams.map((t) => t.id);
      for (let i = 0; i + 1 < teams.length; i += 2) {
        add(sources[i], sources[i + 1], "Swiss", 1);
        matches[matches.length - 1].bestOf = 1;
        matches[matches.length - 1].pool = "Swiss";
      }
      for (let r = 2; r <= rules.swissRounds!; r++) {
        const group = `Swiss Round ${r}`;
        groups[group] = teams.map((t) => t.id);
        const previous = matches
          .filter((m) => m.stage === "Swiss" && m.round === r - 1)
          .map((m) => m.id);
        for (let i = 0; i + 1 < teams.length; i += 2) {
          add(
            { kind: "rank", group, rank: i + 1 },
            { kind: "rank", group, rank: i + 2 },
            "Swiss",
            r,
          );
          Object.assign(matches[matches.length - 1], {
            bestOf: 1,
            pool: "Swiss",
            dependsOn: previous,
          });
        }
      }
      break;
    case "tiered_playoffs": {
      roundRobin(
        teams.map((t) => t.id),
        "Preliminary",
      );
      const tiers = rules.tiers || [{ name: "Gold", size: teams.length }];
      if (
        !tiers.length ||
        tiers.reduce((sum, t) => sum + t.size, 0) !== teams.length ||
        tiers.some(
          (t) => !t.name.trim() || !Number.isInteger(t.size) || t.size < 2,
        ) ||
        new Set(tiers.map((t) => t.name.trim().toLowerCase())).size !==
          tiers.length
      )
        throw new CompetitionError(
          "TIER_SIZES",
          "Every team must be assigned to exactly one named division of at least two teams.",
        );
      let offset = 0;
      for (const tier of tiers) {
        const qualifiers: Source[] = Array.from(
          { length: tier.size },
          (_, i) => ({
            kind: "rank",
            group: "Preliminary",
            rank: offset + i + 1,
          }),
        );
        elimination(qualifiers, "single", `${tier.name} `);
        offset += tier.size;
      }
      break;
    }
    default:
      throw new CompetitionError(
        "INVALID_FORMAT",
        "Unknown tournament format.",
      );
  }
  const topology: Topology = {
    version: 2,
    teams,
    rules,
    groups,
    matches,
    placements,
  };
  validateTopology(topology);
  return topology;
}

export function validateTopology(topology: Topology): void {
  const ids = new Set(topology.matches.map((m) => m.id));
  const teams = new Set(topology.teams.map((t) => t.id));
  if (ids.size !== topology.matches.length || topology.matches.length > 1000)
    throw new CompetitionError(
      "MATCH_IDENTITIES",
      "Match IDs must be unique; at most 1,000 matches are supported.",
    );
  const used = new Set<string>();
  const byId = new Map(topology.matches.map((m) => [m.id, m]));
  const visiting = new Set<string>(),
    done = new Set<string>();
  function visit(match: Match) {
    if (visiting.has(match.id))
      throw new CompetitionError(
        "ADVANCEMENT_CYCLE",
        "Advancement paths must not contain a cycle.",
      );
    if (done.has(match.id)) return;
    visiting.add(match.id);
    if (
      ![1, 3, 5, 7].includes(match.bestOf) ||
      !Number.isInteger(match.round) ||
      match.round < 1
    )
      throw new CompetitionError(
        "INVALID_ROUND",
        "Choose a valid round and best-of-1, 3, 5, or 7.",
      );
    if (sourceKey(match.sources[0]) === sourceKey(match.sources[1]))
      throw new CompetitionError(
        "SELF_MATCH",
        "A match cannot contain the same participant source twice.",
      );
    for (const source of match.sources) {
      if (source.kind === "team") {
        if (!teams.has(source.teamId))
          throw new CompetitionError(
            "UNKNOWN_TEAM",
            "A match references an unknown team.",
          );
      } else if (source.kind === "rank") {
        if (
          !topology.groups[source.group] ||
          !Number.isInteger(source.rank) ||
          source.rank < 1 ||
          source.rank > topology.groups[source.group].length
        )
          throw new CompetitionError(
            "INVALID_QUALIFIER",
            "A qualification position is invalid.",
          );
      } else {
        const feeder = byId.get(source.matchId);
        if (!feeder)
          throw new CompetitionError(
            "UNKNOWN_FEEDER",
            "An advancement source does not exist.",
          );
        visit(feeder);
      }
      if (source.kind !== "team" && !match.resetOf) {
        const key = sourceKey(source);
        if (used.has(key))
          throw new CompetitionError(
            "DUPLICATE_ADVANCEMENT",
            "An advancement result cannot enter multiple matches.",
          );
        used.add(key);
      }
    }
    visiting.delete(match.id);
    done.add(match.id);
  }
  topology.matches.forEach(visit);
  validateParticipantPaths(topology);
}
