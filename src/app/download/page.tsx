import type { Metadata } from 'next';
import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';
import { Smartphone, Monitor, ArrowUpRight } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Sports Team Management App for Phones & Web',
  description: 'Use The Squad team management app in your browser on a phone, tablet or computer. Keep schedules, team chat, waivers and dues together.',
  alternates: { canonical: 'https://www.thesquad.pro/download' },
};
const questions = [
  { question: 'Is The Squad only for coaches?', answer: 'No. Coaches and team managers run the squad; parents and guardians follow their children’s schedules, waivers and dues; athletes see their team schedule and assigned activities. Clubs, leagues and schools have organization tools on the relevant plans.' },
  { question: 'Can I use The Squad on iPhone, iPad or Android?', answer: 'Yes. The web app works in a browser on phones, tablets and computers. Open thesquad.pro, sign in and use your existing account.' },
  { question: 'How do I add the web app to my home screen?', answer: 'Open thesquad.pro in your browser and choose Install The Squad in the homepage navigation or mobile menu. If your browser supports installation, follow its prompt. Otherwise, the button shows instructions for your device.' },
  { question: 'Do I need a new account for each device?', answer: 'No. Sign in with the same account to access the teams you belong to. A parent or guardian can manage linked children from their family workspace.' },
  { question: 'Can I start free?', answer: 'Starter is a free plan for a team’s schedules, chat and score tracking. Paid plans add Pro tools. Review the plan comparison and current billing prices before subscribing.' },
];
export default function DownloadPage() {
  const faqSchema = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: questions.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) };
  return <main className="min-h-screen bg-[#f6f5f2]">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, '\\u003c') }} />
    <header className="container mx-auto px-6 py-8"><Link href="/" aria-label="The Squad home"><BrandLogo variant="light-background" className="h-10 w-40" /></Link></header>
    <section className="container mx-auto max-w-5xl px-6 py-14 md:py-20">
      <p className="mb-5 text-xs font-black uppercase tracking-[0.2em] text-primary">Phone. Tablet. Computer.</p>
      <h1 className="max-w-3xl text-5xl font-black tracking-tight md:text-7xl">Your team,<br />wherever you are.</h1>
      <p className="mt-6 max-w-xl text-lg font-medium leading-relaxed text-muted-foreground">Open The Squad in your browser. Keep the season calendar, team chat, waivers and dues with you on the sideline or at your desk.</p>
      <div className="mt-8 flex flex-wrap gap-4"><Link href="/login" className="inline-flex items-center gap-3 rounded-full bg-primary px-7 py-4 text-sm font-bold text-white">Open The Squad <ArrowUpRight className="h-4 w-4" /></Link><Link href="/signup" className="rounded-full border border-black/15 px-7 py-4 text-sm font-bold">Create a web account</Link></div>
      <div className="mt-14 grid gap-5 md:grid-cols-2">{[{ Icon: Smartphone, title: 'On your phone or tablet', text: 'Use the web app in your browser. The Install The Squad button on the homepage provides the installation steps for your device.' }, { Icon: Monitor, title: 'On your computer', text: 'Sign in to the same account to work with schedules, rosters, forms and competitions on a larger screen.' }].map(({ Icon, title, text }) => <div key={title} className="rounded-3xl border border-black/5 bg-white p-8"><Icon className="mb-5 h-7 w-7 text-primary" /><h2 className="text-xl font-bold">{title}</h2><p className="mt-3 text-sm font-normal leading-relaxed text-muted-foreground">{text}</p></div>)}</div>
    </section>
    <section className="container mx-auto max-w-4xl px-6 pb-20"><h2 className="mb-6 text-3xl font-black">Before you get started</h2><div className="divide-y divide-black/10">{questions.map(item => <details key={item.question} className="py-5"><summary className="cursor-pointer font-bold">{item.question}</summary><p className="mt-3 text-sm font-normal leading-relaxed text-muted-foreground">{item.answer}</p></details>)}</div><p className="mt-6 flex flex-wrap gap-5 text-sm"><Link href="/plans" className="underline">Compare plans</Link><Link href="/how-to" className="underline">Setup guide</Link><Link href="/privacy" className="underline">Privacy policy</Link></p></section>
  </main>;
}
