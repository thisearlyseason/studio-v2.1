import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'Squad Schedule App',
  description: 'Your team schedule and personal to-do list — works offline.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Squad Schedule',
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#7c3aed',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function ScheduleAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        margin: 0,
        padding: 0,
        minHeight: '100dvh',
        background: '#09090b',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      {children}
    </div>
  );
}
