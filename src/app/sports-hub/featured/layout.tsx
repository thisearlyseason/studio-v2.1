import { sportsHubPageMetadata } from '@/lib/sports-hub-page-metadata';

export const metadata = sportsHubPageMetadata('/sports-hub/featured', 'Featured Sports Guides', 'Read hand-picked sports management, coaching, youth development, performance, and tournament guides from The Squad.');

export default function FeaturedLayout({ children }: { children: React.ReactNode }) {
  return children;
}
