'use client';

import { useState } from 'react';
import { useAuth } from '@/firebase';
import { useTeam } from '@/components/providers/team-provider';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isStoreDistribution } from '@/lib/app-distribution';
import { registerPushDevice } from '@/lib/client-push-registration';

export function FirstLoginNotifications() {
  const { user } = useTeam();
  const auth = useAuth();
  const [reminders, setReminders] = useState(true);
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  const [error, setError] = useState('');
  if (!user?.notificationInvitationPending || user.isDemo || closed || typeof window === 'undefined') return null;
  const supported = !isStoreDistribution && 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator;
  if (!supported && user.notificationGuideSeen) return null;
  async function choose(enable: boolean) {
    if (!user || busy || auth.currentUser?.uid !== user.id) return;
    setBusy(true); setError('');
    try {
      if (enable && !await registerPushDevice(user.id)) {
        throw new Error(Notification.permission === 'denied' ? 'Notifications are blocked. Allow them in your browser settings, then try again.' : 'This device could not register for notifications. You can retry or choose Not now.');
      }
      if (auth.currentUser?.uid !== user.id) return;
      const token = await auth.currentUser.getIdToken();
      const response = await fetch('/api/notifications/introduction', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice: enable ? 'enable' : supported ? 'skip' : 'guide', reminders }),
      });
      if (!response.ok) throw new Error('Your choice could not be saved. Try again.');
      setClosed(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to enable notifications.'); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) void choose(false); }}>
    <DialogContent hideClose className="h-auto max-h-[90dvh] top-1/2 -translate-y-1/2 rounded-2xl p-6 sm:max-w-md">
      <DialogHeader><DialogTitle>Turn on team notifications?</DialogTitle>
        <DialogDescription>{supported ? 'Get team updates and schedule changes on this device.' : 'For team updates and game-day reminders on iPhone or iPad, open thesquad.pro in Safari, add it to your Home Screen, then open it from there. On other devices, use a browser that supports notifications.'}</DialogDescription>
      </DialogHeader>
      {supported && <label className="my-4 flex items-center gap-2"><input type="checkbox" checked={reminders} onChange={e => setReminders(e.target.checked)} />Include same-day game and activity reminders</label>}
      {error && <p role="alert" className="my-2 text-sm text-destructive">{error}</p>}
      <div className="mt-4 flex justify-end gap-2"><Button disabled={busy} variant="outline" onClick={() => choose(false)}>{supported ? 'Not now' : 'Got it'}</Button>
        {supported && <Button disabled={busy} onClick={() => choose(true)}>Enable notifications</Button>}</div>
    </DialogContent>
  </Dialog>;
}
