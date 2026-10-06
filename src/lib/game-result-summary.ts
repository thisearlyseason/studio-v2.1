type GameResult = {
  isCompleted?: boolean; isDisputed?: boolean;
  team1: string; team2: string; team1Id?: string; team2Id?: string;
  score1?: number; score2?: number; winnerId?: string | null;
};
/** Use an adjudicated winner when present, including tied scores settled by a tiebreak. */
export function gameResultSummary(game: GameResult) {
  if (!game.isCompleted) return null;
  if (game.isDisputed) return {label: 'Result under review', winner: null, side: null};
  const a=game.score1, b=game.score2;
  const side = game.winnerId && game.winnerId===game.team1Id ? 1
    : game.winnerId && game.winnerId===game.team2Id ? 2
    : typeof a==='number' && typeof b==='number' && a!==b ? (a>b ? 1 : 2) : null;
  const winner = side===1 ? game.team1 : side===2 ? game.team2 : null;
  return {label: winner ? `Winner: ${winner}` : 'Draw', winner, side};
}
