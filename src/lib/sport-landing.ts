export const SPORT_SLUGS = ['soccer', 'basketball'] as const;

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

export const SPORT_LANDINGS: Record<SportSlug, SportLanding> = {
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

export function isSportSlug(value: string): value is SportSlug {
  return SPORT_SLUGS.includes(value as SportSlug);
}
