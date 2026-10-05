import { sportsHubPageMetadata } from '@/lib/sports-hub-page-metadata';

export const metadata = sportsHubPageMetadata('/sports-hub/resources', 'Free Sports Resources', 'Download free sports resources for coaches, team managers, parents, athletes, tournament directors, and program administrators.');

export default function ResourcesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
