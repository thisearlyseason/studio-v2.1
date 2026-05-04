import type {Metadata} from 'next';
import './globals.css';
import { Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { TeamProvider } from '@/components/providers/team-provider';
import { TooltipProvider } from "@/components/ui/tooltip";

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
        {/* Font: preconnect for handshake, display=optional avoids render-blocking */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=optional" rel="stylesheet" />
        {/* DNS prefetch for Firebase services — resolves hostnames before JS fires */}
        <link rel="dns-prefetch" href="https://firestore.googleapis.com" />
        <link rel="dns-prefetch" href="https://identitytoolkit.googleapis.com" />
        <link rel="dns-prefetch" href="https://storage.googleapis.com" />
        <link rel="preconnect" href="https://storage.googleapis.com" />
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            const isPanic = (m) => m && (m.includes('INTERNAL ASSERTION FAILED') || m.includes('ca9') || m.includes('b815') || m.includes('ve: -1'));
            const suppress = (e) => {
              const msg = e.message || (e.error && e.error.message) || (e.reason && e.reason.message) || "";
              if (isPanic(msg)) {
                if (e.stopImmediatePropagation) e.stopImmediatePropagation();
                if (e.stopPropagation) e.stopPropagation();
                e.preventDefault();
                console.warn('[System] Suppressed SDK Panic:', msg.slice(0, 50));
                return true;
              }
            };
            window.addEventListener('error', suppress, true);
            window.addEventListener('unhandledrejection', suppress, true);
            const origErr = console.error;
            console.error = function() {
              const msg = (arguments[0] || "").toString();
              if (isPanic(msg)) return;
              origErr.apply(console, arguments);
            };
          })();
        `}} />
      </head>
      <body className="font-body antialiased min-h-screen bg-background text-foreground selection:bg-primary/20" suppressHydrationWarning>
        <FirebaseClientProvider>
          <Suspense fallback={null}>
            <TooltipProvider delayDuration={0}>
              <TeamProvider>
                {children}
                <Toaster />
              </TeamProvider>
            </TooltipProvider>
          </Suspense>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}

