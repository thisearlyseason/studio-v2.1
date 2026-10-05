import { sportsHubPageMetadata } from '@/lib/sports-hub-page-metadata';

export const metadata = sportsHubPageMetadata('/sports-hub/coaching', 'Coaching Guides and Resources', 'Practical coaching guides for practice planning, player development, leadership, conditioning, recovery, and communication.');

export default function CoachingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
