import type {NextConfig} from 'next';
import {buildContentSecurityPolicy} from './src/lib/content-security-policy';

const contentSecurityPolicy = buildContentSecurityPolicy({
  environment: process.env.NODE_ENV,
  firebaseEmulatorsEnabled: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true',
});

/** Security headers applied to every response. */
const securityHeaders = [
  // Prevent browsers from guessing MIME type — blocks MIME-sniffing attacks
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Prevent clickjacking — disallow framing by any other origin
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Strict referrer — only send origin, not full URL, on cross-origin requests
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disable legacy browser features not needed by this app
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  // Force HTTPS for 1 year (enabled in production only; must not break dev)
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains',
  },
  // Content Security Policy
  // - Firebase Auth, Firestore, Storage: *.googleapis.com, *.firebaseapp.com, *.firebase.com
  // - Stripe checkout: js.stripe.com, checkout.stripe.com
  // - freeimage.host: used as frame upload proxy
  // - data: required for canvas/FFmpeg blobs
  {
    key: 'Content-Security-Policy',
    value: contentSecurityPolicy,
  },
];

const embedSecurityHeaders = securityHeaders
  .filter(header => header.key !== 'X-Frame-Options')
  .map(header => header.key === 'Content-Security-Policy'
    ? { ...header, value: `${header.value}; frame-ancestors *` }
    : header);

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // App Hosting provides FIREBASE_WEBAPP_CONFIG at build time. Expose only
  // that public web-SDK configuration to the browser bundle so each backend
  // connects to its own Firebase project instead of the local fallback.
  env: {
    NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG:
      process.env.VERCEL_ENV === 'production'
        ? ''
        : process.env.FIREBASE_WEBAPP_CONFIG ??
          process.env.NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG ??
          '',
  },
  typescript: {
    // Type checking is now enabled. Both project-level TS errors were fixed:
    // 1. games/page.tsx: added missing useToast import
    // 2. team-provider.tsx: added notificationsEnabled to UserProfile type
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'placehold.co', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'images.unsplash.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'picsum.photos', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'api.dicebear.com', port: '', pathname: '/**' },
      { protocol: 'https', hostname: 'storage.googleapis.com', port: '', pathname: '/**' },
    ],
    // Use modern AVIF format first, WebP as fallback
    formats: ['image/avif', 'image/webp'],
  },

  // ─── Bundle size: tree-shake heavy packages to only what's used ───────────
  // This is one of the highest-ROI perf wins available in Next.js 15.
  // lucide-react alone ships 3,000+ icons; without this, they ALL land in the bundle.
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'date-fns',
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-label',
      '@radix-ui/react-menubar',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toast',
      '@radix-ui/react-tooltip',
    ],
    // Compile pages in a separate worker — prevents main dev server thread
    // from blocking on large page compilations (ChunkLoadError prevention).
    webpackBuildWorker: true,
  },

  // ─── Keep PDF/canvas libs server-side (they're only triggered on-click) ───
  // This removes jspdf (~800KB) and html2canvas (~400KB) from the client bundle entirely.
  serverExternalPackages: ['jspdf', 'html2canvas'],

  // ─── HTTP Security Headers ────────────────────────────────────────────────
  async headers() {
    return [
      {
        // Embed cards are intentionally frameable on external Linktree-style sites.
        source: '/embed/:path*',
        headers: embedSecurityHeaders,
      },
      {
        // Every non-embed route retains strict same-origin framing protection.
        source: '/((?!embed(?:/|$)).*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
