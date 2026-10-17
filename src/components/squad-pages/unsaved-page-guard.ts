'use client';
import { useEffect } from 'react';

type TraverseEvent = Event & { navigationType: string; destination: { url: string } };
/** Warn only when a navigation would replace the editor, never for draft previews. */
export function useUnsavedPageGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const confirmLeave = () => window.confirm('Leave this page and discard unsaved edits?');
    const changesRoute = (href: string) => {
      const next = new URL(href, window.location.href), current = new URL(window.location.href);
      return next.origin !== current.origin || next.pathname !== current.pathname || next.search !== current.search;
    };
    const switchContext = (event: Event) => {
      if (!window.confirm('Discard unsaved page edits before changing context?')) event.preventDefault();
    };
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const links = (event: MouseEvent) => {
      const anchor = (event.target as Element)?.closest('a');
      if (!anchor || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || anchor.hasAttribute('download') || anchor.target === '_blank' || anchor.hasAttribute('data-starting-design-review') || anchor.closest('[data-page-preview]')) return;
      const href = anchor.getAttribute('href');
      if (href && changesRoute(href) && !confirmLeave()) { event.preventDefault(); event.stopPropagation(); }
    };
    // Supported browsers can cancel same-document Back/Forward before Next changes route.
    // Do not insert history sentinels or reverse history: either can trap navigation.
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    const traverse = (event: Event) => {
      const next = event as TraverseEvent;
      if (next.navigationType === 'traverse' && next.cancelable && changesRoute(next.destination.url) && !confirmLeave()) next.preventDefault();
    };
    window.addEventListener('squad-pages-before-context-change', switchContext);
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', links, true);
    navigation?.addEventListener('navigate', traverse);
    return () => {
      window.removeEventListener('squad-pages-before-context-change', switchContext);
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', links, true);
      navigation?.removeEventListener('navigate', traverse);
    };
  }, [dirty]);
}
