export const SPORT_SLUGS = [
  'soccer', 'basketball', 'baseball', 'rugby', 'football', 'cornhole', 'gymnastics',
  'pickleball', 'tennis', 'golf', 'swimming', 'esports', 'ultimate-frisbee', 'disc-golf',
] as const;

export type SportSlug = typeof SPORT_SLUGS[number];

export type SportLanding = {
  slug: SportSlug;
  name: string;
  seoTitle: string;
  seoDescription: string;
  heroImage: string;
  heroAlt: string;
  headline: string;
  description: string;
  registration: string;
  scheduling: string;
  teamApp: string;
  tournaments: string;
  operationalDetails: string[];
  faq: Array<{ question: string; answer: string }>;
};

const CORE_SPORT_LANDINGS: Record<'soccer' | 'basketball', SportLanding> = {
  soccer: {
    slug: 'soccer',
    name: 'Soccer',
    seoTitle: 'Soccer Team and League Management Software',
    seoDescription: 'Manage soccer registration, rosters, field schedules, attendance, communication, tournaments, scores, and family access with The Squad.',
    heroImage: '/images/campaigns/coaches-hero.webp',
    heroAlt: 'Soccer coaches and players preparing together beside the field',
    headline: 'Soccer team and league management software',
    description: 'Connect registration, rosters, field schedules, attendance, team communication, tournament operations, and public match information in one soccer workspace.',
    registration: 'Collect player or team details, age group, division, coach contacts, waivers, signatures, and payment status through configurable registration forms.',
    scheduling: 'Coordinate practices and matches across fields, teams, dates, and local time zones. Publish changes from the same schedule coaches and families follow.',
    teamApp: 'Give coaches, athletes, and permitted family members role-appropriate access to rosters, attendance, broadcasts, tactical chat, files, and calendar feeds.',
    tournaments: 'Run team registration, pool or bracket play, field assignments, officials, scorekeeping, standings, and spectator-facing schedules from one event hub.',
    operationalDetails: [
      'Age groups, divisions, and team registration',
      'Field and facility assignment',
      'Coach, athlete, and family communication',
      'Attendance and availability tracking',
      'Tournament brackets, scores, and standings',
      'Public schedules without private roster data',
    ],
    faq: [
      {
        question: 'Can The Squad manage youth soccer registration?',
        answer: 'Yes. Organizers can publish configurable player or team registration forms, collect required contact and eligibility details, archive accepted waivers, and review responses in the appropriate team, league, or tournament workspace.',
      },
      {
        question: 'How does soccer scheduling work?',
        answer: 'Coaches and organizers can schedule practices, matches, and tournaments with dates, local times, facilities, fields, attendance, and updates connected to the same squad or competition hub.',
      },
      {
        question: 'Can parents and athletes use the same soccer team app?',
        answer: 'They can use the same platform with different permissions. Coaches control parent access, athletes see their connected team information, and guardians can manage linked youth athletes without receiving staff authority.',
      },
      {
        question: 'Does The Squad support soccer tournaments?',
        answer: 'Yes. Tournament organizers can manage registration, divisions, schedules, brackets, facilities, officials, scorekeeping, standings, waivers, and a public spectator view.',
      },
    ],
  },
  basketball: {
    slug: 'basketball',
    name: 'Basketball',
    seoTitle: 'Basketball Team and League Management Software',
    seoDescription: 'Manage basketball registration, rosters, court schedules, attendance, communication, tournaments, scorekeeping, and family access with The Squad.',
    heroImage: '/images/campaigns/schools-hero.webp',
    heroAlt: 'Basketball players seated together beside the court',
    headline: 'Basketball team and league management software',
    description: 'Keep player registration, rosters, court schedules, attendance, team communication, tournament brackets, and live game operations connected throughout the season.',
    registration: 'Collect player or team information, age group, division, coach contacts, waivers, signatures, and payment status in configurable basketball registration forms.',
    scheduling: 'Plan practices, league fixtures, and tournament games across gyms and courts while keeping time, location, attendance, and schedule changes in one source.',
    teamApp: 'Connect coaches, athletes, and permitted guardians to schedules, broadcasts, tactical chat, roster information, files, attendance, and calendar feeds.',
    tournaments: 'Coordinate divisions, pool or bracket formats, court assignments, officials, scorekeepers, standings, and public schedules without exposing private operations.',
    operationalDetails: [
      'Player and team registration by division',
      'Gym, court, and facility scheduling',
      'Roster and eligibility records',
      'Practice and game attendance',
      'Tournament brackets and scorekeeping',
      'Coach, athlete, and family updates',
    ],
    faq: [
      {
        question: 'Can The Squad manage basketball league registration?',
        answer: 'Yes. League organizers can configure team or individual registration, collect required answers and waivers, review responses, organize divisions, and track accepted registrations in the league workspace.',
      },
      {
        question: 'Can basketball schedules include multiple gyms and courts?',
        answer: 'Yes. Facilities and sub-resources such as courts can be assigned to practices, games, leagues, and tournaments so organizers can coordinate shared locations and reduce conflicts.',
      },
      {
        question: 'What can basketball coaches manage in the team app?',
        answer: 'Coaches can manage rosters, schedules, attendance, team communication, drills, playbooks, files, volunteers, equipment, and permitted family access from the squad workspace.',
      },
      {
        question: 'Does The Squad include basketball tournament tools?',
        answer: 'Yes. Tournament tools cover registration, divisions, scheduling, court assignments, brackets, officials, scorekeeping, standings, waivers, and spectator information.',
      },
    ],
  },
};

