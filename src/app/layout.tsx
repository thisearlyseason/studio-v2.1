import type {Metadata} from 'next';
import './globals.css';
import { Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { TeamProvider } from '@/components/providers/team-provider';

export const metadata: Metadata = {
  title: 'The Squad - Ultimate Team Hub',
  description: 'Unite your team and coordinate like pros with The Squad.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased min-h-screen bg-background text-foreground selection:bg-primary/20" suppressHydrationWarning>
        <FirebaseClientProvider>
          <Suspense fallback={null}>
            <TeamProvider>
              {children}
              <Toaster />
            </TeamProvider>
          </Suspense>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
