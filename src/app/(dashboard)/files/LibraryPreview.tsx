'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/firebase';
import { authHeader, getAuthToken } from '@/lib/client-auth';
import type { TeamFile } from '@/components/providers/team-provider';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function LibraryPreview({file,teamId,onClose,onDownload}: {
  file:TeamFile; teamId:string; onClose:()=>void; onDownload:()=>void;
}) {
  const auth = useAuth();
  const [media,setMedia] = useState<{url:string;pdf:boolean} | null>(null);
  const [error,setError] = useState('');
  const title = file.displayName || file.name;
  useEffect(() => {
    const controller = new AbortController();
    let url = '';
    async function load() {
      const token = await getAuthToken(auth);
      if (!token) throw Error('Sign in again to open this file.');
      const response = await fetch('/api/teams/library?'+new URLSearchParams({teamId,fileId:file.id}),{
        headers:authHeader(token),cache:'no-store',signal:controller.signal,
      });
      if (!response.ok) throw Error((await response.json()).error || 'File unavailable.');
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      if (!['application/pdf','image/png','image/jpeg','image/gif','image/webp'].includes(blob.type))
        throw Error('Use Download to open this file on your device.');
      url = URL.createObjectURL(blob);
      setMedia({url,pdf:blob.type === 'application/pdf'});
    }
    void load().catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'File unavailable.'); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  },[auth,teamId,file.id]);
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="h-dvh sm:h-[90dvh] sm:max-w-5xl">
      <DialogHeader className="border-b px-5 py-4 pr-16 text-left"><DialogTitle className="break-words text-xl font-bold">{title}</DialogTitle>
        <DialogDescription>{file.displayName && file.displayName !== file.name ? file.name : 'Team Library'}</DialogDescription>
      </DialogHeader>
      {media ? media.pdf ? <iframe src={media.url} title={title} className="min-h-0 w-full flex-1"/> :
        <img src={media.url} alt={title} className="min-h-0 w-full flex-1 object-contain"/> :
        <p role="status" className="flex-1 p-5">{error || 'Opening file…'}</p>}
      <div className="flex justify-end gap-2 border-t p-3"><Button variant="outline" onClick={onDownload}>Download</Button><Button onClick={onClose}>Close</Button></div>
    </DialogContent>
  </Dialog>;
}
