"use client";

import { useCallback, useEffect, useRef } from 'react';
import type { Difficulty, Sport } from './game-core';
import { DIFFICULTY, baseballContact, firstToFive, volleyballPoint } from './game-core';

type Score = { player: number; opponent: number; status: string; over: boolean; distance?: number; pitches?: number };
type Props = { sport: Sport; difficulty: Difficulty; paused: boolean; sound: boolean; onScore: (score: Score) => void; onReady: (api: { action: () => void; reset: () => void }) => void };
type Vec = { x: number; y: number };
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));

export default function GameCanvas({ sport, difficulty, paused, sound, onScore, onReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null); const stateRef = useRef<any>(null); const keys = useRef(new Set<string>()); const frame = useRef(0); const pausedRef = useRef(paused); const soundRef = useRef(sound);
  pausedRef.current = paused; soundRef.current = sound;
  const tone = useCallback((frequency: number) => { if (!soundRef.current) return; try { const ac = new AudioContext(); const o = ac.createOscillator(); const g = ac.createGain(); o.frequency.value = frequency; g.gain.setValueAtTime(.035, ac.currentTime); g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + .08); o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + .08); } catch { /* audio is optional */ } }, []);
  const reset = useCallback(() => {
    const baseball = sport === 'baseball';
    stateRef.current = { player: { x: baseball ? 110 : 155, y: baseball ? 200 : 200 }, ai: { x: 490, y: 200 }, ball: { x: baseball ? 445 : 320, y: baseball ? 200 : 200, vx: baseball ? -120 : 0, vy: 0 }, score: { player: 0, opponent: 0 }, possession: 'loose', timer: 0, message: baseball ? 'READY FOR PITCH 1' : 'KICK OFF', over: false, pitches: 0, best: 0, lastTouch: 'ai', serve: 0, shootCooldown: 0 };
    onScore({ player: 0, opponent: 0, status: stateRef.current.message, over: false, pitches: baseball ? 5 : undefined });
  }, [onScore, sport]);
  const action = useCallback(() => {
    const s = stateRef.current; if (!s || s.over) return;
    if (sport === 'baseball') { const hit = baseballContact((s.ball.x - 155) / 220, difficulty); s.message = hit.label; if (hit.distance) { s.best = Math.max(s.best, hit.distance); s.ball.vx = hit.distance * 2.2; s.ball.vy = -hit.distance * .48; tone(600); } else tone(130); s.pitches++; s.timer = 1.1; onScore({ ...s.score, status: `${hit.label}${hit.distance ? ` · ${hit.distance} m` : ''}`, distance: hit.distance, pitches: Math.max(0, 5 - s.pitches), over: false }); return; }
    const dx = s.ball.x - s.player.x; const dy = s.ball.y - s.player.y;
    if (Math.hypot(dx, dy) < 70 && s.shootCooldown <= 0) { const goalX = sport === 'volleyball' ? 420 : 630; s.ball.vx = (goalX - s.ball.x) * (sport === 'hockey' ? 2.7 : 1.8); s.ball.vy = sport === 'basketball' ? -190 : (sport === 'volleyball' ? -250 : dy * .6); s.possession = 'player'; s.lastTouch = 'player'; s.shootCooldown = .55; tone(420); }
  }, [difficulty, onScore, sport, tone]);
  useEffect(() => { reset(); onReady({ action, reset }); }, [action, onReady, reset]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D',' '].includes(e.key)) e.preventDefault(); if (e.key === ' ') action(); keys.current.add(e.key.toLowerCase()); };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [action]);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d')!; let last = performance.now();
    const resize = () => { const rect = canvas.getBoundingClientRect(); const ratio = Math.min(window.devicePixelRatio || 1, 2); canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio); ctx.setTransform(canvas.width / 640, 0, 0, canvas.height / 400, 0, 0); };
    resize(); const observer = new ResizeObserver(resize); observer.observe(canvas);
    const point = (owner: 'player' | 'opponent', s: any) => { s.score[owner]++; s.message = owner === 'player' ? 'POINT! YOU SCORE' : 'OPPONENT SCORES'; s.ball = { x: 320, y: 200, vx: 0, vy: 0 }; s.possession = 'loose'; tone(owner === 'player' ? 780 : 180); if (firstToFive(s.score.player, s.score.opponent)) { s.over = true; s.message = s.score.player > s.score.opponent ? 'YOU WIN! PRESS R TO RESTART' : 'ROUND OVER — PRESS R'; } onScore({ ...s.score, status: s.message, over: s.over }); };
    const drawSprite = (p: Vec, color: string, label: string) => { ctx.fillStyle = color; ctx.fillRect(p.x - 9, p.y - 12, 18, 24); ctx.fillStyle = '#fff'; ctx.fillRect(p.x - 4, p.y - 8, 8, 8); ctx.fillStyle = '#111'; ctx.font = 'bold 8px monospace'; ctx.fillText(label, p.x - 3, p.y + 9); };
    const draw = (s: any) => { ctx.imageSmoothingEnabled = false; ctx.fillStyle = sport === 'hockey' ? '#a8d9f4' : sport === 'basketball' ? '#e2c185' : sport === 'baseball' ? '#5b9d4c' : '#5aab58'; ctx.fillRect(0, 0, 640, 400); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3; ctx.strokeRect(12, 12, 616, 376);
      if (sport === 'volleyball') { ctx.fillStyle = '#f0d28b'; ctx.fillRect(0, 290, 640, 110); ctx.fillStyle = '#222'; ctx.fillRect(316, 100, 8, 200); ctx.fillStyle = '#fff'; for (let y=105;y<290;y+=18) ctx.fillRect(320,y,4,9); }
      if (sport === 'basketball') { ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(320, 200, 70, 0, Math.PI * 2); ctx.stroke(); ctx.strokeRect(610, 145, 18, 100); }
      if (sport === 'soccer' || sport === 'hockey') { ctx.strokeRect(12, 145, 22, 110); ctx.strokeRect(606, 145, 22, 110); }
      if (sport === 'baseball') { ctx.fillStyle = '#d9b67d'; ctx.fillRect(60, 185, 125, 30); ctx.fillStyle = '#fff'; ctx.fillRect(150, 205, 14, 14); ctx.fillStyle = '#1e5b25'; ctx.fillRect(425, 145, 14, 14); }
      drawSprite(s.player, '#c41f1f', 'Y'); if (sport !== 'baseball') drawSprite(s.ai, '#121212', 'A');
      ctx.fillStyle = sport === 'hockey' ? '#151515' : sport === 'basketball' ? '#f07825' : sport === 'baseball' ? '#fff' : '#fff'; ctx.beginPath(); ctx.arc(s.ball.x, s.ball.y, sport === 'hockey' ? 8 : 10, 0, Math.PI*2); ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.stroke();
    };
    const tick = (now: number) => { const dt = Math.min(.033, (now-last)/1000); last = now; const s = stateRef.current; if (!s) return;
      if (!pausedRef.current && !s.over) {
        const c = DIFFICULTY[difficulty]; s.shootCooldown -= dt; const k = keys.current; const dx = (k.has('arrowright')||k.has('d')?1:0)-(k.has('arrowleft')||k.has('a')?1:0); const dy = (k.has('arrowdown')||k.has('s')?1:0)-(k.has('arrowup')||k.has('w')?1:0); s.player.x = clamp(s.player.x + dx * 175 * c.speed * dt, 25, 615); s.player.y = clamp(s.player.y + dy * 175 * c.speed * dt, 30, 370);
        if (sport === 'baseball') { if (s.timer > 0) { s.timer -= dt; if (s.timer <= 0) { if (s.pitches >= 5) { s.over=true; s.message=`ROUND COMPLETE · BEST ${s.best} m`; onScore({ ...s.score, status:s.message, distance:s.best, pitches:0, over:true }); } else { s.ball={x:445,y: 170+Math.random()*60,vx:-(90+80*c.speed),vy:(Math.random()-.5)*20}; s.message=`PITCH ${s.pitches+1} OF 5`; } } } else { s.ball.x += s.ball.vx*dt; s.ball.y += s.ball.vy*dt; s.ball.vy += 180*dt; if (s.ball.x < 45 || s.ball.x > 690 || s.ball.y > 395) { if (s.pitches >= 5) { s.over=true; s.message=`ROUND COMPLETE · BEST ${s.best} m`; onScore({ ...s.score, status:s.message, distance:s.best, pitches:0, over:true }); } else { s.pitches++; s.timer=.55; onScore({ ...s.score, status:'MISSED PITCH', pitches:Math.max(0,5-s.pitches), over:false }); } } } }
        else { const aiDx=s.ball.x-s.ai.x, aiDy=s.ball.y-s.ai.y; s.ai.x=clamp(s.ai.x+Math.sign(aiDx)*100*c.aiSpeed*dt,25,615); s.ai.y=clamp(s.ai.y+Math.sign(aiDy)*100*c.aiSpeed*dt,30,370); if (Math.hypot(aiDx,aiDy)<38 && Math.random()<.025*c.accuracy) { s.ball.vx=-220*c.speed; s.ball.vy=(Math.random()-.5)*160; s.lastTouch='ai'; s.possession='ai'; }
          if (Math.hypot(s.ball.x-s.player.x,s.ball.y-s.player.y)<25 && Math.abs(s.ball.vx)<80) s.possession='player'; s.ball.x+=s.ball.vx*dt; s.ball.y+=s.ball.vy*dt; s.ball.vx*=sport==='hockey'?.994:sport==='volleyball'?.998:.985; s.ball.vy*=.985;
          if (sport==='volleyball') { s.ball.vy+=250*dt; if (s.ball.y>290) point(volleyballPoint(s.ball.x<320,s.lastTouch)==='player'?'player':'opponent',s); if (Math.abs(s.ball.x-320)<11 && s.ball.y<290) s.ball.vx*=-1; } else if (s.ball.x>628) point('player',s); else if (s.ball.x<12) point('opponent',s); else if (s.ball.y<20||s.ball.y>380) s.ball.vy*=-.8;
        }
      } draw(s); frame.current=requestAnimationFrame(tick); }; frame.current=requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame.current); observer.disconnect(); };
  }, [difficulty, onScore, sport, tone]);
  useEffect(() => { const restart=(e: KeyboardEvent)=>{if(e.key.toLowerCase()==='r')reset()}; window.addEventListener('keydown',restart); return()=>window.removeEventListener('keydown',restart)},[reset]);
  return <canvas ref={canvasRef} tabIndex={0} aria-label={`${sport} game canvas. Use arrow keys or WASD to move and Space to act.`} className="block h-auto w-full aspect-[16/10] touch-none bg-muted outline-none focus-visible:ring-4 focus-visible:ring-primary" />;
}
