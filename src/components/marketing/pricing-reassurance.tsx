import Link from 'next/link';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';

export function PricingReassurance() {
  return <div className="mx-auto mb-10 grid max-w-5xl gap-4 md:grid-cols-2">
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <h3 className="text-base font-bold text-white">Why choose Pro when free apps exist?</h3>
      <p className="mt-3 text-sm font-normal leading-relaxed text-white/65">Free may be enough for schedules and team chat. Pro adds digital waivers, auto-brackets, assigned-film tracking and dues through Stripe Connect. Choose it for the jobs your team needs; compare payment processing fees separately.</p>
      <Link href="/vs/teamlinkt" className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-red-400">Compare free and paid options <ArrowUpRight className="h-3.5 w-3.5" /></Link>
    </div>
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <h3 className="text-base font-bold text-white">Switch one squad first.</h3>
      <p className="mt-3 text-sm font-normal leading-relaxed text-white/65">Keep exports of your old roster, schedule and signed records. Set up one squad, check access with a coach and a family, then invite the rest of your club. No automatic import or migration deadline is promised.</p>
      <Link href="/how-to?q=create%20your%20squad" className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-red-400">Follow the setup guide <ArrowUpRight className="h-3.5 w-3.5" /></Link>
    </div>
  </div>;
}

export function YouthDataStatement() {
  return <aside id="youth-data" className="scroll-mt-28 mx-auto mt-12 max-w-4xl rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-white md:p-8" aria-labelledby="youth-data-title">
    <h3 id="youth-data-title" className="flex items-center gap-3 text-lg font-bold"><ShieldCheck className="h-5 w-5 shrink-0 text-red-400" />Your team’s information, explained.</h3>
    <p className="mt-4 text-sm font-normal leading-relaxed text-white/65">The Squad stores account details, rosters, schedules, uploaded files, registration answers, signed waivers and payment status to run your team. We do not sell personal information. Access depends on team roles and organizer permissions; public forms, schedules and shared profiles can be visible outside the team. Parents, guardians and organizers should manage youth information and obtain permission before publishing a child’s profile or media. Stripe processes payments; The Squad does not receive full card numbers entered into Stripe checkout.</p>
    <p className="mt-4 flex flex-wrap gap-5 text-xs font-semibold text-white/80"><Link href="/privacy" className="underline underline-offset-4">Read the privacy policy</Link><Link href="/safety" className="underline underline-offset-4">Youth access and safety tools</Link></p>
  </aside>;
}
