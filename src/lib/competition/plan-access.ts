export const STARTER_TOURNAMENT_FORMAT = "single_elimination";
export const STARTER_TOURNAMENT_LABEL = "Single Elimination Pool";
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
    rules?.format === STARTER_TOURNAMENT_FORMAT &&
    (rules.seriesLength ?? 1) === 1 &&
    Object.values(rules.seriesByRound || {}).every((length) => length === 1)
  );
}
