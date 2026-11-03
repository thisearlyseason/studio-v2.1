import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Suspense } from 'react';
import { SquadPageBoundary } from '@/components/squad-pages/route-boundary';
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { TooltipProvider } from "@/components/ui/tooltip";

// Private and utility routes are excluded unless a public page opts in.
export const metadata: Metadata = {
  metadataBase: new URL('https://www.thesquad.pro'),
  title: { default: 'The Squad: Sports Team Management', template: '%s | The Squad' },
  description: 'Sports team management for coaches, athletes and families. Organize rosters, schedules, team conversations and competitions with The Squad.',
  robots: { index: false, follow: true },
  icons: { icon: [{ url: '/app-icon-192-v5.png', type: 'image/png', sizes: '192x192' }, { url: '/app-icon-512-v5.png', type: 'image/png', sizes: '512x512' }], apple: [{ url: '/app-icon-192-v5.png', sizes: '192x192', type: 'image/png' }], shortcut: '/app-icon-192-v5.png' },
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'The Squad' },
};

// Separate viewport export (Next.js 14+ requirement)
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Font: preconnect for handshake, display=swap for CLS optimization */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

        {/* DNS prefetch for Firebase services */}
        <link rel="dns-prefetch" href="https://firestore.googleapis.com" />
        <link rel="dns-prefetch" href="https://identitytoolkit.googleapis.com" />
        <link rel="dns-prefetch" href="https://storage.googleapis.com" />
        <link rel="preconnect" href="https://storage.googleapis.com" />

      </head>
      <body className="font-body antialiased min-h-screen bg-background text-foreground selection:bg-primary/20" suppressHydrationWarning>
        <FirebaseClientProvider>
          <Suspense fallback={null}>
            <TooltipProvider delayDuration={0}>
              <SquadPageBoundary>
                {children}
              </SquadPageBoundary>
            </TooltipProvider>
          </Suspense>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
