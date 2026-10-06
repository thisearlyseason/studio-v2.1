'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { onboardingSchema, type NativeOnboarding } from '@/lib/native-auth/protocol';

export function NativeFreeOnboarding({ initialJoinCode, onSubmit }: { initialJoinCode: string; onSubmit(value: NativeOnboarding): void }) {
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('adult_player');
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState(false);
  const submit = () => {
    const result = onboardingSchema.safeParse({ fullName, role, joinCode: joinCode.trim().toUpperCase(), adultConfirmed: adult, termsAccepted: terms });
    if (!result.success || /[\u0000-\u001f\u007f]/.test(fullName + joinCode)) { setError(true); return; }
    setError(false); onSubmit(result.data);
  };
  return (
    <section aria-labelledby="native-account-heading" className="space-y-4 rounded-2xl border p-4 sm:p-5">
      <h2 id="native-account-heading" className="text-xl font-bold">Create your free account</h2>
      <p className="text-sm text-muted-foreground">One more step before opening The Squad. No payment details required.</p>
      <div className="space-y-2">
        <Label htmlFor="native-name">Full name</Label>
        <Input id="native-name" autoComplete="name" maxLength={120} value={fullName} onChange={event => setFullName(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="native-role">I am joining as</Label>
        <select id="native-role" value={role} onChange={event => setRole(event.target.value)} className="min-h-11 w-full rounded-xl border bg-background p-2 text-base">
          <option value="adult_player">Adult athlete</option><option value="parent">Parent</option>
          <option value="coach">Coach</option><option value="admin">School administrator</option><option value="league_creator">League organizer</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="native-join-code">Team join code (optional)</Label>
        <Input id="native-join-code" maxLength={128} autoCapitalize="characters" value={joinCode} onChange={event => setJoinCode(event.target.value)} />
        <p className="text-sm text-muted-foreground">You’ll review the team after sign-in. A code does not grant staff access.</p>
      </div>
      <label className="flex items-start gap-3 text-sm leading-relaxed"><input type="checkbox" checked={adult} onChange={event => setAdult(event.target.checked)} className="mt-1 size-5 shrink-0" />I confirm I am 18 or older.</label>
      <label className="flex items-start gap-3 text-sm leading-relaxed"><input type="checkbox" checked={terms} onChange={event => setTerms(event.target.checked)} className="mt-1 size-5 shrink-0" /><span>I agree to the <Link href="/terms" target="_blank" rel="noopener noreferrer" className="underline">Terms</Link> and <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">Privacy Policy</Link>.</span></label>
      <p className="text-sm">Under 18? <Link href="/signup/youth" className="font-semibold underline">Activate a youth invitation</Link> instead.</p>
      {error && <p role="alert" className="text-sm font-semibold text-destructive">Enter your name and confirm your age and agreement to continue.</p>}
      <Button type="button" onClick={submit} className="h-auto min-h-12 w-full whitespace-normal">Create free account</Button>
    </section>
  );
}
