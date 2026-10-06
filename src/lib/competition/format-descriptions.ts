import type { CompetitionFormat } from "./types";
export const FORMAT_DESCRIPTIONS: Record<CompetitionFormat, string> = {
  single_elimination:
    "Win to advance. One loss eliminates a team; the last team wins the championship.",
  double_elimination:
    "Teams stay in until their second loss, using winners and losers brackets. A final reset is played when needed.",
  round_robin:
    "Every team plays every other team once. Standings show wins, losses, draws, and points for and against.",
  double_round_robin:
    "Every team plays every other team twice. Results combine into one standings table.",
  pool_play:
    "Split teams into pools. Each team plays the others in its pool; use the final standings to create playoffs if wanted.",
  pool_play_knockout:
    "Begin with round-robin pools. Once pool games finish, choose the qualifiers and create single-elimination playoffs.",
  pool_double_elimination:
    "Begin with round-robin pools. Once pool games finish, choose the qualifiers and create double-elimination playoffs.",
  tiered_playoffs:
    "Play a preliminary round, then place teams into championship brackets such as Gold, Silver, and Bronze based on their results.",
  consolation:
    "Teams losing in the main bracket continue in a consolation bracket, giving them more games.",
  placement:
    "Teams keep playing placement matches to determine final positions from first through last.",
  swiss:
    "Teams with similar records meet each round. Pairings are reviewed between rounds, with no repeat opponents.",
  best_of_series:
    "Two teams play a best-of-three, five, or seven series. The first team to win a majority wins the series.",
  custom:
    "The organizer defines pools, matches, and which winners, losers, or ranked teams advance to each match.",
};
