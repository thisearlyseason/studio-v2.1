"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { useFirestore, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import BrandLogo from '@/components/BrandLogo';
import { toast } from '@/hooks/use-toast';

const ROLES = [
  { value: 'adult_player', label: 'Player', destination: '/teams/join' },
  { value: 'parent', label: 'Parent or guardian', destination: '/family' },
  { value: 'coach', label: 'Coach', destination: '/teams/new' },
  { value: 'admin', label: 'School or club administrator', destination: '/teams/new' },
  { value: 'league_creator', label: 'League organizer', destination: '/competition' },
] as const;

export default function OnboardingPage() {
  const { user, isUserLoading } = useUser();
  const db = useFirestore();
  const router = useRouter();
  const [name, setName] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]['value']>('adult_player');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isUserLoading && !user) router.replace('/login');
    if (user?.displayName) setName(current => current || user.displayName || '');
    if (user && db) {
      getDoc(doc(db, 'users', user.uid)).then(snapshot => {
        if (snapshot.exists()) router.replace('/dashboard');
      }).catch(() => undefined);
    }
  }, [db, isUserLoading, router, user]);

  const completeProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user || !db) return;
    const fullName = name.trim().replace(/\s+/g, ' ');
    if (!fullName || fullName.length > 120) {
      toast({ title: 'Valid name required', description: 'Enter a name between 1 and 120 characters.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'users', user.uid), {
        id: user.uid,
        fullName,
        email: String(user.email || '').trim().toLowerCase(),
        role,
        notificationsEnabled: false,
        upcomingEventNotificationsEnabled: false,
        createdAt: new Date().toISOString(),
        avatarUrl: user.photoURL || `https://picsum.photos/seed/${user.uid}/150/150`,
      });
      if (role === 'adult_player') {
        const [firstName, ...lastName] = fullName.split(' ');
        batch.set(doc(db, 'players', `p_${user.uid}`), {
          firstName,
          lastName: lastName.join(' '),
          isMinor: false,
          userId: user.uid,
          parentId: '',
          hasLogin: true,
          recruitingProfileEnabled: false,
          createdAt: new Date().toISOString(),
        });
      }
      await batch.commit();
      const destination = ROLES.find(option => option.value === role)?.destination || '/dashboard';
      router.replace(destination);
    } catch {
      toast({ title: 'Profile setup failed', description: 'Your profile could not be created. Please try again.', variant: 'destructive' });
      setSaving(false);
    }
  };

  if (isUserLoading || !user) {
    return <main className="min-h-screen grid place-items-center"><Loader2 className="h-8 w-8 animate-spin" aria-label="Loading account" /></main>;
  }

  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10 grid place-items-center">
      <form onSubmit={completeProfile} className="w-full max-w-lg bg-background border shadow-xl rounded-lg p-6 sm:p-8 space-y-7">
        <BrandLogo variant="light-background" className="h-12 w-40" priority />
        <div>
          <h1 className="text-3xl font-black uppercase">Complete your profile</h1>
          <p className="text-sm text-muted-foreground mt-2">Choose the role that determines your starting workspace and permissions.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="onboarding-name">Full name</Label>
          <Input id="onboarding-name" value={name} onChange={event => setName(event.target.value)} autoComplete="name" maxLength={120} required />
        </div>
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Account role</legend>
          <RadioGroup value={role} onValueChange={value => setRole(value as typeof role)} className="space-y-2">
            {ROLES.map(option => (
              <Label key={option.value} htmlFor={`role-${option.value}`} className="flex items-center gap-3 border rounded-md p-3 cursor-pointer">
                <RadioGroupItem id={`role-${option.value}`} value={option.value} />
                <span>{option.label}</span>
              </Label>
            ))}
          </RadioGroup>
        </fieldset>
        <Button type="submit" className="w-full" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Continue
        </Button>
      </form>
    </main>
  );
}
