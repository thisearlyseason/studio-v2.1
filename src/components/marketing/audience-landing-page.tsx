import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  ClipboardCheck,
  CreditCard,
  MapPinned,
  Megaphone,
  MessageCircle,
  PlayCircle,
  ShieldCheck,
  Trophy,
  Users,
  Video,
} from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import type { AudienceLanding } from '@/lib/audience-landing';

const ICONS = {
  calendar: CalendarDays,
  chat: MessageCircle,
  users: Users,
  shield: ShieldCheck,
  video: Video,
  book: BookOpen,
  trophy: Trophy,
  building: Building2,
  payments: CreditCard,
  clipboard: ClipboardCheck,
  map: MapPinned,
  megaphone: Megaphone,
};

export function AudienceLandingPage({ landing }: { landing: AudienceLanding }) {
  return (
    <main className="min-h-screen overflow-hidden bg-[#f5f4f1] text-black selection:bg-primary/20">
      <header className="relative z-30 border-b border-black/10 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="The Squad home">
            <BrandLogo variant="light-background" className="h-9 w-36 sm:w-40" priority />
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link href="/login" className="hidden text-xs font-black uppercase tracking-[0.16em] text-zinc-600 transition hover:text-primary sm:block">
              Log in
            </Link>
            <Link href={landing.primaryHref} className="rounded-full bg-primary px-5 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-primary/20 transition hover:-translate-y-0.5 sm:px-7">
              {landing.primaryCta}
            </Link>
          </div>
        </div>
      </header>

      <section className="relative isolate overflow-hidden bg-black text-white">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_78%_24%,rgba(211,28,32,0.42),transparent_34%),radial-gradient(circle_at_18%_90%,rgba(211,28,32,0.18),transparent_30%)]" />
        <div className="absolute inset-0 -z-10 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:52px_52px]" />
        <div className="mx-auto grid min-h-[720px] max-w-7xl items-center gap-16 px-5 py-20 sm:px-8 lg:grid-cols-[1.1fr_.9fr] lg:py-28">
          <div>
            <div className="mb-7 inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-white/80">
              <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_18px_rgba(211,28,32,.9)]" />
              {landing.eyebrow}
            </div>
            <h1 className="max-w-4xl text-5xl font-black uppercase leading-[0.91] tracking-[-0.055em] sm:text-7xl lg:text-[5.7rem]">
              {landing.headline}{' '}
              <span className="text-primary">{landing.accent}</span>
            </h1>
            <p className="mt-8 max-w-2xl text-base font-medium leading-8 text-white/65 sm:text-xl">
              {landing.description}
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Link href={landing.primaryHref} className="group inline-flex min-h-14 items-center justify-center rounded-full bg-primary px-8 text-xs font-black uppercase tracking-[0.16em] text-white shadow-2xl shadow-primary/25 transition hover:-translate-y-1">
                {landing.primaryCta}<ArrowRight className="ml-3 h-4 w-4 transition group-hover:translate-x-1" />
              </Link>
              <Link href={landing.secondaryHref} className="inline-flex min-h-14 items-center justify-center rounded-full border border-white/25 bg-white/5 px-8 text-xs font-black uppercase tracking-[0.16em] text-white transition hover:bg-white hover:text-black">
                {landing.secondaryCta}
              </Link>
            </div>
            <p className="mt-6 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
              <ShieldCheck className="h-4 w-4 text-primary" /> Canadian-built sports operations platform
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-xl">
            <div className="absolute -inset-5 rotate-3 rounded-[44px] border border-primary/40 bg-primary/10" />
            <div
              data-testid="campaign-hero-photo"
              className="relative aspect-[16/10] overflow-hidden rounded-[38px] border border-white/15 bg-zinc-900 shadow-[0_35px_90px_rgba(0,0,0,.55)]"
            >
              <Image
                src={`/images/campaigns/${landing.slug}-hero.webp`}
                alt={`${landing.audience} using a coordinated community sports environment`}
                fill
                priority
                sizes="(max-width: 1024px) 92vw, 560px"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/5 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-6 text-white sm:p-8">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.28em] text-primary">Built for your side of sport</p>
                  <p className="mt-2 max-w-sm text-xl font-black uppercase leading-tight tracking-tight sm:text-2xl">{landing.audience}</p>
                </div>
                <span className="hidden rounded-full border border-white/25 bg-black/35 px-4 py-2 text-[8px] font-black uppercase tracking-[0.2em] backdrop-blur sm:block">
                  Canadian sport
                </span>
              </div>
            </div>
            <div
              data-testid="campaign-operating-card"
              className="relative z-10 mx-3 mt-5 overflow-hidden rounded-[32px] border border-black/10 bg-white p-5 text-black shadow-[0_28px_70px_rgba(0,0,0,.5)] sm:mx-5 sm:mt-6 sm:p-7"
            >
              <div className="flex items-center justify-between border-b border-black/10 pb-5">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.26em] text-primary">Live operating view</p>
                  <h2 className="mt-1 text-2xl font-black uppercase tracking-tight">{landing.boardTitle}</h2>
                </div>
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-black text-white"><PlayCircle className="h-6 w-6" /></span>
              </div>
              <div className="mt-5 space-y-3">
                {landing.boardItems.map((item, index) => (
                  <div key={item} className="flex items-center gap-4 rounded-2xl border border-black/5 bg-zinc-100 px-4 py-4">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-[10px] font-black text-white">0{index + 1}</span>
                    <span className="text-sm font-black uppercase tracking-tight">{item}</span>
                    <Check className="ml-auto h-4 w-4 text-primary" />
                  </div>
                ))}
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                {landing.outcomes.map(outcome => (
                  <div key={outcome.label} className="rounded-2xl bg-black p-3 text-white sm:p-4">
                    <p className="text-sm font-black uppercase text-primary sm:text-base">{outcome.value}</p>
                    <p className="mt-1 text-[8px] font-bold uppercase leading-4 tracking-wider text-white/45">{outcome.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-black/10 bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-primary">The operational problem</p>
          <h2 className="mt-4 max-w-4xl text-4xl font-black uppercase leading-[0.95] tracking-[-0.04em] sm:text-6xl">{landing.problemTitle}</h2>
          <div className="mt-12 grid gap-px overflow-hidden rounded-[32px] border border-black/10 bg-black/10 md:grid-cols-3">
            {landing.problems.map((problem, index) => (
              <article key={problem.title} className="bg-white p-7 sm:p-9">
                <p className="text-5xl font-black tracking-tighter text-zinc-200">0{index + 1}</p>
                <h3 className="mt-6 text-xl font-black uppercase tracking-tight">{problem.title}</h3>
                <p className="mt-3 text-sm font-medium leading-7 text-zinc-600">{problem.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="max-w-3xl">
            <p className="text-[10px] font-black uppercase tracking-[0.26em] text-primary">What changes with The Squad</p>
            <h2 className="mt-4 text-4xl font-black uppercase leading-[0.95] tracking-[-0.04em] sm:text-6xl">{landing.featureTitle}</h2>
            <p className="mt-6 text-lg font-medium leading-8 text-zinc-600">{landing.featureIntro}</p>
          </div>
          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {landing.features.map(feature => {
              const Icon = ICONS[feature.icon];
              return (
                <article key={feature.title} className="group rounded-[30px] border border-black/10 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-white">
                    <Icon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-7 text-xl font-black uppercase tracking-tight">{feature.title}</h3>
                  <p className="mt-3 text-sm font-medium leading-7 text-zinc-600">{feature.description}</p>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-primary py-16 text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 sm:px-8 md:grid-cols-3">
          {landing.outcomes.map(outcome => (
            <div key={outcome.label} className="border-l border-white/30 pl-6">
              <p className="text-4xl font-black uppercase tracking-tight sm:text-5xl">{outcome.value}</p>
              <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-white/65">{outcome.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid gap-12 lg:grid-cols-[.7fr_1.3fr]">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.26em] text-primary">A practical rollout</p>
              <h2 className="mt-4 text-4xl font-black uppercase leading-[0.95] tracking-[-0.04em] sm:text-6xl">Set up once. Operate clearly.</h2>
            </div>
            <div className="space-y-3">
              {landing.steps.map(step => (
                <article key={step.number} className="grid gap-4 rounded-[28px] border border-black/10 p-6 sm:grid-cols-[72px_1fr] sm:p-8">
                  <span className="text-4xl font-black tracking-tighter text-primary">{step.number}</span>
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-tight">{step.title}</h3>
                    <p className="mt-2 text-sm font-medium leading-7 text-zinc-600">{step.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-black py-20 text-white sm:py-28">
        <div className="absolute right-[-8rem] top-[-10rem] h-96 w-96 rounded-full bg-primary/30 blur-3xl" />
        <div className="relative mx-auto max-w-5xl px-5 text-center sm:px-8">
          <p className="text-[10px] font-black uppercase tracking-[0.26em] text-primary">{landing.audience}</p>
          <h2 className="mt-5 text-4xl font-black uppercase leading-[0.95] tracking-[-0.045em] sm:text-7xl">{landing.finalTitle}</h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg font-medium leading-8 text-white/60">{landing.finalDescription}</p>
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href={landing.primaryHref} className="inline-flex min-h-14 items-center justify-center rounded-full bg-primary px-9 text-xs font-black uppercase tracking-[0.16em] text-white">
              {landing.primaryCta}<ArrowRight className="ml-3 h-4 w-4" />
            </Link>
            <Link href="/" className="inline-flex min-h-14 items-center justify-center rounded-full border border-white/25 px-9 text-xs font-black uppercase tracking-[0.16em] text-white hover:bg-white hover:text-black">
              Visit The Squad
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-black/10 bg-white py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-5 sm:flex-row sm:px-8">
          <BrandLogo variant="light-background" className="h-8 w-32" />
          <div className="flex flex-wrap justify-center gap-5 text-[10px] font-black uppercase tracking-[0.16em] text-zinc-500">
            <Link href="/privacy" className="hover:text-primary">Privacy</Link>
            <Link href="/terms" className="hover:text-primary">Terms</Link>
            <Link href="/sports-hub" className="hover:text-primary">Sports Hub</Link>
            <Link href="/sports" className="hover:text-primary">Sports</Link>
            <Link href="/pricing" className="hover:text-primary">Pricing</Link>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Built in Canada</p>
        </div>
      </footer>
    </main>
  );
}
