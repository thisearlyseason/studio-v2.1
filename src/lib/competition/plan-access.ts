export const STARTER_TOURNAMENT_FORMAT = "single_elimination";
export const STARTER_TOURNAMENT_LABEL = "Single or Double Elimination";
export const STARTER_TOURNAMENT_FORMATS = ["single_elimination", "double_elimination"] as const;
export function starterTournamentFormatAllowed(format: string | undefined): boolean {
  return STARTER_TOURNAMENT_FORMATS.some(value => value === format);
}
export function starterTournamentAllowed(
  rules:
    | {
        format?: string;
        seriesLength?: number;
        seriesByRound?: Record<string, number>;
      }
    | undefined,
): boolean {
  return (
    starterTournamentFormatAllowed(rules?.format) &&
    (rules?.seriesLength ?? 1) === 1 &&
    Object.values(rules?.seriesByRound || {}).every((length) => length === 1)
  );
}
