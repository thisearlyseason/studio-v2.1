'use client';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import s from './editor.module.css';

export type PreviewDevice = 'desktop' | 'tablet' | 'mobile';
export const previewWidths: Record<PreviewDevice, number> = { desktop: 1440, tablet: 768, mobile: 390 };
const previewMarkup = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Private page preview</title></head><body style="margin:0"><div id="page-preview-root"></div></body></html>';

/** A separate viewport: changing modes exercises the public page's real responsive rules. */
export function PreviewSurface({ device, children }: { device: PreviewDevice; children: (document: Document) => ReactNode }) {
  const container = useRef<HTMLDivElement | null>(null);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const frame = useRef<HTMLIFrameElement | null>(null);
  const [previewDocument, setPreviewDocument] = useState<Document | null>(null);
  const load = useCallback(() => { setPreviewDocument(frame.current?.contentDocument || null); }, []);
  useEffect(() => {
    if (!previewDocument) return;
    const source = document.head;
    const copiedFonts = new Set<FontFace>();
    const syncLoadedFonts = () => {
      document.fonts.forEach(face => {
        if (face.status !== 'loaded' || previewDocument.fonts.has(face)) return;
        try { previewDocument.fonts.add(face); copiedFonts.add(face); } catch { /* Some engines cannot share a CSS-connected face across documents. */ }
      });
      for (const face of copiedFonts) if (!document.fonts.has(face)) { previewDocument.fonts.delete(face); copiedFonts.delete(face); }
    };
    syncLoadedFonts();
    document.fonts.addEventListener('loadingdone', syncLoadedFonts);
    const copies = new Map<Element, HTMLElement>();
    let pendingSync: number | null = null;
    const syncStyles = () => {
      pendingSync = null;
      const nodes = [...source.querySelectorAll('style,link[rel="stylesheet"]')].filter(node => {
        // Fonts provided by local application styles remain available. Do not initiate
        // additional remote font stylesheet requests from a private preview frame.
        return node.tagName !== 'LINK' || new URL((node as HTMLLinkElement).href, document.baseURI).origin === window.location.origin;
      });
      const retained = new Set(nodes);
      for (const [node, copy] of copies) if (!retained.has(node)) { copy.remove(); copies.delete(node); }
      for (const node of nodes) {
        let copy = copies.get(node);
        if (!copy) {
          copy = previewDocument.importNode(node, true) as HTMLElement;
          copy.setAttribute('data-preview-style', '');
          copies.set(node, copy);
          previewDocument.head.appendChild(copy);
        }
        for (const attribute of [...copy.attributes]) if (attribute.name !== 'data-preview-style' && !node.hasAttribute(attribute.name)) copy.removeAttribute(attribute.name);
        for (const attribute of [...node.attributes]) {
          const value = node.tagName === 'LINK' && attribute.name === 'href' ? (node as HTMLLinkElement).href : attribute.value;
          if (copy.getAttribute(attribute.name) !== value) copy.setAttribute(attribute.name, value);
        }
        if (node.tagName === 'STYLE' && copy.textContent !== node.textContent) copy.textContent = node.textContent;
      }
      // Retain cascade order without detaching unchanged styles (which restarts
      // animations and reloads linked fonts during development hot updates).
      nodes.forEach((node, index) => {
        const copy = copies.get(node)!;
        const current = previewDocument.head.querySelectorAll('[data-preview-style]')[index];
        if (current !== copy) previewDocument.head.insertBefore(copy, current || null);
      });
      previewDocument.documentElement.className = document.documentElement.className;
      previewDocument.body.className = document.body.className;
      syncLoadedFonts();
    };
    syncStyles();
    const observer = new MutationObserver(() => {
      if (pendingSync === null) pendingSync = window.requestAnimationFrame(syncStyles);
    });
    observer.observe(source, { childList: true, subtree: true, characterData: true, attributes: true });
    const localAnchor = (event: MouseEvent) => {
      const element = event.target as Element;
      const href = element.closest('a')?.getAttribute('href');
      if (!href?.startsWith('#')) return;
      event.preventDefault();
      const target = previewDocument.getElementById(href.slice(1));
      if (!target) return;
      target.scrollIntoView({ behavior: previewDocument.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
      if (!target.matches('a[href],button,input,select,textarea,[tabindex],[contenteditable="true"]')) target.tabIndex = -1;
      target.focus({ preventScroll: true });
    };
    previewDocument.addEventListener('click', localAnchor);
    return () => { observer.disconnect(); if (pendingSync !== null) window.cancelAnimationFrame(pendingSync); document.fonts.removeEventListener('loadingdone', syncLoadedFonts); copiedFonts.forEach(face => previewDocument.fonts.delete(face)); previewDocument.removeEventListener('click', localAnchor); };
  }, [previewDocument]);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const update = () => setBounds(previous => {
      const width = element.clientWidth, height = element.clientHeight;
      return previous.width === width && previous.height === height ? previous : { width, height };
    });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Scale the viewport itself, not its contents' responsive layout. Its CSS
  // width remains the selected device width and its own document scrolls.
  const width = previewWidths[device];
  const scale = bounds.width > 0 ? Math.min(1, bounds.width / width) : 1;
  const target = previewDocument?.getElementById('page-preview-root');
  return <div ref={container} className={s.viewportScroller} aria-label={`${device} preview viewport`} tabIndex={0}>
    <iframe ref={frame} onLoad={load} title={`Private ${device} page preview, ${previewWidths[device]} pixels wide`} srcDoc={previewMarkup} sandbox="allow-same-origin" className={s.previewViewport} style={{ width, height: bounds.height > 0 ? bounds.height / scale : '100%', transform: `scale(${scale})`, transformOrigin: 'top left', left: Math.max(0, (bounds.width - width * scale) / 2), visibility: bounds.width > 0 ? 'visible' : 'hidden' }} />
    {target && previewDocument && createPortal(children(previewDocument), target)}
  </div>;
}
