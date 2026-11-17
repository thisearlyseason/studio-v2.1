import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { absolute: 'Sports Community Safety | The Squad' },
  description: 'Learn about membership controls, team communication, parental oversight and reporting tools that help families and organizers use The Squad safely.',
  alternates: { canonical: '/safety' },
};

export default function SafetyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
