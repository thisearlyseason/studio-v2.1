export interface SportsHubTemplateSummary {
  slug: string;
  title: string;
  description: string;
}

export const SPORTS_HUB_TEMPLATES: SportsHubTemplateSummary[] = [
  { slug: 'season-planning-spreadsheet', title: 'Season Planning Spreadsheet', description: 'Map your entire season week by week with phase, training load, game schedule, and monthly planning tools.' },
  { slug: 'practice-plan-builder', title: 'Practice Plan Builder', description: 'Build structured practices with drill slots, time blocks, coaching notes, and post-session reflection.' },
  { slug: 'game-day-checklist', title: 'Game Day Checklist', description: 'Prepare equipment, communications, officials, first aid, and post-game tasks with one complete checklist.' },
  { slug: 'roster-contact-sheet', title: 'Roster & Contact Sheet', description: 'Organize player details, emergency contacts, medical notes, and jersey assignments.' },
  { slug: 'parent-communication-pack', title: 'Parent Communication Pack', description: 'Use ready-to-edit messages for season kickoff, injury updates, schedule changes, and other team communication.' },
  { slug: 'incident-report-form', title: 'Incident & Injury Report Form', description: 'Document sports incidents and injuries consistently with a practical report template.' },
  { slug: 'tournament-runsheet', title: 'Tournament Run Sheet', description: 'Coordinate the day-of operations timeline for tournament directors.' },
  { slug: 'athlete-performance-tracker', title: 'Athlete Performance Tracker', description: 'Track individual player statistics, attendance, and development goals.' },
];

export function getSportsHubTemplate(slug: string) {
  return SPORTS_HUB_TEMPLATES.find(template => template.slug === slug);
}
