/** Versioned tournament model. Legacy tournaments do not opt in implicitly. */
export const COMPETITION_FORMATS = [
  ["single_elimination", "Single Elimination"],
  ["double_elimination", "Double Elimination"],
  ["round_robin", "Round Robin"],
  ["double_round_robin", "Double Round Robin"],
  ["pool_play", "Pool Play"],
  ["pool_play_knockout", "Pool → Single Elimination"],
  ["pool_double_elimination", "Pool → Double Elimination"],
  ["tiered_playoffs", "Gold / Silver / Bronze"],
  ["consolation", "Consolation"],
  ["placement", "Placement"],
  ["swiss", "Swiss"],
  ["best_of_series", "Best-of-X Series"],
  ["custom", "Custom"],
] as const;
export type CompetitionFormat = (typeof COMPETITION_FORMATS)[number][0];
export type Entrant = { id: string; name: string; logoUrl?: string };
export type Source =
  | { kind: "team"; teamId: string }
  | { kind: "winner" | "loser"; matchId: string }
  | { kind: "rank"; group: string; rank: number };
export type SeriesLength = 1 | 3 | 5 | 7;
export type Match = {
  id: string;
  stage: string;
  round: number;
  label: string;
  sources: [Source, Source];
  bestOf: SeriesLength;
  pool?: string;
  placement?: [number, number];
  resetOf?: string;
  dependsOn?: string[];
};
export type CustomMatch = Omit<Match, "label" | "bestOf"> & {
  label?: string;
  bestOf?: SeriesLength;
};
export type CompetitionRules = {
  version: 2;
  format: CompetitionFormat;
  timezone: string;
  poolCount?: number;
  advancePerPool?: number;
  seriesLength?: SeriesLength;
  seriesByRound?: Record<string, SeriesLength>;
  customPools?: { name: string; teamIds: string[]; cycles: 1 | 2 }[];
  tiers?: { name: string; size: number }[];
  swissRounds?: number;
  customMatches?: CustomMatch[];
  points?: { win: number; draw: number; loss: number };
};
export type Topology = {
  version: 2;
  matches: Match[];
  groups: Record<string, string[]>;
  teams: Entrant[];
  rules: CompetitionRules;
  placements?: Record<number, Source>;
};
export type Result = {
  matchId: string;
  game: number;
  score1: number;
  score2: number;
  winner?: 1 | 2;
};
export type Conflict = {
  code: string;
  message: string;
  matchIds?: string[];
  resourceId?: string;
  teamId?: string;
};
export class CompetitionError extends Error {
  constructor(
    public code: string,
    message: string,
    public conflicts: Conflict[] = [],
  ) {
    super(message);
    this.name = "CompetitionError";
  }
}
export const sourceKey = (source: Source) =>
  source.kind === "team"
    ? `team:${source.teamId}`
    : source.kind === "rank"
      ? `rank:${source.group}:${source.rank}`
      : `${source.kind}:${source.matchId}`;
export const isCompetitionFormat = (
  value: unknown,
): value is CompetitionFormat =>
  COMPETITION_FORMATS.some(([id]) => id === value);
