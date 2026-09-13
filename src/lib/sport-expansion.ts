import type { SportLanding } from './sport-landing';

export const NEW_SPORT_SLUGS = [
  'volleyball', 'ice-hockey', 'softball', 'lacrosse', 'cricket', 'badminton', 'table-tennis', 'handball',
] as const;
export type NewSportSlug = typeof NEW_SPORT_SLUGS[number];

type SportProgram = {
  name: string;
  heroAlt: string;
  headline: string;
  description: string;
  registration: string;
  scheduling: string;
  teamApp: string;
  tournaments: string;
  operationalDetails: string[];
  question: string;
  answer: string;
};

const PROGRAMS: Record<NewSportSlug, SportProgram> = {
  volleyball: {
    name: 'Volleyball',
    heroAlt: 'Volleyball on a wooden indoor court with a net in the background',
    headline: 'Bring every volleyball roster, court, and match together',
    description: 'From club tryouts to a full weekend of pool play, keep volleyball registration, court assignments, team updates, and match records connected.',
    registration: 'Collect player and team entries by age group and division, along with coach contacts, jersey details, waivers, and payment status.',
    scheduling: 'Assign practices and fixtures to gyms and courts. Share warm-up times, court changes, and tournament schedules with the teams using them.',
    teamApp: 'Keep practice attendance, travel details, rotation notes, and coach broadcasts in the same workspace that athletes and permitted families follow.',
    tournaments: 'Coordinate pool play and brackets, court assignments, officials, and public fixtures. Use the printable volleyball scoresheet to record sets, lineups, substitutions, and timeouts.',
    operationalDetails: ['Age-group and club-team entries', 'Gym and court assignments', 'Practice attendance and availability', 'Pool-play and bracket schedules', 'Set scores and starting lineups', 'Substitution and timeout records'],
    question: 'What is included in the volleyball scoresheet?',
    answer: 'The printable sheet includes a five-set match summary, starting lineups, substitution and timeout logs, and space for the result and officials. Record the format used by your event before play.',
  },
  'ice-hockey': {
    name: 'Ice Hockey',
    heroAlt: 'Hockey puck and taped stick blade on ice with a red goal behind',
    headline: 'Keep your hockey season organized from the first faceoff',
    description: 'Connect player registration, rink schedules, team communication, and game-day records for ice hockey clubs, leagues, and tournament weekends.',
    registration: 'Collect player and team details, age division, jersey numbers, goalie information, contacts, waivers, and registration payment status.',
    scheduling: 'Publish practices and games with rink and ice-surface assignments. Keep arrival times, location changes, and team availability alongside the fixture.',
    teamApp: 'Share dressing-room instructions, equipment reminders, travel plans, and attendance with coaches, athletes, and permitted guardians.',
    tournaments: 'Organize divisions, rink assignments, officials, brackets, and spectator schedules. Record period scores, goals, assists, shots, and penalties on the printable game sheet.',
    operationalDetails: ['Player, jersey, and goalie records', 'Rink and ice-surface schedules', 'Arrival and dressing-room details', 'Tournament divisions and brackets', 'Period scores and goal logs', 'Penalty and goaltender records'],
    question: 'Can the hockey scoresheet record overtime and penalties?',
    answer: 'Yes. It includes regulation periods, overtime and shootout summary fields, a goal-and-assist log, and separate penalty and goaltender tables. Record your event format in the game details.',
  },
  softball: {
    name: 'Softball',
    heroAlt: 'Yellow softball and leather glove on the dirt beside a softball field',
    headline: 'A connected home for your softball season',
    description: 'Bring softball registration, diamond schedules, lineups, and family communication together, from weekly practices to tournament doubleheaders.',
    registration: 'Collect player or team entries, age group, division, coach contacts, jersey numbers, waivers, and payment status for your softball program.',
    scheduling: 'Assign diamonds to games and practices, include warm-up and arrival details, and publish weather or venue changes to the same team schedule.',
    teamApp: 'Keep lineup notes, equipment needs, volunteer assignments, attendance, and family updates accessible to the people responsible for game day.',
    tournaments: 'Coordinate divisions, diamond assignments, brackets, officials, and public schedules. Print a softball scoresheet for inning totals, batting records, pitching, and substitutions.',
    operationalDetails: ['Age-group and team registration', 'Diamond assignments and doubleheaders', 'Weather and schedule updates', 'Batting order and substitutions', 'Inning totals, hits, and errors', 'Pitching and game-result records'],
    question: 'Does the softball scoresheet include extra innings?',
    answer: 'The sheet provides inning-by-inning totals with extra-inning space, a batting-order table, pitching records, substitutions, and a game-result sign-off. Note any local format or time limit in the game details.',
  },
  lacrosse: {
    name: 'Lacrosse',
    heroAlt: 'Lacrosse stick with a mesh pocket and white ball on a grass field',
    headline: 'Keep your lacrosse club connected on and off the field',
    description: 'Coordinate lacrosse registration, playing venues, practice attendance, team updates, and competition records in one club workspace.',
    registration: 'Collect player and team details, age division, playing format, jersey numbers, emergency contacts, waivers, and payment status.',
    scheduling: 'Assign fields or arenas to practices and matches, record the venue and arrival time, and keep staff and families informed when locations change.',
    teamApp: 'Share equipment reminders, drill files, travel information, volunteer needs, and attendance through role-appropriate team access.',
    tournaments: 'Organize divisions, venues, officials, schedules, and brackets. Use the printable lacrosse sheet for segment scores, goals, assists, penalties, and goalie records.',
    operationalDetails: ['Field or box format details', 'Age-group and roster records', 'Field and arena assignments', 'Practice attendance and equipment notes', 'Goal, assist, and penalty logs', 'Goalie and game-result records'],
    question: 'Can the lacrosse sheet be used for different playing formats?',
    answer: 'Yes. Record field or box and your division in the format field, then label the scoring segments for your competition. Separate goal, penalty, and goalie logs keep the match record together.',
  },
  cricket: {
    name: 'Cricket',
    heroAlt: 'Red cricket ball beside a willow bat with stumps behind on a pitch',
    headline: 'Organize your cricket club from fixtures to final results',
    description: 'Keep cricket team registration, ground assignments, player availability, club communication, and match records connected throughout the season.',
    registration: 'Collect club and team entries, player details, division, captain contacts, waivers, and payment status in configurable registration forms.',
    scheduling: 'Publish match dates, grounds, arrival times, and practice sessions. Keep player availability and weather-related fixture updates with the schedule.',
    teamApp: 'Share squad selections, kit reminders, travel plans, practice files, and captain updates with players and permitted family members.',
    tournaments: 'Manage entries, divisions, ground assignments, fixtures, officials, and public results. Use the printable cricket innings sheet for batting, bowling, extras, and the fall of wickets.',
    operationalDetails: ['Club entries and captain contacts', 'Ground and practice assignments', 'Player availability and squad updates', 'Match format and toss records', 'Batting, bowling, and extras', 'Fall of wickets and innings totals'],
    question: 'How do I use the cricket innings scoresheet?',
    answer: 'Print one two-page copy for each innings. Record the batting and bowling sides, batting scores, extras, fall of wickets, bowling figures, and the innings total. The over log has space for up to 50 overs; use another copy if needed.',
  },
  badminton: {
    name: 'Badminton',
    heroAlt: 'Feather shuttlecock and badminton racket on a green indoor court',
    headline: 'Bring your badminton club, courts, and matches together',
    description: 'Coordinate badminton sessions, singles and doubles entries, court schedules, player updates, and match records for clubs and school programs.',
    registration: 'Collect singles players or doubles pairings, divisions, club and school details, contacts, waivers, and payment status.',
    scheduling: 'Assign practice groups and matches to numbered courts. Publish session times, arrival details, and court changes in the same club schedule.',
    teamApp: 'Keep players informed about training groups, partner arrangements, attendance, equipment reminders, and tournament travel.',
    tournaments: 'Coordinate divisions, draws, court assignments, officials, and public fixtures. Print a badminton scoresheet for game scores, pairings, service notes, and the final result.',
    operationalDetails: ['Singles and doubles entries', 'Partner and division records', 'Numbered court assignments', 'Training groups and attendance', 'Game scores and service notes', 'Match results and official sign-off'],
    question: 'Does the badminton sheet support singles and doubles?',
    answer: 'Yes. Each side has fields for two players, with an event-type field for singles or doubles. The sheet includes a three-game summary, rally log, interval notes, and result sign-off.',
  },
  'table-tennis': {
    name: 'Table Tennis',
    heroAlt: 'Red table tennis paddle and white ball beside a net on a blue table',
    headline: 'A single workspace for your table tennis club',
    description: 'Connect table tennis entries, table assignments, practice groups, match communication, and results for clubs, schools, and leagues.',
    registration: 'Collect singles or doubles entries, player and partner names, club details, division, contacts, waivers, and registration payment status.',
    scheduling: 'Assign fixtures and training sessions to numbered tables. Share reporting times, venue information, and table changes with participants.',
    teamApp: 'Coordinate practice attendance, team selection, partner communication, equipment reminders, and league travel from the club workspace.',
    tournaments: 'Manage event entries, divisions, draws, table assignments, officials, and public schedules. Print a table tennis sheet for game scores, service order, timeouts, and match results.',
    operationalDetails: ['Singles, doubles, and club entries', 'Division and partner details', 'Numbered table assignments', 'Practice and fixture attendance', 'Game scores and service order', 'Timeout notes and match sign-off'],
    question: 'Which match formats fit the table tennis scoresheet?',
    answer: 'The sheet has seven game rows, so you can mark the games needed for your event and leave unused rows blank. It also includes singles or doubles names, service-order notes, timeouts, and a final result.',
  },
  handball: {
    name: 'Handball',
    heroAlt: 'Textured team handball on an indoor court with a striped goal behind',
    headline: 'Keep your handball team and competition in sync',
    description: 'Connect team handball registration, hall schedules, roster communication, practice attendance, and match records for your club or league.',
    registration: 'Collect team and player details, age group, jersey numbers, goalkeeper information, contacts, waivers, and payment status.',
    scheduling: 'Assign halls and courts to training sessions and matches. Publish arrival times and venue changes alongside team availability.',
    teamApp: 'Share training plans, lineup notes, kit reminders, travel details, and volunteer assignments with players, coaches, and permitted families.',
    tournaments: 'Coordinate divisions, hall assignments, officials, fixtures, and brackets. Use the printable handball sheet for half-time scores, goals, timeouts, and disciplinary records.',
    operationalDetails: ['Team entries and jersey records', 'Hall and court scheduling', 'Training attendance and availability', 'Half-time and final scores', 'Goals and team timeouts', 'Warnings, suspensions, and goalkeeper notes'],
    question: 'What match events can the handball scoresheet capture?',
    answer: 'Record first-half, second-half, extra-time, and final scores, plus a goal log, team timeouts, warnings, suspensions, disqualifications, and goalkeeper notes. Note the playing format used by your event.',
  },
};

export const NEW_SPORT_LANDINGS = Object.fromEntries(NEW_SPORT_SLUGS.map(slug => {
  const { question, answer, ...program } = PROGRAMS[slug];
  return [slug, {
    ...program,
    slug,
    seoTitle: `${program.name} Team and League Management Software`,
    seoDescription: program.description,
    heroImage: `/images/sports/photography/${slug}.webp`,
    scoresheetSlug: `${slug}-scoresheet`,
    faq: [
      { question, answer },
      { question: `How can I organize ${program.name.toLowerCase()} sessions?`, answer: program.scheduling },
      { question: `What can I collect during ${program.name.toLowerCase()} registration?`, answer: program.registration },
      { question: 'Can athletes and families follow the team?', answer: program.teamApp },
    ],
  } satisfies SportLanding];
})) as Record<NewSportSlug, SportLanding>;
