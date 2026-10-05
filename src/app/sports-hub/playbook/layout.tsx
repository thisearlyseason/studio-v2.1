import { sportsHubPageMetadata } from '@/lib/sports-hub-page-metadata';

export const metadata = sportsHubPageMetadata('/sports-hub/playbook', 'Sports Playbook Library', 'Explore practical sports playbooks covering coaching, team operations, player development, safety, and tournament management.');

export default function PlaybookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
