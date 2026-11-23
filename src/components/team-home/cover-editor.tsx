'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/firebase';
import { useTeam } from '@/components/providers/team-provider';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CoverHeadline } from './cover-headline';
import { defaultHeadlinePosition, headlinePositions, type HeadlinePosition } from '@/lib/cover-headline-position';
import { TeamCover } from './team-cover';
import { prepareTeamCover } from '@/lib/prepare-team-logo';

export function CoverEditor({ dashboard = false }: { dashboard?: boolean }) {
  const [open, setOpen] = useState(false);
  const { activeTeam, isStaff, isSuperAdmin } = useTeam();
  const auth = useAuth();
  const [positionDraft, setPositionDraft] = useState<HeadlinePosition | null>(null);
  const savedPosition = activeTeam?.homeCoverHeadlinePosition ?? defaultHeadlinePosition;
  const [identityDraft, setIdentityDraft] = useState<HeadlinePosition | null>(null);
  const savedIdentity = activeTeam?.homeCoverIdentityPosition ?? savedPosition;
  const identityPosition = identityDraft ?? savedIdentity;
  const position = positionDraft ?? savedPosition;
  const [headlineDraft, setHeadlineDraft] = useState<string | null>(null);
  const headline = headlineDraft ?? activeTeam?.homeCoverHeadline ?? '';
  const headlineChanged = headline.trim() !== (activeTeam?.homeCoverHeadline ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState('');
  const [x, setX] = useState(activeTeam?.homeCover?.focalX ?? 50);
  const [y, setY] = useState(activeTeam?.homeCover?.focalY ?? 50);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<XMLHttpRequest | null>(null);
  useEffect(() => () => { request.current?.abort(); }, []);
  useEffect(() => { if (!file) { setX(activeTeam?.homeCover?.focalX ?? 50); setY(activeTeam?.homeCover?.focalY ?? 50); } }, [activeTeam?.homeCover, file]);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  if (!activeTeam || (!isStaff && !isSuperAdmin)) return null;
  async function save(method: 'POST' | 'PATCH' | 'DELETE') {
    if (!activeTeam || progress !== null) return;
    setProgress(0); setMessage(''); setError('');
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Sign in again to edit the cover.');
      const form = new FormData(); if (file) form.set('image', file); form.set('focalX', String(x)); form.set('focalY', String(y));
      const edits: Record<string, string | number> = {};
      if (identityPosition !== savedIdentity) {
        edits.identityPosition = identityPosition;
        form.set('identityPosition', identityPosition);
      }
      if (position !== savedPosition) {
        edits.headlinePosition = position;
        form.set('headlinePosition', position);
      }
      if (headlineChanged) {
        edits.headline = headline.trim();
        form.set('headline', headline.trim());
      }
      if (activeTeam.homeCover && (x !== activeTeam.homeCover.focalX || y !== activeTeam.homeCover.focalY)) {
        edits.focalX = x;
        edits.focalY = y;
      }
      await new Promise<void>((resolve,reject) => {
        const xhr = new XMLHttpRequest(); request.current = xhr;
        xhr.open(method, `/api/teams/cover?teamId=${encodeURIComponent(activeTeam.id)}`); xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        if (method === 'PATCH') xhr.setRequestHeader('Content-Type','application/json');
        xhr.upload.onprogress = event => { if (event.lengthComputable) setProgress(Math.min(95, Math.round(event.loaded/event.total*95))); };
        xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else { let detail = 'Cover could not be saved.'; try { detail = JSON.parse(xhr.responseText).error || detail; } catch {} reject(new Error(detail)); } };
        xhr.onerror = () => reject(new Error('Network error. Your existing cover is unchanged. Try again.'));
        xhr.onabort = () => reject(new Error('Upload cancelled.'));
        xhr.send(method === 'POST' ? form : method === 'PATCH' ? JSON.stringify(edits) : null);
      });
      setFile(null); setFileName(''); if (input.current) input.current.value = '';
      setMessage(method === 'DELETE' ? 'Cover removed. The default Squad cover is active.' : 'Team cover saved.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Cover could not be saved.'); }
    finally { setProgress(null); request.current = null; }
  }
  const editor = <section aria-label="Team cover photo" className="space-y-4 border-t pt-6">
    <div><h3 className="text-xl font-bold">Team cover photo</h3><p className="mt-1 text-sm text-muted-foreground">Shared with this team. Choose a photo at least 320 × 160 pixels. Large photos are resized before upload. Choose a photo, adjust the position below, then save.</p></div>
    <div className="team-cover-frame relative overflow-hidden rounded-xl bg-[#081b34]">
      <TeamCover key={preview || activeTeam.homeCover?.id || 'default'} team={activeTeam} preview={preview} focalX={x} focalY={y}/>
      <CoverHeadline team={activeTeam} headline={headline.trim()} position={position} identityPosition={identityPosition} preview />
    </div>
    <label className="block text-sm font-semibold">Dashboard cover headline
      <input type="text" maxLength={48} value={headline} disabled={progress !== null} placeholder="Built for game day." className="mt-1 block w-full rounded-xl border bg-background px-3 py-2 text-foreground" onChange={event => { setHeadlineDraft(event.target.value); setMessage(''); }}/>
      <span className="mt-1 block text-xs font-normal text-muted-foreground">Leave blank to use the default headline.</span>
    </label>
    {([
      ['Headline position', position, setPositionDraft],
      ['Team name and logo position', identityPosition, setIdentityDraft],
    ] as const).map(([label, selected, select]) => <fieldset key={label} disabled={progress !== null}>
      <legend className="mb-2 text-sm font-semibold">{label}</legend>
      <div className="grid grid-cols-3 gap-1.5">{headlinePositions.map(choice =>
        <label key={choice} className="relative cursor-pointer">
          <input className="peer sr-only" type="radio" name={label} value={choice} checked={selected === choice} onChange={() => { select(choice); setMessage(''); }}/>
          <span className="flex min-h-11 items-center justify-center rounded-lg border text-xs font-medium capitalize peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2">{choice.replace('-', ' ')}</span>
        </label>)}</div>
    </fieldset>)}
    {(preview || activeTeam.homeCover) && <div className="grid gap-3 sm:grid-cols-2">{[['Horizontal position',x,setX],['Vertical position',y,setY]].map(([label,value,setter]) => <label key={String(label)} className="text-sm font-medium">{String(label)}<input aria-label={String(label)} className="mt-2 block min-h-8 w-full accent-red-700" type="range" min="0" max="100" value={Number(value)} disabled={preparing || progress !== null} onChange={event => (setter as (v:number)=>void)(Number(event.target.value))}/></label>)}</div>}
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif,.heic,.heif" className="hidden" aria-label="Choose team cover photo" onChange={async event => {
      const selected = event.target.files?.[0];
      event.target.value = '';
      if (!selected) return;
      setPreparing(true); setError(''); setMessage('');
      try {
        const prepared = await prepareTeamCover(selected);
        setFile(prepared); setFileName(selected.name); setX(50); setY(50);
      } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not prepare this photo.'); }
      finally { setPreparing(false); }
    }} />
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="outline" disabled={preparing || progress !== null} onClick={() => input.current?.click()}>Choose cover photo</Button>
      <span role="status" className="text-sm text-muted-foreground">{preparing ? 'Preparing photo…' : file ? fileName : ''}</span>
    </div>
    <div className="flex flex-wrap gap-2"><Button disabled={preparing || progress !== null || (!file && !headlineChanged && position === savedPosition && identityPosition === savedIdentity && (!activeTeam.homeCover || (x === activeTeam.homeCover.focalX && y === activeTeam.homeCover.focalY)))} onClick={() => save(file ? 'POST' : 'PATCH')}>Save cover</Button>{file && <Button variant="outline" disabled={preparing || progress !== null} onClick={() => {setFile(null); if(input.current) input.current.value='';}}>Cancel replacement</Button>}{activeTeam.homeCover && <Button variant="outline" disabled={preparing || progress !== null} onClick={() => save('DELETE')}>Remove cover</Button>}</div>
    {progress !== null && <div role="status"><progress max="100" value={progress} className="w-full" aria-label="Cover upload progress"/><p className="text-sm">{progress < 95 ? `Uploading ${progress}%` : 'Optimizing and saving…'}</p></div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm">{message}</p>}
  </section>;
  return <>
    {dashboard ? <>
      <div className="modern-cover-actions"><button type="button" className="modern-edit-cover" onClick={() => { setIdentityDraft(null); setPositionDraft(null); setHeadlineDraft(null); setOpen(true); }}>Edit cover</button>
      </div>
      <Dialog open={open} onOpenChange={value => { if (progress === null) setOpen(value); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto p-6 sm:max-w-2xl">
          <DialogHeader className="mb-4 pr-10"><DialogTitle>Edit team cover</DialogTitle></DialogHeader>
          {editor}
        </DialogContent>
      </Dialog>
    </> : editor}
  </>;
}
