'use client';

import React, { useState } from 'react';
import { Mail, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function NewsletterSignup({ className }: { className?: string }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/sports-hub/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Subscription failed');
      setSuccess(true);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={cn('relative overflow-hidden rounded-3xl hero-gradient p-8 md:p-12', className)}>
      <div className="absolute inset-0 grid-beam opacity-30 pointer-events-none" aria-hidden />
      <div className="relative z-10 max-w-2xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 bg-white/20 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-4">
          <Mail className="h-3 w-3" />
          Sports Hub Newsletter
        </div>
        <h2 className="text-3xl md:text-4xl font-black tracking-tighter text-white mb-3">
          Stay Ahead of the Game
        </h2>
        <p className="text-white/70 font-medium text-sm md:text-base mb-8 leading-relaxed">
          Coaching tips, drills, resources, and product updates — delivered to your inbox weekly.
        </p>
        {success ? (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle2 className="h-12 w-12 text-white" />
            <p className="text-white font-black uppercase tracking-widest text-sm">You&apos;re in! Welcome to The Squad.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto">
            <Input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-12 bg-white/10 border-white/20 text-white placeholder:text-white/50 font-medium flex-1"
              aria-label="Email address"
            />
            <Button
              type="submit"
              disabled={loading || !email}
              className="h-12 bg-white text-black hover:bg-white/90 font-black uppercase tracking-widest text-xs px-6 shrink-0 shadow-xl gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <><ArrowRight className="h-4 w-4" />Subscribe</>
              )}
            </Button>
          </form>
        )}
        {error && <p className="text-red-200 text-xs font-bold mt-3">{error}</p>}
      </div>
    </section>
  );
}
