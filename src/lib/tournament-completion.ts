/** Conditional games do not keep a decided series or unused reset unfinished. */
export function tournamentCompletion(games: readonly {isCompleted?: boolean; isConditional?: boolean}[]): number {
  const required = games.filter(game => !game.isConditional);
  return required.length ? Math.round(required.filter(game => game.isCompleted).length / required.length * 100) : 0;
}
