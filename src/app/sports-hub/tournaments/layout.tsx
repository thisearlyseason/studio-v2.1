import { sportsHubPageMetadata } from '@/lib/sports-hub-page-metadata';

export const metadata = sportsHubPageMetadata('/sports-hub/tournaments', 'Tournament Management Guides', 'Plan and operate sports tournaments with practical guidance for brackets, scheduling, venues, officials, registration, and game day.');

export default function TournamentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
