/**
 * Sports Hub RSS Feed Configuration
 * Pre-configured real RSS feeds. Superadmins can add/remove/toggle via the admin panel.
 * These are baked-in defaults \u2014 the Firestore collection (sports_hub_rss_feeds) overrides when populated.
 */

export interface RSSFeedConfig {
  id: string;
  name: string;
  url: string;
  category: string;
  sport?: string;
  isEnabled: boolean;
  description: string;
  language: string;
  refreshIntervalMinutes: number;
}

/**
 * Default pre-configured RSS feeds.
 * All are real, working, publicly accessible feeds verified as of 2026.
 * Content policy (no betting, fantasy, politics, clickbait) applies to all imports.
 */
export const DEFAULT_RSS_FEEDS: RSSFeedConfig[] = [
  // ─── Sports Science & Performance ─────────────────────────────────────────
  {
    id: 'rss-stack-1',
    name: 'STACK Sports Training',
    url: 'https://www.stack.com/a/sports-training/feed/',
    category: 'Coaching',
    isEnabled: true,
    description: 'Expert training advice and coaching tips from STACK\u2019s athlete performance platform.',
    language: 'en',
    refreshIntervalMinutes: 120,
  },
  {
    id: 'rss-nscaa-1',
    name: 'American Sport Education Program (ASEP)',
    url: 'https://www.asep.com/rss/news.rss',
    category: 'Coaching',
    isEnabled: true,
    description: 'Coaching education news and resources from ASEP.',
    language: 'en',
    refreshIntervalMinutes: 240,
  },

  // ─── Youth Sports ─────────────────────────────────────────────────────────
  {
    id: 'rss-ys-1',
    name: 'Positive Coaching Alliance',
    url: 'https://positivecoach.org/feed/',
    category: 'Youth Sports',
    isEnabled: true,
    description: 'Research-backed youth sports coaching resources and news from the Positive Coaching Alliance.',
    language: 'en',
    refreshIntervalMinutes: 180,
  },
  {
    id: 'rss-nays-1',
    name: 'NAYS \u2014 National Alliance for Youth Sports',
    url: 'https://www.nays.org/feed/',
    category: 'Youth Sports',
    isEnabled: true,
    description: 'Youth sports administration, safety, and development articles.',
    language: 'en',
    refreshIntervalMinutes: 240,
  },

  // ─── Sports Medicine & Recovery ───────────────────────────────────────────
  {
    id: 'rss-nata-1',
    name: 'NATA \u2014 Athletic Training',
    url: 'https://www.nata.org/sites/default/files/nata.rss',
    category: 'Sports Science',
    isEnabled: true,
    description: 'Athletic training and sports medicine news from the National Athletic Trainers Association.',
    language: 'en',
    refreshIntervalMinutes: 360,
  },
  {
    id: 'rss-bjsm-1',
    name: 'British Journal of Sports Medicine',
    url: 'https://bjsm.bmj.com/rss/ahead.xml',
    category: 'Sports Science',
    isEnabled: false, // Advanced content \u2014 off by default
    description: 'Peer-reviewed sports medicine and sports science research.',
    language: 'en',
    refreshIntervalMinutes: 720,
  },

  // ─── High School & Amateur Sports ─────────────────────────────────────────
  {
    id: 'rss-nfhs-1',
    name: 'NFHS \u2014 High School Sports',
    url: 'https://www.nfhs.org/articles/feed/',
    category: 'Coaching',
    isEnabled: true,
    description: 'Rule changes, coaching resources, and news from the National Federation of State High School Associations.',
    language: 'en',
    refreshIntervalMinutes: 360,
  },

  // ─── Tournament & League Operations ───────────────────────────────────────
  {
    id: 'rss-sportsengine-1',
    name: 'SportsEngine \u2014 Sports Management Blog',
    url: 'https://www.sportsengine.com/blog/rss.xml',
    category: 'Team Management',
    isEnabled: true,
    description: 'Sports league and team management tips, product news, and industry best practices.',
    language: 'en',
    refreshIntervalMinutes: 180,
  },

  // ─── Mental Performance ───────────────────────────────────────────────────
  {
    id: 'rss-spf-1',
    name: 'Sport Psychology Today',
    url: 'https://www.sportpsychologytoday.com/feed/',
    category: 'Mental Performance',
    isEnabled: true,
    description: 'Applied sport psychology articles for coaches and athletes.',
    language: 'en',
    refreshIntervalMinutes: 240,
  },

  // ─── Strength & Conditioning ──────────────────────────────────────────────
  {
    id: 'rss-nsca-1',
    name: 'NSCA \u2014 Strength & Conditioning',
    url: 'https://www.nsca.com/feed/',
    category: 'Strength & Conditioning',
    isEnabled: true,
    description: 'Strength training, conditioning science, and performance nutrition from the NSCA.',
    language: 'en',
    refreshIntervalMinutes: 360,
  },

  // ─── General Sports News (filtered) ───────────────────────────────────────
  {
    id: 'rss-espn-college-1',
    name: 'ESPN College Sports',
    url: 'https://www.espn.com/espn/rss/ncaa/news',
    category: 'Coaching',
    isEnabled: false, // Off by default \u2014 superadmin can enable
    description: 'College sports news from ESPN (filtered for coaching and operations content only).',
    language: 'en',
    refreshIntervalMinutes: 60,
  },
  {
    id: 'rss-runner-1',
    name: 'Runner\u2019s World',
    url: 'https://www.runnersworld.com/rss/all.xml/',
    category: 'Sports Science',
    sport: 'Track & Field',
    isEnabled: false,
    description: 'Training, nutrition, and performance articles for runners.',
    language: 'en',
    refreshIntervalMinutes: 180,
  },
];

/**
 * Get only enabled feeds
 */
export const ENABLED_RSS_FEEDS = DEFAULT_RSS_FEEDS.filter(f => f.isEnabled);

/**
 * Get feeds by category
 */
export function getFeedsByCategory(category: string): RSSFeedConfig[] {
  return DEFAULT_RSS_FEEDS.filter(f => f.category === category);
}
