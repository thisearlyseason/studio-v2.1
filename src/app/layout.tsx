import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { FirebaseClientProvider } from '@/firebase/client-provider';
import { TeamProvider } from '@/components/providers/team-provider';
import { TooltipProvider } from "@/components/ui/tooltip";
import BugReporter from '@/components/BugReporter';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/react';

// ─── SEO Metadata ────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  metadataBase: new URL('https://thesquad.pro'),

  title: {
    default: 'The Squad — Elite Sports Team Management Platform',
    template: '%s | The Squad',
  },

  description:
    'The all-in-one institutional platform for coaches, athletic directors, and club organizers. Manage rosters, automate tournament brackets, track film compliance, and recruit athletes — all in one tactical hub. Built for serious sports programs.',

  keywords: [
    // Core product
    'sports team management software',
    'athletic director software',
    'team management platform',
    'sports organization hub',
    'the squad app',
    // Use cases
    'tournament bracket generator',
    'team scheduling software',
    'athlete recruiting portfolio',
    'sports roster management',
    'film compliance tracking',
    'sports team communication',
    // Personas
    'coach management tool',
    'club organizer software',
    'youth sports platform',
    'high school sports management',
    'elite sports program',
    'school athletic software',
    // Competitive SEO
    'team management app for coaches',
    'sports saas platform',
    'sports operations software',
    'athletic program management',
    'student athlete platform',
    'sports team app',
  ],

  authors: [{ name: 'The Squad', url: 'https://thesquad.pro' }],
  creator: 'The Squad',
  publisher: 'The Squad',

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  alternates: {
    canonical: 'https://thesquad.pro',
  },

  // ── Open Graph ──────────────────────────────────────────────────────────────
  openGraph: {
    type: 'website',
    url: 'https://thesquad.pro',
    title: 'The Squad — Elite Sports Team Management Platform',
    description:
      'Coordinate rosters, automate brackets, verify film compliance, and recruit athletes — the all-in-one institutional sports hub trusted by coaches, ADs, and club organizers.',
    siteName: 'The Squad',
    locale: 'en_US',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'The Squad — Elite Sports Team Management Platform',
        type: 'image/png',
      },
    ],
  },

  // ── Twitter / X Card ────────────────────────────────────────────────────────
  twitter: {
    card: 'summary_large_image',
    site: '@TheSquadPro',
    creator: '@TheSquadPro',
    title: 'The Squad — Elite Sports Team Management Platform',
    description:
      'The all-in-one platform for elite sports organizations. Rosters, brackets, film compliance, and recruiting — all in one tactical hub.',
    images: [{ url: '/og-image.png', alt: 'The Squad — Elite Sports Team Management' }],
  },

  // ── Icons ───────────────────────────────────────────────────────────────────
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/favicon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/favicon-192.png', sizes: '192x192', type: 'image/png' }],
    shortcut: '/favicon.ico',
  },

  // ── App Manifest ────────────────────────────────────────────────────────────
  manifest: '/manifest.json',

  // ── Verification (add tokens when available) ─────────────────────────────────
  // verification: { google: 'YOUR_GOOGLE_SITE_VERIFICATION_TOKEN' },

  // ── Additional meta ─────────────────────────────────────────────────────────
  category: 'Sports Technology',
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

// ─── Structured Data ─────────────────────────────────────────────────────────
const organizationSchema = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: 'The Squad',
  url: 'https://thesquad.pro',
  logo: 'https://thesquad.pro/favicon-512.png',
  contactPoint: {
    '@type': 'ContactPoint',
    email: 'teams@thesquad.pro',
    contactType: 'customer support',
    availableLanguage: 'English',
  },
  sameAs: [],
};

const softwareSchema = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'The Squad',
  applicationCategory: 'SportsApplication',
  operatingSystem: 'Web, iOS, Android',
  url: 'https://thesquad.pro',
  description:
    'The all-in-one institutional platform for elite sports organizations. Manage rosters, automate tournament brackets, verify film compliance, and recruit athletes.',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    description: 'Free tier available with paid plans for advanced features',
  },
  provider: {
    '@type': 'Organization',
    name: 'The Squad',
    url: 'https://thesquad.pro',
  },
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

        {/* Structured Data — Organization */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        {/* Structured Data — SoftwareApplication */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
        />
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
            n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)
            }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '123960649001817');
            fbq('track', 'PageView');
          `}
        </Script>
      </head>
      <body className="font-body antialiased min-h-screen bg-background text-foreground selection:bg-primary/20" suppressHydrationWarning>
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: 'none' }}
            src="https://www.facebook.com/tr?id=123960649001817&ev=PageView&noscript=1"
            alt=""
          />
        </noscript>
        <FirebaseClientProvider>
          <Suspense fallback={null}>
            <TooltipProvider delayDuration={0}>
              <TeamProvider>
                {children}
                <BugReporter />
                <Toaster />
                <Analytics />
              </TeamProvider>
            </TooltipProvider>
          </Suspense>
        </FirebaseClientProvider>
      </body>
    </html>
  );
}
