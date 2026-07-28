import type { Metadata } from 'next';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function EmbedLayout({ children }: { children: React.ReactNode }) {
  return (
    <main
      className="relative min-h-screen bg-cover bg-center bg-fixed p-4 text-zinc-950 sm:p-8"
      style={{ backgroundImage: "url('/images/embed/grass-background.webp')" }}
    >
      <div className="pointer-events-none absolute inset-0 bg-black/45" aria-hidden="true" />
      <div className="relative z-10 mx-auto max-w-xl">{children}</div>
    </main>
  );
}
