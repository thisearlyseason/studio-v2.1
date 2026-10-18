'use client';

import React, { createContext, forwardRef, useContext, useEffect, useRef, useState, useTransition } from 'react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';

type Router = ReturnType<typeof useRouter>;
type Navigate = (href: string, options?: Parameters<Router['push']>[1], replace?: boolean) => void;
const NavigationContext = createContext<Navigate | null>(null);

export function NavigationFeedback({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [slow, setSlow] = useState(false);
  const [failed, setFailed] = useState(false);
  const busy = useRef(false);
  const observedPending = useRef(false);
  const originalURL = useRef('');
  const initiatingElement = useRef<HTMLElement | null>(null);
  const status = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pending) {
      observedPending.current = true;
      status.current?.focus();
      const timer = window.setTimeout(() => setSlow(true), 8000);
      return () => window.clearTimeout(timer);
    }
    if (observedPending.current) {
      observedPending.current = false;
      busy.current = false;
      setSlow(false);
      if (window.location.href === originalURL.current && initiatingElement.current?.isConnected) {
        initiatingElement.current.focus();
      }
    }
  }, [pending]);

  const navigate: Navigate = (href, options, replace = false) => {
    if (busy.current) return;
    const destination = new URL(href, window.location.href);
    // Native same-page anchors and no-op destinations need no pending state.
    if (destination.origin !== window.location.origin ||
        (destination.pathname === window.location.pathname && destination.search === window.location.search)) {
      if (replace) router.replace(href, options); else router.push(href, options);
      return;
    }
    busy.current = true;
    originalURL.current = window.location.href;
    initiatingElement.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setFailed(false);
    startTransition(() => {
      try {
        if (replace) router.replace(href, options); else router.push(href, options);
      } catch {
        busy.current = false;
        setFailed(true);
      }
    });
  };

  return (
    <NavigationContext.Provider value={navigate}>
      <div style={{ display: 'contents' }} inert={pending || undefined} aria-busy={pending || undefined}>
        {children}
      </div>
      {(pending || failed) && (
        <div ref={status} role="status" aria-live="polite" tabIndex={-1}
          className="fixed bottom-24 left-1/2 z-[200] w-max max-w-[90vw] -translate-x-1/2 rounded-xl border bg-background px-5 py-3 text-sm font-semibold text-foreground shadow-lg outline-none">
          {pending ? (slow ? 'Still opening… Please wait.' : 'Opening section…') : 'Unable to open this section. Please try again.'}
        </div>
      )}
    </NavigationContext.Provider>
  );
}

export function useNavigationRouter(): Router {
  const router = useRouter();
  const navigate = useContext(NavigationContext);
  return navigate ? { ...router, push: (href, options) => navigate(href, options), replace: (href, options) => navigate(href, options, true) } : router;
}

// Keep Next Link's prefetch and native click semantics. onNavigate runs only
// after capture-phase draft guards and modified/external click handling.
export const NavigationLink = forwardRef<HTMLAnchorElement, React.ComponentProps<typeof NextLink>>(
  function NavigationLink({ onNavigate, href, replace, scroll, ...props }, ref) {
    const navigate = useContext(NavigationContext);
    return <NextLink {...props} ref={ref} href={href} replace={replace} scroll={scroll} onNavigate={event => {
      let canceled = false;
      onNavigate?.({ preventDefault() { canceled = true; event.preventDefault(); } });
      if (canceled || !navigate || typeof href !== 'string') return;
      const destination = new URL(href, window.location.href);
      if (destination.pathname === window.location.pathname && destination.search === window.location.search) return;
      event.preventDefault();
      navigate(href, { scroll }, replace);
    }} />;
  },
);
