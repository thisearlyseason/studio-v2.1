'use client';
/* eslint-disable @next/next/no-img-element -- Private draft images use scoped blob URLs. */
import { useId, useState } from 'react';
import type { Photo } from '@/lib/squad-pages/model';
import s from './editor.module.css';

export function FocalPointControl({ label = 'Hero image', photo, src, onChange }: { label?: string; photo: Photo; src: string; onChange: (photo: Photo) => void }) {
  const help = useId();
  const [aspectRatio, setAspectRatio] = useState<number>(16 / 9);
  const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
  return <div className={s.focalControl}>
    <button type="button" className={s.focalTarget} aria-label={`Position ${label.toLowerCase()} focal point`} style={{ aspectRatio, height: 'auto', minHeight: 0 }} aria-describedby={help}
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        const rect = event.currentTarget.getBoundingClientRect();
        onChange({ ...photo, x: clamp((event.clientX - rect.left) / rect.width * 100), y: clamp((event.clientY - rect.top) / rect.height * 100) });
      }}
      onPointerMove={event => {
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
        const rect = event.currentTarget.getBoundingClientRect();
        onChange({ ...photo, x: clamp((event.clientX - rect.left) / rect.width * 100), y: clamp((event.clientY - rect.top) / rect.height * 100) });
      }}
      onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }}
      onKeyDown={event => {
        const step = event.shiftKey ? 10 : 1;
        const delta = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[event.key];
        if (!delta) return;
        event.preventDefault();
        onChange({ ...photo, x: clamp(photo.x + delta[0]), y: clamp(photo.y + delta[1]) });
      }}>
      <img src={src} alt={photo.alt} draggable={false} onLoad={event => { const image = event.currentTarget; if (image.naturalWidth && image.naturalHeight) setAspectRatio(image.naturalWidth / image.naturalHeight); }} />
      <span className={s.focalMarker} style={{ left: `${photo.x}%`, top: `${photo.y}%` }} aria-hidden><span /></span>
    </button>
    <p id={help} className={s.focalHelp}>Drag the marker or use arrow keys. Shift + arrow moves 10%. Focus affects cropped photos; a full uncropped image, including the lightbox, stays fully visible.</p>
    <output className={s.focalValue} aria-live="polite" aria-atomic="true">Focal point: {photo.x}% horizontal · {photo.y}% vertical</output>
  </div>;
}