type AdditionalSportConfig = { name: string; focus: string; heroImage: string; heroAlt: string };

const ADDITIONAL_SPORTS: Record<Exclude<SportSlug, 'soccer' | 'basketball'>, AdditionalSportConfig> = {
  baseball: { name: 'Baseball', focus: 'diamond scheduling, player development, scorekeeping, and tournament operations', heroImage: '/images/campaigns/leagues-hero.webp', heroAlt: 'Youth baseball team preparing on a community field' },
  rugby: { name: 'Rugby', focus: 'club registration, pitch scheduling, rosters, safeguarding, and match-day communication', heroImage: '/images/campaigns/coaches-hero.webp', heroAlt: 'Rugby coaches and players preparing together' },
  football: { name: 'Football', focus: 'team registration, practice facilities, roster permissions, game-day roles, and league scheduling', heroImage: '/images/campaigns/schools-hero.webp', heroAlt: 'Football players and coaches meeting beside a field' },
  cornhole: { name: 'Cornhole', focus: 'league registration, bracket scheduling, venue setup, scorekeeping, and player communication', heroImage: '/images/campaigns/leagues-hero.webp', heroAlt: 'Community players competing in a cornhole event' },
  gymnastics: { name: 'Gymnastics', focus: 'class enrollment, coach assignments, attendance, skill progress, family updates, and showcases', heroImage: '/images/campaigns/schools-hero.webp', heroAlt: 'Gymnastics athletes training with their coaches' },
  pickleball: { name: 'Pickleball', focus: 'court bookings, ladders, leagues, player registration, match schedules, and event communication', heroImage: '/images/campaigns/leagues-hero.webp', heroAlt: 'Pickleball players gathering at community courts' },
  tennis: { name: 'Tennis', focus: 'court scheduling, lesson rosters, ladders, clinics, tournaments, and player communication', heroImage: '/images/campaigns/coaches-hero.webp', heroAlt: 'Tennis players and coaches preparing for practice' },
  golf: { name: 'Golf', focus: 'club events, tee-time registration, divisions, volunteer coordination, and tournament results', heroImage: '/images/campaigns/leagues-hero.webp', heroAlt: 'Golfers preparing for a community tournament' },
  swimming: { name: 'Swimming', focus: 'lane scheduling, meet registration, athlete rosters, attendance, results, and family communication', heroImage: '/images/campaigns/schools-hero.webp', heroAlt: 'Swimmers and coaches preparing at a pool' },
  esports: { name: 'Esports', focus: 'player enrollment, team rosters, match scheduling, permissions, broadcasts, and competition operations', heroImage: '/images/campaigns/coaches-hero.webp', heroAlt: 'Esports team members preparing for a match' },
  'ultimate-frisbee': { name: 'Ultimate Frisbee', focus: 'club registration, field scheduling, spirit standards, rosters, tournaments, and team communication', heroImage: '/images/campaigns/leagues-hero.webp', heroAlt: 'Ultimate Frisbee players preparing on a field' },
  'disc-golf': { name: 'Disc Golf', focus: 'league registration, course scheduling, divisions, scorekeeping, events, and player updates', heroImage: '/images/campaigns/coaches-hero.webp', heroAlt: 'Disc golf players preparing for a community round' },
};

