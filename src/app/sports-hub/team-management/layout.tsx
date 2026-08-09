import { sportsHubPageMetadata } from '@/lib/sports-hub-page-metadata';

export const metadata = sportsHubPageMetadata('/sports-hub/team-management', 'Sports Team Management Guides', 'Guidance for sports rosters, scheduling, equipment, communication, volunteers, fundraising, and team operations.');

export default function TeamManagementLayout({ children }: { children: React.ReactNode }) {
  return children;
}
