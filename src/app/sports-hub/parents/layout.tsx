import { sportsHubPageMetadata } from '@/lib/sports-hub-page-metadata';

export const metadata = sportsHubPageMetadata('/sports-hub/parents', 'Youth Sports Guides for Parents', 'Practical guidance for sports parents on athlete wellbeing, communication, development, safety, nutrition, and team life.');

export default function ParentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
