"use client";
import React from 'react';
import {Button} from '@/components/ui/button';
import {selfMediaPlayerId,type SelfMediaSubject,type SelfImageKind} from '@/lib/player-self-media';
import {mediaReadUrl} from '@/lib/media-client';

export type SelfMediaProfile={photoURL?:string;photos?:string[]};
export function PlayerSelfMediaControls({subject,profile,busy,status,onUpload,onDelete}:{subject:SelfMediaSubject;profile:SelfMediaProfile;busy:boolean;status:string;onUpload:(kind:SelfImageKind,file:File)=>void;onDelete:(kind:SelfImageKind,url:string)=>void}){
  if(!selfMediaPlayerId(subject))return null;
  return <section aria-label="My player media" className="min-w-0 space-y-3 rounded-2xl border p-4 bg-background text-foreground">
    <h3 className="font-bold">My player media</h3>
    <p className="text-sm text-muted-foreground">JPEG, PNG, GIF or WebP, up to 5 MiB. Player media follows your recruiting privacy setting.</p>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      {(['avatar','gallery'] as const).map(kind=><label key={kind} className="min-w-0 text-sm font-medium">{kind==='avatar'?'Player avatar':'Gallery photo'}
        <input type="file" aria-label={kind==='avatar'?'Upload player avatar':'Upload gallery photo'} accept="image/jpeg,image/png,image/gif,image/webp" disabled={busy} className="mt-1 block w-full min-w-0 max-w-full rounded-lg border p-2 text-xs" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)onUpload(kind,file);}}/>
      </label>)}
    </div>
    {profile.photoURL&&<div className="flex flex-wrap items-center gap-3"><img src={mediaReadUrl(profile.photoURL,process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)} alt="My player avatar" width={64} height={64} className="h-16 w-16 rounded-xl object-cover"/><Button variant="outline" size="sm" disabled={busy} onClick={()=>onDelete('avatar',profile.photoURL!)}>Delete player avatar</Button></div>}
    <div className="grid min-w-0 grid-cols-2 gap-3">{(profile.photos||[]).map((url,index)=><div key={url} className="min-w-0 space-y-2"><img src={mediaReadUrl(url,process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)} alt={`My gallery photo ${index+1}`} className="h-24 w-full rounded-xl object-cover"/><Button variant="outline" size="sm" className="h-auto min-h-9 w-full whitespace-normal" disabled={busy} onClick={()=>onDelete('gallery',url)}>Delete gallery photo {index+1}</Button></div>)}</div>
    <p role="status" aria-live="polite" className="break-words text-sm">{status||'Ready to upload'}</p>
  </section>;
}
