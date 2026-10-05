/**
 * RSS Feed Registry
 *
 * RULES:
 * - NO sports management software company feeds (TeamSnap, LeagueApps,
 *   SportsEngine, PlayPass, etc.)
 * - Only neutral journalism, research, and coaching-education sources
 * - Each entry has `keywords` — articles must match ≥1 keyword to be shown
 * - Empty `keywords` = allow all (General Sports only)
 */

export interface FeedEntry {
  url: string;
  source: string;
  category: string;
  tags: string[];
  /** Articles must contain ≥1 of these words in title or excerpt to be shown */
  keywords?: string[];
}

export const FEED_REGISTRY: FeedEntry[] = [

  // ── COACHING ─────────────────────────────────────────────────────────────────
  {
    url: 'https://www.espn.com/espn/rss/ncf/news',
    source: 'ESPN',
    category: 'Coaching',
    tags: ['coaching', 'leadership', 'college sports'],
    keywords: [
      'coach', 'coaching', 'head coach', 'offensive coordinator',
      'defensive coordinator', 'strategy', 'program', 'development',
      'playbook', 'game plan', 'practice', 'drill',
    ],
  },
  {
    url: 'https://www.espn.com/espn/rss/soccer/news',
    source: 'ESPN',
    category: 'Coaching',
    tags: ['coaching', 'soccer', 'tactics'],
    keywords: [
      'coach', 'manager', 'tactical', 'formation', 'training session',
      'coaching staff', 'development', 'player development',
    ],
  },
  {
    url: 'https://simplifaster.com/feed',
    source: 'SimpliFaster',
    category: 'Coaching',
    tags: ['coaching', 'athlete development', 'performance'],
    keywords: [
      'coach', 'coaching', 'athlete', 'training', 'development',
      'practice', 'skill', 'teach', 'session', 'program',
    ],
  },
  {
    url: 'https://www.runnersworld.com/rss/all.xml',
    source: "Runner's World",
    category: 'Coaching',
    tags: ['coaching', 'training', 'endurance'],
    keywords: [
      'coach', 'coaching', 'training plan', 'program', 'run coach',
      'technique', 'form', 'drill', 'workout', 'athlete',
    ],
  },

  // ── TEAM MANAGEMENT ──────────────────────────────────────────────────────────
  // Strictly team-management topics from neutral journalism/research sources
  {
    url: 'https://www.espn.com/espn/rss/news',
    source: 'ESPN',
    category: 'Team Management',
    tags: ['team management', 'sports administration'],
    keywords: [
      'roster', 'general manager', 'front office', 'staff', 'contract',
      'trade', 'signing', 'release', 'waiver', 'personnel', 'operations',
      'team building', 'chemistry', 'locker room', 'communication',
    ],
  },
  {
    url: 'https://rss.cbssports.com/rss/headlines/',
    source: 'CBS Sports',
    category: 'Team Management',
    tags: ['team management', 'sports administration'],
    keywords: [
      'roster', 'general manager', 'GM', 'front office', 'staff',
      'contract', 'trade', 'personnel', 'operations', 'signing',
      'team building', 'chemistry', 'locker room', 'communication',
    ],
  },
  {
    url: 'https://www.espn.com/espn/rss/ncf/news',
    source: 'ESPN',
    category: 'Team Management',
    tags: ['team management', 'college sports'],
    keywords: [
      'roster', 'staff', 'coordinator', 'program management', 'recruiting',
      'transfer', 'scholarship', 'compliance', 'operations', 'athletics',
      'athletic director', 'budget', 'facility', 'volunteer',
    ],
  },

  // ── TOURNAMENT MANAGEMENT ────────────────────────────────────────────────────
  {
    url: 'https://www.espn.com/espn/rss/news',
    source: 'ESPN',
    category: 'Tournament Management',
    tags: ['tournaments', 'competition', 'bracket'],
    keywords: [
      'tournament', 'bracket', 'championship', 'playoff', 'postseason',
      'seeding', 'qualifier', 'round robin', 'venue', 'schedule',
      'format', 'registration', 'draw', 'cup', 'invitational',
    ],
  },
  {
    url: 'https://rss.cbssports.com/rss/headlines/',
    source: 'CBS Sports',
    category: 'Tournament Management',
    tags: ['tournaments', 'competition'],
    keywords: [
      'tournament', 'bracket', 'playoff', 'championship', 'seeding',
      'postseason', 'qualifier', 'cup', 'bowl', 'invitational',
      'standings', 'draw', 'format',
    ],
  },
  {
    url: 'https://www.espn.com/espn/rss/ncf/news',
    source: 'ESPN',
    category: 'Tournament Management',
    tags: ['tournaments', 'playoffs', 'college sports'],
    keywords: [
      'tournament', 'playoff', 'bracket', 'bowl', 'championship',
      'postseason', 'schedule', 'seeding', 'qualifier', 'conference',
    ],
  },

  // ── YOUTH SPORTS ─────────────────────────────────────────────────────────────
  {
    url: 'https://www.espn.com/espn/rss/ncf/news',
    source: 'ESPN',
    category: 'Youth Sports',
    tags: ['youth sports', 'college sports', 'student athletes'],
    keywords: [
      'youth', 'high school', 'student athlete', 'college athlete',
      'young', 'junior', 'recruit', 'recruiting', 'freshman',
      'sophomore', 'NIL', 'amateur',
    ],
  },
  {
    url: 'https://www.runnersworld.com/rss/all.xml',
    source: "Runner's World",
    category: 'Youth Sports',
    tags: ['youth sports', 'running', 'fitness'],
    keywords: [
      'youth', 'young', 'high school', 'student', 'junior', 'teen',
      'school', 'kids', 'children', 'beginner', 'college', 'amateur',
    ],
  },
  {
    url: 'https://simplifaster.com/feed',
    source: 'SimpliFaster',
    category: 'Youth Sports',
    tags: ['youth sports', 'athlete development'],
    keywords: [
      'youth', 'young athlete', 'high school', 'junior', 'adolescent',
      'school', 'teen', 'development', 'beginner', 'foundation',
    ],
  },

  // ── NUTRITION ────────────────────────────────────────────────────────────────
  {
    url: 'https://www.runnersworld.com/rss/all.xml',
    source: "Runner's World",
    category: 'Nutrition',
    tags: ['nutrition', 'fueling', 'sports diet'],
    keywords: [
      'nutrition', 'diet', 'fuel', 'fueling', 'carb', 'protein',
      'hydration', 'supplement', 'eating', 'food', 'calorie', 'energy',
      'recovery', 'pre-workout', 'post-workout', 'electrolyte', 'vitamin',
    ],
  },
  {
    url: 'https://www.strongerbyscience.com/feed',
    source: 'Stronger By Science',
    category: 'Nutrition',
    tags: ['nutrition', 'sports science', 'evidence-based'],
    keywords: [
      'protein', 'carb', 'diet', 'nutrition', 'supplement', 'creatine',
      'calorie', 'eating', 'food', 'macro', 'nutrient', 'fat', 'muscle',
      'hydration', 'electrolyte',
    ],
  },

  // ── SPORTS SCIENCE ───────────────────────────────────────────────────────────
  {
    url: 'https://www.strongerbyscience.com/feed',
    source: 'Stronger By Science',
    category: 'Sports Science',
    tags: ['sports science', 'research', 'evidence-based'],
    keywords: [
      'research', 'study', 'science', 'hypertrophy', 'strength', 'power',
      'endurance', 'muscle', 'performance', 'recovery', 'physiology',
      'biomechanics', 'fatigue', 'adaptation', 'training effect',
      'VO2', 'lactate',
    ],
  },
  {
    url: 'https://simplifaster.com/feed',
    source: 'SimpliFaster',
    category: 'Sports Science',
    tags: ['sports science', 'performance', 'speed'],
    keywords: [
      'science', 'research', 'performance', 'biomechanics', 'sprint',
      'plyometric', 'speed', 'power', 'agility', 'hamstring', 'eccentric',
      'isometric', 'force', 'velocity', 'physiology',
    ],
  },

  // ── STRENGTH & CONDITIONING ──────────────────────────────────────────────────
  {
    url: 'https://www.strongerbyscience.com/feed',
    source: 'Stronger By Science',
    category: 'Strength & Conditioning',
    tags: ['strength', 'conditioning', 'training'],
    keywords: [
      'strength', 'conditioning', 'training', 'lift', 'squat', 'deadlift',
      'volume', 'intensity', 'periodization', 'program', 'muscle',
      'hypertrophy', 'workout', 'resistance', 'isometric', 'eccentric',
      'powerlifting', 'weight training',
    ],
  },
  {
    url: 'https://simplifaster.com/feed',
    source: 'SimpliFaster',
    category: 'Strength & Conditioning',
    tags: ['strength', 'conditioning', 'speed', 'athletic development'],
    keywords: [
      'strength', 'conditioning', 'speed', 'power', 'sprint', 'jump',
      'plyometric', 'weight', 'training', 'athlete', 'agility',
      'force', 'velocity', 'deceleration', 'acceleration',
    ],
  },
  {
    url: 'https://www.runnersworld.com/rss/all.xml',
    source: "Runner's World",
    category: 'Strength & Conditioning',
    tags: ['conditioning', 'endurance', 'training'],
    keywords: [
      'strength', 'conditioning', 'workout', 'interval', 'tempo',
      'cross-train', 'build', 'program', 'plan', 'resistance',
      'training plan', 'speed work',
    ],
  },

  // ── GENERAL SPORTS ────────────────────────────────────────────────────────────
  {
    url: 'https://www.espn.com/espn/rss/news',
    source: 'ESPN',
    category: 'General Sports',
    tags: ['sports', 'news'],
    keywords: [],
  },
  {
    url: 'https://rss.cbssports.com/rss/headlines/',
    source: 'CBS Sports',
    category: 'General Sports',
    tags: ['sports', 'news'],
    keywords: [],
  },
  {
    url: 'https://sports.yahoo.com/rss/',
    source: 'Yahoo Sports',
    category: 'General Sports',
    tags: ['sports', 'news'],
    keywords: [],
  },
];
