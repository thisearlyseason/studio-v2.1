'use client';
/* eslint-disable @next/next/no-img-element -- Authenticated draft blobs and the width-limited page media loader require direct image URLs. */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowDown, ArrowUp, ArrowUpRight, Expand, Menu, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { type PageContent, type Photo, textOn } from '@/lib/squad-pages/model';
import { sampleImageUrl, isSamplePlaceholder } from '@/lib/squad-pages/sample-content';
import styles from './pages.module.css';
export type PublicContext = { forms: { id: string; label: string; url: string; active: boolean }[]; directory: { name: string; url: string }[] };
export function PageView({ content: c, images: suppliedImages, context, preview = false, previewDocument, localReview = false }: { content: PageContent; images: (p: Photo) => string; context: PublicContext; preview?: boolean; previewDocument?: Document; localReview?: boolean }) {
  const images = (p: Photo) => sampleImageUrl(p.id) || suppliedImages(p);
  const [activeLink, setActiveLink] = useState<{ url: string; label: string } | null>(null);
  const linkReturn = useRef<HTMLAnchorElement | null>(null);
  const linkDialog = useRef<HTMLDivElement | null>(null), galleryDialog = useRef<HTMLDivElement | null>(null);
  const [dialogNode, setDialogNode] = useState<HTMLDivElement | null>(null);
  const linkNode = useCallback((node: HTMLDivElement | null) => { linkDialog.current = node; if (node) setDialogNode(node); }, []);
  const galleryNode = useCallback((node: HTMLDivElement | null) => { galleryDialog.current = node; if (node) setDialogNode(node); }, []);
  const pageRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDetailsElement | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null); const galleryReturn = useRef<HTMLButtonElement | null>(null);
  const galleryOpen = lightbox !== null, linkOpen = activeLink !== null;
  useEffect(() => { if (lightbox !== null && (c.galleryLightbox === false || !c.gallery[lightbox])) setLightbox(null); }, [c.galleryLightbox, c.gallery, lightbox]);
  // Radix portals render into the frame, but keyboard events belong to that frame's document.
  useEffect(() => {
    if (!linkOpen && !galleryOpen) return; const dialog = dialogNode; if (!dialog?.isConnected) return;
    const doc = dialog.ownerDocument;
    const controls = () => [...dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(node => node.getClientRects().length > 0);
    const frame = window.requestAnimationFrame(() => (controls()[0] || dialog).focus());
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (linkOpen) setActiveLink(null); else setLightbox(null); return; }
      if (event.key !== 'Tab') return; event.preventDefault(); event.stopPropagation(); const targets = controls(); if (!targets.length) { dialog.focus(); return; }
      const current = targets.indexOf(doc.activeElement as HTMLElement), next = (current + (event.shiftKey ? -1 : 1) + targets.length) % targets.length; targets[next].focus();
    };
    doc.addEventListener('keydown', key, true); return () => { window.cancelAnimationFrame(frame); doc.removeEventListener('keydown', key, true); };
  }, [linkOpen, galleryOpen, previewDocument, dialogNode]);
  function restoreFocus(target: HTMLElement | null) { const view = target?.ownerDocument.defaultView; if (!target || !view) return; window.requestAnimationFrame(() => window.setTimeout(() => { if (target.isConnected) { const menu = target.closest('details'); const destination = menu && !menu.open ? menu.querySelector('summary') : target; destination?.focus({ preventScroll: true }); } }, 0)); }
  const formActive = (id?: string) => !id || context.forms.some(f => f.id === id && f.active);
  const registrations = c.registrations.filter(l => l.label && l.url && (!l.formId || context.forms.some(f => f.id === l.formId && f.url === l.url))), first = registrations.find(l => formActive(l.formId)), second = c.links.find(l => l.label && l.url);
  const sampleRegistrations = c.registrations.filter(isSamplePlaceholder);
  function placeholder(l: { id: string; label: string }) { return <span key={l.id} className={styles.closed} aria-disabled="true">{l.label} · Not connected</span>; }
  function photo(p: Photo | null, logo = false, priority = false) { if (!p || !images(p)) return null; return <img src={images(p)} alt={p.alt} className={`${styles.photo} ${logo ? styles.logoImage : ''}`} srcSet={!sampleImageUrl(p.id) && !images(p).startsWith('blob:') ? [480, 960, 1440].map(w => `${images(p)}&w=${w} ${w}w`).join(', ') : undefined} sizes={logo ? '150px' : '(max-width: 700px) 100vw, 65vw'} style={{ objectPosition: logo ? 'center' : `${p.x}% ${p.y}%`, '--photo-size': (p.size ?? 100) / 100, ...(!logo && p.zoom !== undefined ? { scale: String(p.zoom / 100), transformOrigin: `${p.x}% ${p.y}%` } : {}) } as CSSProperties} loading={priority ? 'eager' : 'lazy'} decoding="async" />; }
  function link(url: string, label: string, primary = false) { return <a href={url} className={primary ? styles.cta : styles.secondary} target={url.startsWith('https:') ? '_blank' : undefined} rel="noopener noreferrer">{label}<ArrowUpRight size={17} aria-hidden /></a>; }
  const filled = (id: string) => ({ about: !!c.about || !!c.aboutImage, details: Object.values(c.details).some(Boolean), registration: registrations.length > 0 || sampleRegistrations.length > 0, directory: context.directory.length > 0, gallery: c.gallery.length > 0, links: c.links.some(l => l.label && l.url || isSamplePlaceholder(l)), contact: !!c.contact.email || !!c.contact.phone || !!c.contact.text, sponsors: c.sponsors.some(s => s.name || s.image), resources: (c.resources || []).some(l => l.label && l.url || isSamplePlaceholder(l)) })[id];
  const sections = c.sections.filter(s => s.visible && filled(s.id));
  const headerButton = c.headerButton ? c.headerButton.visible && (!c.headerButton.target.startsWith('#section-') || sections.some(section => `#section-${section.id}` === c.headerButton!.target)) ? { url: c.headerButton.target, label: c.headerButton.label } : null : first;
  const menu = (c.menu ?? sections.map(section => ({ id: section.id, label: section.heading, target: `#section-${section.id}`, visible: true }))).filter(item => item.visible && item.label && item.target && (!item.target.startsWith('#section-') || sections.some(section => `#section-${section.id}` === item.target)));
  const sectionKey = sections.map(s => s.id).join(',');
  useEffect(() => {
    const page = pageRef.current;
    if (!page || typeof IntersectionObserver === 'undefined') return;
    const view = page.ownerDocument.defaultView || window;
    const motion = view.matchMedia('(prefers-reduced-motion: reduce)');
    const targets = [...page.querySelectorAll<HTMLElement>('[data-page-section]')];
    const reveal = new view.IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        (entry.target as HTMLElement).dataset.revealed = 'true';
        reveal.unobserve(entry.target);
      }
    }, { threshold: .08 });
    if (!motion.matches) targets.forEach(target => reveal.observe(target));
    const visibleSections = new Set<Element>();
    const hero = page.querySelector<HTMLElement>('#page-top');
    let heroVisible = !!hero && hero.getBoundingClientRect().bottom > 0 && hero.getBoundingClientRect().top < view.innerHeight;
    const updateNavigation = () => {
      const visible = [...visibleSections].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      setActiveSection(heroVisible ? null : visible[0]?.id || null);
    };
    const navigation = new view.IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) visibleSections.add(entry.target);
        else visibleSections.delete(entry.target);
      }
      updateNavigation();
    }, { rootMargin: '-10% 0px -55% 0px', threshold: 0 });
    const heroNavigation = new view.IntersectionObserver(entries => {
      heroVisible = entries.some(entry => entry.isIntersecting);
      updateNavigation();
    }, { threshold: 0 });
    targets.filter(target => target.id).forEach(target => navigation.observe(target));
    if (hero) heroNavigation.observe(hero);
    updateNavigation();
    const stopMotion = () => {
      if (motion.matches) {
        reveal.disconnect();
        targets.forEach(target => delete target.dataset.revealed);
      }
    };
    motion.addEventListener('change', stopMotion);
    return () => { reveal.disconnect(); navigation.disconnect(); heroNavigation.disconnect(); motion.removeEventListener('change', stopMotion); };
  }, [sectionKey, c.template, c.extra, previewDocument]);
  // Radix's title/description checks and modal focus scope use the parent
  // document. Keep each preview dialog and its semantic title together there,
  // positioned inside the fitted preview pane rather than in the iframe.
  const dialogContainer = previewDocument?.defaultView?.frameElement?.parentElement;
  const overlayStyle: CSSProperties | undefined = dialogContainer ? { position: 'absolute' } : undefined;
  const galleryStyle: CSSProperties | undefined = dialogContainer ? { position: 'absolute', width: 'min(94%, 1100px)', maxHeight: '94%' } : undefined;
  const destinationStyle: CSSProperties | undefined = dialogContainer ? { position: 'absolute', width: 'min(90%, 520px)', maxHeight: '85%' } : undefined;
  function frameStyle(p: Photo | null) { return { '--photo-size': (p?.size ?? 100) / 100 } as CSSProperties; }
  function closeMenu() { if (menuRef.current) menuRef.current.open = false; }
  return <article ref={pageRef} className={`${styles.page} ${styles[c.template]} ${c.background ? styles.customBackground : ''}`} onClickCapture={event => { if (!preview && !localReview) return; const target = (event.target as Element).closest('a'); const url = target?.getAttribute('href'); if (url && !url.startsWith('#')) { event.preventDefault(); linkReturn.current = target as HTMLAnchorElement; setActiveLink({ url, label: target?.textContent?.trim() || target?.getAttribute('aria-label') || 'Link destination' }); } }} style={{ ...(c.background ? { '--page-background': c.background, '--page-foreground': textOn(c.background) } : {}), '--ink': c.primary, '--accent': c.secondary, '--on-ink': textOn(c.primary), '--on-accent': textOn(c.secondary) } as CSSProperties}>
    <header className={styles.pageHeader}><a href="#page-top" className={styles.identity}>{photo(c.logo, true, true)}<span>{c.name}</span></a><nav aria-label="Page sections">{menu.map(item => <a key={item.id} href={item.target} target={item.target.startsWith('https:') ? '_blank' : undefined} rel="noopener noreferrer" aria-current={activeSection === item.target ? 'location' : undefined}>{item.label}</a>)}</nav><details ref={menuRef} className={styles.mobileNav} onKeyDown={e => { if (e.key === 'Escape') { closeMenu(); menuRef.current?.querySelector('summary')?.focus(); } }}><summary className={styles.menuLabel}><Menu size={19} aria-hidden /><span>Explore</span></summary><nav className={styles.mobileMenu} aria-label="Mobile page sections">{menu.map(item => <a key={item.id} href={item.target} target={item.target.startsWith('https:') ? '_blank' : undefined} rel="noopener noreferrer" aria-current={activeSection === item.target ? 'location' : undefined} onClick={closeMenu}>{item.label}<ArrowUpRight size={16} aria-hidden /></a>)}{headerButton && <div onClick={closeMenu}>{link(headerButton.url, headerButton.label, true)}</div>}<a href="#page-footer" onClick={closeMenu}>Page information<ArrowDown size={16} aria-hidden /></a></nav></details>{headerButton && <div className={styles.headerAction}>{link(headerButton.url, headerButton.label, true)}</div>}</header>
    <section id="page-top" style={frameStyle(c.hero)} className={`${styles.hero} ${!c.hero ? styles.noImage : ''}`}><div className={styles.heroPhoto}>{photo(c.hero, false, true)}{c.template !== 'simple' && c.hero && <span className={styles.overlay} style={{ background: `rgba(0,0,0,${Math.max(.6, c.hero.overlay)})` }} />}</div><div className={styles.heroCopy}><p className={styles.eyebrow}>{c.details.sport || c.name}{c.details.season && ` / ${c.details.season}`}</p><h1>{c.headline || c.name}</h1>{c.intro && <p className={styles.lead}>{c.intro}</p>}<div className={styles.actions}>{first && link(first.url, first.label, true)}{!first && sampleRegistrations.map(placeholder)}{second && link(second.url, second.label)}</div><a className={styles.explore} href={sections[0] ? `#section-${sections[0].id}` : '#page-footer'}><ArrowDown size={18} aria-hidden /> Explore {c.name}</a></div></section>
    <div className={styles.sections}>{sections.map(s => <section data-page-section id={`section-${s.id}`} className={`${styles.section} ${styles[s.id]}`} key={s.id}>
      {s.id === 'about' && <div className={styles.aboutGrid}><div><p className={styles.eyebrow}>{s.heading}</p><h2>{c.aboutHeading || s.heading}</h2><Formatted text={c.about} /></div>{c.aboutImage && <div className={styles.photoFrame} style={frameStyle(c.aboutImage)}>{photo(c.aboutImage)}</div>}</div>}
      {s.id === 'details' && <><p className={styles.eyebrow}>{s.heading}</p><div className={styles.detailGrid}>{Object.entries(c.details).filter(([, v]) => v).map(([k, v]) => <div key={k}><span>{k === 'ages' ? 'Age group' : k}</span><strong>{v}</strong></div>)}</div></>}
      {s.id === 'registration' && <div className={styles.joinCard} style={frameStyle(c.joinImage)}>{photo(c.joinImage)}{c.joinImage && <span className={styles.overlay} style={{ background: `rgba(0,0,0,${Math.max(.55, c.joinImage.overlay)})` }} />}<div className={styles.joinCopy}><p className={styles.eyebrow}>{s.heading}</p><h2>{c.joinHeading || s.heading}</h2><Formatted text={c.joinText} /><div className={styles.actions}>{registrations.map(l => <span key={l.id}>{formActive(l.formId) ? link(l.url, l.label, true) : <span className={styles.closed}>{l.label} · Registration closed</span>}</span>)}{sampleRegistrations.map(placeholder)}</div></div></div>}
      {s.id === 'directory' && <><h2>{s.heading}</h2><div className={styles.directoryGrid}>{context.directory.map(d => <a key={d.url} href={d.url}>{d.name}<ArrowUpRight size={20} /></a>)}</div></>}
      {s.id === 'gallery' && <><div className={styles.sectionHeading}><h2>{s.heading}</h2><span>{c.gallery.length.toString().padStart(2, '0')} moments</span></div><div className={`${styles.galleryGrid} ${c.galleryLayout ? styles['gallery' + c.galleryLayout] : styles.galleryDefault}`}>{c.gallery.map((p, i) => <figure key={`${p.id}-${i}`} style={frameStyle(p)}>{c.galleryLightbox !== false ? <button aria-label={`Open image ${i + 1}: ${p.alt || p.caption || 'Gallery image'}`} onClick={e => { galleryReturn.current = e.currentTarget; setLightbox(i); }}>{photo(p)}<span className={styles.galleryHint} aria-hidden><Expand size={16} /></span></button> : <div className={styles.galleryStill}>{photo(p)}</div>}{p.caption && <figcaption>{p.caption}</figcaption>}</figure>)}</div></>}
      {(s.id === 'links' || s.id === 'resources') && <><h2>{s.heading}</h2><div className={styles.linksGrid}>{(s.id === 'resources' ? c.resources || [] : c.links).filter(l => l.label && l.url || isSamplePlaceholder(l)).map(l => <div key={l.id}>{isSamplePlaceholder(l) ? placeholder(l) : link(l.url, l.label)}</div>)}</div></>}
      {s.id === 'contact' && <div className={styles.contactGrid}><h2>{c.contact.heading || s.heading}</h2><div><Formatted text={c.contact.text} />{c.contact.email && <a href={`mailto:${c.contact.email}`}>{c.contact.email}</a>}{c.contact.phone && <p>{c.contact.phone}</p>}</div></div>}
      {s.id === 'sponsors' && <><p className={styles.eyebrow}>{s.heading}</p><div className={styles.sponsorGrid}>{c.sponsors.map((sponsor, i) => <div key={i}>{photo(sponsor.image, true)}{sponsor.url ? link(sponsor.url, sponsor.name || sponsor.image?.alt || 'Visit sponsor') : <strong>{sponsor.name}</strong>}</div>)}</div></>}
    </section>)}{c.extra.filter(e => e.visible && (e.heading || e.text)).map(e => <section data-page-section className={styles.section} key={e.id}><h2>{e.heading}</h2><Formatted text={e.text} /></section>)}</div>
    <footer id="page-footer" className={styles.pageFooter}><span>{c.name}</span>{(c.squadBrand || c.gamedayBrand) && <div className={styles.powered}><small>Powered by</small>{c.squadBrand && <a href="https://thesquad.pro" target="_blank" rel="noopener noreferrer" aria-label="The Squad (opens in new tab)"><img src="/squad-pages/squad-official.png" alt="The Squad" /></a>}{c.gamedayBrand && <a href="https://gamedaysports.pro" target="_blank" rel="noopener noreferrer" aria-label="Gameday Sports (opens in new tab)"><img className={styles.gamedayLogo} src="/squad-pages/gameday-on-light.png" alt="Gameday Sports" /></a>}</div>}<a className={styles.backTop} href="#page-top">Back to top<ArrowUp size={16} aria-hidden /></a></footer>
    <Dialog.Root open={activeLink !== null} onOpenChange={open => { if (!open) setActiveLink(null); }}><Dialog.Portal container={dialogContainer || undefined}><Dialog.Overlay className={styles.lightboxOverlay} style={overlayStyle} /><Dialog.Content aria-modal="true" ref={linkNode} className={styles.linkDialog} style={destinationStyle} onCloseAutoFocus={event => { event.preventDefault(); restoreFocus(linkReturn.current); }}><Dialog.Title>{localReview ? 'Fictional link preview' : 'Draft link preview'}</Dialog.Title><Dialog.Description>This button opens the destination below on your published page. Previewing it here keeps your draft and account safe.</Dialog.Description><strong>{activeLink?.label}</strong><code>{activeLink?.url}</code><p>{activeLink?.url.startsWith('/register/') || activeLink?.url.startsWith('/events/register/') ? 'This uses the existing registration workflow. Local review does not submit registrations, run payments or change membership.' : 'External websites, email and account actions are not opened from this local draft preview.'}</p><Dialog.Close>Back to page</Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
    <Dialog.Root open={lightbox !== null} onOpenChange={open => { if (!open) setLightbox(null); }}><Dialog.Portal container={dialogContainer || undefined}><Dialog.Overlay className={styles.lightboxOverlay} style={overlayStyle} /><Dialog.Content aria-modal="true" ref={galleryNode} className={styles.lightbox} style={galleryStyle} onCloseAutoFocus={e => { e.preventDefault(); restoreFocus(galleryReturn.current); }} onKeyDown={e => { if (lightbox === null) return; if (e.key === 'ArrowRight') setLightbox((lightbox + 1) % c.gallery.length); if (e.key === 'ArrowLeft') setLightbox((lightbox + c.gallery.length - 1) % c.gallery.length); }}><Dialog.Title className={styles.srOnly}>Gallery image {lightbox === null ? '' : lightbox + 1}</Dialog.Title><Dialog.Description className={styles.srOnly}>Use arrow keys to browse images. Escape closes the gallery.</Dialog.Description><Dialog.Close className={styles.close} aria-label="Close gallery"><X /></Dialog.Close>{lightbox !== null && c.gallery[lightbox] && <div className={styles.lightboxBody} style={dialogContainer ? { maxHeight: Math.max(0, dialogContainer.clientHeight * .94 - 64) } : undefined}><img src={images(c.gallery[lightbox])} alt={c.gallery[lightbox].alt} /><p>{c.gallery[lightbox].caption}</p><div className={styles.lightboxControls}><button aria-label="Previous image" onClick={() => setLightbox((lightbox + c.gallery.length - 1) % c.gallery.length)}><ChevronLeft /></button><span>{lightbox + 1} / {c.gallery.length}</span><button aria-label="Next image" onClick={() => setLightbox((lightbox + 1) % c.gallery.length)}><ChevronRight /></button></div></div>}</Dialog.Content></Dialog.Portal></Dialog.Root>
  </article>;
}
function Formatted({ text }: { text: string }) { return <div className={styles.prose}>{text.split(/\n\s*\n/).filter(Boolean).map((p, i) => <p key={i}>{p.split(/(\*\*[^*]+\*\*)/g).map((part, j) => part.startsWith('**') && part.endsWith('**') ? <strong key={j}>{part.slice(2, -2)}</strong> : part)}</p>)}</div>; }
