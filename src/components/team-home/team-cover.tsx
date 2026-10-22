'use client';
import { useState } from 'react';
import type { Team } from '@/components/providers/team-provider';

export function TeamCover({ team, focalX, focalY }: { team: Team; focalX?: number; focalY?: number }) {
  const [failed, setFailed] = useState(false);
  const cover = team.homeCover;
  return <div className="absolute inset-0 overflow-hidden bg-[#081b34]" aria-hidden="true">
    {cover && !failed ? <img src={cover.urls[cover.urls.length - 1]?.url} srcSet={cover.urls.map(v => `${v.url} ${v.width}w`).join(', ')} sizes="(min-width: 1024px) 65vw, 100vw" alt="" onError={() => setFailed(true)} className="h-full w-full object-cover" style={{ objectPosition: `${focalX ?? cover.focalX}% ${focalY ?? cover.focalY}%` }} fetchPriority="high" /> : <>
      <img src="/images/embed/grass-background.webp" alt="" className="absolute inset-0 h-full w-full object-cover opacity-35 grayscale"/>
      <div className="absolute -right-12 -top-16 h-96 w-96 rounded-full border-[48px] border-white/[0.04]" />
      <div className="absolute bottom-0 right-8 h-48 w-48 -rotate-12 border-[32px] border-red-500/10" />
      <img src="/logo-light.png" alt="" className="absolute right-5 top-6 w-40 max-w-[35%] opacity-50" />
    </>}
    <div className="absolute inset-0 bg-gradient-to-r from-[#041123]/95 via-[#041123]/60 to-[#041123]/15" />
  </div>;
}
