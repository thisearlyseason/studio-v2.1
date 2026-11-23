'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { type ActivityConflict, type ActivityPublishOptions } from '@/lib/activity-publish';

export function ConflictReview({ conflicts, busy, onClose, onPublish }: {
  conflicts: ActivityConflict[]; busy: boolean; onClose: () => void;
  onPublish: (choices: ActivityPublishOptions) => void;
}) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const dates = [...new Set(conflicts.map(c => c.date))].sort();
  const complete = dates.every(date => choices[date]);
  const removed = new Map<string, string>();
  for (const item of conflicts) if (choices[item.date] === 'replace' && item.replaceId && item.revision) removed.set(item.replaceId, item.revision);
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="left-1/2 top-1/2 h-auto max-h-[90dvh] w-[calc(100vw-1rem)] -translate-x-1/2 -translate-y-1/2 rounded-3xl border-none bg-background p-0 shadow-2xl sm:max-w-lg">
      <DialogHeader className="shrink-0 border-b bg-muted/30 py-5 pl-5 pr-16 text-left sm:py-6 sm:pl-7"><DialogTitle className="text-2xl font-black uppercase tracking-tight">Review schedule conflicts</DialogTitle>
        <DialogDescription>Choose what to keep on each date. Your changes take effect when you publish.</DialogDescription></DialogHeader>
      <div className="min-h-0 space-y-3 overflow-y-auto p-5 sm:px-7">
        {dates.map(date => {
          const items = conflicts.filter(c => c.date === date);
          const canReplace = items.every(c => c.replaceId);
          return <fieldset key={date} className="space-y-2 rounded-2xl border border-border bg-card px-4 pb-4 pt-2">
            <legend className="px-1 text-sm font-bold">{new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric', year:'numeric' })}</legend>
            <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{items.map((item, i) => <li key={i}>{item.title}{item.time ? ' · ' + item.time : ''}</li>)}</ul>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm font-medium has-[:checked]:border-primary has-[:checked]:bg-primary/5"><input type="radio" name={date} checked={choices[date] === 'skip'} onChange={() => setChoices({ ...choices, [date]: 'skip' })}/>Skip this repeat</label>
            {canReplace && <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm font-medium has-[:checked]:border-primary has-[:checked]:bg-primary/5"><input type="radio" name={date} checked={choices[date] === 'replace'} onChange={() => setChoices({ ...choices, [date]: 'replace' })}/>Remove the listed event{items.length > 1 ? 's' : ''} and keep this repeat</label>}
          </fieldset>;
        })}
      </div>
      <div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-muted/30 p-4 sm:flex-row sm:justify-end sm:px-7">
        <Button className="min-h-11 rounded-xl" variant="outline" disabled={busy} onClick={onClose}>Back to editor</Button>
        <Button className="min-h-11 rounded-xl" disabled={!complete || busy} onClick={() => onPublish({
          skipDates: dates.filter(date => choices[date] === 'skip'),
          replace: [...removed].map(([id, revision]) => ({ id, revision })),
        })}>{removed.size ? `Remove ${removed.size} & publish` : 'Publish remaining events'}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
