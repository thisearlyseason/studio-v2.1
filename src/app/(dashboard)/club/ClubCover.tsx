'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/firebase';
import { getAuthToken, authHeader } from '@/lib/client-auth';
import { prepareTeamCover } from '@/lib/prepare-team-logo';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function ClubCover({teamId, school, children, className}: {school:boolean; teamId?:string; children:ReactNode; className:string}) {
  const auth = useAuth();
  const [blob,setBlob] = useState<Blob|null>(null);
  const [photo,setPhoto] = useState('');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const url = teamId ? '/api/club/cover?'+new URLSearchParams({teamId, kind:school ? 'school' : 'club'}) : '';
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    setBusy(true);
    void (async () => {
      const token = await getAuthToken(auth);
      if (!token) throw Error();
      const res = await fetch(url,{headers:authHeader(token),signal:controller.signal,cache:'no-store'});
      if (!res.ok) throw Error();
      const data = res.status === 204 ? null : await res.blob();
      if (!controller.signal.aborted) setBlob(data);
    })().catch(() => { if (!controller.signal.aborted) setMessage('Could not load the hub photo.'); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  },[url,auth]);
  useEffect(() => {
    const objectUrl = blob ? URL.createObjectURL(blob) : '';
    setPhoto(objectUrl);
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  },[blob]);
  async function save(file?:File) {
    if (!url || busy) return;
    setBusy(true); setMessage('');
    try {
      const body = file ? await prepareTeamCover(file) : undefined;
      const token = await getAuthToken(auth);
      if (!token) throw Error('Sign in again to change the cover.');
      const res = await fetch(url,{method:file ? 'POST' : 'DELETE',headers:authHeader(token),body});
      if (!res.ok) throw Error((await res.json()).error || 'Could not save your photo.');
      setBlob(file ? await res.blob() : null);
      setMessage(file ? 'Cover photo saved.' : 'Default cover restored.');
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Could not save your photo.'); }
    finally { setBusy(false); }
  }
  return <Card className={className}>
    {photo && <div className="absolute inset-0"><img src={photo} alt="" className="h-full w-full object-cover"/><div className="absolute inset-0 bg-gradient-to-r from-black/85 to-black/35"/></div>}
    {children}
    {url && <div className="relative z-10 mt-2 flex flex-wrap items-center gap-2">
      <input ref={input} type="file" className="hidden" accept="image/jpeg,image/png,image/webp,image/gif,.heic,.heif" onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void save(file);}}/>
      <Button variant="secondary" disabled={busy} onClick={()=>input.current?.click()}>{photo ? 'Change cover photo' : 'Add cover photo'}</Button>
      {photo && <Button variant="secondary" disabled={busy} onClick={()=>save()}>Restore default cover</Button>}
      <span role="status" className="text-sm text-white">{busy ? 'Loading…' : message}</span>
    </div>}
  </Card>;
}
