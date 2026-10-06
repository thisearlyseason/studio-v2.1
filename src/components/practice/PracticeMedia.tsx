"use client";

import { useState } from 'react';
import { Dumbbell, Play, ImageIcon, Video } from 'lucide-react';

export type PracticeReaderDrill = {
  id: string; title?: string; description?: string; objective?: string;
  category?: string; type?: string; estimatedTime?: string | number; duration?: number;
  coverImageUrl?: string; videoUrl?: string; url?: string;
  additionalMedia?: (string | { url: string; description?: string })[];
  media?: { url: string; description?: string }[];
};

export function mediaSource(value?: string) {
  if (!value) return null;
  if (/^\/demo-media\/[a-z0-9-]+\.svg$/.test(value)) return { url: value, kind: 'image' as const };
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(value)) return { url: value, kind: 'image' as const };
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const segments = url.pathname.split('/').filter(Boolean);
    const yt = host === 'youtu.be' ? segments[0] : ['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host) ? (url.searchParams.get('v') || (['embed', 'shorts', 'live'].includes(segments[0]) ? segments[1] : null)) : null;
    if (yt && /^[\w-]{11}$/.test(yt)) return { url: `https://www.youtube-nocookie.com/embed/${yt}?rel=0&playsinline=1`, thumbnail: `https://img.youtube.com/vi/${yt}/hqdefault.jpg`, kind: 'embed' as const };
    if (['vimeo.com', 'player.vimeo.com'].includes(host)) {
      const id = segments.find(p => /^\d+$/.test(p));
      if (id) return { url: `https://player.vimeo.com/video/${id}${url.searchParams.get('h') ? `?h=${encodeURIComponent(url.searchParams.get('h')!)}` : ''}`, kind: 'embed' as const };
    }
    return { url: url.href, kind: /\.(png|jpe?g|webp|gif|avif|svg)(?:$|[?#])/i.test(decodeURIComponent(url.href)) ? 'image' as const : 'file' as const };
  } catch { return null; }
}

export function PracticeCover({ drill, title }: { drill?: PracticeReaderDrill; title: string }) {
  const [failed, setFailed] = useState(false);
  const video = mediaSource(drill?.videoUrl || drill?.url);
  const extra = (drill?.additionalMedia || drill?.media || [])[0];
  const firstImage = mediaSource(typeof extra === 'string' ? extra : extra?.url);
  const cover = mediaSource(drill?.coverImageUrl)?.url || video?.thumbnail || (firstImage?.kind === 'image' ? firstImage.url : undefined);
  return <div className="aspect-video bg-neutral-950 relative overflow-hidden">
    {cover && !failed ? <img src={cover} alt={title} onError={() => setFailed(true)} className="h-full w-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" /> : <div className="absolute inset-0 bg-linear-to-br from-neutral-800 to-black flex items-center justify-center"><Dumbbell className="h-16 w-16 text-white/25" /></div>}
    {video && <span className="absolute inset-0 flex items-center justify-center"><span className="rounded-full bg-black/50 p-4 ring-1 ring-white/30"><Play className="h-7 w-7 text-white fill-white" /></span></span>}
    <div className="absolute bottom-4 left-4 flex gap-2 text-xs font-semibold text-white">
      {video && <span className="rounded-full bg-black/75 px-3 py-1 flex items-center gap-1.5"><Video className="h-3.5 w-3.5" /> Video</span>}
      {cover && <span className="rounded-full bg-black/75 px-3 py-1 flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> Image</span>}
    </div>
  </div>;
}

export function PracticeMedia({ url, title, image = false, poster }: { url: string; title: string; image?: boolean; poster?: string }) {
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const source = mediaSource(url);
  if (!source || failed) return <p role="status" className="rounded-2xl bg-muted p-5 text-sm">{title} could not be loaded. The coach can update this resource in the Playbook.</p>;
  if (image || source.kind === 'image') return <figure className="overflow-hidden rounded-2xl border bg-neutral-100"><img src={source.url} alt={title} onError={() => setFailed(true)} className="w-full max-h-[65dvh] object-contain" /><figcaption className="px-4 py-3 text-sm font-medium bg-white">{title}</figcaption></figure>;
  return <div className="aspect-video rounded-2xl overflow-hidden bg-black relative">
    {!playing ? <button type="button" onClick={() => setPlaying(true)} aria-label={`Play ${title}`} className="group relative w-full h-full text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-primary">
      {(poster || source.thumbnail) && <img src={poster || source.thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />}
      <span className="relative flex flex-col items-center gap-3 p-4"><span className="rounded-full bg-primary p-4"><Play className="h-7 w-7 fill-current" /></span><span className="font-semibold text-sm">Play video</span></span>
    </button> : source.kind === 'embed' ? <iframe title={title} src={source.url} className="h-full w-full border-0" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> : <video src={source.url} controls playsInline autoPlay poster={poster} onError={() => setFailed(true)} className="h-full w-full" />}
  </div>;
}
