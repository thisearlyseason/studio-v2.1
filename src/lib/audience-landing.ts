export const AUDIENCE_SLUGS = [
  'parents',
  'coaches',
  'leagues',
  'tournaments',
  'schools',
  'municipalities',
] as const;

export type AudienceSlug = typeof AUDIENCE_SLUGS[number];

type Feature = {
  icon: 'calendar' | 'chat' | 'users' | 'shield' | 'video' | 'book' | 'trophy' | 'building' | 'payments' | 'clipboard' | 'map' | 'megaphone';
  title: string;
  description: string;
};

export type AudienceLanding = {
  slug: AudienceSlug;
  audience: string;
  eyebrow: string;
  headline: string;
  accent: string;
  description: string;
  primaryCta: string;
  primaryHref: string;
  secondaryCta: string;
  secondaryHref: string;
  boardTitle: string;
  boardItems: string[];
  problemTitle: string;
  problems: { title: string; description: string }[];
  featureTitle: string;
  featureIntro: string;
  features: Feature[];
  outcomes: { label: string; value: string }[];
  steps: { number: string; title: string; description: string }[];
  finalTitle: string;
  finalDescription: string;
  seoTitle: string;
  seoDescription: string;
};

export const AUDIENCE_LANDINGS: Record<AudienceSlug, AudienceLanding> = {
  parents: {
    slug: 'parents',
    audience: 'Sports parents',
    eyebrow: 'For parents and guardians',
    headline: 'Your child’s team life,',
    accent: 'finally in one place.',
    description: 'Schedules, updates, team messages, forms, payments, and useful resources—organized around your family instead of scattered across group chats and inboxes.',
    primaryCta: 'Refer Your Coach',
    primaryHref: '/refer-a-coach',
    secondaryCta: 'Explore Parent Resources',
    secondaryHref: '/sports-hub/parents',
    boardTitle: 'Your family game plan',
    boardItems: ['One schedule for every athlete', 'Coach-approved team updates', 'Forms and payments in context', 'Parent resources when you need them'],
    problemTitle: 'Less chasing. More showing up.',
    problems: [
      { title: 'Missed changes', description: 'Last-minute schedule updates disappear inside busy group chats.' },
      { title: 'Too many channels', description: 'Email, texts, PDFs, payment links, and calendars all live somewhere different.' },
      { title: 'No clear source', description: 'Families waste time confirming which message or schedule is current.' },
    ],
    featureTitle: 'A calmer way to stay connected',
    featureIntro: 'The Squad gives families a clear, team-controlled place to find what matters.',
    features: [
      { icon: 'calendar', title: 'Family-ready schedules', description: 'See practices, games, tournaments, and changes without rebuilding the calendar yourself.' },
      { icon: 'megaphone', title: 'Reliable team updates', description: 'Important announcements stay visible instead of getting buried beneath replies.' },
      { icon: 'chat', title: 'Appropriate communication', description: 'Reach permitted parents and coaches through team-controlled communication settings.' },
      { icon: 'clipboard', title: 'Forms in context', description: 'Keep waivers, attendance, and action items connected to the right athlete and team.' },
      { icon: 'payments', title: 'Clear payment records', description: 'Understand what is due, what was paid, and which program the charge belongs to.' },
      { icon: 'book', title: 'Parent Sports Hub', description: 'Get practical support for confidence, playing time, coach conversations, and healthy development.' },
    ],
    outcomes: [
      { value: 'One view', label: 'for the family schedule' },
      { value: 'Clear', label: 'coach-to-parent updates' },
      { value: 'Less noise', label: 'outside the group chat' },
    ],
    steps: [
      { number: '01', title: 'Your coach sets up the team', description: 'The team controls its schedule, roster, communication, and parent access.' },
      { number: '02', title: 'Your athlete is connected', description: 'Your family sees only the teams and information connected to your athlete.' },
      { number: '03', title: 'You stay ready', description: 'Open one place for the latest schedule, updates, resources, and actions.' },
    ],
    finalTitle: 'Think your team could use less chaos?',
    finalDescription: 'Send your coach a friendly, one-time introduction to The Squad.',
    seoTitle: 'Sports Team App for Parents and Families',
    seoDescription: 'Keep youth sports schedules, team updates, messages, forms, and payments organized for the whole family with The Squad.',
  },
  coaches: {
    slug: 'coaches',
    audience: 'Coaches',
    eyebrow: 'For coaches',
    headline: 'Spend less time managing noise.',
    accent: 'Coach more.',
    description: 'Run your roster, schedule, communication, drills, playbooks, video, volunteers, and team operations from one focused squad workspace.',
    primaryCta: 'Create Your Squad',
    primaryHref: '/signup',
    secondaryCta: 'See Plans',
    secondaryHref: '/pricing',
    boardTitle: 'Your coaching command centre',
    boardItems: ['Roster and family access', 'Schedule and attendance', 'Tactical chat and broadcasts', 'Drills, playbooks, and video'],
    problemTitle: 'Your season should not run from six apps.',
    problems: [
      { title: 'Admin steals practice time', description: 'Roster questions, reminders, forms, and payments pull attention away from athletes.' },
      { title: 'Information fragments', description: 'Plans, video, schedules, and conversations live in disconnected tools.' },
      { title: 'Parents need clarity', description: 'Without one source of truth, every update creates another round of questions.' },
    ],
    featureTitle: 'Built around the work coaches actually do',
    featureIntro: 'Start with a free squad, then unlock Pro tools when your team is ready.',
    features: [
      { icon: 'users', title: 'Roster command', description: 'Manage athletes, coaches, parents, roles, player profiles, and team access.' },
      { icon: 'calendar', title: 'Schedule and attendance', description: 'Publish events, track attendance, and keep changes connected to the team.' },
      { icon: 'chat', title: 'Tactical communication', description: 'Message permitted team members and control parent chat and live-feed access.' },
      { icon: 'book', title: 'Drills and playbooks', description: 'Build reusable practice resources and keep your tactical material organized.' },
      { icon: 'video', title: 'Video and recruiting', description: 'Share highlights, maintain athlete profiles, and prepare scouting information.' },
      { icon: 'payments', title: 'Team operations', description: 'Coordinate fees, fundraising, volunteers, equipment, documents, and facilities.' },
    ],
    outcomes: [
      { value: 'One hub', label: 'for the entire season' },
      { value: 'Your rules', label: 'for parent access' },
      { value: 'More time', label: 'for athlete development' },
    ],
    steps: [
      { number: '01', title: 'Create or upgrade a squad', description: 'Begin free or select Pro during signup for the complete team toolkit.' },
      { number: '02', title: 'Invite your team', description: 'Connect coaches, athletes, and families with role-appropriate access.' },
      { number: '03', title: 'Run the season', description: 'Keep every update, resource, and operational task in the squad hub.' },
    ],
    finalTitle: 'Bring your season under control.',
    finalDescription: 'Build your squad workspace and give everyone one reliable place to go.',
    seoTitle: 'Sports Team Management Software for Coaches',
    seoDescription: 'Manage rosters, schedules, messages, drills, playbooks, video, volunteers, and team operations in one coaching platform.',
  },
  leagues: {
    slug: 'leagues',
    audience: 'League organizers',
    eyebrow: 'For leagues',
    headline: 'Coordinate every team.',
    accent: 'Protect every boundary.',
    description: 'Manage invitation-based league access, enrolled teams, schedules, standings, registration, facilities, communication, and payments without exposing private league data.',
    primaryCta: 'Start Your League',
    primaryHref: '/signup',
    secondaryCta: 'Review League Plans',
    secondaryHref: '/pricing',
    boardTitle: 'League operations at a glance',
    boardItems: ['Invite-code league access', 'Team registration and divisions', 'Schedules, scores, and standings', 'Organizer controls and finance'],
    problemTitle: 'League operations break when the data does not connect.',
    problems: [
      { title: 'Registration lives in spreadsheets', description: 'Team information, divisions, fees, and approvals drift out of sync.' },
      { title: 'Schedules change everywhere', description: 'Organizers update one file while coaches and spectators follow another.' },
      { title: 'Access gets too broad', description: 'Private leagues need intentional enrollment—not public discovery by default.' },
    ],
    featureTitle: 'A private operating system for your league',
    featureIntro: 'Organizers control enrollment and visibility while teams get the information they need.',
    features: [
      { icon: 'shield', title: 'Invite-only discovery', description: 'Leagues remain private until a valid invite code connects a user or team.' },
      { icon: 'users', title: 'Team enrollment', description: 'Organize registered teams, divisions, coaches, rosters, and eligibility.' },
      { icon: 'calendar', title: 'League scheduling', description: 'Coordinate fixtures, facilities, dates, scores, and standings in one system.' },
      { icon: 'megaphone', title: 'Organizer communication', description: 'Broadcast important updates and connect coaches across enrolled teams.' },
      { icon: 'payments', title: 'Registration and finance', description: 'Track online and approved offline payments with organizer oversight.' },
      { icon: 'clipboard', title: 'Compliance records', description: 'Keep waivers, registration requirements, and league documents connected.' },
    ],
    outcomes: [
      { value: 'Private', label: 'until invited' },
      { value: 'Connected', label: 'teams and schedules' },
      { value: 'Auditable', label: 'registration and payments' },
    ],
    steps: [
      { number: '01', title: 'Create the league', description: 'Set the structure, registration details, divisions, and organizer controls.' },
      { number: '02', title: 'Invite teams', description: 'Teams join through controlled registration and invite-code workflows.' },
      { number: '03', title: 'Operate from one hub', description: 'Publish schedules, manage results, communicate, and monitor requirements.' },
    ],
    finalTitle: 'Run a league teams can trust.',
    finalDescription: 'Give organizers control and every registered team one consistent source of truth.',
    seoTitle: 'Sports League Management and Scheduling Software',
    seoDescription: 'Manage private league registration, teams, schedules, standings, facilities, payments, and communication with The Squad.',
  },
  tournaments: {
    slug: 'tournaments',
    audience: 'Tournament organizers',
    eyebrow: 'For tournaments',
    headline: 'From registration to final score,',
    accent: 'keep the event moving.',
    description: 'Coordinate teams, brackets, schedules, facilities, officials, scorekeeping, public spectator updates, volunteers, and event payments in one tournament workspace.',
    primaryCta: 'Plan Your Tournament',
    primaryHref: '/signup',
    secondaryCta: 'Compare Plans',
    secondaryHref: '/pricing',
    boardTitle: 'Tournament day command',
    boardItems: ['Team registration and waivers', 'Brackets and facility assignments', 'Officials and live scorekeeping', 'Public spectator schedule'],
    problemTitle: 'Event-day pressure exposes every disconnected process.',
    problems: [
      { title: 'Brackets go stale', description: 'One score changes several games, fields, officials, and spectator expectations.' },
      { title: 'Teams ask the same questions', description: 'Check-in, facilities, waivers, and schedules need one reliable public source.' },
      { title: 'Results arrive late', description: 'Manual score collection slows standings and creates avoidable corrections.' },
    ],
    featureTitle: 'Tournament operations that stay connected',
    featureIntro: 'Keep organizer tools private while sharing only the public event information spectators need.',
    features: [
      { icon: 'trophy', title: 'Brackets and formats', description: 'Build tournament structures and keep advancement tied to recorded results.' },
      { icon: 'clipboard', title: 'Registration and waivers', description: 'Collect team information, eligibility details, signatures, and payment status.' },
      { icon: 'map', title: 'Facilities and resources', description: 'Assign games to locations, fields, courts, and event resources.' },
      { icon: 'users', title: 'Officials and staff', description: 'Coordinate referees, scorekeepers, volunteers, and operational assignments.' },
      { icon: 'megaphone', title: 'Spectator portal', description: 'Publish schedules, rosters, scores, and approved public event information.' },
      { icon: 'payments', title: 'Event finance', description: 'Track registration revenue and approved online or offline payment workflows.' },
    ],
    outcomes: [
      { value: 'Live', label: 'scores and schedules' },
      { value: 'Public', label: 'only where intended' },
      { value: 'Organized', label: 'staff and facilities' },
    ],
    steps: [
      { number: '01', title: 'Build the event', description: 'Configure registration, tournament format, facilities, and public details.' },
      { number: '02', title: 'Enroll and schedule', description: 'Approve teams, collect requirements, and place games across resources.' },
      { number: '03', title: 'Run tournament day', description: 'Record scores, update progression, and keep participants informed.' },
    ],
    finalTitle: 'Make the tournament feel professionally run.',
    finalDescription: 'Connect the organizer desk, playing surface, teams, and public feed.',
    seoTitle: 'Sports Tournament Management and Bracket Software',
    seoDescription: 'Manage tournament registration, brackets, schedules, facilities, officials, scorekeeping, spectators, and payments with The Squad.',
  },
  schools: {
    slug: 'schools',
    audience: 'Schools and athletic departments',
    eyebrow: 'For schools',
    headline: 'One athletic department.',
    accent: 'Every squad connected.',
    description: 'Give athletic directors a school-wide hub for squads, coaches, master schedules, facilities, safety, waivers, finance, and shared program standards.',
    primaryCta: 'Build Your School Hub',
    primaryHref: '/signup',
    secondaryCta: 'Review School Plans',
    secondaryHref: '/pricing',
    boardTitle: 'Institutional command',
    boardItems: ['All squads under one school', 'Master schedules and facilities', 'Shared documents and safety records', 'Seats, finance, and oversight'],
    problemTitle: 'School athletics cannot operate team by team.',
    problems: [
      { title: 'Every coach uses a different system', description: 'The department loses visibility when each squad manages data independently.' },
      { title: 'Facilities collide', description: 'Courts, fields, and events need school-wide coordination rather than separate calendars.' },
      { title: 'Requirements are hard to audit', description: 'Waivers, safety records, staff access, and payments need consistent oversight.' },
    ],
    featureTitle: 'Institutional control without slowing coaches down',
    featureIntro: 'Set school-wide standards while each squad keeps its own operational workspace.',
    features: [
      { icon: 'building', title: 'School Hub', description: 'See every allocated squad, coach, administrator, and program from one institutional view.' },
      { icon: 'calendar', title: 'Master scheduling', description: 'Coordinate team calendars, programs, facilities, and shared resources.' },
      { icon: 'shield', title: 'Safety oversight', description: 'Review incidents, medical clearance, waivers, and institutional requirements.' },
      { icon: 'clipboard', title: 'Shared protocols', description: 'Deploy school documents and compliance standards across connected squads.' },
      { icon: 'payments', title: 'Plan and finance controls', description: 'Manage included Pro squad seats, additional squads, fees, and approved payments.' },
      { icon: 'users', title: 'Role-based administration', description: 'Give athletic directors, finance admins, and coaches the access their jobs require.' },
    ],
    outcomes: [
      { value: 'One school', label: 'across every squad' },
      { value: 'Local time', label: 'for every schedule' },
      { value: 'Scoped', label: 'roles and financial access' },
    ],
    steps: [
      { number: '01', title: 'Establish the School Hub', description: 'Create the institutional identity and assign approved administrators.' },
      { number: '02', title: 'Allocate squads', description: 'Use included Pro seats or add free and paid squads as needed.' },
      { number: '03', title: 'Coordinate the department', description: 'Monitor schedules, facilities, policies, finance, and safety in one place.' },
    ],
    finalTitle: 'Give your athletic department one operating system.',
    finalDescription: 'Connect institutional oversight with the daily work of every coaching staff.',
    seoTitle: 'School Athletic Department Management Software',
    seoDescription: 'Manage school sports teams, coaches, schedules, facilities, safety, waivers, finance, and shared standards in one School Hub.',
  },
  municipalities: {
    slug: 'municipalities',
    audience: 'Municipal recreation departments',
    eyebrow: 'For municipalities',
    headline: 'Coordinate community sport',
    accent: 'across programs and places.',
    description: 'Bring leagues, tournaments, teams, facilities, volunteers, schedules, public information, and operational accountability into one community sports framework.',
    primaryCta: 'Discuss Your Program',
    primaryHref: '/#contact',
    secondaryCta: 'Explore Platform Plans',
    secondaryHref: '/pricing',
    boardTitle: 'Community sport operations',
    boardItems: ['Programs, leagues, and events', 'Facilities and field resources', 'Public schedules and updates', 'Staff, volunteers, and accountability'],
    problemTitle: 'Community sport spans more than one team or event.',
    problems: [
      { title: 'Facility demand overlaps', description: 'Programs compete for fields, courts, rooms, and staff without a shared operating view.' },
      { title: 'Public information fragments', description: 'Residents need current schedules and event details without seeing private participant data.' },
      { title: 'Oversight stops at spreadsheets', description: 'Registration, volunteers, incidents, payments, and program records are difficult to reconcile.' },
    ],
    featureTitle: 'A practical framework for community sport',
    featureIntro: 'Coordinate internal operations and publish only the information residents should see.',
    features: [
      { icon: 'building', title: 'Multi-program oversight', description: 'Organize teams, leagues, tournaments, schools, and community programs by scope.' },
      { icon: 'map', title: 'Facility coordination', description: 'Maintain venues, fields, courts, availability, and event assignments.' },
      { icon: 'calendar', title: 'Shared schedules', description: 'Connect program calendars with local-time event details and public feeds.' },
      { icon: 'megaphone', title: 'Public information', description: 'Share approved schedules, rosters, scores, and event details without exposing private operations.' },
      { icon: 'users', title: 'Volunteer and staff tools', description: 'Coordinate opportunities, signups, verification, contribution records, and program roles.' },
      { icon: 'shield', title: 'Operational accountability', description: 'Keep safety, permissions, payments, and organization data appropriately scoped.' },
    ],
    outcomes: [
      { value: 'Connected', label: 'programs and venues' },
      { value: 'Useful', label: 'public information' },
      { value: 'Accountable', label: 'operations and records' },
    ],
    steps: [
      { number: '01', title: 'Map the community structure', description: 'Define programs, facilities, organizers, teams, and public audiences.' },
      { number: '02', title: 'Connect operations', description: 'Bring schedules, registration, volunteers, safety, and communication together.' },
      { number: '03', title: 'Serve the public clearly', description: 'Publish current information while maintaining role and tenant boundaries.' },
    ],
    finalTitle: 'Build a clearer community sports system.',
    finalDescription: 'Talk with The Squad about your programs, facilities, and operational needs.',
    seoTitle: 'Municipal Recreation and Community Sports Software',
    seoDescription: 'Coordinate municipal sports programs, leagues, tournaments, facilities, volunteers, schedules, and public information with The Squad.',
  },
};

export function isAudienceSlug(value: string): value is AudienceSlug {
  return AUDIENCE_SLUGS.includes(value as AudienceSlug);
}