function buildAdditionalLanding(slug: Exclude<SportSlug, 'soccer' | 'basketball'>, config: AdditionalSportConfig): SportLanding {
  const lower = config.name.toLowerCase();
  return {
    slug, name: config.name,
    seoTitle: `${config.name} Team and League Management Software`,
    seoDescription: `Manage ${lower} registration, rosters, schedules, communication, events, and family access with The Squad.`,
    heroImage: config.heroImage, heroAlt: config.heroAlt,
    headline: `${config.name} team and league management software`,
    description: `Connect ${config.focus} in one workspace built for the organizations and communities that run ${lower}.`,
    registration: `Collect ${lower} player, team, class, or event details with configurable forms for contacts, divisions, waivers, permissions, and payment status.`,
    scheduling: `Coordinate ${lower} practices, matches, lessons, rounds, or events across facilities and local time zones while keeping updates in one source.`,
    teamApp: `Give coaches, organizers, athletes, and permitted families role-appropriate access to rosters, attendance, broadcasts, files, and calendar feeds.`,
    tournaments: `Run ${lower} leagues and tournaments with registration, divisions, schedules, officials or volunteers, scoring, standings, and public event information.`,
    operationalDetails: [
      `${config.name} registration and divisions`, 'Facility, venue, or course scheduling', 'Roster and eligibility records',
      'Coach, organizer, athlete, and family communication', 'Attendance, scoring, and event operations', 'Public schedules without private roster data',
    ],
    faq: [
      { question: `Can The Squad manage ${lower} registration?`, answer: `Yes. Organizers can configure ${lower} registration forms, collect required answers and waivers, review responses, and keep accepted registrations in the right team, club, league, or event workspace.` },
      { question: `How does ${lower} scheduling work?`, answer: `Schedules can include practices, matches, classes, rounds, meets, or events with local times, facilities, attendance, and updates connected to the same organization.` },
      { question: `Can families and athletes use the ${lower} team app?`, answer: 'Yes. People use the same platform with role-appropriate permissions. Coaches and organizers manage operations while athletes and guardians see the information they are allowed to access.' },
      { question: `Does The Squad support ${lower} tournaments?`, answer: `Yes. Event organizers can manage registration, divisions, schedules, venues, scoring, standings, waivers, volunteers, and public spectator information.` },
    ],
  };
}

export const SPORT_LANDINGS: Record<SportSlug, SportLanding> = {
  ...CORE_SPORT_LANDINGS,
  ...Object.fromEntries(Object.entries(ADDITIONAL_SPORTS).map(([slug, config]) => [slug, buildAdditionalLanding(slug as Exclude<SportSlug, 'soccer' | 'basketball'>, config)])),
} as Record<SportSlug, SportLanding>;

export function isSportSlug(value: string): value is SportSlug {
  return SPORT_SLUGS.includes(value as SportSlug);
}
