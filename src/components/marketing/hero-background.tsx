'use client';

import { useEffect, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

const SPORTS = [
  { name: 'Baseball', video: 'https://assets.mixkit.co/videos/853/853-720.mp4', poster: '/images/sports/photography/baseball.webp' },
  { name: 'Soccer', video: 'https://assets.mixkit.co/videos/43494/43494-720.mp4', poster: '/images/sports/photography/soccer.webp' },
  { name: 'Football', video: 'https://assets.mixkit.co/videos/42554/42554-720.mp4', poster: '/images/sports/photography/football.webp' },
  { name: 'Golf', video: 'https://cdn.pixabay.com/video/2018/10/02/18528-293467377_large.mp4', poster: '/images/sports/photography/golf.webp' },
  { name: 'Hockey', video: 'https://assets.mixkit.co/videos/48383/48383-720.mp4', poster: '/images/sports/photography/hockey.webp' },
];

export function HeroBackground() {
  const [active, setActive] = useState(0);
  const [playVideo, setPlayVideo] = useState(false);

  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string; addEventListener?: (event: string, handler: () => void) => void; removeEventListener?: (event: string, handler: () => void) => void } }).connection;
    const update = () => setPlayVideo(!motion.matches && !connection?.saveData && !['slow-2g', '2g'].includes(connection?.effectiveType || ''));
    update();
    motion.addEventListener('change', update);
    connection?.addEventListener?.('change', update);
    return () => { motion.removeEventListener('change', update); connection?.removeEventListener?.('change', update); };
  }, []);

  useEffect(() => {
    if (!playVideo || paused) return;
    const timer = window.setTimeout(() => setActive(index => (index + 1) % SPORTS.length), 8000);
    return () => window.clearTimeout(timer);
  }, [active, playVideo, paused]);

  const sport = SPORTS[active];
  return <>
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${sport.poster}")` }}>
      {playVideo && !paused && <video key={sport.name} src={sport.video} poster={sport.poster} autoPlay muted playsInline loop preload="metadata" className="h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-black/15" />
      <div className="absolute inset-0 bg-linear-to-r from-black/85 via-black/45 to-transparent" />
      <div className="absolute inset-0 bg-linear-to-t from-black/75 via-transparent to-black/20" />
    </div>
    <div className="relative z-20 flex flex-wrap container mx-auto justify-start gap-2 px-6 pb-6 sm:px-10" aria-label="Hero sport background">
      {SPORTS.map((item, index) => <button key={item.name} type="button" onClick={() => setActive(index)} aria-pressed={index === active} aria-label={`Show ${item.name} background`} className={cn('rounded-full border px-3 py-2 text-[9px] font-black uppercase tracking-[0.15em] backdrop-blur-md transition-colors', index === active ? 'border-primary bg-primary text-white' : 'border-white/20 bg-black/30 text-white/65 hover:border-white/50 hover:text-white')}>{item.name}</button>)}
      {playVideo && <button type="button" onClick={() => setPaused(value => !value)} className="flex items-center justify-center rounded-full border border-white/20 bg-black/30 p-2 text-white/65 backdrop-blur-md hover:text-white" aria-label={paused ? 'Play background video' : 'Pause background video'}>{paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}</button>}
    </div>
  </>;
}
