"use client";

import { Clock, Edit2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { PracticeTemplate } from '@/components/providers/team-provider';
import { PracticeMedia, mediaSource, type PracticeReaderDrill } from './PracticeMedia';
export type { PracticeReaderDrill } from './PracticeMedia';

export function PracticeTemplateReader({ template, drills, loading, error, onClose, onEdit }: {
  template: PracticeTemplate | null; drills: PracticeReaderDrill[]; loading: boolean;
  error?: boolean; onClose: () => void; onEdit?: () => void;
}) {
  return <Dialog open={Boolean(template)} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent hideClose className="h-[100dvh] sm:h-[90dvh] sm:max-w-5xl sm:rounded-[2rem] bg-zinc-50">
      <DialogHeader className="sticky top-0 z-20 shrink-0 border-b bg-white p-4 sm:p-6 text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-2"><DialogDescription className="text-primary text-xs font-bold uppercase tracking-widest">Practice plan · {template?.drillIds?.length || 0} drills</DialogDescription><DialogTitle className="text-xl sm:text-3xl font-black leading-tight break-words">{template?.title}</DialogTitle></div>
          <DialogClose asChild><Button variant="outline" size="icon" className="h-11 w-11 shrink-0 rounded-full" aria-label="Close practice"><X className="h-5 w-5" /></Button></DialogClose>
        </div>
      </DialogHeader>
      <div className="p-4 sm:p-8 space-y-6">
        <section className="rounded-3xl bg-white p-5 sm:p-6 ring-1 ring-black/5 space-y-3">
          <div className="flex flex-wrap justify-between items-center gap-3"><h3 className="font-bold text-lg">Practice objective</h3>{onEdit && <Button variant="outline" className="min-h-11 rounded-full gap-2" onClick={onEdit}><Edit2 className="h-4 w-4" />Edit template</Button>}</div>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{template?.description || 'No objective provided.'}</p>
        </section>
        {loading ? <p role="status">Loading drill instructions…</p> : error ? <p role="alert">Drill instructions could not be loaded. Close this view and try again.</p> : !template?.drillIds?.length ? <p>No drills have been added to this template.</p> : <ol className="space-y-6">
          {template.drillIds.map((id, index) => {
            const drill = drills.find(item => item.id === id);
            const duration = drill?.estimatedTime || (drill?.duration ? `${drill.duration} minutes` : null);
            const video = drill?.videoUrl || drill?.url;
            return <li key={`${id}-${index}`} className="rounded-[2rem] bg-white overflow-hidden ring-1 ring-black/5 shadow-sm">
              <div className="p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap gap-2"><Badge className="rounded-full px-3 py-1">{drill?.category || drill?.type || 'Drill protocol'}</Badge>{duration && <Badge variant="secondary" className="rounded-full px-3 py-1 gap-1"><Clock className="h-3.5 w-3.5" />{duration}</Badge>}</div>
                <h3 className="text-xl sm:text-2xl font-black break-words">{index + 1}. {drill?.title || 'Unavailable drill'}</h3>
                {!drill ? <p className="text-sm text-muted-foreground">This drill is no longer available in the team playbook. Edit the template to replace it.</p> : <>
                  {video ? <PracticeMedia key={`${id}-${video}`} url={video} title={drill.title || 'Drill video'} poster={mediaSource(drill.coverImageUrl)?.url} /> : drill.coverImageUrl ? <PracticeMedia key={`${id}-cover`} url={drill.coverImageUrl} title={drill.title || 'Drill illustration'} image /> : null}
                  {drill.objective && <p className="text-sm whitespace-pre-wrap break-words"><strong>Objective: </strong>{drill.objective}</p>}
                  <div className="space-y-2"><h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Instructions</h4><p className="text-sm sm:text-base leading-relaxed whitespace-pre-wrap break-words">{drill.description || 'No written instructions provided for this drill.'}</p></div>
                  {(drill.additionalMedia || drill.media || []).length > 0 && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">{(drill.additionalMedia || drill.media || []).map((media, i) => {
                    const url = typeof media === 'string' ? media : media.url;
                    const source = mediaSource(url);
                    const isVideo = source?.kind === 'embed' || /\.(mp4|webm|mov)(?:$|[?#])/i.test(url);
                    return <PracticeMedia key={`${i}-${url}`} url={url} title={typeof media !== 'string' && media.description || `Drill image ${i + 1}`} image={!isVideo} />;
                  })}</div>}
                </>}
              </div>
            </li>;
          })}
        </ol>}
        <DialogClose asChild><Button variant="outline" className="w-full min-h-12 rounded-full">Back to practices</Button></DialogClose>
      </div>
    </DialogContent>
  </Dialog>;
}
