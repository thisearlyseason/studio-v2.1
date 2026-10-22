'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTeam } from '@/components/providers/team-provider';
import { Button } from '@/components/ui/button';

export function HomeLayoutSelector({ invitation = false }: { invitation?: boolean }) {
  const router = useRouter();
  const { user, updateUser } = useTeam();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  if (!user) return null;
  async function save(layout?: 'classic' | 'modern') {
    setSaving(true); setError(''); setSaved(false);
    try {
      await updateUser({ ...(layout ? { homeScreenLayout: layout } : {}), homeLayoutInvitationDismissed: true });
      setSaved(true);
      if (invitation && layout === 'modern') router.push('/dashboard');
    } catch { setError('Your choice could not be saved. Your saved layout is unchanged. Please try again.'); }
    finally { setSaving(false); }
  }
  return <section aria-label="Home screen layout" className="mb-6 rounded-2xl border bg-card p-5 text-card-foreground">
    <h3 className="text-lg font-bold">{invitation ? 'Choose your home screen' : 'Home screen layout'}</h3>
    <p className="mt-1 text-sm text-muted-foreground">{invitation ? 'Keep the familiar Classic layout or try the new Modern view. You can switch anytime in My Account.' : 'Your choice applies to the dashboard and team pages across teams and devices. Color mode stays independent.'}</p>
    <div className="mt-4 grid grid-cols-2 gap-3">
      {(['classic', 'modern'] as const).map(layout => <button key={layout} disabled={saving} onClick={() => save(layout)} aria-pressed={(user.homeScreenLayout || 'classic') === layout} className="rounded-xl border-2 p-3 text-left aria-pressed:border-primary disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
        <div aria-hidden="true" className="mb-3 h-16 overflow-hidden rounded-md border bg-muted p-2">
          {layout === 'classic' ? <><div className="mb-2 h-2 w-1/2 rounded bg-foreground/30"/><div className="grid h-8 grid-cols-4 gap-1">{[1,2,3,4].map(i => <div key={i} className="rounded bg-primary/30"/>)}</div></> : <><div className="mb-1 h-7 rounded bg-[#081c38]"/><div className="grid h-5 grid-cols-4 gap-1">{[1,2,3,4].map(i => <div key={i} className="rounded bg-background"/>)}</div></>}
        </div>
        <span className="font-bold">{invitation ? layout === 'classic' ? 'Keep Classic' : 'Try Modern' : layout === 'classic' ? 'Classic' : 'Modern'}</span>
      </button>)}
    </div>
    {invitation && <Button disabled={saving} variant="ghost" className="mt-2" onClick={() => save()}>Not now</Button>}
    <p role={error ? 'alert' : 'status'} className={`mt-2 text-sm ${error ? 'text-destructive' : 'text-muted-foreground'}`}>{error || (saving ? 'Saving…' : saved ? 'Home screen preference saved.' : '')}</p>
  </section>;
}
