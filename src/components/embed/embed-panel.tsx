'use client';

import { FormEvent, useState } from 'react';
import { ArrowRight, BookOpen, HeartHandshake, LayoutDashboard, Loader2, Mail, UserPlus } from 'lucide-react';
import Image from 'next/image';

type EmbedMode = 'newsletter' | 'signup' | 'sports-hub' | 'squad-hub' | 'links';

const links = [
  { mode: 'signup', title: 'Create Your Account', description: 'Build your squad and start organizing today.', href: '/signup', Icon: UserPlus },
  { mode: 'squad-hub', title: 'Open Squad Hub', description: 'Sign in and go directly to your team dashboard.', href: '/dashboard', Icon: LayoutDashboard },
  { mode: 'sports-hub', title: 'Explore Sports Hub', description: 'Coaching resources, news, templates, and playbooks.', href: '/sports-hub', Icon: BookOpen },
  { mode: 'parent-referral', title: 'Refer Your Coach', description: 'Send your coach a friendly introduction to The Squad.', href: '/refer-a-coach', Icon: HeartHandshake },
] as const;

export function EmbedPanel({ mode }: { mode: EmbedMode }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const subscribe = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, source: 'landing_page' }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to subscribe.');
      setName('');
      setEmail('');
      setMessage('You are subscribed. Check your inbox for your welcome email.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to subscribe.');
    } finally {
      setLoading(false);
    }
  };

  const newsletter = (
    <section className="rounded-[28px] border border-white/40 bg-white/95 p-6 shadow-2xl backdrop-blur-sm sm:p-8">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white"><Mail className="h-6 w-6" /></div>
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">Stay in the game</p>
      <h1 className="mt-2 text-3xl font-black uppercase tracking-tight">Join The Squad Newsletter</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-600">Sports insights, product news, and practical resources delivered to your inbox.</p>
      <form onSubmit={subscribe} className="mt-6 space-y-3">
        <label className="block"><span className="sr-only">Name</span><input value={name} onChange={event => setName(event.target.value)} maxLength={120} placeholder="Your name" className="h-12 w-full rounded-xl border border-zinc-300 px-4 outline-none focus:border-primary" /></label>
        <label className="block"><span className="sr-only">Email</span><input required type="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} placeholder="you@example.com" className="h-12 w-full rounded-xl border border-zinc-300 px-4 outline-none focus:border-primary" /></label>
        <button disabled={loading} className="flex h-12 w-full items-center justify-center rounded-xl bg-primary px-5 text-sm font-black uppercase tracking-wider text-white disabled:opacity-60">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Subscribe <ArrowRight className="ml-2 h-4 w-4" /></>}
        </button>
      </form>
      {message && <p role="status" className="mt-4 text-sm font-bold text-zinc-700">{message}</p>}
      <p className="mt-4 text-[10px] leading-4 text-zinc-500">Unsubscribe easily from any email.</p>
    </section>
  );

  if (mode === 'newsletter') return newsletter;
  if (mode === 'links') {
    return (
      <div className="space-y-4">
        <div className="pb-4 text-center text-white">
          <Image
            src="/images/embed/the-squad-logo.png"
            alt="The Squad"
            width={2304}
            height={1440}
            priority
            className="mx-auto h-auto w-full max-w-[390px] drop-shadow-[0_12px_24px_rgba(0,0,0,0.65)]"
          />
          <h1 className="mt-2 text-3xl font-black uppercase tracking-tight drop-shadow-lg sm:text-4xl">Everything your team needs.</h1>
        </div>
        {links.map(({ title, description, href, Icon }) => <LinkCard key={href} title={title} description={description} href={href} Icon={Icon} />)}
        {newsletter}
      </div>
    );
  }
  const selected = links.find(link => link.mode === mode)!;
  return <LinkCard title={selected.title} description={selected.description} href={selected.href} Icon={selected.Icon} />;
}

function LinkCard({ title, description, href, Icon }: { title: string; description: string; href: string; Icon: typeof UserPlus }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="group flex items-center gap-4 rounded-[28px] border border-white/40 bg-white/95 p-6 shadow-2xl backdrop-blur-sm transition hover:-translate-y-0.5 hover:border-primary">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-7 w-7" /></span>
      <span className="min-w-0 flex-1"><span className="block text-lg font-black uppercase tracking-tight">{title}</span><span className="mt-1 block text-sm leading-5 text-zinc-600">{description}</span></span>
      <ArrowRight className="h-5 w-5 shrink-0 transition group-hover:translate-x-1" />
    </a>
  );
}
