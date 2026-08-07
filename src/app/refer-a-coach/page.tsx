'use client';

import { FormEvent, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, Mail, ShieldCheck, Users } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';

export default function ReferACoachPage() {
  const [parentName, setParentName] = useState('');
  const [coachName, setCoachName] = useState('');
  const [coachEmail, setCoachEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const submissionId = useRef('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      if (!submissionId.current) submissionId.current = crypto.randomUUID();
      const response = await fetch('/api/referrals/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentName: parentName.trim(),
          coachName: coachName.trim(),
          coachEmail: coachEmail.trim().toLowerCase(),
          website,
          submissionId: submissionId.current,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Unable to send the referral.');
      setSent(true);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to send the referral.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#f5f4f1] text-black">
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="The Squad home"><BrandLogo variant="light-background" className="h-9 w-36" priority /></Link>
          <Link href="/embed/links" className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500 hover:text-primary">
            <ArrowLeft className="h-4 w-4" /> Back to links
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 sm:py-20 lg:grid-cols-[.85fr_1.15fr]">
        <section className="relative overflow-hidden rounded-[36px] bg-black p-8 text-white sm:p-12">
          <div className="absolute -right-20 -top-20 h-72 w-72 rounded-full bg-primary/35 blur-3xl" />
          <div className="relative">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary"><Users className="h-7 w-7" /></span>
            <p className="mt-10 text-[10px] font-black uppercase tracking-[0.26em] text-primary">Parent referral</p>
            <h1 className="mt-4 text-5xl font-black uppercase leading-[0.92] tracking-[-0.05em] sm:text-6xl">Think your team could use less chaos?</h1>
            <p className="mt-6 text-base font-medium leading-8 text-white/65">Send your coach a friendly introduction to The Squad. We will send the exact message shown here—nothing else.</p>
            <div className="mt-10 space-y-4 border-t border-white/15 pt-8">
              <p className="flex items-start gap-3 text-sm font-bold text-white/75"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /> One-time referral only. The coach is not subscribed to marketing.</p>
              <p className="flex items-start gap-3 text-sm font-bold text-white/75"><Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" /> The email content is fixed and cannot be changed into a general message.</p>
            </div>
          </div>
        </section>

        <section className="rounded-[36px] border border-black/10 bg-white p-6 shadow-xl sm:p-10">
          {sent ? (
            <div className="flex min-h-[560px] flex-col items-center justify-center text-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-700"><CheckCircle2 className="h-10 w-10" /></span>
              <h2 className="mt-7 text-3xl font-black uppercase tracking-tight">Referral sent</h2>
              <p className="mt-3 max-w-md text-sm font-medium leading-7 text-zinc-600">The introduction was sent to {coachName}. Thanks for helping your team discover a simpler way to stay organized.</p>
              <Link href="/for/parents" className="mt-8 inline-flex h-12 items-center rounded-full bg-black px-7 text-[10px] font-black uppercase tracking-[0.16em] text-white">
                Parent Resources <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </div>
          ) : (
            <>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-primary">Send the introduction</p>
                <h2 className="mt-3 text-3xl font-black uppercase tracking-tight">Refer your coach</h2>
                <p className="mt-2 text-sm font-medium leading-6 text-zinc-600">Enter only your name and your coach’s contact details.</p>
              </div>
              <form onSubmit={submit} className="mt-8 space-y-5">
                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em]">Your name</span>
                  <input required maxLength={120} autoComplete="name" value={parentName} onChange={event => setParentName(event.target.value)} placeholder="Parent or guardian name" className="h-14 w-full rounded-2xl border-2 border-zinc-200 px-4 font-bold outline-none transition focus:border-primary" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em]">Coach’s name</span>
                  <input required maxLength={120} autoComplete="off" value={coachName} onChange={event => setCoachName(event.target.value)} placeholder="Coach’s full name" className="h-14 w-full rounded-2xl border-2 border-zinc-200 px-4 font-bold outline-none transition focus:border-primary" />
                </label>
                <label className="block">
                  <span className="mb-2 block text-[10px] font-black uppercase tracking-[0.16em]">Coach’s email</span>
                  <input required type="email" maxLength={254} autoComplete="email" value={coachEmail} onChange={event => setCoachEmail(event.target.value)} placeholder="coach@example.com" className="h-14 w-full rounded-2xl border-2 border-zinc-200 px-4 font-bold outline-none transition focus:border-primary" />
                </label>
                <label className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
                  Website
                  <input tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} />
                </label>
                {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}
                <button disabled={loading || !parentName.trim() || !coachName.trim() || !coachEmail.trim()} className="flex h-14 w-full items-center justify-center rounded-2xl bg-primary px-6 text-xs font-black uppercase tracking-[0.16em] text-white shadow-xl shadow-primary/20 disabled:cursor-not-allowed disabled:opacity-50">
                  {loading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Sending referral</> : <>Send to coach <ArrowRight className="ml-2 h-4 w-4" /></>}
                </button>
              </form>

              <details className="mt-8 rounded-2xl bg-zinc-100 p-5">
                <summary className="cursor-pointer text-[10px] font-black uppercase tracking-[0.16em]">Preview the exact email</summary>
                <div className="mt-5 whitespace-pre-line text-sm leading-7 text-zinc-700">
                  {`Subject: Thought this might be helpful for our team

Hi ${coachName || '[Coach’s Name]'},

I found a team app called The Squad and thought it might be worth a look for our team.

It keeps schedules, updates, messages, videos, drills, playbooks, and other team info in one place, which could make things a little easier than keeping track of group chats and emails.

No pressure at all—I just thought I’d pass it along in case it could help.

You can check it out at thesquad.pro.

Thanks!

${parentName || '[Parent’s Name]'}`}
                </div>
              </details>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
