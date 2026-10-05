import { CompetitionError, type Entrant } from "./types";
export type SwissRecord = {
  round: number;
  team1: string;
  team2: string | null;
  points1: number;
  points2: number;
  final: boolean;
};
export type SwissPairing = { team1: string; team2: string | null };
/** Deterministic bounded minimum score-distance matching, with no repeated opponents or byes. */
export function pairSwissRound(
  teams: Entrant[],
  records: SwissRecord[],
  round: number,
): SwissPairing[] {
  if (
    !Number.isInteger(round) ||
    round < 1 ||
    records.some((r) => !r.final || r.round >= round)
  )
    throw new CompetitionError(
      "SWISS_NOT_READY",
      "Finalize every previous round before pairing the next round.",
    );
  const points = new Map(teams.map((t) => [t.id, 0]));
  const opponents = new Set<string>(),
    byes = new Set<string>();
  const pairKey = (a: string, b: string) => [a, b].sort().join(":");
  for (const record of records) {
    if (
      !points.has(record.team1) ||
      (record.team2 && !points.has(record.team2))
    )
      throw new CompetitionError(
        "SWISS_TEAM",
        "A Swiss result references an unknown team.",
      );
    points.set(record.team1, points.get(record.team1)! + record.points1);
    if (record.team2) {
      points.set(record.team2, points.get(record.team2)! + record.points2);
      opponents.add(pairKey(record.team1, record.team2));
    } else byes.add(record.team1);
  }
  for (let prior = 1; prior < round; prior++) {
    const ids = records
      .filter((r) => r.round === prior)
      .flatMap((r) => (r.team2 ? [r.team1, r.team2] : [r.team1]));
    if (ids.length !== teams.length || new Set(ids).size !== teams.length)
      throw new CompetitionError(
        "SWISS_INCOMPLETE",
        `Round ${prior} does not contain every team exactly once.`,
      );
  }
  const ordered = teams
    .map((t) => t.id)
    .sort(
      (a, b) =>
        points.get(b)! - points.get(a)! ||
        teams.findIndex((t) => t.id === a) - teams.findIndex((t) => t.id === b),
    );
  const byeChoices: (string | null)[] =
    teams.length % 2
      ? [...ordered].reverse().filter((id) => !byes.has(id))
      : [null];
  let attempts = 0;
  for (const bye of byeChoices) {
    let best: SwissPairing[] | null = null,
      bestCost = Infinity;
    function search(ids: string[], pairs: SwissPairing[], cost: number) {
      if (++attempts > 200000)
        throw new CompetitionError(
          "SEARCH_LIMIT",
          "Swiss pairing search reached its limit. No pairings were published.",
        );
      if (cost >= bestCost) return;
      if (!ids.length) {
        best = [...pairs];
        bestCost = cost;
        return;
      }
      const a = ids[0];
      const candidates = ids
        .slice(1)
        .filter((b) => !opponents.has(pairKey(a, b)))
        .sort(
          (b, c) =>
            Math.abs(points.get(a)! - points.get(b)!) -
            Math.abs(points.get(a)! - points.get(c)!),
        );
      for (const b of candidates)
        search(
          ids.filter((id) => id !== a && id !== b),
          [...pairs, { team1: a, team2: b }],
          cost + Math.abs(points.get(a)! - points.get(b)!),
        );
    }
    search(
      ordered.filter((id) => id !== bye),
      [],
      0,
    );
    if (best)
      return [
        ...(best as SwissPairing[]),
        ...(bye ? [{ team1: bye, team2: null }] : []),
      ];
  }
  throw new CompetitionError(
    "SWISS_NO_PAIRING",
    "No complete pairing avoids repeat opponents and repeat byes. Reduce the round count or revise the competition format.",
  );
}
