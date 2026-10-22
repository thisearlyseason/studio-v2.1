'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/firebase';
import { useTeam } from '@/components/providers/team-provider';
import { Button } from '@/components/ui/button';
import { TeamCover } from './team-cover';
import { RASTER_IMAGE_ACCEPT, validateRasterImage } from '@/lib/storage-upload-policy';

export function CoverEditor() {
  const { activeTeam, isStaff, isSuperAdmin } = useTeam();
  const auth = useAuth();
  const [file, setFile] = useState<File | null>(null);
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
      await new Promise<void>((resolve,reject) => {
        const xhr = new XMLHttpRequest(); request.current = xhr;
        xhr.open(method, `/api/teams/cover?teamId=${encodeURIComponent(activeTeam.id)}`); xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        if (method === 'PATCH') xhr.setRequestHeader('Content-Type','application/json');
        xhr.upload.onprogress = event => { if (event.lengthComputable) setProgress(Math.min(95, Math.round(event.loaded/event.total*95))); };
        xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else { let detail = 'Cover could not be saved.'; try { detail = JSON.parse(xhr.responseText).error || detail; } catch {} reject(new Error(detail)); } };
        xhr.onerror = () => reject(new Error('Network error. Your existing cover is unchanged. Try again.'));
        xhr.onabort = () => reject(new Error('Upload cancelled.'));
        xhr.send(method === 'POST' ? form : method === 'PATCH' ? JSON.stringify({focalX:x,focalY:y}) : null);
      });
      setFile(null); if (input.current) input.current.value = '';
      setMessage(method === 'DELETE' ? 'Cover removed. The default Squad cover is active.' : 'Team cover saved.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Cover could not be saved.'); }
    finally { setProgress(null); request.current = null; }
  }
  return <section aria-label="Team cover photo" className="space-y-4 border-t pt-6">
    <div><h3 className="text-xl font-bold">Team cover photo</h3><p className="mt-1 text-sm text-muted-foreground">Shared with this team. JPEG, PNG, WebP or GIF, up to 5 MB; at least 320 × 160 pixels. Animated images use the first frame.</p></div>
    <div className="relative h-48 overflow-hidden rounded-xl bg-[#081b34]">
      {preview ? <img src={preview} alt="Cover positioning preview" className="h-full w-full object-cover" style={{objectPosition:`${x}% ${y}%`}}/> : <TeamCover key={activeTeam.homeCover?.id || 'default'} team={activeTeam} focalX={x} focalY={y}/>}
      <span className="pointer-events-none absolute bottom-4 left-4 rounded bg-black/70 px-3 py-1 text-sm font-semibold text-white">{activeTeam.name}</span>
    </div>
    {(preview || activeTeam.homeCover) && <div className="grid gap-3 sm:grid-cols-2">{[['Horizontal position',x,setX],['Vertical position',y,setY]].map(([label,value,setter]) => <label key={String(label)} className="text-sm font-medium">{String(label)}<input aria-label={String(label)} className="mt-2 block min-h-8 w-full accent-red-700" type="range" min="0" max="100" value={Number(value)} disabled={progress !== null} onChange={event => (setter as (v:number)=>void)(Number(event.target.value))}/></label>)}</div>}
    <input ref={input} type="file" accept={RASTER_IMAGE_ACCEPT} aria-label="Choose team cover photo" disabled={progress !== null} onChange={event => { const selected = event.target.files?.[0]; setError(''); setMessage(''); if (!selected) return; const invalid = validateRasterImage(selected); if (invalid) { setError(invalid); return; } setFile(selected); setX(50); setY(50); }} className="block w-full text-sm"/>
    <div className="flex flex-wrap gap-2"><Button disabled={progress !== null || (!file && !activeTeam.homeCover)} onClick={() => save(file ? 'POST' : 'PATCH')}>{file ? 'Save cover' : 'Save position'}</Button>{file && <Button variant="outline" disabled={progress !== null} onClick={() => {setFile(null); if(input.current) input.current.value='';}}>Cancel replacement</Button>}{activeTeam.homeCover && <Button variant="outline" disabled={progress !== null} onClick={() => save('DELETE')}>Remove cover</Button>}</div>
    {progress !== null && <div role="status"><progress max="100" value={progress} className="w-full" aria-label="Cover upload progress"/><p className="text-sm">{progress < 95 ? `Uploading ${progress}%` : 'Optimizing and saving…'}</p></div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm">{message}</p>}
  </section>;
}
