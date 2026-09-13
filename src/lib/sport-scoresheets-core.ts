import type { SportScoresheet, ScoresheetTable } from './sport-scoresheets';

const matchFields = ['Competition / division', 'Date / start time', 'Venue', 'Match number / round', 'Team A', 'Team B', 'Playing format', 'Scorer / officials'];
const resultFields = ['Final result / winner', 'Scorer / official signature', 'Team A representative', 'Team B representative'];
const players = ['Side A — player 1', 'Side A — player 2 (doubles)', 'Side B — player 1', 'Side B — player 2 (doubles)'];
const numbered = (count: number) => Array.from({ length: count }, (_, i) => String(i + 1));
const segmentScores = (labels: string[]): ScoresheetTable => ({ title: 'Score by segment', columns: ['Segment', 'Team A', 'Team B'], rows: labels.length, rowLabels: labels });

export const CORE_SPORT_SCORESHEETS: SportScoresheet[] = [
  {
    slug: 'soccer-scoresheet', sportSlug: 'soccer', title: 'Soccer Scoresheet',
    description: 'Record half-time scores, goals, substitutions, cards, and shootout attempts on a printable soccer match sheet.',
    instructions: 'Enter the match format and period lengths. Record shootout attempts separately from match goals. Print another log page for additional events.',
    fields: matchFields,
    pages: [
      { title: 'Match summary and goals', tables: [
        segmentScores(['First half', 'Second half', 'Extra time', 'Final']),
        { title: 'Goal log', columns: ['Minute', 'Team', 'Scorer #', 'Assist #', 'Score A–B'], rows: 14 },
      ], fields: resultFields },
      { title: 'Substitutions, cards, and shootout', tables: [
        { title: 'Substitutions', columns: ['Minute', 'Team', 'Player out #', 'Player in #'], rows: 10 },
        { title: 'Cards and incidents', columns: ['Minute', 'Team / player #', 'Yellow / red', 'Reason / notes'], rows: 10 },
        { title: 'Shootout attempts', columns: ['Round', 'A taker #', 'A outcome', 'B taker #', 'B outcome'], rows: 8 },
      ] },
    ],
  },
  {
    slug: 'basketball-scoresheet', sportSlug: 'basketball', title: 'Basketball Scoresheet',
    description: 'Print a basketball game record with period totals, player scoring, fouls, and team timeouts.',
    instructions: 'Label halves or quarters for your event. Record made free throws, two-pointers, and three-pointers in the player table. Use extra copies for larger rosters or overtime.',
    fields: matchFields,
    pages: [
      { title: 'Game score and scoring log', tables: [
        segmentScores(['1 — ___', '2 — ___', '3 — ___', '4 — ___', 'Overtime', 'Final']),
        { title: 'Running score log', columns: ['Period / time', 'Team', 'Player #', 'Points added', 'Score A–B'], rows: 16 },
      ], fields: resultFields },
      { title: 'Player scoring, fouls, and timeouts', tables: [
        { title: 'Player totals', columns: ['Team', 'Player / #', 'FT made', '2PT made', '3PT made', 'Points', 'Fouls'], rows: 20 },
        { title: 'Team fouls and timeouts', columns: ['Period', 'Team', 'Team fouls', 'Timeout time', 'Notes'], rows: 8 },
      ] },
    ],
  },
  {
    slug: 'baseball-scoresheet', sportSlug: 'baseball', title: 'Baseball Scoresheet',
    description: 'Keep baseball inning scores, batting totals, pitching records, and substitutions on a printable game sheet.',
    instructions: 'Print one copy per team for batting and pitching records. Enter the extra-inning number in the extra row and use another copy when needed.',
    fields: ['Competition / division', 'Date / start time', 'Diamond / game number', 'Playing format', 'Visiting team', 'Home team', 'Team recorded on this copy', 'Scorer / umpire'],
    pages: [
      { title: 'Innings and batting totals', tables: [
        { title: 'Inning scores', columns: ['Inning', 'Visitor runs', 'Home runs'], rows: 10, rowLabels: [...numbered(9), 'Extra ___'] },
        { title: 'Batting order and totals', columns: ['Order', 'Player / #', 'Pos.', 'AB', 'R', 'H', 'RBI', 'BB', 'SO'], rows: 10, note: 'AB: at bats · R: runs · H: hits · RBI: runs batted in · BB: walks · SO: strikeouts.' },
      ], fields: ['Final score — visitor / home', 'Hits — visitor / home', 'Errors — visitor / home', 'Scorer / umpire signature'] },
      { title: 'Pitching, substitutions, and notes', tables: [
        { title: 'Pitching record', columns: ['Pitcher / #', 'IP', 'H', 'R', 'ER', 'BB', 'SO', 'Pitches'], rows: 6, note: 'IP: innings pitched · ER: earned runs. Note partial innings using your scoring convention.' },
        { title: 'Substitution log', columns: ['Inning', 'Player out #', 'Player in #', 'Batting slot', 'Position'], rows: 12 },
        { title: 'Game notes', columns: ['Inning / time', 'Play / ruling / delay'], rows: 8 },
      ] },
    ],
  },
  {
    slug: 'rugby-scoresheet', sportSlug: 'rugby', title: 'Rugby Scoresheet',
    description: 'Record rugby scores, scoring types, replacements, and disciplinary events with a printable match record.',
    instructions: 'Specify union, league, sevens, or your event format and its point values. Enter actual points awarded for each scoring event; leave unused categories blank.',
    fields: ['Competition / division', 'Date / venue', 'Team A', 'Team B', 'Code / playing format', 'Point values used', 'Match number / period length', 'Scorer / referee'],
    pages: [
      { title: 'Match summary and scoring', tables: [
        segmentScores(['First half', 'Second half', 'Extra time', 'Final']),
        { title: 'Scoring log', columns: ['Minute', 'Team / player #', 'Try / conversion / penalty / drop / other', 'Points', 'Score A–B'], rows: 18 },
      ], fields: resultFields },
      { title: 'Replacements and disciplinary log', tables: [
        { title: 'Replacements / interchanges', columns: ['Time', 'Team', 'Player out #', 'Player in #', 'Reason / return'], rows: 14 },
        { title: 'Cards and suspensions', columns: ['Time', 'Team / player #', 'Sanction', 'Off / return time', 'Notes'], rows: 10 },
        { title: 'Match notes', columns: ['Time', 'Incident / decision'], rows: 6 },
      ] },
    ],
  },
  {
    slug: 'football-scoresheet', sportSlug: 'football', title: 'Football Scoresheet',
    description: 'Track football quarter scores, scoring plays, possessions, and penalties on a printable game sheet.',
    instructions: 'Record your competition format, including any flag or tackle variation. Enter the points actually awarded for touchdowns, conversion attempts, field goals, safeties, or other scores.',
    fields: matchFields,
    pages: [
      { title: 'Game summary and scoring plays', tables: [
        segmentScores(['Quarter 1', 'Quarter 2', 'Quarter 3', 'Quarter 4', 'Overtime', 'Final']),
        { title: 'Scoring plays', columns: ['Quarter / time', 'Team / player #', 'Play / scoring type', 'Points', 'Score A–B'], rows: 16 },
      ], fields: resultFields },
      { title: 'Possessions, penalties, and timeouts', tables: [
        { title: 'Possession log', columns: ['Quarter / time', 'Team', 'Start spot', 'Plays / yards', 'Result'], rows: 14 },
        { title: 'Penalties', columns: ['Quarter / time', 'Team / player #', 'Infraction', 'Yards / outcome'], rows: 10 },
        { title: 'Timeouts', columns: ['Quarter / time', 'Team', 'Notes'], rows: 6 },
      ] },
    ],
  },
  {
    slug: 'cornhole-scoresheet', sportSlug: 'cornhole', title: 'Cornhole Scoresheet',
    description: 'Print a cornhole game record for bags on the board, bags in the hole, round points, and running totals.',
    instructions: 'Enter the scoring method, target, and win condition used by your event. Record each side’s raw points, then points awarded after cancellation if applicable.',
    fields: ['Competition / division', 'Date / board number', 'Side A players', 'Side B players', 'Match / game number', 'Target / win condition', 'Scoring / cancellation method', 'Scorer / official'],
    pages: [
      { title: 'Round scoring', tables: [
        { title: 'Rounds 1–20', columns: ['Round', 'A board / hole', 'B board / hole', 'Raw A / B', 'Awarded A / B', 'Total A / B'], rows: 20, rowLabels: numbered(20) },
      ], fields: resultFields },
      { title: 'Continuation and match result', tables: [
        { title: 'Additional rounds', columns: ['Round', 'A board / hole', 'B board / hole', 'Raw A / B', 'Awarded A / B', 'Total A / B'], rows: 18 },
        { title: 'Game summary', columns: ['Game', 'Side A score', 'Side B score', 'Winner'], rows: 5, rowLabels: numbered(5) },
        { title: 'Notes', columns: ['Round / game', 'Decision / note'], rows: 5 },
      ] },
    ],
  },
  {
    slug: 'gymnastics-scoresheet', sportSlug: 'gymnastics', title: 'Gymnastics Scoresheet',
    description: 'Record gymnastics apparatus results, difficulty, execution, deductions, and meet totals on a printable sheet.',
    instructions: 'Enter the discipline, level, apparatus, and scoring system. Use difficulty/execution columns only where applicable; record awarded scores and adjustments under the event’s rules.',
    fields: ['Meet / session', 'Date / venue', 'Discipline / level', 'Division / age group', 'Athlete / team / club', 'Bib / competitor number', 'Scoring system', 'Judges / recorder'],
    pages: [
      { title: 'Apparatus and routine results', tables: [
        { title: 'Routine scores', columns: ['Athlete / bib', 'Apparatus / routine', 'Difficulty / start', 'Execution', 'Deductions', 'Awarded score'], rows: 18 },
      ], fields: ['Athlete / team total', 'Placing / result', 'Judge signature', 'Recorder signature'] },
      { title: 'Judge records and adjustments', tables: [
        { title: 'Individual judge marks', columns: ['Athlete / apparatus', 'Judge 1', 'Judge 2', 'Judge 3', 'Judge 4', 'Panel result'], rows: 14 },
        { title: 'Score adjustments / inquiries', columns: ['Athlete / apparatus', 'Original score', 'Adjustment / reason', 'Final score', 'Approved by'], rows: 8 },
        { title: 'Meet notes', columns: ['Time / routine', 'Note'], rows: 6 },
      ] },
    ],
  },
  {
    slug: 'pickleball-scoresheet', sportSlug: 'pickleball', title: 'Pickleball Scoresheet',
    description: 'Print a pickleball match record with singles or doubles names, game scores, serving order, and timeout logs.',
    instructions: 'Record side-out or rally scoring, the game target, and win condition. For doubles, note the serving player and server number when used by your format. Print another rally log as needed.',
    fields: ['Competition / division', 'Date / court / match', 'Singles / doubles / best of', 'Scoring method / target / win condition', ...players],
    pages: [
      { title: 'Players and game summary', tables: [
        { title: 'Game scores', columns: ['Game', 'Side A', 'Side B', 'First server / side', 'Winner'], rows: 5, rowLabels: numbered(5) },
        { title: 'Timeouts and end changes', columns: ['Game', 'Score A–B', 'Side', 'Timeout / end change / note'], rows: 10 },
      ], fields: ['Games won — A / B', ...resultFields] },
      { title: 'Serving and rally log', tables: [
        { title: 'Rally record', columns: ['Game / rally', 'Serving side / player', 'Server #', 'Rally winner', 'Score A–B'], rows: 24 },
        { title: 'Match notes', columns: ['Game / score', 'Decision / note'], rows: 6 },
      ] },
    ],
  },
  {
    slug: 'tennis-scoresheet', sportSlug: 'tennis', title: 'Tennis Scoresheet',
    description: 'Record tennis set scores, tiebreaks, service order, and match notes on a printable singles or doubles sheet.',
    instructions: 'Enter the match format, including tiebreak and deciding-set arrangements. Record set games separately from tiebreak points and use only the set rows required by your event.',
    fields: ['Competition / division', 'Date / court / match', 'Singles / doubles / best of', 'Tiebreak / deciding-set format', ...players],
    pages: [
      { title: 'Players and set summary', tables: [
        { title: 'Set scores', columns: ['Set', 'Games A', 'Games B', 'Tiebreak A / B', 'Winner'], rows: 5, rowLabels: numbered(5) },
        { title: 'Service order and game results', columns: ['Set / game', 'Server', 'Game winner', 'Set score A–B'], rows: 14 },
      ], fields: ['Sets won — A / B', ...resultFields] },
      { title: 'Tiebreak and match log', tables: [
        { title: 'Tiebreak points', columns: ['Set / point', 'Server', 'Point winner', 'Tiebreak score A–B'], rows: 20 },
        { title: 'Match notes', columns: ['Set / game / time', 'Interruption / decision / note'], rows: 8 },
      ] },
    ],
  },
  {
    slug: 'golf-scoresheet', sportSlug: 'golf', title: 'Golf Scoresheet',
    description: 'Print an 18-hole golf scorecard for four players with par, strokes, penalties, and round totals.',
    instructions: 'Enter player names and the event’s format. Record the full hole score including penalties. Apply any handicap adjustment only under the format declared for your event.',
    fields: ['Event / date', 'Course / tees', 'Format / round', 'Tee time / group', 'Player A / handicap allowance', 'Player B / handicap allowance', 'Player C / handicap allowance', 'Player D / handicap allowance'],
    pages: [
      { title: 'Front nine', tables: [
        { title: 'Holes 1–9', columns: ['Hole', 'Par', 'Player A', 'Player B', 'Player C', 'Player D'], rows: 10, rowLabels: [...numbered(9), 'Out total'] },
        { title: 'Penalty and ruling notes', columns: ['Hole', 'Player', 'Penalty strokes', 'Ruling / note'], rows: 10 },
      ], fields: ['Front-nine notes', 'Marker initials'] },
      { title: 'Back nine and round totals', tables: [
        { title: 'Holes 10–18', columns: ['Hole', 'Par', 'Player A', 'Player B', 'Player C', 'Player D'], rows: 10, rowLabels: [...numbered(9).map(n => String(Number(n) + 9)), 'In total'] },
        { title: 'Round summary', columns: ['Player', 'Out', 'In', 'Gross', 'Allowance / adjustment', 'Net / event result'], rows: 4, rowLabels: ['A', 'B', 'C', 'D'] },
        { title: 'Back-nine penalty notes', columns: ['Hole', 'Player', 'Penalty strokes', 'Ruling / note'], rows: 8 },
      ], fields: ['Player / marker signatures', 'Result verified by'] },
    ],
  },
  {
    slug: 'swimming-scoresheet', sportSlug: 'swimming', title: 'Swimming Scoresheet',
    description: 'Record swimming event details, lane assignments, finish times, split times, and official decisions.',
    instructions: 'Print one copy per event or heat. Specify distance, stroke, course length, and timing method. Record disqualifications or timing corrections with the official’s decision.',
    fields: ['Meet / date', 'Venue / course length', 'Event number / stroke', 'Distance / division', 'Heat / round', 'Start time / timing method', 'Relay / individual', 'Officials / recorder'],
    pages: [
      { title: 'Heat entries and results', tables: [
        { title: 'Lane results', columns: ['Lane', 'Athlete / relay team', 'Club', 'Entry time', 'Finish time', 'Place / status'], rows: 10, rowLabels: numbered(10) },
        { title: 'Relay swimmers / entries', columns: ['Lane', 'Swimmer 1', 'Swimmer 2', 'Swimmer 3', 'Swimmer 4'], rows: 8 },
      ], fields: ['Winning time / result', 'Timing official signature', 'Referee signature', 'Recorder signature'] },
      { title: 'Splits and official decisions', tables: [
        { title: 'Split times', columns: ['Lane / athlete', 'Distance', 'Split time', 'Cumulative time'], rows: 18 },
        { title: 'Disqualifications / timing corrections', columns: ['Lane', 'Reason / decision', 'Original time', 'Official result', 'Approved by'], rows: 8 },
      ] },
    ],
  },
  {
    slug: 'esports-scoresheet', sportSlug: 'esports', title: 'Esports Scoresheet',
    description: 'Print an esports series record for maps or rounds, player handles, title-specific statistics, and match rulings.',
    instructions: 'Enter the game title, version, and competition format. Label the metric columns for the title being played; this sheet does not assume a universal esports scoring system.',
    fields: ['Event / division', 'Date / match number', 'Game title / version', 'Series format / server', 'Team A', 'Team B', 'Lobby / match reference', 'Admin / recorder'],
    pages: [
      { title: 'Series results and rosters', tables: [
        { title: 'Map / round results', columns: ['Game', 'Map / mode', 'Score A', 'Score B', 'Winner', 'Match ID'], rows: 7, rowLabels: numbered(7) },
        { title: 'Player roster', columns: ['Team', 'Player handle', 'Role / slot', 'Substitute / notes'], rows: 12 },
      ], fields: resultFields },
      { title: 'Game statistics and rulings', tables: [
        { title: 'Title-specific statistics', columns: ['Game / player', 'Metric 1: ___', 'Metric 2: ___', 'Metric 3: ___', 'Notes'], rows: 18 },
        { title: 'Pauses, remakes, and decisions', columns: ['Game / time', 'Issue', 'Admin decision', 'Restart / result'], rows: 10 },
      ] },
    ],
  },
  {
    slug: 'ultimate-frisbee-scoresheet', sportSlug: 'ultimate-frisbee', title: 'Ultimate Frisbee Scoresheet',
    description: 'Record ultimate point scores, goals, assists, timeouts, and spirit notes on a printable game sheet.',
    instructions: 'Enter the target, time cap, and event format. Record the cumulative score after each point. Use the spirit categories and scale specified by your competition.',
    fields: ['Competition / division', 'Date / field', 'Team A', 'Team B', 'Target / time cap', 'Match number / format', 'Start time', 'Scorer / captains'],
    pages: [
      { title: 'Point-by-point scoring', tables: [
        { title: 'Point log', columns: ['Point / time', 'Receiving team', 'Scoring team', 'Goal #', 'Assist #', 'Score A–B'], rows: 24 },
      ], fields: resultFields },
      { title: 'Timeouts and spirit records', tables: [
        { title: 'Timeouts and stoppages', columns: ['Time / score', 'Team', 'Timeout / stoppage', 'Notes'], rows: 12 },
        { title: 'Spirit assessment', columns: ['Category / scale', 'Team A', 'Team B', 'Comments'], rows: 6 },
        { title: 'Game notes', columns: ['Point / time', 'Decision / note'], rows: 10 },
      ] },
    ],
  },
  {
    slug: 'disc-golf-scoresheet', sportSlug: 'disc-golf', title: 'Disc Golf Scoresheet',
    description: 'Print an 18-hole disc golf scorecard with throws, penalties, hole totals, and round results for four players.',
    instructions: 'Enter the course layout and format. Record each player’s hole total including penalty throws; use the notes to identify penalties and rulings.',
    fields: ['Event / date', 'Course / layout', 'Division / round', 'Start hole / tee time', 'Player A', 'Player B', 'Player C', 'Player D'],
    pages: [
      { title: 'Holes 1–9', tables: [
        { title: 'Front-nine scores', columns: ['Hole', 'Par', 'Player A', 'Player B', 'Player C', 'Player D'], rows: 10, rowLabels: [...numbered(9), 'Out total'] },
        { title: 'Penalty throws and notes', columns: ['Hole', 'Player', 'Penalty throws', 'Reason / ruling'], rows: 10 },
      ], fields: ['Front-nine notes', 'Scorekeeper initials'] },
      { title: 'Holes 10–18 and totals', tables: [
        { title: 'Back-nine scores', columns: ['Hole', 'Par', 'Player A', 'Player B', 'Player C', 'Player D'], rows: 10, rowLabels: [...numbered(9).map(n => String(Number(n) + 9)), 'In total'] },
        { title: 'Round summary', columns: ['Player', 'Out', 'In', 'Total throws', 'Course par', 'Relative to par'], rows: 4, rowLabels: ['A', 'B', 'C', 'D'] },
        { title: 'Additional holes / playoff', columns: ['Hole', 'Player A', 'Player B', 'Player C', 'Player D', 'Notes'], rows: 8 },
      ], fields: ['Player / scorekeeper signatures', 'Result verified by'] },
    ],
  },
];
