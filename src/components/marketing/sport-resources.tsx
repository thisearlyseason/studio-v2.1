import Link from 'next/link';
import { Download, FileText } from 'lucide-react';
import catalog from '@/lib/score-sheet-catalog.json';
import { NewsletterSignup } from '@/components/sports-hub/NewsletterSignup';

export function SportResources({ sport }: { sport?: string }) {
  // Exact IDs only: do not advertise a different scoring format as a matching sheet.
  const sheet = catalog.find(item => item.id === sport);
  return (
    <>
      <section id="scoresheets" className="border-y border-red-100 bg-red-50/60 px-5 py-16 sm:px-8">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_1fr] lg:items-center">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-red-700">A special feature from The Squad</p>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">{sheet ? `${sheet.name} scoresheets. Ready for game day.` : 'Branded scoresheets. Ready for game day.'}</h2>
            <p className="mt-4 max-w-xl leading-7 text-zinc-700">Keep a paper record at the scorer’s table, on the bench, or beside the court. Our original printable packs include scoring grids and a scorer guide, with portrait and landscape options.</p>
            <p className="mt-3 text-sm leading-6 text-zinc-600">Free downloads. No account required. These are community worksheets, not official governing-body forms; check your competition’s requirements.</p>
          </div>
          <div className="rounded-2xl border border-red-100 bg-white p-6 shadow-sm sm:p-8">
            <FileText className="mb-4 h-8 w-8 text-red-700" aria-hidden="true" />
            {sheet ? (
              <>
                <h3 className="text-xl font-bold">The Squad {sheet.name} pack</h3>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <a href={`/downloads/score-sheets/the-squad-${sheet.id}-portrait.pdf`} download className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-red-700 px-5 text-sm font-bold text-white"><Download className="h-4 w-4" aria-hidden="true" />Portrait PDF</a>
                  <a href={`/downloads/score-sheets/the-squad-${sheet.id}.pdf`} download className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-zinc-300 px-5 text-sm font-bold"><Download className="h-4 w-4" aria-hidden="true" />Landscape PDF</a>
                </div>
                <Link href={`/sports-hub/resources/score-sheet-${sheet.id}`} className="mt-5 block text-sm font-semibold underline underline-offset-4">Read the scoring guide</Link>
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold">Choose a pack for your sport</h3>
                <p className="mt-3 text-sm leading-6 text-zinc-600">Browse the available sports and scoring formats. A dedicated sheet is not available for every sport yet.</p>
              </>
            )}
            <Link href="/sports-hub/playbook?type=score-sheet" className="mt-5 block text-sm font-bold text-red-700 underline underline-offset-4">Explore all branded scoresheets</Link>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8"><NewsletterSignup /></div>
    </>
  );
}
