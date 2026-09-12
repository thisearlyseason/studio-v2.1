import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';

export function SquadFooter() {
  return (
    <footer className="border-t bg-zinc-50 px-5 py-12 text-zinc-700 sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
        <Link href="/" aria-label="The Squad home"><BrandLogo variant="light-background" className="h-10 w-40" /></Link>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-4 text-sm font-semibold">
          <Link href="/sports">Explore Sports</Link>
          <Link href="/sports-hub">Sports Hub</Link>
          <Link href="/sports-hub/playbook?type=score-sheet">Branded Scoresheets</Link>
          <Link href="/how-to">How to Guide</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
        </nav>
        <p className="text-xs">© {new Date().getFullYear()} The Squad. All rights reserved.</p>
      </div>
    </footer>
  );
}
