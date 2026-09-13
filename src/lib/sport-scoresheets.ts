import { CORE_SPORT_SCORESHEETS } from './sport-scoresheets-core';

export type ScoresheetTable = {
  title: string;
  columns: string[];
  rows: number;
  rowLabels?: string[];
  note?: string;
};
export type SportScoresheet = {
  slug: string;
  sportSlug: string;
  title: string;
  description: string;
  instructions: string;
  fields: string[];
  pages: Array<{ title: string; tables: ScoresheetTable[]; fields?: string[] }>;
};

const matchFields = ['Competition / division', 'Date / start time', 'Venue / court', 'Match number / round', 'Team A', 'Team B', 'Playing format', 'Scorer / officials'];
const resultFields = ['Final result / winner', 'Official / scorer signature', 'Team A representative', 'Team B representative'];
const goals = (rows: number): ScoresheetTable => ({ title: 'Goal log', columns: ['Time / segment', 'Team', 'Scorer #', 'Assist #', 'Score A–B'], rows });
const pairedPlayers = ['Side A — player 1', 'Side A — player 2 (doubles)', 'Side B — player 1', 'Side B — player 2 (doubles)'];

export const SPORT_SCORESHEETS: SportScoresheet[] = [
  ...CORE_SPORT_SCORESHEETS,
  {
    slug: 'volleyball-scoresheet', sportSlug: 'volleyball', title: 'Volleyball Scoresheet',
    description: 'Print a volleyball match record with set scores, starting lineups, substitutions, and timeouts.',
    instructions: 'Use the sets required by your event. Record jersey numbers in starting positions I–VI for each set; use another log page when needed.',
    fields: matchFields,
    pages: [
      { title: 'Match and set summary', tables: [
        { title: 'Set scores', columns: ['Set', 'Team A', 'Team B', 'Start', 'Finish', 'Winner'], rows: 5, rowLabels: ['1', '2', '3', '4', '5'] },
        { title: 'Starting lineups', columns: ['Team / set', 'I', 'II', 'III', 'IV', 'V', 'VI', 'Libero #'], rows: 10, rowLabels: ['A / 1', 'B / 1', 'A / 2', 'B / 2', 'A / 3', 'B / 3', 'A / 4', 'B / 4', 'A / 5', 'B / 5'] },
      ], fields: ['Sets won — A / B', ...resultFields] },
      { title: 'Match event logs', tables: [
        { title: 'Substitutions', columns: ['Set', 'Team', 'Player out #', 'Player in #', 'Score A–B'], rows: 18 },
        { title: 'Timeouts and sanctions', columns: ['Set', 'Team / player #', 'Score A–B', 'Timeout / sanction', 'Notes'], rows: 12 },
      ] },
    ],
  },
  {
    slug: 'ice-hockey-scoresheet', sportSlug: 'ice-hockey', title: 'Ice Hockey Scoresheet',
    description: 'Record period scores, goals and assists, penalties, and goaltender statistics on a printable hockey game sheet.',
    instructions: 'Enter the competition format before play. Keep shootout attempts separate from regulation goals and use the event’s result convention.',
    fields: matchFields.map(field => field === 'Venue / court' ? 'Rink / ice surface' : field),
    pages: [
      { title: 'Game summary and goals', tables: [
        { title: 'Period summary', columns: ['Segment', 'Goals A', 'Goals B', 'Shots A', 'Shots B'], rows: 6, rowLabels: ['1', '2', '3', 'Overtime', 'Shootout', 'Final'] },
        { title: 'Goals and assists', columns: ['Period', 'Time', 'Team', 'Scorer #', 'Assist 1 #', 'Assist 2 #', 'Score A–B'], rows: 14 },
      ], fields: resultFields },
      { title: 'Penalties and goaltenders', tables: [
        { title: 'Penalty log', columns: ['Period / time', 'Team', 'Player #', 'Infraction', 'Minutes', 'Start / end'], rows: 16 },
        { title: 'Goaltenders', columns: ['Team / goalie #', 'Minutes', 'Shots faced', 'Goals allowed', 'Saves'], rows: 4 },
        { title: 'Shootout attempts', columns: ['Round', 'Team A shooter #', 'Outcome A', 'Team B shooter #', 'Outcome B'], rows: 8 },
      ] },
    ],
  },
  {
    slug: 'softball-scoresheet', sportSlug: 'softball', title: 'Softball Scoresheet',
    description: 'Keep inning totals, batting records, pitching figures, and substitutions together on a printable softball sheet.',
    instructions: 'Print one copy for each team’s batting and pitching records. Enter extra-inning numbers in the extra rows and use another copy for continuation.',
    fields: ['Competition / division', 'Date / start time', 'Diamond', 'Game number / round', 'Visiting team', 'Home team', 'Team recorded on this copy', 'Format / time limit'],
    pages: [
      { title: 'Innings and batting', tables: [
        { title: 'Inning totals', columns: ['Inning', 'Visitor runs', 'Home runs'], rows: 9, rowLabels: ['1', '2', '3', '4', '5', '6', '7', 'Extra ___', 'Extra ___'] },
        { title: 'Batting order and totals', columns: ['Order', 'Player / #', 'Pos.', 'AB', 'R', 'H', 'RBI', 'BB', 'SO'], rows: 12, note: 'AB: at bats · R: runs · H: hits · RBI: runs batted in · BB: walks · SO: strikeouts.' },
      ], fields: ['Final score — visitor / home', 'Hits — visitor / home', 'Errors — visitor / home', 'Official / scorer signature'] },
      { title: 'Pitching and substitutions', tables: [
        { title: 'Pitching record', columns: ['Pitcher / #', 'IP', 'H', 'R', 'ER', 'BB', 'SO', 'Pitches'], rows: 6, note: 'IP: innings pitched · ER: earned runs. Note partial innings using your scoring convention.' },
        { title: 'Substitutions / re-entry', columns: ['Inning', 'Player out #', 'Player in #', 'Batting slot', 'Position / notes'], rows: 12 },
        { title: 'Game notes', columns: ['Inning / time', 'Play / decision / delay'], rows: 8 },
      ] },
    ],
  },
  {
    slug: 'lacrosse-scoresheet', sportSlug: 'lacrosse', title: 'Lacrosse Scoresheet',
    description: 'Print a lacrosse match record with scoring segments, goals, assists, penalties, and goalie statistics.',
    instructions: 'Identify field or box and your division. Label the scoring segments as periods, quarters, or halves to match your event.',
    fields: matchFields.map(field => field === 'Playing format' ? 'Field / box / playing format' : field),
    pages: [
      { title: 'Score summary and goals', tables: [
        { title: 'Scoring segments', columns: ['Segment', 'Team A', 'Team B'], rows: 6, rowLabels: ['1 — ___', '2 — ___', '3 — ___', '4 — ___', 'Overtime', 'Final'] },
        goals(18),
      ], fields: resultFields },
      { title: 'Penalties and goalie records', tables: [
        { title: 'Penalties', columns: ['Segment / time', 'Team', 'Player #', 'Infraction', 'Duration / release'], rows: 16 },
        { title: 'Goalie record', columns: ['Team / goalie #', 'Minutes', 'Shots faced', 'Goals allowed', 'Saves'], rows: 6 },
        { title: 'Timeouts and game notes', columns: ['Segment / time', 'Team', 'Timeout / note'], rows: 8 },
      ] },
    ],
  },
  {
    slug: 'cricket-scoresheet', sportSlug: 'cricket', title: 'Cricket Innings Scoresheet',
    description: 'Print batting, bowling, extras, fall-of-wickets, and over records for a cricket innings.',
    instructions: 'Print one two-page copy per innings. Enter the over limit and any revised target. The over log supports 50 overs; print a continuation copy for longer innings.',
    fields: ['Competition / date', 'Ground / match number', 'Batting side', 'Bowling side', 'Innings / over limit', 'Toss won by / decision', 'Target / revised target', 'Scorers / umpires'],
    pages: [
      { title: 'Batting and innings total', tables: [
        { title: 'Batting record', columns: ['#', 'Batter', 'How out / fielder', 'Bowler', 'Runs', 'Balls', '4s', '6s'], rows: 11, rowLabels: Array.from({ length: 11 }, (_, i) => String(i + 1)) },
        { title: 'Extras', columns: ['Byes', 'Leg byes', 'Wides', 'No balls', 'Penalty runs', 'Total extras'], rows: 1 },
        { title: 'Fall of wickets', columns: ['Wicket', 'Score', 'Batter out', 'Over'], rows: 10, rowLabels: Array.from({ length: 10 }, (_, i) => String(i + 1)) },
      ], fields: ['Total runs / wickets', 'Overs completed', 'Innings result / match result', 'Scorer / umpire sign-off'] },
      { title: 'Bowling and over log', tables: [
        { title: 'Bowling figures', columns: ['Bowler', 'Overs', 'Maidens', 'Runs', 'Wickets', 'Wides', 'No balls'], rows: 8 },
        { title: 'Over-by-over total', columns: ['Over', 'Runs / wkts', 'Over', 'Runs / wkts', 'Over', 'Runs / wkts', 'Over', 'Runs / wkts', 'Over', 'Runs / wkts'], rows: 10, note: 'Columns cover overs 1–10, 11–20, 21–30, 31–40, and 41–50. Write each over number and cumulative total.' },
        { title: 'Interruptions and target notes', columns: ['Time / over', 'Delay / target revision / decision'], rows: 8 },
      ] },
    ],
  },
  {
    slug: 'badminton-scoresheet', sportSlug: 'badminton', title: 'Badminton Scoresheet',
    description: 'Record singles or doubles pairings, game scores, rally notes, and the final badminton match result.',
    instructions: 'Label the event singles or doubles and enter player names for each side. Use the rally log for service changes or detailed scoring notes; print extra log pages as needed.',
    fields: ['Competition / division', 'Date / time', 'Court / match number', 'Singles / doubles / format', ...pairedPlayers],
    pages: [
      { title: 'Players and game summary', tables: [
        { title: 'Game scores', columns: ['Game', 'Side A', 'Side B', 'First server', 'Winner'], rows: 3, rowLabels: ['1', '2', '3'] },
        { title: 'Service and interval notes', columns: ['Game', 'Score A–B', 'Server / receiver', 'Interval / end change / note'], rows: 12 },
      ], fields: ['Games won — A / B', ...resultFields] },
      { title: 'Rally and match notes', tables: [
        { title: 'Rally log', columns: ['Game / rally', 'Server', 'Rally winner', 'Score A–B', 'Notes'], rows: 24 },
        { title: 'Officials’ notes', columns: ['Game / score', 'Decision / incident'], rows: 6 },
      ] },
    ],
  },
  {
    slug: 'table-tennis-scoresheet', sportSlug: 'table-tennis', title: 'Table Tennis Scoresheet',
    description: 'Print a table tennis match sheet for singles or doubles, with seven game rows, service order, and timeouts.',
    instructions: 'Mark the match format and use only the required game rows. For doubles, record the serving and receiving order for each game.',
    fields: ['Competition / division', 'Date / time', 'Table / match number', 'Singles / doubles / best of', ...pairedPlayers],
    pages: [
      { title: 'Players and game scores', tables: [
        { title: 'Game scores', columns: ['Game', 'Side A', 'Side B', 'First server', 'Winner'], rows: 7, rowLabels: ['1', '2', '3', '4', '5', '6', '7'] },
        { title: 'Serving and receiving order', columns: ['Game', 'First server', 'First receiver', 'Doubles sequence / end changes'], rows: 7 },
      ], fields: ['Games won — A / B', ...resultFields] },
      { title: 'Timeouts and point log', tables: [
        { title: 'Timeouts and disciplinary notes', columns: ['Game', 'Score A–B', 'Side / player', 'Timeout / decision'], rows: 8 },
        { title: 'Point log', columns: ['Game / point', 'Server', 'Point winner', 'Score A–B', 'Notes'], rows: 22 },
      ] },
    ],
  },
  {
    slug: 'handball-scoresheet', sportSlug: 'handball', title: 'Handball Scoresheet',
    description: 'Track half-time scores, goals, team timeouts, disciplinary events, and goalkeeper notes on a handball game sheet.',
    instructions: 'Enter the event’s playing format. Record each disciplinary event separately, including the player, time, and sanction.',
    fields: matchFields,
    pages: [
      { title: 'Match summary and goals', tables: [
        { title: 'Score by segment', columns: ['Segment', 'Team A', 'Team B'], rows: 5, rowLabels: ['First half', 'Second half', 'Extra time', 'Tie-break', 'Final'] },
        goals(20),
      ], fields: resultFields },
      { title: 'Discipline, timeouts, and goalkeepers', tables: [
        { title: 'Disciplinary record', columns: ['Time', 'Team / player #', 'Warning', 'Suspension', 'Disqualification / notes'], rows: 14 },
        { title: 'Team timeouts', columns: ['Half / time', 'Team', 'Score A–B'], rows: 6 },
        { title: 'Goalkeeper record', columns: ['Team / goalie #', 'Minutes', 'Shots faced', 'Goals allowed', 'Saves'], rows: 4 },
        { title: 'Match notes', columns: ['Time', 'Decision / incident'], rows: 4 },
      ] },
    ],
  },
];

// Preserve the existing production sport routes with their own printable records.
for (const [sportSlug, sourceSlug, name] of [
  ['hockey', 'ice-hockey', 'Hockey'],
  ['slo-pitch', 'softball', 'Slo-Pitch'],
  ['field-lacrosse', 'lacrosse', 'Field Lacrosse'],
  ['box-lacrosse', 'lacrosse', 'Box Lacrosse'],
]) {
  const source = SPORT_SCORESHEETS.find(sheet => sheet.sportSlug === sourceSlug)!;
  SPORT_SCORESHEETS.push({
    ...source,
    slug: `${sportSlug}-scoresheet`, sportSlug, title: `${name} Scoresheet`,
    description: `Print a ${name.toLowerCase()} scoring record with event details, results, and scoring logs.`,
    instructions: `Record the playing format and segments used by your ${name.toLowerCase()} event. Use additional log pages when needed.`,
  });
}

export function getSportScoresheet(slug: string) {
  return SPORT_SCORESHEETS.find(sheet => sheet.slug === slug);
}
