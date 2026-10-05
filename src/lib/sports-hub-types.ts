export type SportsHubSection = 'hub' | 'news' | 'coaching' | 'team-management' | 'tournaments' | 'resources' | 'playbook' | 'featured';

export type ContentType = 'article' | 'rss' | 'resource' | 'video' | 'drill' | 'product-update';

export interface SportsHubArticle {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  featuredImage?: string;
  author: {
    name: string;
    avatar?: string;
    bio?: string;
    title?: string;
  };
  categories: string[];
  tags: string[];
  readingTime: number; // minutes
  publishedAt: string; // ISO date
  scheduledAt?: string;
  isDraft: boolean;
  isFeatured: boolean;
  isProductUpdate: boolean;
  viewCount: number;
  bookmarkCount: number;
  reactionCounts: Record<string, number>;
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  ogImage?: string;
  sport?: string;
  tableOfContents: Array<{ id: string; text: string; level: number }>;
  section: SportsHubSection;
  createdAt: string;
  updatedAt: string;
}

export interface RSSFeed {
  id: string;
  url: string;
  name: string;
  category: string;
  sport?: string;
  isEnabled: boolean;
  refreshIntervalMinutes: number;
  lastSyncAt?: string;
  lastSyncStatus?: 'success' | 'error' | 'pending';
  articleCount: number;
  syncHistory: Array<{
    syncAt: string;
    status: 'success' | 'error';
    articlesImported: number;
    error?: string;
  }>;
  createdAt: string;
}

export interface RSSArticle {
  id: string;
  feedId: string;
  title: string;
  url: string;
  excerpt: string;
  imageUrl?: string;
  source: string;
  publishedAt: string;
  category: string;
  sport?: string;
  importedAt: string;
  isDuplicate: boolean;
}

export interface PlaybookResource {
  id: string;
  title: string;
  description: string;
  type: PlaybookResourceType;
  sport?: string;
  ageGroup?: string;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  fileUrl?: string;
  previewUrl?: string;
  thumbnailUrl?: string;
  tags: string[];
  downloadCount: number;
  isVideo: boolean;
  videoUrl?: string;
  videoProvider?: 'youtube' | 'vimeo';
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PlaybookResourceType =
  | 'practice-plan'
  | 'drill'
  | 'season-planner'
  | 'lineup-template'
  | 'practice-template'
  | 'tournament-checklist'
  | 'game-day-checklist'
  | 'parent-communication'
  | 'volunteer-guide'
  | 'emergency-action-plan'
  | 'fundraising-ideas'
  | 'equipment-list'
  | 'travel-checklist'
  | 'coach-meeting-agenda'
  | 'video'
  | 'other';

export interface SportsHubPreferences {
  userId: string;
  favoriteSports: string[];
  coachingLevel?: 'youth' | 'high-school' | 'college' | 'professional' | 'recreational';
  ageGroups: string[];
  leagueType?: 'recreational' | 'competitive' | 'elite' | 'school';
  updatedAt: string;
}

export interface NewsletterSubscriber {
  id: string;
  email: string;
  name?: string;
  subscribedAt: string;
  isActive: boolean;
  sports: string[];
}

export interface SportsHubAnalyticsEvent {
  id: string;
  event: 'view' | 'search' | 'download' | 'share' | 'bookmark' | 'rss_click' | 'newsletter_signup';
  contentId?: string;
  contentType?: ContentType;
  userId?: string;
  timestamp: string;
  meta: Record<string, any>;
}

export const SPORTS_HUB_SPORTS = [
  'Football', 'Basketball', 'Soccer', 'Baseball', 'Softball', 'Volleyball',
  'Tennis', 'Swimming', 'Track & Field', 'Wrestling', 'Hockey', 'Lacrosse',
  'Rugby', 'Golf', 'Gymnastics', 'Cheerleading', 'Cross Country', 'Bowling',
  'Badminton', 'Pickleball', 'General'
] as const;

export const SPORTS_HUB_CATEGORIES = [
  'Coaching', 'Player Development', 'Team Management', 'Tournament Management',
  'League Management', 'Sports Technology', 'Sports Science', 'Nutrition',
  'Recovery', 'Volunteer Management', 'Parent Resources', 'Rule Changes',
  'Youth Sports', 'Mental Performance', 'Strength & Conditioning',
  'Fun Facts about Sports', 'Product Updates'
] as const;

export const COACHING_CATEGORIES = [
  'Leadership', 'Motivation', 'Communication', 'Practice Planning',
  'Player Development', 'Goalkeeping', 'Conditioning', 'Recovery',
  'Mental Performance', 'Youth Coaching', 'Game Strategy'
] as const;

export const PLAYBOOK_RESOURCE_TYPES: Array<{ value: PlaybookResourceType; label: string; emoji: string }> = [
  { value: 'practice-plan', label: 'Practice Plans', emoji: '📋' },
  { value: 'drill', label: 'Drills', emoji: '🏃' },
  { value: 'season-planner', label: 'Season Planners', emoji: '📅' },
  { value: 'lineup-template', label: 'Lineup Templates', emoji: '📊' },
  { value: 'practice-template', label: 'Practice Templates', emoji: '📝' },
  { value: 'tournament-checklist', label: 'Tournament Checklists', emoji: '🏆' },
  { value: 'game-day-checklist', label: 'Game Day Checklists', emoji: '✅' },
  { value: 'parent-communication', label: 'Parent Communication', emoji: '👨‍👩‍👧' },
  { value: 'volunteer-guide', label: 'Volunteer Guides', emoji: '🤝' },
  { value: 'emergency-action-plan', label: 'Emergency Action Plans', emoji: '🚨' },
  { value: 'fundraising-ideas', label: 'Fundraising Ideas', emoji: '💰' },
  { value: 'equipment-list', label: 'Equipment Lists', emoji: '🎽' },
  { value: 'travel-checklist', label: 'Travel Checklists', emoji: '✈️' },
  { value: 'coach-meeting-agenda', label: 'Coach Meeting Agendas', emoji: '📌' },
  { value: 'video', label: 'Videos', emoji: '🎥' },
];

export const RSS_FILTER_BLOCKLIST = [
  'betting', 'fantasy', 'wager', 'gambling', 'odds', 'spread', 'parlay',
  'politics', 'political', 'election', 'celebrity', 'transfer rumor', 'tabloid',
  'clickbait', 'you won\'t believe', 'shocking', 'mindblowing'
] as const;
