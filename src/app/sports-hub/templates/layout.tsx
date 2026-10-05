import { sportsHubPageMetadata } from '@/lib/sports-hub-page-metadata';

export const metadata = sportsHubPageMetadata('/sports-hub/templates', 'Free Sports Team Templates', 'Use free, ready-to-edit templates for season planning, practice plans, game days, rosters, communications, incidents, tournaments, and athlete development.');

export default function TemplatesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
