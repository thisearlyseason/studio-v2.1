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
    <DialogContent className="flex max-h-[85dvh] flex-col gap-4 sm:max-w-lg">
      <DialogHeader><DialogTitle>Review schedule conflicts</DialogTitle>
        <DialogDescription>Choose what to keep on each date. Your changes take effect when you publish.</DialogDescription></DialogHeader>
      <div className="space-y-4 overflow-y-auto">
        {dates.map(date => {
          const items = conflicts.filter(c => c.date === date);
          const canReplace = items.every(c => c.replaceId);
          return <fieldset key={date} className="space-y-2 rounded-xl border p-4">
            <legend className="px-1 font-semibold">{new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric', year:'numeric' })}</legend>
            <ul className="text-sm">{items.map((item, i) => <li key={i}>{item.title}{item.time ? ' · ' + item.time : ''}</li>)}</ul>
            <label className="flex items-center gap-2"><input type="radio" name={date} checked={choices[date] === 'skip'} onChange={() => setChoices({ ...choices, [date]: 'skip' })}/>Skip this repeat</label>
            {canReplace && <label className="flex items-center gap-2"><input type="radio" name={date} checked={choices[date] === 'replace'} onChange={() => setChoices({ ...choices, [date]: 'replace' })}/>Remove the listed event{items.length > 1 ? 's' : ''} and keep this repeat</label>}
          </fieldset>;
        })}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={onClose}>Back to editor</Button>
        <Button disabled={!complete || busy} onClick={() => onPublish({
          skipDates: dates.filter(date => choices[date] === 'skip'),
          replace: [...removed].map(([id, revision]) => ({ id, revision })),
        })}>{removed.size ? `Remove ${removed.size} & publish` : 'Publish remaining events'}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
