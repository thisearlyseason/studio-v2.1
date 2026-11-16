'use client';

import { useEffect, useState } from 'react';
import { Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

const SPORTS = [
  { name: 'Baseball', video: 'https://assets.mixkit.co/videos/853/853-720.mp4', poster: 'https://images.unsplash.com/photo-1508088062105-17d61307629d?auto=format&fit=crop&q=80&w=1600' },
  { name: 'Soccer', video: 'https://assets.mixkit.co/videos/43494/43494-720.mp4', poster: 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?auto=format&fit=crop&q=80&w=1600' },
  { name: 'Football', video: 'https://assets.mixkit.co/videos/42554/42554-720.mp4', poster: 'https://images.unsplash.com/photo-1560272564-c83b66b1ad12?auto=format&fit=crop&q=80&w=1600' },
  { name: 'Golf', video: 'https://cdn.pixabay.com/video/2018/10/02/18528-293467377_large.mp4', poster: 'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?auto=format&fit=crop&q=80&w=1600' },
  { name: 'Hockey', video: 'https://assets.mixkit.co/videos/48383/48383-720.mp4', poster: 'https://images.unsplash.com/photo-1515703407324-5f753afd8be8?auto=format&fit=crop&q=80&w=1600' },
];

export function HeroBackground() {
  const [active, setActive] = useState(0);
  const [playVideo, setPlayVideo] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const wideViewport = window.matchMedia('(min-width: 768px)');
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string; addEventListener?: (event: string, handler: () => void) => void; removeEventListener?: (event: string, handler: () => void) => void } }).connection;
    const update = () => setPlayVideo(wideViewport.matches && !motion.matches && !connection?.saveData && !['slow-2g', '2g'].includes(connection?.effectiveType || ''));
    update();
    motion.addEventListener('change', update);
    wideViewport.addEventListener('change', update);
    connection?.addEventListener?.('change', update);
    return () => { motion.removeEventListener('change', update); wideViewport.removeEventListener('change', update); connection?.removeEventListener?.('change', update); };
  }, []);

  useEffect(() => {
    if (!playVideo) return;
    const timer = window.setTimeout(() => setActive(index => (index + 1) % SPORTS.length), 8000);
    return () => window.clearTimeout(timer);
  }, [active, playVideo]);

  const sport = SPORTS[active];
  return <>
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${sport.poster}")` }}>
      {playVideo && <video key={sport.name} src={sport.video} poster={sport.poster} autoPlay muted playsInline loop preload="metadata" className="h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-black/60" />
      <div className="absolute inset-0 bg-linear-to-b from-black/50 via-transparent to-black" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_10%,rgba(0,0,0,0.55)_100%)]" />
    </div>
    <div className="relative z-20 flex flex-wrap justify-center gap-2 px-5 pb-6 xl:absolute xl:bottom-8 xl:left-8 xl:justify-start xl:px-0 xl:pb-0" aria-label="Hero sport background">
      {SPORTS.map((item, index) => <button key={item.name} type="button" onClick={() => setActive(index)} aria-pressed={index === active} aria-label={`Show ${item.name} background`} className={cn('rounded-full border px-3 py-2 text-[9px] font-black uppercase tracking-[0.15em] backdrop-blur-md transition-colors', index === active ? 'border-primary bg-primary text-white' : 'border-white/20 bg-black/30 text-white/65 hover:border-white/50 hover:text-white')}>{item.name}</button>)}
      {playVideo && <button type="button" onClick={() => setPlayVideo(false)} className="flex items-center justify-center rounded-full border border-white/20 bg-black/30 p-2 text-white/65 backdrop-blur-md hover:text-white" aria-label="Pause background video"><Pause className="h-3 w-3" /></button>}
    </div>
  </>;
}
