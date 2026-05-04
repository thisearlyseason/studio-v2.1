import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
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
};

export default nextConfig;